"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { generateTaskTitle, getActionButtonForTaskType } from "@/lib/scheduling";
import { Prisma } from "@prisma/client";
import { createDefaultStages } from "./stages";

// Type for all action buttons
type ActionButtonType = "SEND_FIRST_MESSAGE" | "SEND_FIRST_MESSAGE_FOLLOW_UP" | "SCHEDULE_INSPECTION" | "SEND_APPOINTMENT_REMINDER" | "ASSIGN_STATUS" | "SEND_QUOTE" | "SEND_QUOTE_FOLLOW_UP" | "SEND_CLAIM_REC" | "SEND_CLAIM_REC_FOLLOW_UP" | "SEND_PA_AGREEMENT" | "SEND_PA_FOLLOW_UP" | "SEND_CLAIM_FOLLOW_UP" | "UPLOAD_PA" | "SEND_SEASONAL_MESSAGE" | "MARK_RESPONDED" | "MARK_JOB_SCHEDULED" | "MARK_JOB_IN_PROGRESS" | "MARK_JOB_COMPLETE" | "JOSH_DRAFT_MESSAGE" | null;

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

export interface UpdateContactInput extends Partial<CreateContactInput> {
  // Claim-specific fields
  carrier?: string;
  carrierId?: string | null;
  adjusterEmail?: string | null;
  dateOfLoss?: Date | string;
  policyNumber?: string;
  claimNumber?: string;
  // Retail fields
  quoteType?: string;
  // Job tracking
  jobStatus?: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED";
  jobScheduledDate?: Date | string;
  jobCompletedDate?: Date | string;
  // Seasonal
  seasonalReminderDate?: Date | string;
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

    // Get user's ACTIVE organization
    let membership;
    if (dbUser.activeOrganizationId) {
      membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id, organizationId: dbUser.activeOrganizationId },
        include: { organization: true },
      });
    }
    if (!membership) {
      membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
        include: { organization: true },
        orderBy: { joinedAt: "asc" },
      });
    }

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

    // Get default stage (New Lead)
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

    // Create initial task for first message
    const today = new Date();
    const contactName = `${input.firstName} ${input.lastName}`;
    const actionButton = getActionButtonForTaskType("FIRST_MESSAGE");
    
    await prisma.task.create({
      data: {
        contactId: contact.id,
        userId: user.id,
        title: generateTaskTitle(contactName, "FIRST_MESSAGE"),
        dueDate: today,
        status: "PENDING",
        taskType: "FIRST_MESSAGE",
        actionButton: actionButton as ActionButtonType,
        currentAction: actionButton as ActionButtonType,
      },
    });

    revalidatePath("/contacts");
    revalidatePath("/dashboard");
    revalidatePath("/tasks");

    return { data: contact };
  } catch (error) {
    console.error("Error creating contact:", error);
    return { error: "Failed to create contact" };
  }
}

export async function getContacts(options?: {
  search?: string;
  stageId?: string;
  assignedToId?: string;
  stageType?: string;
}): Promise<{ data: ContactWithRelations[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: [] };
  }

  try {
    // Get user's ACTIVE organization (respects activeOrganizationId)
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { activeOrganizationId: true },
    });

    // Try to get active organization membership
    let membership;
    if (dbUser?.activeOrganizationId) {
      membership = await prisma.organizationMember.findFirst({
        where: { 
          userId: user.id,
          organizationId: dbUser.activeOrganizationId,
        },
      });
    }

    // Fall back to first organization
    if (!membership) {
      membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
        orderBy: { joinedAt: "asc" },
      });
    }

    // If no membership, return empty
    if (!membership) {
      return { data: [] };
    }

    const where: Prisma.ContactWhereInput = {
      organizationId: membership.organizationId,
    };

    if (options?.search) {
      where.OR = [
        { firstName: { contains: options.search, mode: "insensitive" } },
        { lastName: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
        { phone: { contains: options.search } },
      ];
    }

    if (options?.stageId) {
      where.stageId = options.stageId;
    }

    if (options?.stageType) {
      where.stage = { stageType: options.stageType as Prisma.EnumStageTypeFilter["equals"] };
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
          orderBy: { createdAt: "desc" },
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

export async function updateContact(id: string, input: UpdateContactInput) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const { carrierId, adjusterEmail, ...rest } = input;
    const data: Prisma.ContactUpdateInput = {
      ...rest,
      updatedAt: new Date(),
    };

    // Handle carrier relation
    if (carrierId !== undefined) {
      if (carrierId) {
        data.carrierRef = { connect: { id: carrierId } };
      } else {
        data.carrierRef = { disconnect: true };
      }
      delete (data as Record<string, unknown>).carrierId;
    }

    if (adjusterEmail !== undefined) {
      data.adjusterEmail = adjusterEmail;
    }

    // Convert string dates to Date objects
    if (input.dateOfLoss) {
      data.dateOfLoss = new Date(input.dateOfLoss);
    }
    if (input.jobScheduledDate) {
      data.jobScheduledDate = new Date(input.jobScheduledDate);
    }
    if (input.jobCompletedDate) {
      data.jobCompletedDate = new Date(input.jobCompletedDate);
    }
    if (input.seasonalReminderDate) {
      data.seasonalReminderDate = new Date(input.seasonalReminderDate);
    }

    const contact = await prisma.contact.update({
      where: { id },
      data,
      include: {
        stage: true,
      },
    });

    revalidatePath("/contacts");
    revalidatePath(`/contacts/${id}`);
    revalidatePath("/tasks");

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

export async function addNote(contactId: string, content: string, noteType: string = "NOTE") {
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
        noteType: noteType as "NOTE" | "EMAIL_SENT" | "SMS_SENT" | "STAGE_CHANGE" | "TASK_COMPLETED" | "APPOINTMENT_SCHEDULED" | "APPOINTMENT_COMPLETED" | "FILE_UPLOADED" | "PA_UPLOADED" | "QUOTE_SENT" | "CLAIM_REC_SENT" | "JOB_STATUS_CHANGE" | "SYSTEM",
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

// Get contacts needing seasonal follow-up (for spring reminder cron job)
export async function getSeasonalContacts() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: [] };
  }

  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    if (!membership) {
      return { data: [] };
    }

    const today = new Date();
    
    const contacts = await prisma.contact.findMany({
      where: {
        organizationId: membership.organizationId,
        stage: {
          stageType: "SEASONAL",
        },
        seasonalReminderDate: {
          lte: today,
        },
      },
      include: {
        stage: true,
        assignedTo: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    return { data: contacts };
  } catch (error) {
    console.error("Error fetching seasonal contacts:", error);
    return { error: "Failed to fetch seasonal contacts", data: [] };
  }
}
