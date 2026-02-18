/**
 * Manual Josh Email Sync Endpoint
 * 
 * Allows users to manually trigger email processing from the settings page.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { processNewEmails } from "@/lib/josh/email-processor";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve ACTIVE organization for this user
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { activeOrganizationId: true },
    });

    let membership = null;
    if (dbUser?.activeOrganizationId) {
      membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id, organizationId: dbUser.activeOrganizationId },
        select: { organizationId: true },
      });
    }

    if (!membership) {
      membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
        select: { organizationId: true },
        orderBy: { joinedAt: "asc" },
      });
    }

    if (!membership?.organizationId) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 400 }
      );
    }

    // Check if this ORGANIZATION has Gmail connected
    const googleToken = await prisma.googleToken.findUnique({
      where: { organizationId: membership.organizationId },
      select: { hasGmailAccess: true },
    });

    if (!googleToken?.hasGmailAccess) {
      return NextResponse.json(
        { error: "Gmail not connected for this organization" },
        { status: 400 }
      );
    }

    // Process emails
    const result = await processNewEmails(user.id, membership.organizationId);

    return NextResponse.json({
      success: true,
      processed: result.processed,
      created: result.created,
      linked: result.linked,
      flagged: result.flagged,
    });
  } catch (error) {
    console.error("Manual sync error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
