"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { STAGE_NAMES } from "@/types";

export async function getLeadStages(organizationId?: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: [] };
  }

  try {
    // Respect active organization
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { activeOrganizationId: true },
    });

    let membership;
    if (dbUser?.activeOrganizationId) {
      membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id, organizationId: dbUser.activeOrganizationId },
      });
    }
    if (!membership) {
      membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
        orderBy: { joinedAt: "asc" },
      });
    }

    const orgId = organizationId || membership?.organizationId || user.id;

    let stages = await prisma.leadStage.findMany({
      where: { organizationId: orgId },
      orderBy: { order: "asc" },
    });

    // Create default stages if none exist
    if (stages.length === 0) {
      stages = await createDefaultStages(orgId);
    }

    return { data: stages };
  } catch (error) {
    console.error("Error fetching lead stages:", error);
    return { error: "Failed to fetch lead stages", data: [] };
  }
}

// Alias for contacts page
export async function getStages() {
  return getLeadStages();
}

export async function getStageByName(stageName: string, organizationId?: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: null };
  }

  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    const orgId = organizationId || membership?.organizationId;
    if (!orgId) {
      return { error: "No organization found", data: null };
    }

    const stage = await prisma.leadStage.findFirst({
      where: { 
        organizationId: orgId,
        name: stageName,
      },
    });

    return { data: stage };
  } catch (error) {
    console.error("Error fetching stage by name:", error);
    return { error: "Failed to fetch stage", data: null };
  }
}

export async function updateContactStage(contactId: string, stageId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const stage = await prisma.leadStage.findUnique({
      where: { id: stageId },
    });

    if (!stage) {
      return { error: "Stage not found" };
    }

    // Get the previous stage and org settings
    const previousContact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { stage: true },
    });

    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: true },
    });
    const officeDays = membership?.organization?.officeDays || [1, 3, 5];

    // Update the contact stage
    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: {
        stageId,
        stageOrder: stage.order,
        updatedAt: new Date(),
      },
      include: {
        stage: true,
      },
    });

    // Add timeline entry for stage change
    await prisma.note.create({
      data: {
        contactId,
        userId: user.id,
        content: `Status changed from "${previousContact?.stage?.name || 'None'}" to "${stage.name}"`,
        noteType: "STAGE_CHANGE",
        metadata: {
          fromStageId: previousContact?.stageId,
          fromStageName: previousContact?.stage?.name,
          toStageId: stageId,
          toStageName: stage.name,
        },
      },
    });

    // Cancel existing pending tasks for this contact
    await prisma.task.updateMany({
      where: {
        contactId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: {
        status: "CANCELLED",
        updatedAt: new Date(),
      },
    });

    // Auto-create the appropriate task for the new status
    const { generateTaskTitle, getActionButtonForTaskType, getNextOfficeDay, getSeasonalFollowUpDate, enforceOfficeDay } = await import("@/lib/scheduling");
    const contactName = `${contact.firstName} ${contact.lastName}`;

    type ActionButtonType = "SEND_FIRST_MESSAGE" | "SEND_FIRST_MESSAGE_FOLLOW_UP" | "SCHEDULE_INSPECTION" | "SEND_APPOINTMENT_REMINDER" | "ASSIGN_STATUS" | "SEND_QUOTE" | "SEND_QUOTE_FOLLOW_UP" | "SEND_CLAIM_REC" | "SEND_CLAIM_REC_FOLLOW_UP" | "SEND_PA_AGREEMENT" | "SEND_PA_FOLLOW_UP" | "SEND_CLAIM_FOLLOW_UP" | "UPLOAD_PA" | "SEND_SEASONAL_MESSAGE" | "SEND_CARRIER_FOLLOW_UP" | "MARK_RESPONDED" | "MARK_JOB_SCHEDULED" | "MARK_JOB_IN_PROGRESS" | "MARK_JOB_COMPLETE" | "JOSH_DRAFT_MESSAGE" | null;

    // Map stage name to task type
    const stageTaskMap: Record<string, { taskType: string; dueDate: () => Date } | null> = {
      [STAGE_NAMES.NEW_LEAD]: {
        taskType: "FIRST_MESSAGE",
        dueDate: () => enforceOfficeDay(new Date(), officeDays),
      },
      [STAGE_NAMES.SCHEDULED_INSPECTION]: {
        taskType: "SET_APPOINTMENT",
        dueDate: () => enforceOfficeDay(new Date(), officeDays),
      },
      [STAGE_NAMES.RETAIL_PROSPECT]: {
        taskType: "SEND_QUOTE",
        dueDate: () => getNextOfficeDay(new Date(), officeDays),
      },
      [STAGE_NAMES.CLAIM_PROSPECT]: {
        taskType: "CLAIM_RECOMMENDATION",
        dueDate: () => getNextOfficeDay(new Date(), officeDays),
      },
      [STAGE_NAMES.OPEN_CLAIM]: {
        taskType: "CLAIM_FOLLOW_UP",
        dueDate: () => getNextOfficeDay(new Date(), officeDays),
      },
      [STAGE_NAMES.SEASONAL]: {
        taskType: "SEASONAL_FOLLOW_UP",
        dueDate: () => getSeasonalFollowUpDate(
          membership?.organization?.seasonalFollowUpMonth || 4,
          membership?.organization?.seasonalFollowUpDay || 1,
          new Date(),
          officeDays
        ),
      },
      [STAGE_NAMES.APPROVED]: {
        taskType: "FOLLOW_UP",
        dueDate: () => getNextOfficeDay(new Date(), officeDays),
      },
      [STAGE_NAMES.NOT_INTERESTED]: {
        taskType: "FOLLOW_UP",
        dueDate: () => getNextOfficeDay(new Date(), officeDays),
      },
    };

    const taskConfig = stageTaskMap[stage.name];
    if (taskConfig) {
      const { taskType, dueDate } = taskConfig;
      const actionButton = getActionButtonForTaskType(taskType as Parameters<typeof getActionButtonForTaskType>[0]);

      // Custom titles for terminal stages
      let taskTitle: string;
      if (stage.name === STAGE_NAMES.APPROVED) {
        taskTitle = `${contactName} - Approval Check In`;
      } else if (stage.name === STAGE_NAMES.NOT_INTERESTED) {
        taskTitle = `${contactName} - Reactivation Review`;
      } else {
        taskTitle = generateTaskTitle(contactName, taskType as Parameters<typeof generateTaskTitle>[1]);
      }

      await prisma.task.create({
        data: {
          contactId,
          userId: user.id,
          title: taskTitle,
          dueDate: dueDate(),
          status: "PENDING",
          taskType: taskType as "FIRST_MESSAGE" | "FIRST_MESSAGE_FOLLOW_UP" | "SET_APPOINTMENT" | "DISCUSS_INSPECTION" | "SEND_QUOTE" | "QUOTE_FOLLOW_UP" | "CLAIM_RECOMMENDATION" | "CLAIM_REC_FOLLOW_UP" | "PA_AGREEMENT" | "PA_FOLLOW_UP" | "CLAIM_FOLLOW_UP" | "SEASONAL_FOLLOW_UP" | "FOLLOW_UP" | "CUSTOM",
          actionButton: actionButton as ActionButtonType,
          currentAction: actionButton as ActionButtonType,
        },
      });
    }

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/dashboard");
    revalidatePath("/tasks");

    return { data: contact };
  } catch (error) {
    console.error("Error updating contact stage:", error);
    return { error: "Failed to update stage" };
  }
}

export async function createLeadStage(input: {
  name: string;
  color: string;
  description?: string;
  stageType: "ACTIVE" | "APPROVED" | "SEASONAL" | "NOT_INTERESTED";
  workflowType?: "RETAIL" | "CLAIM" | "BOTH" | "TERMINAL";
  isTerminal?: boolean;
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

    const orgId = membership?.organizationId || user.id;

    // Get the highest order
    const lastStage = await prisma.leadStage.findFirst({
      where: { organizationId: orgId },
      orderBy: { order: "desc" },
    });

    const stage = await prisma.leadStage.create({
      data: {
        organizationId: orgId,
        name: input.name,
        color: input.color,
        description: input.description,
        stageType: input.stageType,
        workflowType: input.workflowType || "BOTH",
        isTerminal: input.isTerminal || input.stageType !== "ACTIVE",
        order: (lastStage?.order || 0) + 1,
      },
    });

    revalidatePath("/settings");

    return { data: stage };
  } catch (error) {
    console.error("Error creating lead stage:", error);
    return { error: "Failed to create stage" };
  }
}

/**
 * Reset stages to the correct roofing workflow defaults
 * This will delete all existing stages and recreate them
 */
export async function resetStagesToDefaults() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    if (!membership) {
      return { error: "No organization found" };
    }

    const orgId = membership.organizationId;

    // First, unset stageId from all contacts in this org (so we can delete stages)
    await prisma.contact.updateMany({
      where: { organizationId: orgId },
      data: { stageId: null },
    });

    // Delete all existing stages for this organization
    await prisma.leadStage.deleteMany({
      where: { organizationId: orgId },
    });

    // Create the correct default stages
    const stages = await createDefaultStages(orgId);

    // Re-assign contacts to New Lead stage
    const newLeadStage = stages.find(s => s.name === STAGE_NAMES.NEW_LEAD);
    if (newLeadStage) {
      await prisma.contact.updateMany({
        where: { 
          organizationId: orgId,
          stageId: null,
        },
        data: { 
          stageId: newLeadStage.id,
          stageOrder: newLeadStage.order,
        },
      });
    }

    return { success: true, stages };
  } catch (error) {
    console.error("Error resetting stages:", error);
    return { error: "Failed to reset stages" };
  }
}

// Helper function to create default lead stages for roofing workflow
export async function createDefaultStages(organizationId: string) {
  const defaultStages = [
    // Initial stages (shared)
    { 
      name: STAGE_NAMES.NEW_LEAD, 
      color: "#6366f1", // Indigo
      order: 0, 
      stageType: "ACTIVE" as const, 
      workflowType: "BOTH" as const,
      isTerminal: false,
      description: "New lead - needs first contact"
    },
    { 
      name: STAGE_NAMES.SCHEDULED_INSPECTION, 
      color: "#14b8a6", // Teal
      order: 1, 
      stageType: "ACTIVE" as const, 
      workflowType: "BOTH" as const,
      isTerminal: false,
      description: "Initial inspection scheduled"
    },
    
    // Retail path
    { 
      name: STAGE_NAMES.RETAIL_PROSPECT, 
      color: "#f59e0b", // Amber
      order: 2, 
      stageType: "ACTIVE" as const, 
      workflowType: "RETAIL" as const,
      isTerminal: false,
      description: "Retail prospect - quote in progress"
    },
    
    // Claim path
    { 
      name: STAGE_NAMES.CLAIM_PROSPECT, 
      color: "#8b5cf6", // Purple
      order: 3, 
      stageType: "ACTIVE" as const, 
      workflowType: "CLAIM" as const,
      isTerminal: false,
      description: "Claim prospect - insurance claim in progress"
    },
    { 
      name: STAGE_NAMES.OPEN_CLAIM, 
      color: "#ec4899", // Pink
      order: 4, 
      stageType: "ACTIVE" as const, 
      workflowType: "CLAIM" as const,
      isTerminal: false,
      description: "PA signed - claim open with insurance"
    },
    
    // Terminal stages
    { 
      name: STAGE_NAMES.APPROVED, 
      color: "#22c55e", // Green
      order: 5, 
      stageType: "APPROVED" as const, 
      workflowType: "TERMINAL" as const,
      isTerminal: true,
      description: "Job approved - ready for scheduling"
    },
    { 
      name: STAGE_NAMES.SEASONAL, 
      color: "#06b6d4", // Cyan
      order: 6, 
      stageType: "SEASONAL" as const, 
      workflowType: "TERMINAL" as const,
      isTerminal: true,
      description: "Follow up in spring"
    },
    { 
      name: STAGE_NAMES.NOT_INTERESTED, 
      color: "#ef4444", // Red
      order: 7, 
      stageType: "NOT_INTERESTED" as const, 
      workflowType: "TERMINAL" as const,
      isTerminal: true,
      description: "Not interested / Lost"
    },
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

/**
 * Batch update multiple contacts to the same stage concurrently.
 * Reuses updateContactStage so task cancellation + creation logic is preserved.
 */
export async function updateContactsStagesBatch(contactIds: string[], stageId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Unauthorized" };

  try {
    // Run all stage updates concurrently (not serially)
    const results = await Promise.allSettled(
      contactIds.map((contactId) => updateContactStage(contactId, stageId))
    );

    const succeeded = results.filter((r) => r.status === "fulfilled" && !(r.value as { error?: string }).error).length;
    const failed = results.length - succeeded;

    revalidatePath("/tasks");
    revalidatePath("/contacts");
    revalidatePath("/dashboard");

    return { succeeded, failed, total: contactIds.length };
  } catch (error) {
    console.error("Error batch updating contact stages:", error);
    return { error: "Failed to update stages" };
  }
}
