import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

/**
 * POST /api/josh/drafts/[id]/send - Mark a draft as sent
 * The actual send action (opening SMS/email compose) happens client-side;
 * this endpoint records that the user sent it.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const draft = await prisma.joshDraft.update({
      where: { id, userId: user.id },
      data: { status: "sent" },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Record in the contact timeline
    await prisma.note.create({
      data: {
        contactId: draft.contactId,
        userId: user.id,
        content: `Sent ${draft.channel.toUpperCase()} to ${draft.recipientType}: ${draft.body.substring(0, 100)}${draft.body.length > 100 ? "..." : ""}`,
        noteType: draft.channel === "email" ? "EMAIL_SENT" : "SMS_SENT",
      },
    });

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Error sending draft:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
