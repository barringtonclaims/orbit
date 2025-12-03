"use server";

import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { startOfMonth, endOfMonth } from "date-fns";
import { 
  getGoogleAuthUrl, 
  isGoogleCalendarConnected, 
  disconnectGoogleCalendar,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/lib/google-calendar";

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

    return {
      data: {
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate,
          appointmentTime: t.appointmentTime,
          taskType: t.taskType,
          status: t.status,
          isAppointment: t.taskType === "APPOINTMENT",
          calendarEventId: t.calendarEventId,
          contact: t.contact,
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
 * Get Google Calendar OAuth URL for connecting
 */
export async function getGoogleCalendarAuthUrl() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: null };
  }

  const authUrl = getGoogleAuthUrl(user.id);
  return { data: authUrl };
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
 * Disconnect Google Calendar
 */
export async function disconnectGoogleCalendarAction() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    await disconnectGoogleCalendar(user.id);
    return { success: true };
  } catch (error) {
    console.error("Error disconnecting Google Calendar:", error);
    return { error: "Failed to disconnect Google Calendar" };
  }
}

/**
 * Sync an appointment task to Google Calendar
 */
export async function syncTaskToGoogleCalendar(taskId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        contact: {
          select: {
            firstName: true,
            lastName: true,
            address: true,
            city: true,
            state: true,
            phone: true,
          },
        },
      },
    });

    if (!task) {
      return { error: "Task not found" };
    }

    if (task.taskType !== "APPOINTMENT") {
      return { error: "Only appointment tasks can be synced to calendar" };
    }

    // Build location string
    const locationParts = [
      task.contact.address,
      task.contact.city,
      task.contact.state,
    ].filter(Boolean);
    const location = locationParts.join(", ");

    // Build description
    const description = [
      `Inspection for ${task.contact.firstName} ${task.contact.lastName}`,
      task.contact.phone ? `Phone: ${task.contact.phone}` : null,
      task.description,
    ].filter(Boolean).join("\n");

    // Create or update the calendar event
    if (task.calendarEventId) {
      // Update existing event
      const success = await updateCalendarEvent(user.id, task.calendarEventId, {
        title: task.title,
        description,
        location,
        startTime: task.appointmentTime || task.dueDate,
      });

      if (!success) {
        return { error: "Failed to update calendar event" };
      }

      return { success: true, eventId: task.calendarEventId };
    } else {
      // Create new event
      const eventId = await createCalendarEvent(user.id, {
        title: task.title,
        description,
        location,
        startTime: task.appointmentTime || task.dueDate,
      });

      if (!eventId) {
        return { error: "Failed to create calendar event (check Google Calendar connection)" };
      }

      // Save event ID to task
      await prisma.task.update({
        where: { id: taskId },
        data: { calendarEventId: eventId },
      });

      return { success: true, eventId };
    }
  } catch (error) {
    console.error("Error syncing to Google Calendar:", error);
    return { error: "Failed to sync to Google Calendar" };
  }
}

/**
 * Remove a task's calendar event
 */
export async function removeTaskFromGoogleCalendar(taskId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task || !task.calendarEventId) {
      return { success: true }; // Nothing to remove
    }

    await deleteCalendarEvent(user.id, task.calendarEventId);

    // Clear event ID from task
    await prisma.task.update({
      where: { id: taskId },
      data: { calendarEventId: null },
    });

    return { success: true };
  } catch (error) {
    console.error("Error removing from Google Calendar:", error);
    return { error: "Failed to remove from Google Calendar" };
  }
}

/**
 * Auto-sync appointment when scheduled (called from workflow engine)
 */
export async function autoSyncAppointmentToCalendar(
  userId: string,
  taskId: string
) {
  // Check if user has Google Calendar connected
  const isConnected = await isGoogleCalendarConnected(userId);
  if (!isConnected) {
    return; // Silently skip if not connected
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      contact: {
        select: {
          firstName: true,
          lastName: true,
          address: true,
          city: true,
          state: true,
          phone: true,
        },
      },
    },
  });

  if (!task || task.taskType !== "APPOINTMENT") {
    return;
  }

  // Build location string
  const locationParts = [
    task.contact.address,
    task.contact.city,
    task.contact.state,
  ].filter(Boolean);
  const location = locationParts.join(", ");

  // Build description
  const description = [
    `Inspection for ${task.contact.firstName} ${task.contact.lastName}`,
    task.contact.phone ? `Phone: ${task.contact.phone}` : null,
    task.description,
  ].filter(Boolean).join("\n");

  const eventId = await createCalendarEvent(userId, {
    title: task.title,
    description,
    location,
    startTime: task.appointmentTime || task.dueDate,
  });

  if (eventId) {
    await prisma.task.update({
      where: { id: taskId },
      data: { calendarEventId: eventId },
    });
  }
}
