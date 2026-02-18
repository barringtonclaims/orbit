"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { 
  generateTaskTitle, 
  getNextOfficeDay, 
  getNextOfficeDayAfter,
  getSeasonalFollowUpDate,
  getSpringReminderDate,
  getActionButtonForTaskType,
  getCurrentActionForTask,
  enforceOfficeDay,
  type TaskTypeForTitle 
} from "@/lib/scheduling";
import { STAGE_NAMES } from "@/types";

/**
 * Orbit Workflow Engine
 * 
 * Handles all status transitions and automatic task management for the roofing sales workflow.
 * 
 * Workflow paths:
 * 1. New Lead → Scheduled Inspection → (Retail Prospect | Claim Prospect)
 * 2. Retail: Retail Prospect → Quote Follow Up cycle → (Approved | Seasonal | Not Interested)
 * 3. Claim: Claim Prospect → PA Agreement → Open Claim → (Approved | Seasonal | Not Interested)
 */

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getOrganizationSettings(userId: string) {
  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
  });
  
  return {
    organizationId: membership?.organizationId,
    officeDays: membership?.organization.officeDays || [1, 3, 5],
    inspectionDays: membership?.organization.inspectionDays || [2, 4],
    seasonalFollowUpMonth: membership?.organization.seasonalFollowUpMonth || 4,
    seasonalFollowUpDay: membership?.organization.seasonalFollowUpDay || 1,
  };
}

async function getStageByName(organizationId: string, stageName: string) {
  let stage = await prisma.leadStage.findFirst({
    where: { organizationId, name: stageName },
  });
  
  // If stage not found, try to create default stages and retry
  if (!stage) {
    const { createDefaultStages } = await import("@/lib/actions/stages");
    
    // Check if any stages exist for this org
    const existingStages = await prisma.leadStage.count({
      where: { organizationId },
    });
    
    if (existingStages === 0) {
      await createDefaultStages(organizationId);
      stage = await prisma.leadStage.findFirst({
        where: { organizationId, name: stageName },
      });
    }
  }
  
  return stage;
}

async function cancelPendingTasks(contactId: string) {
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
}

type ActionButtonType = "SEND_FIRST_MESSAGE" | "SEND_FIRST_MESSAGE_FOLLOW_UP" | "SCHEDULE_INSPECTION" | "SEND_APPOINTMENT_REMINDER" | "ASSIGN_STATUS" | "SEND_QUOTE" | "SEND_QUOTE_FOLLOW_UP" | "SEND_CLAIM_REC" | "SEND_CLAIM_REC_FOLLOW_UP" | "SEND_PA_AGREEMENT" | "SEND_PA_FOLLOW_UP" | "SEND_CLAIM_FOLLOW_UP" | "UPLOAD_PA" | "SEND_SEASONAL_MESSAGE" | "MARK_RESPONDED" | "MARK_JOB_SCHEDULED" | "MARK_JOB_IN_PROGRESS" | "MARK_JOB_COMPLETE" | "JOSH_DRAFT_MESSAGE" | null;

async function createTask(params: {
  contactId: string;
  userId: string;
  taskType: TaskTypeForTitle;
  contactName: string;
  dueDate: Date;
  appointmentTime?: Date;
  extra?: { quoteType?: string };
  currentAction?: string; // Override the current action (for dynamic tasks like SET_APPOINTMENT)
  contact?: { firstMessageSentAt?: Date | null }; // For calculating dynamic current action
}) {
  const actionButton = getActionButtonForTaskType(params.taskType);
  
  // Calculate the current action - this may differ from actionButton for dynamic tasks
  let currentAction: string | null = params.currentAction || actionButton;
  
  // For SET_APPOINTMENT task, the current action depends on whether first message was sent
  if (params.taskType === 'SET_APPOINTMENT' && params.contact) {
    currentAction = getCurrentActionForTask('SET_APPOINTMENT', params.contact);
  }
  
  return prisma.task.create({
    data: {
      contactId: params.contactId,
      userId: params.userId,
      title: generateTaskTitle(params.contactName, params.taskType, {
        appointmentDate: params.appointmentTime,
        quoteType: params.extra?.quoteType,
      }),
      dueDate: params.dueDate,
      status: "PENDING",
      taskType: params.taskType,
      actionButton: actionButton as ActionButtonType,
      currentAction: currentAction as ActionButtonType,
      appointmentTime: params.appointmentTime,
    },
  });
}

async function addTimelineEntry(params: {
  contactId: string;
  userId: string;
  content: string;
  noteType: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}) {
  // Filter out undefined values from metadata
  const cleanMetadata = params.metadata 
    ? Object.fromEntries(
        Object.entries(params.metadata).filter(([, v]) => v !== undefined)
      )
    : undefined;
    
  return prisma.note.create({
    data: {
      contactId: params.contactId,
      userId: params.userId,
      content: params.content,
      noteType: params.noteType as "NOTE" | "EMAIL_SENT" | "SMS_SENT" | "STAGE_CHANGE" | "TASK_COMPLETED" | "APPOINTMENT_SCHEDULED" | "APPOINTMENT_COMPLETED" | "FILE_UPLOADED" | "PA_UPLOADED" | "QUOTE_SENT" | "CLAIM_REC_SENT" | "JOB_STATUS_CHANGE" | "SYSTEM",
      metadata: cleanMetadata as object | undefined,
    },
  });
}

// ============================================
// FIRST MESSAGE WORKFLOW
// ============================================

/**
 * Mark that the first message was sent and start the follow-up cycle
 * Called when user sends the initial message to a new lead
 */
export async function markFirstMessageSent(contactId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const { officeDays } = await getOrganizationSettings(user.id);
    
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { stage: true },
    });
    
    if (!contact) {
      return { error: "Contact not found" };
    }

    // Only for New Lead contacts
    if (contact.stage?.name !== STAGE_NAMES.NEW_LEAD) {
      return { error: "Contact is not in New Lead stage" };
    }

    // Update contact with first message sent timestamp
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        firstMessageSentAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Cancel existing first message task
    await cancelPendingTasks(contactId);

    // Create first message follow-up task for next office day
    const contactName = `${contact.firstName} ${contact.lastName}`;
    const nextDate = getNextOfficeDay(new Date(), officeDays);
    
    await createTask({
      contactId,
      userId: user.id,
      taskType: "FIRST_MESSAGE_FOLLOW_UP",
      contactName,
      dueDate: nextDate,
    });

    // Add timeline entry
    await addTimelineEntry({
      contactId,
      userId: user.id,
      content: "First message sent",
      noteType: "SMS_SENT",
      metadata: { type: "first_message" },
    });

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/tasks");

    return { success: true };
  } catch (error) {
    console.error("Error marking first message sent:", error);
    return { error: "Failed to mark first message sent" };
  }
}

/**
 * Reschedule first message follow-up (when no response received)
 */
export async function rescheduleFirstMessageFollowUp(taskId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const { officeDays } = await getOrganizationSettings(user.id);
    
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { contact: true },
    });
    
    if (!task) {
      return { error: "Task not found" };
    }

    // Mark current task as completed
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // Create new follow-up task for next office day
    const contactName = `${task.contact.firstName} ${task.contact.lastName}`;
    const nextDate = getNextOfficeDay(new Date(), officeDays);
    
    await createTask({
      contactId: task.contactId,
      userId: user.id,
      taskType: "FIRST_MESSAGE_FOLLOW_UP",
      contactName,
      dueDate: nextDate,
    });

    // Add timeline entry
    await addTimelineEntry({
      contactId: task.contactId,
      userId: user.id,
      content: `First message follow-up sent, next follow-up scheduled for ${nextDate.toLocaleDateString()}`,
      noteType: "SMS_SENT",
      metadata: { type: "first_message_follow_up" },
    });

    revalidatePath(`/contacts/${task.contactId}`);
    revalidatePath("/tasks");

    return { success: true };
  } catch (error) {
    console.error("Error rescheduling first message follow-up:", error);
    return { error: "Failed to reschedule follow-up" };
  }
}

// ============================================
// STATUS TRANSITIONS
// ============================================

/**
 * Transition contact to Scheduled Inspection status
 * Called when user schedules an initial inspection
 * 
 * This also automatically creates a "Discuss Initial Inspection" task 
 * for the next office day AFTER the scheduled inspection date.
 */
export async function transitionToScheduledInspection(
  contactId: string,
  appointmentDate: Date,
  appointmentNotes?: string
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const { organizationId, officeDays } = await getOrganizationSettings(user.id);
    if (!organizationId) {
      return { error: "No organization found" };
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) {
      return { error: "Contact not found" };
    }

    const stage = await getStageByName(organizationId, STAGE_NAMES.SCHEDULED_INSPECTION);
    if (!stage) {
      return { error: "Stage not found" };
    }

    // Cancel any pending tasks
    await cancelPendingTasks(contactId);

    // Update contact stage
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        stageId: stage.id,
        stageOrder: stage.order,
        updatedAt: new Date(),
      },
    });

    const contactName = `${contact.firstName} ${contact.lastName}`;
    
    // Create inspection appointment task
    await createTask({
      contactId,
      userId: user.id,
      taskType: "APPOINTMENT",
      contactName,
      dueDate: appointmentDate,
      appointmentTime: appointmentDate,
    });

    // Add timeline entries
    await addTimelineEntry({
      contactId,
      userId: user.id,
      content: `Stage changed to "${STAGE_NAMES.SCHEDULED_INSPECTION}"`,
      noteType: "STAGE_CHANGE",
      metadata: { stageName: STAGE_NAMES.SCHEDULED_INSPECTION },
    });

    await addTimelineEntry({
      contactId,
      userId: user.id,
      content: `Inspection scheduled for ${appointmentDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })}${appointmentNotes ? `. Notes: ${appointmentNotes}` : ''}`,
      noteType: "APPOINTMENT_SCHEDULED",
      metadata: { appointmentDate: appointmentDate.toISOString(), notes: appointmentNotes },
    });

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/tasks");
    revalidatePath("/calendar");

    return { success: true };
  } catch (error) {
    console.error("Error transitioning to scheduled inspection:", error);
    return { error: "Failed to schedule inspection" };
  }
}

/**
 * Create "Assign Status" task after inspection date has passed
 * Called by cron job or manually triggered
 */
export async function createAssignStatusTask(contactId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { stage: true },
    });
    
    if (!contact) {
      return { error: "Contact not found" };
    }

    // Only for contacts in Scheduled Inspection stage
    if (contact.stage?.name !== STAGE_NAMES.SCHEDULED_INSPECTION) {
      return { error: "Contact not in Scheduled Inspection stage" };
    }

    // Cancel any pending tasks
    await cancelPendingTasks(contactId);

    // Create assign status task
    const contactName = `${contact.firstName} ${contact.lastName}`;
    await createTask({
      contactId,
      userId: user.id,
      taskType: "ASSIGN_STATUS",
      contactName,
      dueDate: new Date(),
    });

    // Add timeline entry
    await addTimelineEntry({
      contactId,
      userId: user.id,
      content: "Inspection completed - status assignment needed",
      noteType: "APPOINTMENT_COMPLETED",
    });

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/tasks");

    return { success: true };
  } catch (error) {
    console.error("Error creating assign status task:", error);
    return { error: "Failed to create assign status task" };
  }
}

/**
 * Transition contact after inspection - to Retail or Claim Prospect
 */
export async function transitionAfterInspection(
  contactId: string,
  type: "retail" | "claim",
  notes: string,
  options?: {
    quoteType?: string; // For retail
    carrier?: string; // For claim
    dateOfLoss?: Date; // For claim
  }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const { organizationId, officeDays } = await getOrganizationSettings(user.id);
    if (!organizationId) {
      return { error: "No organization found" };
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) {
      return { error: "Contact not found" };
    }

    const stageName = type === "retail" ? STAGE_NAMES.RETAIL_PROSPECT : STAGE_NAMES.CLAIM_PROSPECT;
    const stage = await getStageByName(organizationId, stageName);
    if (!stage) {
      return { error: "Stage not found" };
    }

    // Cancel any pending tasks
    await cancelPendingTasks(contactId);

    // Update contact with stage and any claim-specific fields
    const updateData: {
      stageId: string;
      stageOrder: number;
      updatedAt: Date;
      quoteType?: string;
      carrier?: string;
      dateOfLoss?: Date;
    } = {
      stageId: stage.id,
      stageOrder: stage.order,
      updatedAt: new Date(),
    };

    if (type === "retail" && options?.quoteType) {
      updateData.quoteType = options.quoteType;
    }

    if (type === "claim") {
      if (options?.carrier) updateData.carrier = options.carrier;
      if (options?.dateOfLoss) updateData.dateOfLoss = options.dateOfLoss;
    }

    await prisma.contact.update({
      where: { id: contactId },
      data: updateData,
    });

    // Create appropriate task
    const contactName = `${contact.firstName} ${contact.lastName}`;
    const nextDate = getNextOfficeDay(new Date(), officeDays);

    if (type === "retail") {
      await createTask({
        contactId,
        userId: user.id,
        taskType: "SEND_QUOTE",
        contactName,
        dueDate: nextDate,
        extra: { quoteType: options?.quoteType },
      });
    } else {
      await createTask({
        contactId,
        userId: user.id,
        taskType: "CLAIM_RECOMMENDATION",
        contactName,
        dueDate: nextDate,
      });
    }

    // Add timeline entries
    await addTimelineEntry({
      contactId,
      userId: user.id,
      content: `Stage changed to "${stageName}"`,
      noteType: "STAGE_CHANGE",
      metadata: { stageName, type },
    });

    if (notes) {
      await addTimelineEntry({
        contactId,
        userId: user.id,
        content: `Inspection notes: ${notes}`,
        noteType: "NOTE",
      });
    }

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/tasks");

    return { success: true };
  } catch (error) {
    console.error("Error transitioning after inspection:", error);
    return { error: "Failed to transition contact" };
  }
}

/**
 * Mark that a quote was sent and start follow-up cycle
 */
export async function markQuoteSent(contactId: string, quoteDescription?: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const { officeDays } = await getOrganizationSettings(user.id);
    
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) {
      return { error: "Contact not found" };
    }

    // Update contact with quote sent timestamp
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        quoteSentAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Cancel any pending tasks
    await cancelPendingTasks(contactId);

    // Create quote follow-up task for next office day
    const contactName = `${contact.firstName} ${contact.lastName}`;
    const nextDate = getNextOfficeDay(new Date(), officeDays);
    
    await createTask({
      contactId,
      userId: user.id,
      taskType: "QUOTE_FOLLOW_UP",
      contactName,
      dueDate: nextDate,
    });

    // Add timeline entry
    await addTimelineEntry({
      contactId,
      userId: user.id,
      content: `Quote sent${quoteDescription ? `: ${quoteDescription}` : ''}`,
      noteType: "QUOTE_SENT",
      metadata: { quoteDescription },
    });

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/tasks");

    return { success: true };
  } catch (error) {
    console.error("Error marking quote sent:", error);
    return { error: "Failed to mark quote sent" };
  }
}

/**
 * Mark that a claim recommendation was sent and start follow-up cycle
 */
export async function markClaimRecSent(
  contactId: string,
  carrier: string,
  dateOfLoss: Date
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const { officeDays } = await getOrganizationSettings(user.id);
    
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) {
      return { error: "Contact not found" };
    }

    // Update contact with claim info and timestamp
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        carrier,
        dateOfLoss,
        claimRecSentAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Cancel any pending tasks
    await cancelPendingTasks(contactId);

    // Create claim rec follow-up task
    const contactName = `${contact.firstName} ${contact.lastName}`;
    const nextDate = getNextOfficeDay(new Date(), officeDays);
    
    await createTask({
      contactId,
      userId: user.id,
      taskType: "CLAIM_REC_FOLLOW_UP",
      contactName,
      dueDate: nextDate,
    });

    // Add timeline entry
    await addTimelineEntry({
      contactId,
      userId: user.id,
      content: `Claim recommendation sent. Carrier: ${carrier}, Date of Loss: ${dateOfLoss.toLocaleDateString()}`,
      noteType: "CLAIM_REC_SENT",
      metadata: { carrier, dateOfLoss: dateOfLoss.toISOString() },
    });

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/tasks");

    return { success: true };
  } catch (error) {
    console.error("Error marking claim rec sent:", error);
    return { error: "Failed to mark claim recommendation sent" };
  }
}

/**
 * Mark that PA agreement was sent and start follow-up cycle
 */
export async function markPASent(contactId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const { officeDays } = await getOrganizationSettings(user.id);
    
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) {
      return { error: "Contact not found" };
    }

    // Update contact with PA sent timestamp
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        paSentAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Cancel any pending tasks
    await cancelPendingTasks(contactId);

    // Create PA follow-up task
    const contactName = `${contact.firstName} ${contact.lastName}`;
    const nextDate = getNextOfficeDay(new Date(), officeDays);
    
    await createTask({
      contactId,
      userId: user.id,
      taskType: "PA_FOLLOW_UP",
      contactName,
      dueDate: nextDate,
    });

    // Add timeline entry
    await addTimelineEntry({
      contactId,
      userId: user.id,
      content: "PA Agreement sent",
      noteType: "EMAIL_SENT",
      metadata: { type: "pa_agreement" },
    });

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/tasks");

    return { success: true };
  } catch (error) {
    console.error("Error marking PA sent:", error);
    return { error: "Failed to mark PA agreement sent" };
  }
}

/**
 * Transition contact to Open Claim status after PA is uploaded
 */
export async function transitionToOpenClaim(contactId: string, fileId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const { organizationId, officeDays } = await getOrganizationSettings(user.id);
    if (!organizationId) {
      return { error: "No organization found" };
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) {
      return { error: "Contact not found" };
    }

    const stage = await getStageByName(organizationId, STAGE_NAMES.OPEN_CLAIM);
    if (!stage) {
      return { error: "Stage not found" };
    }

    // Mark file as PA document
    await prisma.contactFile.update({
      where: { id: fileId },
      data: { 
        isPADocument: true,
        fileType: "PA_AGREEMENT",
      },
    });

    // Cancel any pending tasks
    await cancelPendingTasks(contactId);

    // Update contact stage
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        stageId: stage.id,
        stageOrder: stage.order,
        updatedAt: new Date(),
      },
    });

    // Create claim follow-up task
    const contactName = `${contact.firstName} ${contact.lastName}`;
    const nextDate = getNextOfficeDay(new Date(), officeDays);
    
    await createTask({
      contactId,
      userId: user.id,
      taskType: "CLAIM_FOLLOW_UP",
      contactName,
      dueDate: nextDate,
    });

    // Add timeline entries
    await addTimelineEntry({
      contactId,
      userId: user.id,
      content: "Signed PA Agreement uploaded",
      noteType: "PA_UPLOADED",
    });

    await addTimelineEntry({
      contactId,
      userId: user.id,
      content: `Stage changed to "${STAGE_NAMES.OPEN_CLAIM}"`,
      noteType: "STAGE_CHANGE",
      metadata: { stageName: STAGE_NAMES.OPEN_CLAIM },
    });

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/tasks");

    return { success: true };
  } catch (error) {
    console.error("Error transitioning to open claim:", error);
    return { error: "Failed to transition to open claim" };
  }
}

/**
 * Transition contact to a terminal status (Approved, Seasonal, Not Interested)
 */
export async function transitionToTerminal(
  contactId: string,
  status: "approved" | "seasonal" | "not_interested",
  notes?: string
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const { organizationId, officeDays, seasonalFollowUpMonth, seasonalFollowUpDay } = await getOrganizationSettings(user.id);
    if (!organizationId) {
      return { error: "No organization found" };
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });
    if (!contact) {
      return { error: "Contact not found" };
    }

    const stageNameMap = {
      approved: STAGE_NAMES.APPROVED,
      seasonal: STAGE_NAMES.SEASONAL,
      not_interested: STAGE_NAMES.NOT_INTERESTED,
    };

    const stageName = stageNameMap[status];
    const stage = await getStageByName(organizationId, stageName);
    if (!stage) {
      return { error: "Stage not found" };
    }

    // Cancel any pending tasks
    await cancelPendingTasks(contactId);

    // Update contact
    const updateData: {
      stageId: string;
      stageOrder: number;
      updatedAt: Date;
      seasonalReminderDate?: Date;
      jobStatus?: "SCHEDULED";
    } = {
      stageId: stage.id,
      stageOrder: stage.order,
      updatedAt: new Date(),
    };

    // Set seasonal reminder using organization's configured date
    if (status === "seasonal") {
      const reminderDate = getSeasonalFollowUpDate(
        seasonalFollowUpMonth,
        seasonalFollowUpDay,
        new Date(),
        officeDays
      );
      updateData.seasonalReminderDate = reminderDate;
    }

    // Initialize job status for approved contacts
    if (status === "approved") {
      updateData.jobStatus = "SCHEDULED";
    }

    await prisma.contact.update({
      where: { id: contactId },
      data: updateData,
    });

    // For approved contacts, create an Approval Check-In task for the next office day
    if (status === "approved") {
      const contactName = `${contact.firstName} ${contact.lastName}`;
      const checkInDate = getNextOfficeDay(new Date(), officeDays);

      await prisma.task.create({
        data: {
          contactId,
          userId: user.id,
          title: `${contactName} - Approval Check In`,
          dueDate: checkInDate,
          status: "PENDING",
          taskType: "FOLLOW_UP",
          actionButton: null,
          currentAction: null,
        },
      });
    }

    // For seasonal contacts, also create the seasonal follow-up task
    if (status === "seasonal") {
      const contactName = `${contact.firstName} ${contact.lastName}`;
      const reminderDate = getSeasonalFollowUpDate(
        seasonalFollowUpMonth,
        seasonalFollowUpDay,
        new Date(),
        officeDays
      );
      
      await createTask({
        contactId,
        userId: user.id,
        taskType: "SEASONAL_FOLLOW_UP",
        contactName,
        dueDate: reminderDate,
      });
    }

    // Add timeline entries
    await addTimelineEntry({
      contactId,
      userId: user.id,
      content: `Stage changed to "${stageName}"`,
      noteType: "STAGE_CHANGE",
      metadata: { stageName, status },
    });

    if (notes) {
      await addTimelineEntry({
        contactId,
        userId: user.id,
        content: notes,
        noteType: "NOTE",
      });
    }

    if (status === "seasonal") {
      const reminderDate = getSeasonalFollowUpDate(
        seasonalFollowUpMonth,
        seasonalFollowUpDay,
        new Date(),
        officeDays
      );
      await addTimelineEntry({
        contactId,
        userId: user.id,
        content: `Seasonal follow-up scheduled for ${reminderDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
        noteType: "SYSTEM",
      });
    }

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/tasks");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error transitioning to terminal:", error);
    return { error: "Failed to transition contact" };
  }
}

/**
 * Update job status for approved contacts
 */
export async function updateJobStatus(
  contactId: string,
  jobStatus: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED",
  date?: Date
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { stage: true },
    });
    
    if (!contact) {
      return { error: "Contact not found" };
    }

    if (contact.stage?.stageType !== "APPROVED") {
      return { error: "Contact is not in Approved status" };
    }

    const updateData: {
      jobStatus: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED";
      jobScheduledDate?: Date;
      jobCompletedDate?: Date;
      updatedAt: Date;
    } = {
      jobStatus,
      updatedAt: new Date(),
    };

    if (jobStatus === "SCHEDULED" && date) {
      updateData.jobScheduledDate = date;
    }
    if (jobStatus === "COMPLETED") {
      updateData.jobCompletedDate = date || new Date();
    }

    await prisma.contact.update({
      where: { id: contactId },
      data: updateData,
    });

    const statusText = {
      SCHEDULED: "Job scheduled",
      IN_PROGRESS: "Job in progress",
      COMPLETED: "Job completed",
    };

    await addTimelineEntry({
      contactId,
      userId: user.id,
      content: statusText[jobStatus],
      noteType: "JOB_STATUS_CHANGE",
      metadata: { jobStatus, date: date?.toISOString() },
    });

    // Auto-create relevant follow-up tasks when job status changes
    const { officeDays: orgOfficeDays } = await getOrganizationSettings(user.id);
    const contactForTask = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { firstName: true, lastName: true },
    });

    if (contactForTask) {
      const contactName = `${contactForTask.firstName} ${contactForTask.lastName}`;
      const nextDate = getNextOfficeDay(new Date(), orgOfficeDays);

      // Cancel any existing pending FOLLOW_UP tasks for this contact
      await prisma.task.updateMany({
        where: { contactId, taskType: "FOLLOW_UP", status: { in: ["PENDING", "IN_PROGRESS"] } },
        data: { status: "CANCELLED", updatedAt: new Date() },
      });

      if (jobStatus === "COMPLETED") {
        await prisma.task.create({
          data: {
            contactId,
            userId: user.id,
            title: `${contactName} - Invoice Follow Up`,
            dueDate: nextDate,
            status: "PENDING",
            taskType: "FOLLOW_UP",
            actionButton: null,
            currentAction: null,
          },
        });
      } else if (jobStatus === "IN_PROGRESS") {
        await prisma.task.create({
          data: {
            contactId,
            userId: user.id,
            title: `${contactName} - Job Check In`,
            dueDate: nextDate,
            status: "PENDING",
            taskType: "FOLLOW_UP",
            actionButton: null,
            currentAction: null,
          },
        });
      }
    }

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/dashboard");
    revalidatePath("/tasks");

    return { success: true };
  } catch (error) {
    console.error("Error updating job status:", error);
    return { error: "Failed to update job status" };
  }
}

/**
 * Reschedule a follow-up task to the next office day
 * Called when completing a follow-up task that should auto-reschedule
 */
export async function rescheduleFollowUp(taskId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const { officeDays } = await getOrganizationSettings(user.id);
    
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { contact: true },
    });
    
    if (!task) {
      return { error: "Task not found" };
    }

    // Mark current task as completed
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // Create new follow-up task for next office day
    const contactName = `${task.contact.firstName} ${task.contact.lastName}`;
    const nextDate = getNextOfficeDay(new Date(), officeDays);
    
    await createTask({
      contactId: task.contactId,
      userId: user.id,
      taskType: task.taskType as TaskTypeForTitle,
      contactName,
      dueDate: nextDate,
    });

    // Add timeline entry
    await addTimelineEntry({
      contactId: task.contactId,
      userId: user.id,
      content: `Follow-up completed, next follow-up scheduled for ${nextDate.toLocaleDateString()}`,
      noteType: "TASK_COMPLETED",
    });

    revalidatePath(`/contacts/${task.contactId}`);
    revalidatePath("/tasks");

    return { success: true };
  } catch (error) {
    console.error("Error rescheduling follow-up:", error);
    return { error: "Failed to reschedule follow-up" };
  }
}

/**
 * Complete a task without auto-rescheduling
 * Used when customer responds or when manually completing tasks
 */
export async function completeTaskWithoutReschedule(taskId: string, notes?: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { contact: true },
    });
    
    if (!task) {
      return { error: "Task not found" };
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    await addTimelineEntry({
      contactId: task.contactId,
      userId: user.id,
      content: `Task completed: ${task.title}${notes ? `. ${notes}` : ''}`,
      noteType: "TASK_COMPLETED",
    });

    revalidatePath(`/contacts/${task.contactId}`);
    revalidatePath("/tasks");

    return { success: true };
  } catch (error) {
    console.error("Error completing task:", error);
    return { error: "Failed to complete task" };
  }
}

// ============================================
// CRON JOB HELPERS
// ============================================

/**
 * Check for inspections that have passed and mark them completed
 * The "Discuss Initial Inspection" task is already auto-created when the inspection is scheduled,
 * so this cron just marks the appointment task as completed.
 * Should be called by daily cron job.
 */
export async function checkPassedInspections() {
  try {
    const now = new Date();
    
    // Find all contacts with passed inspection appointments
    const contactsWithPassedInspections = await prisma.contact.findMany({
      where: {
        stage: {
          name: STAGE_NAMES.SCHEDULED_INSPECTION,
        },
        tasks: {
          some: {
            taskType: "APPOINTMENT",
            status: { in: ["PENDING", "IN_PROGRESS"] },
            appointmentTime: {
              lt: now,
            },
          },
        },
      },
      include: {
        tasks: {
          where: {
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
        },
        assignedTo: true,
        organization: true,
      },
    });

    const results = [];
    for (const contact of contactsWithPassedInspections) {
      // Mark inspection task as completed
      const appointmentTasks = contact.tasks.filter(t => t.taskType === "APPOINTMENT");
      for (const task of appointmentTasks) {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: "COMPLETED",
            completedAt: now,
          },
        });
      }

      // Check if discuss inspection task already exists (it should from scheduling)
      const hasDiscussTask = contact.tasks.some(t => 
        t.taskType === "DISCUSS_INSPECTION" && 
        (t.status === "PENDING" || t.status === "IN_PROGRESS")
      );

      // If no discuss task exists (fallback), create one for today
      if (!hasDiscussTask) {
        const contactName = `${contact.firstName} ${contact.lastName}`;
        const actionButton = getActionButtonForTaskType("DISCUSS_INSPECTION");
        const officeDays = contact.organization.officeDays || [1, 3, 5];
        const dueDate = enforceOfficeDay(now, officeDays);
        
        await prisma.task.create({
          data: {
            contactId: contact.id,
            userId: contact.assignedToId || contact.createdById,
            title: generateTaskTitle(contactName, "DISCUSS_INSPECTION"),
            dueDate,
            status: "PENDING",
            taskType: "DISCUSS_INSPECTION",
            actionButton: actionButton as ActionButtonType,
            currentAction: actionButton as ActionButtonType,
          },
        });
      }

      results.push({ contactId: contact.id, contactName: `${contact.firstName} ${contact.lastName}` });
    }

    return { success: true, processed: results.length, contacts: results };
  } catch (error) {
    console.error("Error checking passed inspections:", error);
    return { error: "Failed to check passed inspections" };
  }
}

/**
 * Check for seasonal contacts that need spring reminders
 * Should be called by daily cron job
 */
export async function checkSeasonalReminders() {
  try {
    const today = new Date();
    
    const contactsNeedingReminder = await prisma.contact.findMany({
      where: {
        stage: {
          stageType: "SEASONAL",
        },
        seasonalReminderDate: {
          lte: today,
        },
        // Don't create duplicate tasks
        tasks: {
          none: {
            taskType: "FOLLOW_UP",
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
        },
      },
      include: {
        assignedTo: true,
      },
    });

    const results = [];
    for (const contact of contactsNeedingReminder) {
      const contactName = `${contact.firstName} ${contact.lastName}`;
      
      await prisma.task.create({
        data: {
          contactId: contact.id,
          userId: contact.assignedToId || contact.createdById,
          title: `${contactName} - Spring Follow Up`,
          dueDate: today,
          status: "PENDING",
          taskType: "FOLLOW_UP",
          actionButton: "SEND_FIRST_MESSAGE",
        },
      });

      // Update the seasonal reminder date for next year
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          seasonalReminderDate: getSpringReminderDate(new Date(today.getFullYear() + 1, 0, 1)),
        },
      });

      results.push({ contactId: contact.id, contactName });
    }

    return { success: true, processed: results.length, contacts: results };
  } catch (error) {
    console.error("Error checking seasonal reminders:", error);
    return { error: "Failed to check seasonal reminders" };
  }
}

/**
 * Check for contacts without any pending tasks and create appropriate tasks
 * This ensures every active contact always has a task assigned.
 * Should be called by daily cron job or can be triggered manually.
 */
export async function checkContactsWithoutTasks(organizationId?: string) {
  try {
    const now = new Date();
    
    const allContacts = await prisma.contact.findMany({
      where: {
        ...(organizationId && { organizationId }),
      },
      include: {
        stage: true,
        tasks: {
          where: {
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
        },
      },
    });
    
    const contactsWithoutTasks = allContacts.filter(contact => {
      // Only skip truly "done" stages - Seasonal and Not Interested
      // Approved contacts SHOULD have tasks (check-ins, invoice follow-ups)
      const isSkipped = contact.stage?.stageType === "SEASONAL" ||
                        contact.stage?.stageType === "NOT_INTERESTED";
      const hasPendingTasks = contact.tasks.length > 0;
      return !isSkipped && !hasPendingTasks;
    });
    
    // Now fetch full contact details for those that need tasks
    const contactIds = contactsWithoutTasks.map(c => c.id);
    const contactsToFix = await prisma.contact.findMany({
      where: {
        id: { in: contactIds },
      },
      include: {
        stage: true,
        assignedTo: true,
        organization: true,
      },
    });

    const results = [];
    for (const contact of contactsToFix) {
      const contactName = `${contact.firstName} ${contact.lastName}`;
      const officeDays = contact.organization?.officeDays || [1, 3, 5];
      const dueDate = enforceOfficeDay(now, officeDays);
      
      // Determine appropriate task type based on stage and contact state
      let taskType: TaskTypeForTitle = "FOLLOW_UP";
      
      if (contact.stage?.name === STAGE_NAMES.NEW_LEAD) {
        // New leads need first message or follow-up
        taskType = contact.firstMessageSentAt ? "FIRST_MESSAGE_FOLLOW_UP" : "FIRST_MESSAGE";
      } else if (contact.stage?.name === STAGE_NAMES.SCHEDULED_INSPECTION) {
        // Contacts with scheduled inspection need discuss task
        taskType = "DISCUSS_INSPECTION";
      } else if (contact.stage?.name === STAGE_NAMES.RETAIL_PROSPECT) {
        // Retail prospects need quote or follow-up
        taskType = contact.quoteSentAt ? "QUOTE_FOLLOW_UP" : "SEND_QUOTE";
      } else if (contact.stage?.name === STAGE_NAMES.CLAIM_PROSPECT) {
        // Claim prospects need claim rec, PA, or follow-up
        if (contact.paSentAt) {
          taskType = "PA_FOLLOW_UP";
        } else if (contact.claimRecSentAt) {
          taskType = "CLAIM_REC_FOLLOW_UP";
        } else {
          taskType = "CLAIM_RECOMMENDATION";
        }
      } else if (contact.stage?.name === STAGE_NAMES.OPEN_CLAIM) {
        taskType = "CLAIM_FOLLOW_UP";
      } else if (contact.stage?.stageType === "APPROVED") {
        // Approved jobs need check-ins and invoice follow-ups
        taskType = "FOLLOW_UP";
      }
      
      const actionButton = getActionButtonForTaskType(taskType);

      // Build a descriptive title for approved job tasks
      const approvedTaskTitle = (() => {
        if (contact.stage?.stageType !== "APPROVED") return null;
        if (contact.jobStatus === "COMPLETED") return `${contactName} - Invoice Follow Up`;
        if (contact.jobStatus === "IN_PROGRESS") return `${contactName} - Job Check In`;
        return `${contactName} - Approval Check In`;
      })();
      
      await prisma.task.create({
        data: {
          contactId: contact.id,
          userId: contact.assignedToId || contact.createdById,
          title: approvedTaskTitle || generateTaskTitle(contactName, taskType),
          dueDate,
          status: "PENDING",
          taskType: taskType,
          actionButton: actionButton as ActionButtonType,
          currentAction: actionButton as ActionButtonType,
        },
      });

      results.push({ 
        contactId: contact.id, 
        contactName,
        stage: contact.stage?.name,
        taskCreated: taskType,
      });
    }

    return { 
      success: true, 
      processed: results.length, 
      contacts: results,
      message: results.length > 0 
        ? `Created tasks for ${results.length} contact(s) without tasks`
        : "All active contacts have tasks assigned"
    };
  } catch (error) {
    console.error("Error checking contacts without tasks:", error);
    return { error: "Failed to check contacts without tasks" };
  }
}

