/**
 * Orbit Google Calendar Integration
 * 
 * Handles OAuth2 authentication and event CRUD with Google Calendar API.
 * Syncs inspection appointments to the user's calendar.
 */

import prisma from "@/lib/prisma";

// Google OAuth2 configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL + "/api/auth/google/callback";

// Google Calendar API endpoints
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// Required scopes for calendar access
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

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
 * Generate the OAuth2 authorization URL
 */
export function getGoogleAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: userId, // Pass user ID to identify user in callback
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }

  return response.json();
}

/**
 * Refresh an access token using a refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const tokens = await response.json();
  return {
    ...tokens,
    refresh_token: refreshToken, // Refresh token is not returned on refresh
  };
}

/**
 * Store Google Calendar tokens for a user
 */
export async function storeGoogleTokens(
  userId: string,
  tokens: GoogleTokens
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.googleCalendarToken.upsert({
    where: { userId },
    create: {
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      expiresAt,
      scope: tokens.scope,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      expiresAt,
      scope: tokens.scope,
    },
  });
}

/**
 * Get valid access token for a user, refreshing if needed
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const tokenRecord = await prisma.googleCalendarToken.findUnique({
    where: { userId },
  });

  if (!tokenRecord) {
    return null;
  }

  // Check if token is expired or will expire in the next 5 minutes
  const expiryBuffer = 5 * 60 * 1000; // 5 minutes
  if (new Date(tokenRecord.expiresAt).getTime() - expiryBuffer < Date.now()) {
    try {
      const newTokens = await refreshAccessToken(tokenRecord.refreshToken);
      await storeGoogleTokens(userId, newTokens);
      return newTokens.access_token;
    } catch (error) {
      console.error("Failed to refresh Google token:", error);
      // Token refresh failed, user needs to re-authenticate
      await prisma.googleCalendarToken.delete({ where: { userId } });
      return null;
    }
  }

  return tokenRecord.accessToken;
}

/**
 * Check if a user has connected their Google Calendar
 */
export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  const token = await prisma.googleCalendarToken.findUnique({
    where: { userId },
  });
  return !!token;
}

/**
 * Disconnect Google Calendar (remove tokens)
 */
export async function disconnectGoogleCalendar(userId: string): Promise<void> {
  await prisma.googleCalendarToken.delete({
    where: { userId },
  }).catch(() => {
    // Ignore if already deleted
  });
}

/**
 * Create a calendar event for an inspection appointment
 */
export async function createCalendarEvent(
  userId: string,
  event: {
    title: string;
    description?: string;
    location?: string;
    startTime: Date;
    endTime?: Date;
  }
): Promise<string | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return null;
  }

  const tokenRecord = await prisma.googleCalendarToken.findUnique({
    where: { userId },
  });
  const calendarId = tokenRecord?.calendarId || "primary";

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
  userId: string,
  eventId: string,
  updates: {
    title?: string;
    description?: string;
    location?: string;
    startTime?: Date;
    endTime?: Date;
  }
): Promise<boolean> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return false;
  }

  const tokenRecord = await prisma.googleCalendarToken.findUnique({
    where: { userId },
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
  userId: string,
  eventId: string
): Promise<boolean> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return false;
  }

  const tokenRecord = await prisma.googleCalendarToken.findUnique({
    where: { userId },
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
  userId: string,
  maxResults: number = 10
): Promise<CalendarEvent[] | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return null;
  }

  const tokenRecord = await prisma.googleCalendarToken.findUnique({
    where: { userId },
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

