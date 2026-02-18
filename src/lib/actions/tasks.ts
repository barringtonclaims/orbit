"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import { getNextOfficeDay, generateTaskTitle, getActionButtonForTaskType, type TaskTypeForTitle } from "@/lib/scheduling";
import { Prisma } from "@prisma/client";

export type TaskWithContact = Prisma.TaskGetPayload<{
  include: {
    contact: {
      select: {
        id: true;
        firstName: true;
        lastName: true;
        phone: true;
        email: true;
        address: true;
        carrier: true;
        carrierId: true;
        claimNumber: true;
        adjusterEmail: true;
        quoteType: true;
        stage: {
          select: {
            id: true;
            name: true;
            color: true;
            stageType: true;
            workflowType: true;
          };
        };
        carrierRef: {
          select: {
            id: true;
            name: true;
            unifiedEmail: true;
            emailType: true;
          };
        };
      };
    };
  };
}>;

export async function getTasks(options?: {
  view?: "today" | "upcoming" | "overdue" | "completed" | "seasonal" | "not_interested" | "approved" | "all";
  contactId?: string;
  taskType?: string;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: [] };
  }

  try {
    // Get user's ACTIVE organization
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { activeOrganizationId: true },
    });

    let membership;
    if (dbUser?.activeOrganizationId) {
      membership = await prisma.organizationMember.findFirst({
        where: { 
          userId: user.id,
          organizationId: dbUser.activeOrganizationId,
        },
      });
    }

    if (!membership) {
      membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
        orderBy: { joinedAt: "asc" },
      });
    }

    if (!membership) {
      return { data: [] };
    }

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const where: Prisma.TaskWhereInput = {
      userId: user.id,
      // CRITICAL: Only show tasks for contacts in the active organization
      contact: {
        organizationId: membership.organizationId,
      },
    };

    if (options?.contactId) {
      where.contactId = options.contactId;
    }

    if (options?.taskType) {
      where.taskType = options.taskType as Prisma.EnumTaskTypeFilter["equals"];
    }

    // Active views exclude terminal stages (seasonal, not interested, approved)
    const activeContactFilter = {
      organizationId: membership.organizationId,
      OR: [
        { stage: { isTerminal: false } },
        { stage: null },
        { stageId: null },
      ],
    };

    switch (options?.view) {
      case "today":
        where.status = { in: ["PENDING", "IN_PROGRESS"] };
        where.dueDate = { gte: todayStart, lte: todayEnd };
        where.contact = activeContactFilter;
        break;
      case "upcoming":
        where.status = { in: ["PENDING", "IN_PROGRESS"] };
        where.dueDate = { gt: todayEnd };
        where.contact = activeContactFilter;
        break;
      case "overdue":
        where.status = { in: ["PENDING", "IN_PROGRESS"] };
        where.dueDate = { lt: todayStart };
        where.contact = activeContactFilter;
        break;
      case "completed":
        where.status = "COMPLETED";
        break;
      case "seasonal":
        where.status = { in: ["PENDING", "IN_PROGRESS"] };
        where.contact = {
          organizationId: membership.organizationId,
          stage: { stageType: "SEASONAL" },
        };
        break;
      case "not_interested":
        where.status = { in: ["PENDING", "IN_PROGRESS"] };
        where.contact = {
          organizationId: membership.organizationId,
          stage: { stageType: "NOT_INTERESTED" },
        };
        break;
      case "approved":
        where.status = { in: ["PENDING", "IN_PROGRESS"] };
        where.contact = {
          organizationId: membership.organizationId,
          stage: { stageType: "APPROVED" },
        };
        break;
      case "all":
        break;
      default:
        where.status = { in: ["PENDING", "IN_PROGRESS"] };
        where.contact = activeContactFilter;
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            address: true,
            carrier: true,
            carrierId: true,
            claimNumber: true,
            adjusterEmail: true,
            quoteType: true,
            stage: {
              select: {
                id: true,
                name: true,
                color: true,
                stageType: true,
                workflowType: true,
              },
            },
            carrierRef: {
              select: {
                id: true,
                name: true,
                unifiedEmail: true,
                emailType: true,
              },
            },
          },
        },
      },
      orderBy: [
        { dueDate: "asc" },
        { createdAt: "asc" },
      ],
    });

    return { data: tasks as TaskWithContact[] };
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return { error: "Failed to fetch tasks", data: [] };
  }
}

export async function getTaskStats() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: null };
  }

  try {
    // Get active organization
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { activeOrganizationId: true },
    });

    let membership;
    if (dbUser?.activeOrganizationId) {
      membership = await prisma.organizationMember.findFirst({
        where: { 
          userId: user.id,
          organizationId: dbUser.activeOrganizationId,
        },
      });
    }

    if (!membership) {
      membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
        orderBy: { joinedAt: "asc" },
      });
    }

    if (!membership) {
      return { data: null };
    }

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const [today, upcoming, overdue] = await Promise.all([
      prisma.task.count({
        where: {
          userId: user.id,
          contact: { organizationId: membership.organizationId },
          status: { in: ["PENDING", "IN_PROGRESS"] },
          dueDate: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.task.count({
        where: {
          userId: user.id,
          contact: { organizationId: membership.organizationId },
          status: { in: ["PENDING", "IN_PROGRESS"] },
          dueDate: { gt: todayEnd },
        },
      }),
      prisma.task.count({
        where: {
          userId: user.id,
          contact: { organizationId: membership.organizationId },
          status: { in: ["PENDING", "IN_PROGRESS"] },
          dueDate: { lt: todayStart },
        },
      }),
    ]);

    return { data: { today, upcoming, overdue, total: today + upcoming + overdue } };
  } catch (error) {
    console.error("Error fetching task stats:", error);
    return { error: "Failed to fetch task stats", data: null };
  }
}

export async function completeTask(taskId: string, options?: {
  reschedule?: boolean; // Whether to auto-reschedule to next office day
  nextTaskType?: TaskTypeForTitle; // Specific task type for next task
  customTitle?: string; // Override the auto-generated task title
  notes?: string;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
      include: {
        contact: true,
      },
    });

    // Add timeline entry
    await prisma.note.create({
      data: {
        contactId: task.contactId,
        userId: user.id,
        content: `Completed task: ${task.title}${options?.notes ? `. ${options.notes}` : ''}`,
        noteType: "TASK_COMPLETED",
      },
    });

    // Fetch org for scheduling settings
    const completeDbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { activeOrganizationId: true },
    });
    let membership;
    if (completeDbUser?.activeOrganizationId) {
      membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id, organizationId: completeDbUser.activeOrganizationId },
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
    const rawOfficeDays = membership?.organization?.officeDays;
    const officeDays = Array.isArray(rawOfficeDays) && rawOfficeDays.length > 0 ? rawOfficeDays : [1, 3, 5];
    const contactName = `${task.contact.firstName} ${task.contact.lastName}`;

    // Handle explicit reschedule or next task creation
    if (options?.reschedule || options?.nextTaskType || options?.customTitle) {
      const nextDate = getNextOfficeDay(new Date(), officeDays);
      const nextTaskType = options?.nextTaskType || task.taskType as TaskTypeForTitle;
      const actionButton = getActionButtonForTaskType(nextTaskType);
      
      // Use custom title if provided, otherwise auto-generate
      const title = options?.customTitle 
        ? `${contactName} - ${options.customTitle}`
        : generateTaskTitle(contactName, nextTaskType, {
            quoteType: task.contact.quoteType || undefined,
          });
      
      await prisma.task.create({
        data: {
          contactId: task.contactId,
          userId: user.id,
          title,
          dueDate: nextDate,
          status: "PENDING",
          taskType: nextTaskType,
          actionButton: actionButton as ActionButtonType,
          currentAction: actionButton as ActionButtonType,
        },
      });
    }

    // SAFETY NET: Every contact must always have a pending task.
    // Check if the contact still has any pending tasks after this completion.
    const remainingTasks = await prisma.task.count({
      where: {
        contactId: task.contactId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });

    if (remainingTasks === 0) {
      const contact = await prisma.contact.findUnique({
        where: { id: task.contactId },
        include: { stage: true },
      });

      if (contact) {
        const nextDate = getNextOfficeDay(new Date(), officeDays);
        let fallbackTitle = `${contactName} - Follow Up`;
        const fallbackType: TaskTypeForTitle = "FOLLOW_UP";

        if (contact.stage?.stageType === "APPROVED") {
          fallbackTitle = `${contactName} - Approval Check In`;
        } else if (contact.stage?.stageType === "NOT_INTERESTED") {
          fallbackTitle = `${contactName} - Reactivation Review`;
        } else if (contact.stage?.stageType === "SEASONAL") {
          fallbackTitle = `${contactName} - Seasonal Follow Up`;
        }

        const actionButton = getActionButtonForTaskType(fallbackType);
        await prisma.task.create({
          data: {
            contactId: task.contactId,
            userId: user.id,
            title: fallbackTitle,
            dueDate: nextDate,
            status: "PENDING",
            taskType: fallbackType,
            actionButton: actionButton as ActionButtonType,
            currentAction: actionButton as ActionButtonType,
          },
        });
      }
    }

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath(`/contacts/${task.contactId}`);

    return { data: task };
  } catch (error) {
    console.error("Error completing task:", error);
    return { error: "Failed to complete task" };
  }
}

// Type for all action buttons
type ActionButtonType = "SEND_FIRST_MESSAGE" | "SEND_FIRST_MESSAGE_FOLLOW_UP" | "SCHEDULE_INSPECTION" | "SEND_APPOINTMENT_REMINDER" | "ASSIGN_STATUS" | "SEND_QUOTE" | "SEND_QUOTE_FOLLOW_UP" | "SEND_CLAIM_REC" | "SEND_CLAIM_REC_FOLLOW_UP" | "SEND_PA_AGREEMENT" | "SEND_PA_FOLLOW_UP" | "SEND_CLAIM_FOLLOW_UP" | "UPLOAD_PA" | "SEND_SEASONAL_MESSAGE" | "MARK_RESPONDED" | "MARK_JOB_SCHEDULED" | "MARK_JOB_IN_PROGRESS" | "MARK_JOB_COMPLETE" | "JOSH_DRAFT_MESSAGE" | null;

/**
 * Update quick notes on a task (auto-save from UI)
 */
export async function updateTaskNotes(taskId: string, quickNotes: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Unauthorized" };

  try {
    await prisma.task.update({
      where: { id: taskId },
      data: { quickNotes: quickNotes || null },
    });
    return { success: true };
  } catch {
    return { error: "Failed to update notes" };
  }
}

export async function updateTask(
  taskId: string, 
  data: { 
    title?: string; 
    description?: string; 
    dueDate?: Date;
    appointmentTime?: Date;
  }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath(`/contacts/${task.contactId}`);
    revalidatePath("/calendar");

    return { data: task };
  } catch (error) {
    console.error("Error updating task:", error);
    return { error: "Failed to update task" };
  }
}

export async function rescheduleTask(taskId: string, newDate: Date) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        dueDate: newDate,
        // Also update appointment time if this is an appointment task
        appointmentTime: undefined, // Will be set separately if needed
      },
      include: {
        contact: true,
      },
    });

    // Add timeline entry
    await prisma.note.create({
      data: {
        contactId: task.contactId,
        userId: user.id,
        content: `Task rescheduled to ${newDate.toLocaleDateString()}`,
        noteType: "SYSTEM",
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath(`/contacts/${task.contactId}`);
    revalidatePath("/calendar");

    return { data: task };
  } catch (error) {
    console.error("Error rescheduling task:", error);
    return { error: "Failed to reschedule task" };
  }
}

/**
 * Reschedule a task by N office days (respects organization's office day settings)
 * @param taskId Task to reschedule
 * @param officeDaysToSkip Number of office days to skip (1 = next office day, 2 = 2nd office day, etc.)
 */
export async function rescheduleTaskByOfficeDays(taskId: string, officeDaysToSkip: number) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { activeOrganizationId: true },
    });
    let membership;
    if (dbUser?.activeOrganizationId) {
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
    
    const rawDays = membership?.organization?.officeDays;
    const officeDays = Array.isArray(rawDays) && rawDays.length > 0 ? rawDays : [1, 3, 5];
    
    // Calculate the new date using office day logic
    const { getNthOfficeDay } = await import("@/lib/scheduling");
    const newDate = getNthOfficeDay(officeDaysToSkip, new Date(), officeDays);
    
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        dueDate: newDate,
      },
      include: {
        contact: true,
      },
    });

    // Add timeline entry
    await prisma.note.create({
      data: {
        contactId: task.contactId,
        userId: user.id,
        content: `Task rescheduled to ${newDate.toLocaleDateString()} (${officeDaysToSkip} office day${officeDaysToSkip > 1 ? 's' : ''})`,
        noteType: "SYSTEM",
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath(`/contacts/${task.contactId}`);
    revalidatePath("/calendar");

    return { data: task, newDate };
  } catch (error) {
    console.error("Error rescheduling task:", error);
    return { error: "Failed to reschedule task" };
  }
}

export async function createTask(input: {
  contactId: string;
  title: string;
  description?: string;
  dueDate: Date;
  taskType?: TaskTypeForTitle;
  appointmentTime?: Date;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const taskType = input.taskType || "CUSTOM";
    const actionButton = getActionButtonForTaskType(taskType);
    
    const task = await prisma.task.create({
      data: {
        contactId: input.contactId,
        userId: user.id,
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
        status: "PENDING",
        taskType: taskType,
        actionButton: actionButton as ActionButtonType,
        currentAction: actionButton as ActionButtonType,
        appointmentTime: input.appointmentTime,
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath(`/contacts/${input.contactId}`);
    revalidatePath("/calendar");

    return { data: task };
  } catch (error) {
    console.error("Error creating task:", error);
    return { error: "Failed to create task" };
  }
}

export async function cancelTask(taskId: string, reason?: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "CANCELLED",
        updatedAt: new Date(),
      },
      include: {
        contact: true,
      },
    });

    // Add timeline entry
    await prisma.note.create({
      data: {
        contactId: task.contactId,
        userId: user.id,
        content: `Task cancelled: ${task.title}${reason ? `. Reason: ${reason}` : ''}`,
        noteType: "SYSTEM",
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath(`/contacts/${task.contactId}`);

    return { data: task };
  } catch (error) {
    console.error("Error cancelling task:", error);
    return { error: "Failed to cancel task" };
  }
}

// Get tasks that are appointments (for calendar view)
export async function getAppointments(options?: {
  startDate?: Date;
  endDate?: Date;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: [] };
  }

  try {
    const where: Prisma.TaskWhereInput = {
      userId: user.id,
      taskType: "APPOINTMENT",
      status: { in: ["PENDING", "IN_PROGRESS"] },
    };

    if (options?.startDate || options?.endDate) {
      where.appointmentTime = {};
      if (options.startDate) (where.appointmentTime as Prisma.DateTimeNullableFilter).gte = options.startDate;
      if (options.endDate) (where.appointmentTime as Prisma.DateTimeNullableFilter).lte = options.endDate;
    }

    const appointments = await prisma.task.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            address: true,
            city: true,
            state: true,
            stage: {
              select: {
                name: true,
                color: true,
              },
            },
          },
        },
      },
      orderBy: { appointmentTime: "asc" },
    });

    return { data: appointments };
  } catch (error) {
    console.error("Error fetching appointments:", error);
    return { error: "Failed to fetch appointments", data: [] };
  }
}

/**
 * Server action to check and fix contacts without tasks
 * Creates appropriate tasks for any active contacts missing them
 */
export async function fixContactsWithoutTasks() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    // Get user's organization
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: true },
    });

    if (!membership) {
      return { error: "No organization found" };
    }

    // Import and call the workflow engine function
    const { checkContactsWithoutTasks } = await import("@/lib/workflow-engine");
    const result = await checkContactsWithoutTasks(membership.organizationId);

    if (result.error) {
      return { error: result.error };
    }

    revalidatePath("/tasks");
    revalidatePath("/contacts");
    revalidatePath("/dashboard");

    return { 
      success: true, 
      message: result.message,
      processed: result.processed,
      contacts: result.contacts,
    };
  } catch (error) {
    console.error("Error fixing contacts without tasks:", error);
    return { error: "Failed to check contacts" };
  }
}

/**
 * Batch reschedule tasks by N office days — single DB call instead of N serial calls
 */
export async function rescheduleTasksBatch(taskIds: string[], officeDaysToSkip: number) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Unauthorized" };

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { activeOrganizationId: true },
    });
    let membership;
    if (dbUser?.activeOrganizationId) {
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
    const rawDays = membership?.organization?.officeDays;
    const officeDays = Array.isArray(rawDays) && rawDays.length > 0 ? rawDays : [1, 3, 5];

    const { getNthOfficeDay } = await import("@/lib/scheduling");
    const newDate = getNthOfficeDay(officeDaysToSkip, new Date(), officeDays);

    const result = await prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: { dueDate: newDate, updatedAt: new Date() },
    });

    revalidatePath("/tasks");
    revalidatePath("/dashboard");

    return { updated: result.count, newDate };
  } catch (error) {
    console.error("Error batch rescheduling tasks:", error);
    return { error: "Failed to reschedule tasks" };
  }
}

/**
 * Batch set tasks to a specific date — single DB call
 */
export async function setTasksDateBatch(taskIds: string[], date: Date) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "Unauthorized" };

  try {
    const result = await prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: { dueDate: date, updatedAt: new Date() },
    });

    revalidatePath("/tasks");
    revalidatePath("/dashboard");

    return { updated: result.count };
  } catch (error) {
    console.error("Error batch setting task dates:", error);
    return { error: "Failed to set task dates" };
  }
}
