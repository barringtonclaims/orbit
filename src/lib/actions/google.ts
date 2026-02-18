"use server";

import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { 
  getGoogleConnectionStatus as getStatus, 
  getGoogleAuthUrl,
  disconnectGoogle 
} from "@/lib/google-oauth";
import { revalidatePath } from "next/cache";

/**
 * Get the current user's active organization ID
 */
async function getActiveOrganizationId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeOrganizationId: true },
  });

  if (user?.activeOrganizationId) {
    return user.activeOrganizationId;
  }

  // Fall back to first organization
  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
  });

  return membership?.organizationId || null;
}

/**
 * Get Google connection status for settings page
 */
export async function getGoogleConnectionStatus(): Promise<{
  data: {
    isConnected: boolean;
    hasCalendarAccess: boolean;
    hasGmailAccess: boolean;
    lastGmailSyncAt: string | null;
    authUrl: string;
    userEmail?: string;
  } | null;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: "Unauthorized" };
    }

    const organizationId = await getActiveOrganizationId(user.id);
    
    if (!organizationId) {
      return { data: null, error: "No organization found" };
    }

    const status = await getStatus(organizationId);
    const authUrl = getGoogleAuthUrl(organizationId, user.id);

    if (status) {
      return {
        data: {
          isConnected: true,
          hasCalendarAccess: status.hasCalendarAccess,
          hasGmailAccess: status.hasGmailAccess,
          lastGmailSyncAt: status.lastGmailSyncAt?.toISOString() || null,
          authUrl,
          userEmail: status.gmailEmail || undefined,
        },
      };
    }

    return {
      data: {
        isConnected: false,
        hasCalendarAccess: false,
        hasGmailAccess: false,
        lastGmailSyncAt: null,
        authUrl,
      },
    };
  } catch (error) {
    console.error("Error getting Google connection status:", error);
    return { data: null, error: "Failed to get connection status" };
  }
}

/**
 * Disconnect Google account from current organization
 */
export async function disconnectGoogleAccount(): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Unauthorized" };
    }

    const organizationId = await getActiveOrganizationId(user.id);
    
    if (!organizationId) {
      return { error: "No organization found" };
    }

    await disconnectGoogle(organizationId);
    
    revalidatePath("/settings");
    
    return {};
  } catch (error) {
    console.error("Error disconnecting Google:", error);
    return { error: "Failed to disconnect Google account" };
  }
}
