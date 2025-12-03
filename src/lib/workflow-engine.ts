"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { 
  generateTaskTitle, 
  getNextOfficeDay, 
  getSpringReminderDate,
  getActionButtonForTaskType,
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

async function createTask(params: {
  contactId: string;
  userId: string;
  taskType: TaskTypeForTitle;
  contactName: string;
  dueDate: Date;
  appointmentTime?: Date;
  extra?: { quoteType?: string };
}) {
  const actionButton = getActionButtonForTaskType(params.taskType);
  
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
      actionButton: actionButton as "SEND_FIRST_MESSAGE" | "SCHEDULE_INSPECTION" | "ASSIGN_STATUS" | "SEND_QUOTE" | "SEND_QUOTE_FOLLOW_UP" | "SEND_CLAIM_REC" | "SEND_CLAIM_FOLLOW_UP" | "SEND_PA_AGREEMENT" | "SEND_PA_FOLLOW_UP" | "UPLOAD_PA" | "MARK_RESPONDED" | "MARK_JOB_SCHEDULED" | "MARK_JOB_IN_PROGRESS" | "MARK_JOB_COMPLETE" | null,
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
    const { organizationId } = await getOrganizationSettings(user.id);
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

    // Create inspection appointment task
    const contactName = `${contact.firstName} ${contact.lastName}`;
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
    const { organizationId } = await getOrganizationSettings(user.id);
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

    // Set spring reminder for seasonal follow-up
    if (status === "seasonal") {
      updateData.seasonalReminderDate = getSpringReminderDate();
    }

    // Initialize job status for approved contacts
    if (status === "approved") {
      updateData.jobStatus = "SCHEDULED";
    }

    await prisma.contact.update({
      where: { id: contactId },
      data: updateData,
    });

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
      const reminderDate = getSpringReminderDate();
      await addTimelineEntry({
        contactId,
        userId: user.id,
        content: `Spring follow-up reminder set for ${reminderDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
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

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/dashboard");

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
 * Check for inspections that have passed and need status assignment
 * Should be called by daily cron job
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
            taskType: "APPOINTMENT",
            status: { in: ["PENDING", "IN_PROGRESS"] },
          },
        },
        assignedTo: true,
      },
    });

    const results = [];
    for (const contact of contactsWithPassedInspections) {
      // Mark inspection task as completed
      for (const task of contact.tasks) {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: "COMPLETED",
            completedAt: now,
          },
        });
      }

      // Create assign status task
      const contactName = `${contact.firstName} ${contact.lastName}`;
      const actionButton = getActionButtonForTaskType("ASSIGN_STATUS");
      
      await prisma.task.create({
        data: {
          contactId: contact.id,
          userId: contact.assignedToId || contact.createdById,
          title: generateTaskTitle(contactName, "ASSIGN_STATUS"),
          dueDate: now,
          status: "PENDING",
          taskType: "ASSIGN_STATUS",
          actionButton: actionButton as "SEND_FIRST_MESSAGE" | "SCHEDULE_INSPECTION" | "ASSIGN_STATUS" | "SEND_QUOTE" | "SEND_QUOTE_FOLLOW_UP" | "SEND_CLAIM_REC" | "SEND_CLAIM_FOLLOW_UP" | "SEND_PA_AGREEMENT" | "SEND_PA_FOLLOW_UP" | "UPLOAD_PA" | "MARK_RESPONDED" | "MARK_JOB_SCHEDULED" | "MARK_JOB_IN_PROGRESS" | "MARK_JOB_COMPLETE" | null,
        },
      });

      results.push({ contactId: contact.id, contactName });
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

