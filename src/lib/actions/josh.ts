"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getOrganization } from "./organizations";

export interface JoshActivitySummary {
  totalLeadsCreated: number;
  emailsLinked: number;
  carrierEmails: number;
  recentActivities: Array<{
    id: string;
    activityType: string;
    title: string;
    description: string | null;
    contactId: string | null;
    createdAt: Date;
    isRead: boolean;
  }>;
  gmailConnected: boolean;
}

/**
 * Get Josh activity summary for dashboard
 */
export async function getJoshActivitySummary(): Promise<{
  data: JoshActivitySummary | null;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { data: null, error: "Unauthorized" };
    }

    const { data: org } = await getOrganization();
    if (!org) {
      return { data: null, error: "No organization" };
    }

    // Check if Gmail is connected (via unified token - now per organization)
    const googleToken = await prisma.googleToken.findUnique({
      where: { organizationId: org.id },
      select: { hasGmailAccess: true },
    });

    // Get activity counts for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const activities = await prisma.joshActivity.findMany({
      where: {
        organizationId: org.id,
        createdAt: { gte: sevenDaysAgo },
      },
      orderBy: { createdAt: "desc" },
    });

    // Count by type
    const totalLeadsCreated = activities.filter(
      (a) => a.activityType === "LEAD_CREATED" || a.activityType === "LEAD_CREATED_ACCULYNX"
    ).length;

    const emailsLinked = activities.filter(
      (a) => a.activityType === "EMAIL_LINKED"
    ).length;

    const carrierEmails = activities.filter(
      (a) => a.activityType === "CARRIER_EMAIL_RECEIVED"
    ).length;

    // Get recent unread activities
    const recentActivities = await prisma.joshActivity.findMany({
      where: {
        organizationId: org.id,
        OR: [
          { userId: user.id },
          { userId: null },
        ],
        isRead: false,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return {
      data: {
        totalLeadsCreated,
        emailsLinked,
        carrierEmails,
        recentActivities,
        gmailConnected: googleToken?.hasGmailAccess || false,
      },
    };
  } catch (error) {
    console.error("Error getting Josh activity summary:", error);
    return { data: null, error: "Failed to get activity summary" };
  }
}

/**
 * Manually trigger email sync
 */
export async function triggerEmailSync(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const { data: org } = await getOrganization();
    if (!org) {
      return { success: false, error: "No organization" };
    }

    // Import dynamically to avoid circular deps
    const { processNewEmails } = await import("@/lib/josh/email-processor");
    
    await processNewEmails(user.id, org.id);

    return { success: true };
  } catch (error) {
    console.error("Error triggering email sync:", error);
    return { success: false, error: "Failed to sync emails" };
  }
}
