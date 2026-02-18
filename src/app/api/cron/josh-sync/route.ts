/**
 * Josh Email Sync Cron Job
 * 
 * Runs every 5 minutes to process new emails for all users with Gmail connected.
 * Triggered by Vercel Cron or can be called manually.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { processNewEmails } from "@/lib/josh/email-processor";

// Verify the request is from Vercel Cron or has valid auth
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all organizations with Gmail connected (org-scoped token)
    const googleTokens = await prisma.googleToken.findMany({
      where: {
        hasGmailAccess: true,
      },
      select: {
        organizationId: true,
        connectedById: true,
        lastGmailSyncAt: true,
      },
    });

    if (googleTokens.length === 0) {
      return NextResponse.json({
        message: "No Gmail accounts connected",
        processed: 0,
      });
    }

    const results: Array<{
      userId: string;
      organizationId: string;
      processed: number;
      created: number;
      linked: number;
      flagged: number;
      error?: string;
    }> = [];

    // Process emails for each organization
    for (const token of googleTokens) {
      try {
        const result = await processNewEmails(token.connectedById, token.organizationId);
        
        results.push({
          userId: token.connectedById,
          organizationId: token.organizationId,
          processed: result.processed,
          created: result.created,
          linked: result.linked,
          flagged: result.flagged,
        });
      } catch (error) {
        console.error(`Error processing emails for org ${token.organizationId}:`, error);
        results.push({
          userId: token.connectedById,
          organizationId: token.organizationId,
          processed: 0,
          created: 0,
          linked: 0,
          flagged: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Calculate totals
    const totals = results.reduce(
      (acc, r) => ({
        processed: acc.processed + r.processed,
        created: acc.created + r.created,
        linked: acc.linked + r.linked,
        flagged: acc.flagged + r.flagged,
        errors: acc.errors + (r.error ? 1 : 0),
      }),
      { processed: 0, created: 0, linked: 0, flagged: 0, errors: 0 }
    );

    return NextResponse.json({
      message: "Josh sync completed",
      accounts: googleTokens.length,
      ...totals,
      details: results,
    });
  } catch (error) {
    console.error("Josh sync cron error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
