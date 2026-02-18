import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

interface DirectiveItem {
  contactId: string;
  taskId?: string | null;
  directive: string;
}

/**
 * POST /api/josh/queue-directive-batch
 * Saves directives as queued drafts and returns immediately.
 * Compose happens asynchronously via /api/josh/process-queue.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const directives: DirectiveItem[] = body.directives;

    if (!Array.isArray(directives) || directives.length === 0) {
      return NextResponse.json(
        { error: "directives array is required" },
        { status: 400 }
      );
    }

    const valid = directives.filter(
      (d) => d.contactId && d.directive?.trim()
    );

    if (valid.length === 0) {
      return NextResponse.json(
        { error: "No valid directives provided" },
        { status: 400 }
      );
    }

    await prisma.joshDraft.createMany({
      data: valid.map((item) => ({
        userId: user.id,
        contactId: item.contactId,
        taskId: item.taskId || null,
        channel: "",
        recipientType: "customer",
        body: "",
        directive: item.directive.trim(),
        status: "queued",
      })),
    });

    return NextResponse.json({
      queued: valid.length,
      skipped: directives.length - valid.length,
    });
  } catch (error) {
    console.error("Error queuing directives:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
