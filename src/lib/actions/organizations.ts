"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { randomBytes } from "crypto";

export async function createOrganization(input: {
  name: string;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    // Check if user already has an organization
    const existingMembership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    if (existingMembership) {
      return { error: "You are already a member of an organization" };
    }

    // Generate a unique slug
    const baseSlug = input.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    let slug = baseSlug;
    let counter = 1;
    
    while (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Create the organization
    const organization = await prisma.organization.create({
      data: {
        name: input.name,
        slug,
      },
    });

    // Add the creator as owner
    await prisma.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: "OWNER",
      },
    });

    // Create default lead stages for the organization
    await createDefaultStages(organization.id);

    revalidatePath("/team");
    revalidatePath("/dashboard");

    return { data: organization };
  } catch (error) {
    console.error("Error creating organization:", error);
    return { error: "Failed to create organization" };
  }
}

export async function getOrganization() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: null };
  }

  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: {
        organization: true,
      },
    });

    if (!membership) {
      return { data: null };
    }

    return {
      data: {
        ...membership.organization,
        role: membership.role,
      },
    };
  } catch (error) {
    console.error("Error fetching organization:", error);
    return { error: "Failed to fetch organization", data: null };
  }
}

export async function getOrganizationMembers() {
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

    const members = await prisma.organizationMember.findMany({
      where: { organizationId: membership.organizationId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [
        { role: "asc" },
        { joinedAt: "asc" },
      ],
    });

    // Get lead counts for each member
    const memberData = await Promise.all(
      members.map(async (member) => {
        const leadsCount = await prisma.contact.count({
          where: {
            organizationId: membership.organizationId,
            assignedToId: member.userId,
          },
        });

        return {
          id: member.id,
          userId: member.userId,
          role: member.role,
          joinedAt: member.joinedAt,
          user: member.user,
          leadsCount,
        };
      })
    );

    return { data: memberData };
  } catch (error) {
    console.error("Error fetching members:", error);
    return { error: "Failed to fetch members", data: [] };
  }
}

export async function inviteMember(email: string, role: "MANAGER" | "MEMBER") {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    // Check if user is owner or manager
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    if (!membership || membership.role === "MEMBER") {
      return { error: "You don't have permission to invite members" };
    }

    // Check if the user exists
    const invitedUser = await prisma.user.findUnique({
      where: { email },
    });

    if (!invitedUser) {
      return { error: "User not found. They need to sign up first." };
    }

    // Check if they're already a member
    const existingMembership = await prisma.organizationMember.findFirst({
      where: { userId: invitedUser.id },
    });

    if (existingMembership) {
      return { error: "User is already a member of an organization" };
    }

    // Add them to the organization
    await prisma.organizationMember.create({
      data: {
        userId: invitedUser.id,
        organizationId: membership.organizationId,
        role,
      },
    });

    revalidatePath("/team");

    return { success: true };
  } catch (error) {
    console.error("Error inviting member:", error);
    return { error: "Failed to invite member" };
  }
}

export async function updateMemberRole(memberId: string, role: "MANAGER" | "MEMBER") {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    // Check if user is owner
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    if (!membership || membership.role !== "OWNER") {
      return { error: "Only the owner can change roles" };
    }

    const targetMember = await prisma.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.organizationId !== membership.organizationId) {
      return { error: "Member not found" };
    }

    if (targetMember.role === "OWNER") {
      return { error: "Cannot change owner role" };
    }

    await prisma.organizationMember.update({
      where: { id: memberId },
      data: { role },
    });

    revalidatePath("/team");

    return { success: true };
  } catch (error) {
    console.error("Error updating role:", error);
    return { error: "Failed to update role" };
  }
}

export async function removeMember(memberId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    // Check if user is owner or manager
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    if (!membership || membership.role === "MEMBER") {
      return { error: "You don't have permission to remove members" };
    }

    const targetMember = await prisma.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!targetMember || targetMember.organizationId !== membership.organizationId) {
      return { error: "Member not found" };
    }

    if (targetMember.role === "OWNER") {
      return { error: "Cannot remove the owner" };
    }

    // Managers can only remove members, not other managers
    if (membership.role === "MANAGER" && targetMember.role === "MANAGER") {
      return { error: "Managers cannot remove other managers" };
    }

    // Unassign all contacts from this member
    await prisma.contact.updateMany({
      where: {
        organizationId: membership.organizationId,
        assignedToId: targetMember.userId,
      },
      data: { assignedToId: null },
    });

    await prisma.organizationMember.delete({
      where: { id: memberId },
    });

    revalidatePath("/team");
    revalidatePath("/contacts");

    return { success: true };
  } catch (error) {
    console.error("Error removing member:", error);
    return { error: "Failed to remove member" };
  }
}

export async function assignContact(contactId: string, userId: string | null) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    // Check if user is owner or manager
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    if (!membership || membership.role === "MEMBER") {
      return { error: "You don't have permission to assign contacts" };
    }

    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: {
        assignedToId: userId,
        updatedAt: new Date(),
      },
    });

    if (userId) {
      const assignee = await prisma.user.findUnique({
        where: { id: userId },
      });

      await prisma.note.create({
        data: {
          contactId,
          userId: user.id,
          content: `Assigned to ${assignee?.fullName || "team member"}`,
          noteType: "SYSTEM",
        },
      });
    }

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/contacts");

    return { data: contact };
  } catch (error) {
    console.error("Error assigning contact:", error);
    return { error: "Failed to assign contact" };
  }
}

export async function updateOrganizationSettings(input: {
  officeDays?: number[];
  inspectionDays?: number[];
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    if (!membership || (membership.role !== "OWNER" && membership.role !== "MANAGER")) {
      return { error: "You don't have permission to update settings" };
    }

    const org = await prisma.organization.update({
      where: { id: membership.organizationId },
      data: {
        officeDays: input.officeDays,
        inspectionDays: input.inspectionDays,
      },
    });

    revalidatePath("/settings");
    revalidatePath("/calendar");
    revalidatePath("/dashboard");

    return { data: org };
  } catch (error) {
    console.error("Error updating organization settings:", error);
    return { error: "Failed to update settings" };
  }
}

// Helper function to create default lead stages
async function createDefaultStages(organizationId: string) {
  const defaultStages = [
    { name: "New Lead", color: "#6366f1", order: 0, stageType: "ACTIVE" as const, isTerminal: false },
    { name: "First Contact", color: "#8b5cf6", order: 1, stageType: "ACTIVE" as const, isTerminal: false },
    { name: "Inspection Scheduled", color: "#14b8a6", order: 2, stageType: "ACTIVE" as const, isTerminal: false },
    { name: "Quote Sent", color: "#f59e0b", order: 3, stageType: "ACTIVE" as const, isTerminal: false },
    { name: "Approved", color: "#22c55e", order: 4, stageType: "APPROVED" as const, isTerminal: true },
    { name: "Seasonal Follow-up", color: "#06b6d4", order: 5, stageType: "SEASONAL" as const, isTerminal: true },
    { name: "Not Interested", color: "#ef4444", order: 6, stageType: "NOT_INTERESTED" as const, isTerminal: true },
  ];

  for (const stageData of defaultStages) {
    await prisma.leadStage.create({
      data: {
        ...stageData,
        organizationId,
      },
    });
  }
}

