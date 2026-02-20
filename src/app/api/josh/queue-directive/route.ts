import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

interface QueueDirectiveRequest {
  contactId: string;
  taskId?: string | null;
  directive: string;
}

/**
 * POST /api/josh/queue-directive
 * Saves a single directive as a queued draft and returns immediately.
 * Composition happens asynchronously via /api/josh/process-queue,
 * identical to the batch flow.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: QueueDirectiveRequest = await request.json();
    const { contactId, taskId, directive } = body;

    if (!contactId || !directive?.trim()) {
      return NextResponse.json(
        { error: "Contact ID and directive are required" },
        { status: 400 }
      );
    }

    const draft = await prisma.joshDraft.create({
      data: {
        userId: user.id,
        contactId,
        taskId: taskId || null,
        channel: "",
        recipientType: "customer",
        body: "",
        directive: directive.trim(),
        status: "queued",
      },
    });

    return NextResponse.json({ queued: 1, draftId: draft.id });
  } catch (error) {
    console.error("Error queuing directive:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
