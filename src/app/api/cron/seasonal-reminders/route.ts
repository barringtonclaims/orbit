import { NextRequest, NextResponse } from "next/server";
import { checkSeasonalReminders } from "@/lib/workflow-engine";

/**
 * Cron Job: Check for Seasonal Reminders
 * 
 * This endpoint should be called daily (e.g., via Vercel Cron).
 * It checks for contacts with seasonal follow-up dates that have arrived
 * and creates follow-up tasks.
 * 
 * Vercel Cron config (add to vercel.json):
 * {
 *   "crons": [
 *     {
 *       "path": "/api/cron/seasonal-reminders",
 *       "schedule": "0 9 * * *"  // Daily at 9 AM UTC
 *     }
 *   ]
 * }
 */

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  // In development, allow without secret
  if (process.env.NODE_ENV !== "development") {
    if (!cronSecret) {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  try {
    const result = await checkSeasonalReminders();
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Created ${result.processed} seasonal follow-up tasks`,
      contacts: result.contacts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron job error (seasonal-reminders):", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Disable body parsing for cron endpoint
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

