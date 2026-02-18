import { NextRequest, NextResponse } from "next/server";
import { checkContactsWithoutTasks } from "@/lib/workflow-engine";

/**
 * Cron Job: Task Maintenance
 * 
 * This endpoint checks for contacts without tasks and creates appropriate tasks.
 * This ensures every active contact always has a task assigned.
 * 
 * Should be called daily (e.g., via Vercel Cron).
 * 
 * Vercel Cron config (add to vercel.json):
 * {
 *   "crons": [
 *     {
 *       "path": "/api/cron/task-maintenance",
 *       "schedule": "0 7 * * *"  // Daily at 7 AM UTC (before post-inspection)
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
    const result = await checkContactsWithoutTasks();
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      processed: result.processed,
      contacts: result.contacts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron job error (task-maintenance):", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Disable body parsing for cron endpoint
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

