"use server";

import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { startOfMonth, endOfMonth } from "date-fns";
import { isGoogleCalendarConnected } from "@/lib/google-calendar";

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

    const officeDays = membership?.organization.officeDays || [1, 3, 5];
    const inspectionDays = membership?.organization.inspectionDays || [2, 4];

    // Fetch only PENDING and IN_PROGRESS tasks within the month
    // Exclude COMPLETED and CANCELLED tasks to keep calendar clean
    const tasks = await prisma.task.findMany({
      where: {
        userId: user.id,
        status: { in: ["PENDING", "IN_PROGRESS"] },
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
            address: true,
            city: true,
            state: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    // Check Google Calendar connection status
    const isGoogleConnected = await isGoogleCalendarConnected(user.id);

    const appointments = await prisma.appointment.findMany({
      where: {
        userId: user.id,
        startTime: { gte: start, lte: end },
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
      orderBy: { startTime: "asc" },
    });

    return {
      data: {
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate,
          taskType: t.taskType,
          status: t.status,
          contact: t.contact,
        })),
        appointments: appointments.map(a => ({
          id: a.id,
          title: a.title,
          type: a.type,
          startTime: a.startTime,
          endTime: a.endTime,
          location: a.location,
          description: a.description,
          contact: a.contact,
        })),
        settings: {
          officeDays,
          inspectionDays,
        },
        isGoogleConnected,
      },
    };
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return { error: "Failed to fetch calendar events", data: null };
  }
}

/**
 * Check if user has connected Google Calendar
 */
export async function checkGoogleCalendarConnection() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: null };
  }

  const isConnected = await isGoogleCalendarConnected(user.id);
  return { data: { isConnected } };
}

/**
 * Sync an appointment task to Google Calendar
 * TODO: Calendar sync will be tied to the Appointment model going forward. Tasks no longer have appointmentTime or calendarEventId.
 */
export async function syncTaskToGoogleCalendar(taskId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  return { error: "Not supported. Calendar sync will be tied to the Appointment model." };
}

/**
 * Remove a task's calendar event
 * TODO: Calendar sync will be tied to the Appointment model going forward. Tasks no longer have calendarEventId.
 */
export async function removeTaskFromGoogleCalendar(taskId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  return { success: true }; // Nothing to remove - tasks no longer have calendar events
}

/**
 * Auto-sync appointment when scheduled (called from workflow engine)
 * TODO: Calendar sync will be tied to the Appointment model going forward. Tasks no longer have appointmentTime or calendarEventId.
 */
export async function autoSyncAppointmentToCalendar(
  _userId: string,
  _taskId: string
) {
  // No-op: calendar sync will be tied to the Appointment model
}
