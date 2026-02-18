/**
 * Orbit Unified Google OAuth Module
 * 
 * Handles OAuth2 authentication for Google services (Calendar + Gmail).
 * Google accounts are linked PER ORGANIZATION, allowing different orgs
 * to have different Google accounts.
 */

import prisma from "@/lib/prisma";

// Google OAuth2 configuration
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL + "/api/auth/google/callback";

// Combined scopes for Calendar and Gmail
export const GOOGLE_SCOPES = [
  // Calendar scopes
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  // Gmail scopes (read-only for Josh)
  "https://www.googleapis.com/auth/gmail.readonly",
  // Email scope to get user's email address
  "email",
];

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

/**
 * Generate the unified OAuth2 authorization URL
 * State includes both organizationId and userId
 */
export function getGoogleAuthUrl(organizationId: string, userId: string): string {
  // Encode both org and user IDs in state
  const state = JSON.stringify({ organizationId, userId });
  
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // Always show consent to get refresh token
    state: Buffer.from(state).toString("base64"),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Parse the state parameter from callback
 */
export function parseAuthState(state: string): { organizationId: string; userId: string } | null {
  try {
    const decoded = Buffer.from(state, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
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
 * Get Gmail address from access token
 */
export async function getGmailAddress(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.ok) {
      const data = await response.json();
      return data.email;
    }
  } catch (error) {
    console.error("Failed to get Gmail address:", error);
  }
  return null;
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
 * Store Google tokens for an organization
 */
export async function storeGoogleTokens(
  organizationId: string,
  userId: string,
  tokens: GoogleTokens,
  gmailEmail?: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  
  // Parse scopes to determine what access was granted
  const grantedScopes = tokens.scope.split(" ");
  const hasCalendarAccess = grantedScopes.some(s => s.includes("calendar"));
  const hasGmailAccess = grantedScopes.some(s => s.includes("gmail"));

  await prisma.googleToken.upsert({
    where: { organizationId },
    create: {
      organizationId,
      connectedById: userId,
      gmailEmail,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      tokenType: tokens.token_type,
      expiresAt,
      hasCalendarAccess,
      hasGmailAccess,
    },
    update: {
      connectedById: userId,
      gmailEmail,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || undefined,
      tokenType: tokens.token_type,
      expiresAt,
      hasCalendarAccess,
      hasGmailAccess,
    },
  });
}

/**
 * Get valid access token for an organization, refreshing if needed
 */
export async function getValidAccessToken(organizationId: string): Promise<string | null> {
  const tokenRecord = await prisma.googleToken.findUnique({
    where: { organizationId },
  });

  if (!tokenRecord) {
    return null;
  }

  // Check if token is expired or will expire in the next 5 minutes
  const expiryBuffer = 5 * 60 * 1000; // 5 minutes
  if (new Date(tokenRecord.expiresAt).getTime() - expiryBuffer < Date.now()) {
    try {
      const newTokens = await refreshAccessToken(tokenRecord.refreshToken);
      await storeGoogleTokens(
        organizationId, 
        tokenRecord.connectedById, 
        newTokens, 
        tokenRecord.gmailEmail || undefined
      );
      return newTokens.access_token;
    } catch (error) {
      console.error("Failed to refresh Google token:", error);
      // Token refresh failed, user needs to re-authenticate
      await prisma.googleToken.delete({ where: { organizationId } });
      return null;
    }
  }

  return tokenRecord.accessToken;
}

/**
 * Get Google connection status for an organization
 */
export async function getGoogleConnectionStatus(organizationId: string): Promise<{
  isConnected: boolean;
  hasCalendarAccess: boolean;
  hasGmailAccess: boolean;
  lastGmailSyncAt: Date | null;
  gmailEmail: string | null;
} | null> {
  const token = await prisma.googleToken.findUnique({
    where: { organizationId },
    select: {
      hasCalendarAccess: true,
      hasGmailAccess: true,
      lastGmailSyncAt: true,
      gmailEmail: true,
    },
  });

  if (!token) {
    return null;
  }

  return {
    isConnected: true,
    hasCalendarAccess: token.hasCalendarAccess,
    hasGmailAccess: token.hasGmailAccess,
    lastGmailSyncAt: token.lastGmailSyncAt,
    gmailEmail: token.gmailEmail,
  };
}

/**
 * Check if organization has Google connected
 */
export async function isGoogleConnected(organizationId: string): Promise<boolean> {
  const token = await prisma.googleToken.findUnique({
    where: { organizationId },
  });
  return !!token;
}

/**
 * Disconnect Google (remove all tokens and access)
 */
export async function disconnectGoogle(organizationId: string): Promise<void> {
  await prisma.googleToken.delete({
    where: { organizationId },
  }).catch(() => {
    // Ignore if already deleted
  });
}

/**
 * Update Gmail sync state
 */
export async function updateGmailSyncState(
  organizationId: string,
  historyId?: string
): Promise<void> {
  await prisma.googleToken.update({
    where: { organizationId },
    data: {
      lastGmailSyncAt: new Date(),
      lastGmailHistoryId: historyId,
    },
  });
}

/**
 * Get Gmail sync state
 */
export async function getGmailSyncState(organizationId: string): Promise<{
  lastSyncAt: Date | null;
  historyId: string | null;
} | null> {
  const token = await prisma.googleToken.findUnique({
    where: { organizationId },
    select: {
      lastGmailSyncAt: true,
      lastGmailHistoryId: true,
    },
  });

  if (!token) {
    return null;
  }

  return {
    lastSyncAt: token.lastGmailSyncAt,
    historyId: token.lastGmailHistoryId,
  };
}
