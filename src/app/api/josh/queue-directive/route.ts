import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { buildContext, composeMessage } from "@/lib/josh/compose";

interface QueueDirectiveRequest {
  contactId: string;
  taskId?: string | null;
  directive: string;
}

/**
 * POST /api/josh/queue-directive
 * Accepts a freeform directive, has Josh compose the message, and saves it to the outbox.
 * When the AI decides "both" (SMS + email), two separate drafts are created with
 * distinct messages tailored to each channel.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true },
    });
    const userName = dbUser?.fullName || user.email?.split("@")[0] || "the user";

    const body: QueueDirectiveRequest = await request.json();
    const { contactId, taskId, directive } = body;

    if (!contactId || !directive?.trim()) {
      return NextResponse.json(
        { error: "Contact ID and directive are required" },
        { status: 400 }
      );
    }

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        stage: true,
        tasks: {
          where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
          orderBy: { dueDate: "asc" },
          take: 3,
        },
        timeline: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
        carrierRef: true,
        files: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { fileName: true, fileType: true, createdAt: true },
        },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const contactContext = buildContext(contact);
    const result = await composeMessage(
      directive,
      contactContext,
      contact,
      userName
    );

    const draftInclude = {
      contact: {
        select: {
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
    };

    if (result.channel === "both" && result.smsBody && result.emailBody) {
      const [smsDraft, emailDraft] = await Promise.all([
        prisma.joshDraft.create({
          data: {
            userId: user.id,
            contactId,
            taskId: taskId || null,
            channel: "sms",
            recipientType: result.recipientType,
            subject: null,
            body: result.smsBody,
            directive,
            status: "pending",
          },
          include: draftInclude,
        }),
        prisma.joshDraft.create({
          data: {
            userId: user.id,
            contactId,
            taskId: taskId || null,
            channel: "email",
            recipientType: result.recipientType,
            subject: result.subject || null,
            body: result.emailBody,
            directive,
            status: "pending",
          },
          include: draftInclude,
        }),
      ]);

      return NextResponse.json({ drafts: [smsDraft, emailDraft] });
    }

    const draft = await prisma.joshDraft.create({
      data: {
        userId: user.id,
        contactId,
        taskId: taskId || null,
        channel: result.channel,
        recipientType: result.recipientType,
        subject: result.subject || null,
        body: result.body,
        directive,
        status: "pending",
      },
      include: draftInclude,
    });

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("Error queuing directive:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
