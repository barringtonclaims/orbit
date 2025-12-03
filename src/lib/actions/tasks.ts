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
      };
    };
  };
}>;

export async function getTasks(options?: {
  view?: "today" | "upcoming" | "overdue" | "completed" | "all";
  contactId?: string;
  taskType?: string;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: [] };
  }

  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const where: Prisma.TaskWhereInput = {
      userId: user.id,
    };

    if (options?.contactId) {
      where.contactId = options.contactId;
    }

    if (options?.taskType) {
      where.taskType = options.taskType as Prisma.EnumTaskTypeFilter["equals"];
    }

    switch (options?.view) {
      case "today":
        where.status = { in: ["PENDING", "IN_PROGRESS"] };
        where.dueDate = { gte: todayStart, lte: todayEnd };
        break;
      case "upcoming":
        where.status = { in: ["PENDING", "IN_PROGRESS"] };
        where.dueDate = { gt: todayEnd };
        break;
      case "overdue":
        where.status = { in: ["PENDING", "IN_PROGRESS"] };
        where.dueDate = { lt: todayStart };
        break;
      case "completed":
        where.status = "COMPLETED";
        break;
      case "all":
        // No status filter - show all
        break;
      default:
        where.status = { in: ["PENDING", "IN_PROGRESS"] };
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
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const [today, upcoming, overdue] = await Promise.all([
      prisma.task.count({
        where: {
          userId: user.id,
          status: { in: ["PENDING", "IN_PROGRESS"] },
          dueDate: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.task.count({
        where: {
          userId: user.id,
          status: { in: ["PENDING", "IN_PROGRESS"] },
          dueDate: { gt: todayEnd },
        },
      }),
      prisma.task.count({
        where: {
          userId: user.id,
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

    // Handle auto-reschedule or next task creation
    if (options?.reschedule || options?.nextTaskType) {
      const contactName = `${task.contact.firstName} ${task.contact.lastName}`;
      
      // Fetch org for scheduling settings
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
        include: { organization: true },
      });
      const officeDays = membership?.organization.officeDays || [1, 3, 5];
      const nextDate = getNextOfficeDay(new Date(), officeDays);
      
      // Determine next task type - use provided or same as current
      const nextTaskType = options.nextTaskType || task.taskType as TaskTypeForTitle;
      const actionButton = getActionButtonForTaskType(nextTaskType);
      
      await prisma.task.create({
        data: {
          contactId: task.contactId,
          userId: user.id,
          title: generateTaskTitle(contactName, nextTaskType, {
            quoteType: task.contact.quoteType || undefined,
          }),
          dueDate: nextDate,
          status: "PENDING",
          taskType: nextTaskType,
          actionButton: actionButton as "SEND_FIRST_MESSAGE" | "SCHEDULE_INSPECTION" | "ASSIGN_STATUS" | "SEND_QUOTE" | "SEND_QUOTE_FOLLOW_UP" | "SEND_CLAIM_REC" | "SEND_CLAIM_FOLLOW_UP" | "SEND_PA_AGREEMENT" | "SEND_PA_FOLLOW_UP" | "UPLOAD_PA" | "MARK_RESPONDED" | "MARK_JOB_SCHEDULED" | "MARK_JOB_IN_PROGRESS" | "MARK_JOB_COMPLETE" | null,
        },
      });
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
        actionButton: actionButton as "SEND_FIRST_MESSAGE" | "SCHEDULE_INSPECTION" | "ASSIGN_STATUS" | "SEND_QUOTE" | "SEND_QUOTE_FOLLOW_UP" | "SEND_CLAIM_REC" | "SEND_CLAIM_FOLLOW_UP" | "SEND_PA_AGREEMENT" | "SEND_PA_FOLLOW_UP" | "UPLOAD_PA" | "MARK_RESPONDED" | "MARK_JOB_SCHEDULED" | "MARK_JOB_IN_PROGRESS" | "MARK_JOB_COMPLETE" | null,
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
