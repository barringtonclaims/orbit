"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { generateTaskTitle } from "@/lib/scheduling";
import { Prisma } from "@prisma/client";

export interface CreateContactInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  source?: string;
  notes?: string;
}

// Define the return type with relations
export type ContactWithRelations = Prisma.ContactGetPayload<{
  include: {
    stage: true;
    assignedTo: {
      select: {
        id: true;
        fullName: true;
        avatarUrl: true;
      };
    };
    tasks: {
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] };
      };
      orderBy: { dueDate: "asc" };
      take: 1;
    };
    _count: {
      select: {
        timeline: true;
        files: true;
      };
    };
  };
}>;

export async function createContact(input: CreateContactInput) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    // Get or create user in our database
    let dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      dbUser = await prisma.user.create({
        data: {
          id: user.id,
          email: user.email!,
          fullName: user.user_metadata?.full_name || user.email!.split("@")[0],
        },
      });
    }

    // Get user's organization membership (if any)
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: true },
    });

    let organizationId = membership?.organizationId;

    // If user has no organization, create a personal one automatically
    if (!organizationId) {
      const orgName = `${dbUser.fullName}'s Workspace`;
      const slug = `user-${user.id.substring(0, 8)}`; // Use simplified ID for slug

      // Check if org already exists (idempotency)
      let newOrg = await prisma.organization.findUnique({
        where: { slug }
      });

      if (!newOrg) {
        newOrg = await prisma.organization.create({
          data: {
            name: orgName,
            slug,
          }
        });

        // Add user as owner
        await prisma.organizationMember.create({
          data: {
            userId: user.id,
            organizationId: newOrg.id,
            role: "OWNER"
          }
        });
        
        // Initialize default stages
        await createDefaultStages(newOrg.id);
      }

      organizationId = newOrg.id;
    }

    // Get default stage
    const defaultStage = await prisma.leadStage.findFirst({
      where: {
        organizationId: organizationId,
        order: 0,
      },
    });

    // Create the contact
    const contact = await prisma.contact.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        city: input.city || null,
        state: input.state || null,
        zipCode: input.zipCode || null,
        source: input.source || null,
        notes: input.notes || null,
        organizationId: organizationId,
        createdById: user.id,
        assignedToId: user.id,
        stageId: defaultStage?.id || null,
        stageOrder: defaultStage?.order || 0,
      },
    });

    // Create initial timeline entry
    await prisma.note.create({
      data: {
        contactId: contact.id,
        userId: user.id,
        content: "Contact created",
        noteType: "SYSTEM",
      },
    });

    // Create initial task for follow-up
    const today = new Date();
    const contactName = `${input.firstName} ${input.lastName}`;
    
    await prisma.task.create({
      data: {
        contactId: contact.id,
        userId: user.id,
        title: generateTaskTitle(contactName, "FIRST_MESSAGE"),
        dueDate: today,
        status: "PENDING",
        taskType: "FIRST_MESSAGE",
      },
    });

    revalidatePath("/contacts");
    revalidatePath("/dashboard");
    revalidatePath("/tasks");

    return { data: contact, action: "send-first" };
  } catch (error) {
    console.error("Error creating contact:", error);
    return { error: "Failed to create contact" };
  }
}

export async function getContacts(options?: {
  search?: string;
  stageId?: string;
  assignedToId?: string;
}): Promise<{ data: ContactWithRelations[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: [] };
  }

  try {
    // Get user's organization membership
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    // If no membership, return empty
    if (!membership) {
        return { data: [] };
    }

    const where: {
      organizationId: string;
      OR?: { firstName: { contains: string; mode: "insensitive" } } | { lastName: { contains: string; mode: "insensitive" } } | { email: { contains: string; mode: "insensitive" } }[];
      stageId?: string;
      assignedToId?: string;
    } = {
      organizationId: membership.organizationId,
    };

    if (options?.search) {
      where.OR = [
        { firstName: { contains: options.search, mode: "insensitive" } },
        { lastName: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
      ];
    }

    if (options?.stageId) {
      where.stageId = options.stageId;
    }

    // For non-manager members, only show their assigned contacts
    if (membership && membership.role === "MEMBER") {
      where.assignedToId = user.id;
    } else if (options?.assignedToId) {
      where.assignedToId = options.assignedToId;
    }

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        stage: true,
        assignedTo: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        tasks: {
          where: {
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
          orderBy: { dueDate: "asc" },
          take: 1,
        },
        _count: {
          select: {
            timeline: true,
            files: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return { data: contacts };
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return { error: "Failed to fetch contacts", data: [] };
  }
}

export async function getContact(id: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: {
        stage: true,
        assignedTo: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            fullName: true,
          },
        },
        tasks: {
          orderBy: { dueDate: "desc" },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
              },
            },
          },
        },
        timeline: {
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
        files: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!contact) {
      return { error: "Contact not found" };
    }

    return { data: contact };
  } catch (error) {
    console.error("Error fetching contact:", error);
    return { error: "Failed to fetch contact" };
  }
}

export async function updateContact(id: string, input: Partial<CreateContactInput>) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...input,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/contacts");
    revalidatePath(`/contacts/${id}`);

    return { data: contact };
  } catch (error) {
    console.error("Error updating contact:", error);
    return { error: "Failed to update contact" };
  }
}

export async function deleteContact(id: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.contact.delete({
      where: { id },
    });

    revalidatePath("/contacts");
    revalidatePath("/dashboard");
    revalidatePath("/tasks");

    return { success: true };
  } catch (error) {
    console.error("Error deleting contact:", error);
    return { error: "Failed to delete contact" };
  }
}

export async function addNote(contactId: string, content: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const note = await prisma.note.create({
      data: {
        contactId,
        userId: user.id,
        content,
        noteType: "NOTE",
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Update contact's updatedAt
    await prisma.contact.update({
      where: { id: contactId },
      data: { updatedAt: new Date() },
    });

    revalidatePath(`/contacts/${contactId}`);

    return { data: note };
  } catch (error) {
    console.error("Error adding note:", error);
    return { error: "Failed to add note" };
  }
}

// Helper function to create default lead stages
async function createDefaultStages(organizationId: string) {
  const defaultStages = [
    { name: "New Lead", color: "#6366f1", order: 0, stageType: "ACTIVE" as const },
    { name: "First Contact", color: "#8b5cf6", order: 1, stageType: "ACTIVE" as const },
    { name: "Inspection Scheduled", color: "#14b8a6", order: 2, stageType: "ACTIVE" as const },
    { name: "Quote Sent", color: "#f59e0b", order: 3, stageType: "ACTIVE" as const },
    { name: "Approved", color: "#22c55e", order: 4, stageType: "APPROVED" as const, isTerminal: true },
    { name: "Seasonal Follow-up", color: "#06b6d4", order: 5, stageType: "SEASONAL" as const, isTerminal: true },
    { name: "Not Interested", color: "#ef4444", order: 6, stageType: "NOT_INTERESTED" as const, isTerminal: true },
  ];

  const stages = [];
  for (const stageData of defaultStages) {
    const stage = await prisma.leadStage.create({
      data: {
        ...stageData,
        organizationId,
      },
    });
    stages.push(stage);
  }

  return stages;
}
