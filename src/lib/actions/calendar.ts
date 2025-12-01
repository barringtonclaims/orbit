"use server";

import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";

export async function getCalendarEvents(month?: Date) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: null };
  }

  try {
    const currentMonth = month || new Date();
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    // Get user's organization for settings
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: true },
    });

    const orgId = membership?.organizationId || user.id; // Fallback
    const officeDays = membership?.organization.officeDays || [1, 3, 5];
    const inspectionDays = membership?.organization.inspectionDays || [2, 4];

    // Fetch tasks within the month
    const tasks = await prisma.task.findMany({
      where: {
        userId: user.id,
        dueDate: {
          gte: start,
          lte: end,
        },
      },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    return {
      data: {
        tasks: tasks.map(t => ({
          ...t,
          isAppointment: t.taskType === "APPOINTMENT",
        })),
        settings: {
          officeDays,
          inspectionDays,
        },
      },
    };
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return { error: "Failed to fetch calendar events", data: null };
  }
}

