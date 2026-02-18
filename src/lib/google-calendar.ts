/**
 * Orbit Google Calendar Integration
 * 
 * Handles calendar event CRUD with Google Calendar API.
 * Uses unified Google OAuth tokens.
 */

import prisma from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/google-oauth";

// Google Calendar API endpoint
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: "email" | "popup";
      minutes: number;
    }>;
  };
}

/**
 * Check if an organization has Google Calendar access
 */
export async function isGoogleCalendarConnected(organizationId: string): Promise<boolean> {
  const token = await prisma.googleToken.findUnique({
    where: { organizationId },
    select: { hasCalendarAccess: true },
  });
  return token?.hasCalendarAccess || false;
}

/**
 * Create a calendar event for an inspection appointment
 */
export async function createCalendarEvent(
  organizationId: string,
  event: {
    title: string;
    description?: string;
    location?: string;
    startTime: Date;
    endTime?: Date;
  }
): Promise<string | null> {
  const accessToken = await getValidAccessToken(organizationId);
  if (!accessToken) {
    return null;
  }

  const tokenRecord = await prisma.googleToken.findUnique({
    where: { organizationId },
    select: { calendarId: true, hasCalendarAccess: true },
  });
  
  if (!tokenRecord?.hasCalendarAccess) {
    return null;
  }
  
  const calendarId = tokenRecord.calendarId || "primary";

  // Default event duration: 1 hour
  const endTime = event.endTime || new Date(event.startTime.getTime() + 60 * 60 * 1000);

  const calendarEvent: CalendarEvent = {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: {
      dateTime: event.startTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 30 },
        { method: "popup", minutes: 60 * 24 }, // 1 day before
      ],
    },
  };

  try {
    const response = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(calendarEvent),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to create calendar event:", error);
      return null;
    }

    const createdEvent = await response.json();
    return createdEvent.id;
  } catch (error) {
    console.error("Error creating calendar event:", error);
    return null;
  }
}

/**
 * Update a calendar event
 */
export async function updateCalendarEvent(
  organizationId: string,
  eventId: string,
  updates: {
    title?: string;
    description?: string;
    location?: string;
    startTime?: Date;
    endTime?: Date;
  }
): Promise<boolean> {
  const accessToken = await getValidAccessToken(organizationId);
  if (!accessToken) {
    return false;
  }

  const tokenRecord = await prisma.googleToken.findUnique({
    where: { organizationId },
    select: { calendarId: true },
  });
  const calendarId = tokenRecord?.calendarId || "primary";

  const updateBody: Partial<CalendarEvent> = {};

  if (updates.title) {
    updateBody.summary = updates.title;
  }
  if (updates.description !== undefined) {
    updateBody.description = updates.description;
  }
  if (updates.location !== undefined) {
    updateBody.location = updates.location;
  }
  if (updates.startTime) {
    updateBody.start = {
      dateTime: updates.startTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    // Also update end time
    const endTime = updates.endTime || new Date(updates.startTime.getTime() + 60 * 60 * 1000);
    updateBody.end = {
      dateTime: endTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  try {
    const response = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${eventId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateBody),
      }
    );

    return response.ok;
  } catch (error) {
    console.error("Error updating calendar event:", error);
    return false;
  }
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(
  organizationId: string,
  eventId: string
): Promise<boolean> {
  const accessToken = await getValidAccessToken(organizationId);
  if (!accessToken) {
    return false;
  }

  const tokenRecord = await prisma.googleToken.findUnique({
    where: { organizationId },
    select: { calendarId: true },
  });
  const calendarId = tokenRecord?.calendarId || "primary";

  try {
    const response = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${eventId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return response.ok || response.status === 404; // Consider 404 as success (already deleted)
  } catch (error) {
    console.error("Error deleting calendar event:", error);
    return false;
  }
}

/**
 * Get upcoming events from the calendar
 */
export async function getUpcomingEvents(
  organizationId: string,
  maxResults: number = 10
): Promise<CalendarEvent[] | null> {
  const accessToken = await getValidAccessToken(organizationId);
  if (!accessToken) {
    return null;
  }

  const tokenRecord = await prisma.googleToken.findUnique({
    where: { organizationId },
    select: { calendarId: true },
  });
  const calendarId = tokenRecord?.calendarId || "primary";

  try {
    const params = new URLSearchParams({
      timeMin: new Date().toISOString(),
      maxResults: maxResults.toString(),
      singleEvents: "true",
      orderBy: "startTime",
    });

    const response = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    return null;
  }
}
