import { NextRequest, NextResponse } from "next/server";
import { checkPassedInspections } from "@/lib/workflow-engine";

/**
 * Cron Job: Check for Passed Inspections
 * 
 * This endpoint should be called daily (e.g., via Vercel Cron).
 * It checks for inspections that have passed and creates "Assign Status" tasks.
 * 
 * Vercel Cron config (add to vercel.json):
 * {
 *   "crons": [
 *     {
 *       "path": "/api/cron/post-inspection",
 *       "schedule": "0 8 * * *"  // Daily at 8 AM UTC
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
    const result = await checkPassedInspections();
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${result.processed} contacts with passed inspections`,
      contacts: result.contacts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron job error (post-inspection):", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Disable body parsing for cron endpoint
export const runtime = "nodejs";
export const dynamic = "force-dynamic";


