/**
 * Orbit Gmail Integration
 * 
 * Handles Gmail API operations for Josh AI email processing.
 * Uses unified Google OAuth tokens.
 */

import prisma from "@/lib/prisma";
import { getValidAccessToken, updateGmailSyncState, getGmailSyncState } from "@/lib/google-oauth";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body?: {
      data?: string;
      size: number;
    };
    parts?: Array<{
      mimeType: string;
      body?: {
        data?: string;
        size: number;
      };
    }>;
  };
  internalDate: string;
}

export interface ParsedEmail {
  id: string;
  threadId: string;
  from: {
    email: string;
    name?: string;
  };
  to: string[];
  subject: string;
  snippet: string;
  body: string;
  receivedAt: Date;
  labels: string[];
}

/**
 * Check if Gmail is connected for an organization
 */
export async function isGmailConnected(organizationId: string): Promise<boolean> {
  const token = await prisma.googleToken.findUnique({
    where: { organizationId },
    select: { hasGmailAccess: true },
  });
  return token?.hasGmailAccess || false;
}

/**
 * Get sync state for an organization (exported for email processor)
 */
export async function getSyncState(organizationId: string): Promise<{
  lastSyncAt: Date | null;
  lastHistoryId: string | null;
} | null> {
  const state = await getGmailSyncState(organizationId);
  if (!state) return null;
  
  return {
    lastSyncAt: state.lastSyncAt,
    lastHistoryId: state.historyId,
  };
}

/**
 * Update sync state (exported for email processor)
 */
export async function updateSyncState(
  organizationId: string,
  historyId?: string
): Promise<void> {
  await updateGmailSyncState(organizationId, historyId);
}

/**
 * Fetch messages from Gmail inbox
 */
export async function fetchMessages(
  organizationId: string,
  options: {
    maxResults?: number;
    query?: string;
    pageToken?: string;
    after?: Date;
  } = {}
): Promise<{ messages: GmailMessage[]; nextPageToken?: string } | null> {
  // Check if org has Gmail access
  const hasAccess = await isGmailConnected(organizationId);
  if (!hasAccess) {
    return null;
  }

  const accessToken = await getValidAccessToken(organizationId);
  if (!accessToken) {
    return null;
  }

  const { maxResults = 20, query, pageToken, after } = options;

  // Build query string
  let q = query || "in:inbox";
  if (after) {
    // Gmail uses epoch seconds for after: query
    const afterEpoch = Math.floor(after.getTime() / 1000);
    q += ` after:${afterEpoch}`;
  }

  try {
    // First, get the list of message IDs
    const listParams = new URLSearchParams({
      maxResults: maxResults.toString(),
      q,
    });
    if (pageToken) {
      listParams.set("pageToken", pageToken);
    }

    const listResponse = await fetch(
      `${GMAIL_API}/users/me/messages?${listParams}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!listResponse.ok) {
      const error = await listResponse.text();
      console.error("Failed to list Gmail messages:", error);
      return null;
    }

    const listData = await listResponse.json();
    
    if (!listData.messages || listData.messages.length === 0) {
      return { messages: [], nextPageToken: listData.nextPageToken };
    }

    // Fetch full message details for each message
    const messages: GmailMessage[] = await Promise.all(
      listData.messages.map(async (msg: { id: string }) => {
        const msgResponse = await fetch(
          `${GMAIL_API}/users/me/messages/${msg.id}?format=full`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (!msgResponse.ok) {
          console.error(`Failed to fetch message ${msg.id}`);
          return null;
        }

        return msgResponse.json();
      })
    );

    return {
      messages: messages.filter(Boolean) as GmailMessage[],
      nextPageToken: listData.nextPageToken,
    };
  } catch (error) {
    console.error("Error fetching Gmail messages:", error);
    return null;
  }
}

/**
 * Parse a Gmail message into a more usable format
 */
export function parseGmailMessage(message: GmailMessage): ParsedEmail {
  const headers = message.payload.headers;
  
  // Extract headers
  const getHeader = (name: string): string => {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header?.value || "";
  };

  // Parse From header (format: "Name <email@example.com>" or just "email@example.com")
  const fromHeader = getHeader("From");
  const fromMatch = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
  const from = {
    email: fromMatch?.[2]?.trim() || fromHeader,
    name: fromMatch?.[1]?.trim() || undefined,
  };

  // Parse To header
  const toHeader = getHeader("To");
  const to = toHeader.split(",").map(t => t.trim());

  // Get email body
  let body = "";
  if (message.payload.body?.data) {
    body = decodeBase64Url(message.payload.body.data);
  } else if (message.payload.parts) {
    // Look for text/plain or text/html part
    const textPart = message.payload.parts.find(
      p => p.mimeType === "text/plain"
    );
    const htmlPart = message.payload.parts.find(
      p => p.mimeType === "text/html"
    );
    
    if (textPart?.body?.data) {
      body = decodeBase64Url(textPart.body.data);
    } else if (htmlPart?.body?.data) {
      body = stripHtml(decodeBase64Url(htmlPart.body.data));
    }
  }

  return {
    id: message.id,
    threadId: message.threadId,
    from,
    to,
    subject: getHeader("Subject"),
    snippet: message.snippet,
    body,
    receivedAt: new Date(parseInt(message.internalDate)),
    labels: message.labelIds || [],
  };
}

/**
 * Decode base64url encoded string (Gmail uses URL-safe base64)
 */
function decodeBase64Url(data: string): string {
  // Convert URL-safe base64 to standard base64
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  
  try {
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return "";
  }
}

/**
 * Strip HTML tags from a string (basic implementation)
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Get the Gmail profile for the organization's connected account
 */
export async function getGmailProfile(organizationId: string): Promise<{
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
} | null> {
  const hasAccess = await isGmailConnected(organizationId);
  if (!hasAccess) {
    return null;
  }

  const accessToken = await getValidAccessToken(organizationId);
  if (!accessToken) {
    return null;
  }

  try {
    const response = await fetch(`${GMAIL_API}/users/me/profile`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    console.error("Error fetching Gmail profile:", error);
    return null;
  }
}
