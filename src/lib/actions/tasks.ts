"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";
import { getNextOfficeDay, generateTaskTitle } from "@/lib/scheduling";

export async function getTasks(options?: {
  view?: "today" | "upcoming" | "overdue" | "completed";
  contactId?: string;
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

    type TaskWhere = {
      userId?: string;
      contactId?: string;
      status?: { in: string[] } | string;
      dueDate?: { gte: Date; lte: Date } | { lt: Date } | { gt: Date };
    };
    
    const where: TaskWhere = {
      userId: user.id,
    };

    if (options?.contactId) {
      where.contactId = options.contactId;
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
            stage: {
              select: {
                name: true,
                color: true,
              },
            },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    return { data: tasks };
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

    return { data: { today, upcoming, overdue } };
  } catch (error) {
    console.error("Error fetching task stats:", error);
    return { error: "Failed to fetch task stats", data: null };
  }
}

export async function completeTask(taskId: string, nextTaskType?: string) {
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
        content: `Completed task: ${task.title}`,
        noteType: "TASK_COMPLETED",
      },
    });

    // Create next task if specified
    if (nextTaskType && nextTaskType !== "NONE") {
      const contactName = `${task.contact.firstName} ${task.contact.lastName}`;
      
      // Fetch org for scheduling settings
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
        include: { organization: true },
      });
      const officeDays = membership?.organization.officeDays || [1, 3, 5];
      
      const nextDate = getNextOfficeDay(new Date(), officeDays);
      
      await prisma.task.create({
        data: {
          contactId: task.contactId,
          userId: user.id,
          title: generateTaskTitle(contactName, nextTaskType as "SET_APPOINTMENT" | "APPOINTMENT" | "WRITE_QUOTE" | "SEND_QUOTE" | "FOLLOW_UP" | "FIRST_MESSAGE" | "CLAIM_RECOMMENDATION" | "CUSTOM"),
          dueDate: nextDate,
          status: "PENDING",
          taskType: nextTaskType as "SET_APPOINTMENT" | "APPOINTMENT" | "WRITE_QUOTE" | "SEND_QUOTE" | "FOLLOW_UP" | "FIRST_MESSAGE" | "CLAIM_RECOMMENDATION" | "CUSTOM",
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
  data: { title?: string; description?: string; dueDate?: Date }
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
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath(`/contacts/${task.contactId}`);

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
  taskType?: string;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const task = await prisma.task.create({
      data: {
        contactId: input.contactId,
        userId: user.id,
        title: input.title,
        description: input.description,
        dueDate: input.dueDate,
        status: "PENDING",
        taskType: (input.taskType as "SET_APPOINTMENT" | "APPOINTMENT" | "WRITE_QUOTE" | "SEND_QUOTE" | "FOLLOW_UP" | "FIRST_MESSAGE" | "CLAIM_RECOMMENDATION" | "CUSTOM") || "CUSTOM",
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath(`/contacts/${input.contactId}`);

    return { data: task };
  } catch (error) {
    console.error("Error creating task:", error);
    return { error: "Failed to create task" };
  }
}
