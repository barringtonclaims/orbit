import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { buildContext, composeMessage } from "@/lib/josh/compose";

const CONCURRENCY_LIMIT = 5;

/**
 * POST /api/josh/process-queue
 * Picks up queued Josh drafts for the current user, composes messages via AI,
 * and promotes them to "pending" (ready to review/send in the outbox).
 * Designed to be called fire-and-forget after directives are queued.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true },
    });
    const userName =
      dbUser?.fullName || user.email?.split("@")[0] || "the user";

    const queued = await prisma.joshDraft.findMany({
      where: { userId: user.id, status: "queued" },
      orderBy: { createdAt: "asc" },
    });

    if (queued.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    const ids = queued.map((d) => d.id);
    await prisma.joshDraft.updateMany({
      where: { id: { in: ids } },
      data: { status: "composing" },
    });

    let processed = 0;
    let failed = 0;

    for (let i = 0; i < queued.length; i += CONCURRENCY_LIMIT) {
      const chunk = queued.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.allSettled(
        chunk.map(async (draft) => {
          try {
            await composeDraft(draft, user.id, userName);
            processed++;
          } catch (err) {
            console.error(
              `Failed to compose draft ${draft.id}:`,
              err
            );
            await prisma.joshDraft.update({
              where: { id: draft.id },
              data: {
                status: "pending",
                channel: "sms",
                body: "Unable to generate message — please edit manually or discard.",
              },
            });
            failed++;
          }
        })
      );
    }

    return NextResponse.json({ processed, failed });
  } catch (error) {
    console.error("Error processing queue:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function composeDraft(
  draft: { id: string; contactId: string; taskId: string | null; directive: string },
  userId: string,
  userName: string
) {
  const contact = await prisma.contact.findUnique({
    where: { id: draft.contactId },
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
    await prisma.joshDraft.update({
      where: { id: draft.id },
      data: {
        status: "pending",
        channel: "sms",
        body: "Contact not found — please discard this draft.",
      },
    });
    return;
  }

  const contactContext = buildContext(contact);
  const result = await composeMessage(
    draft.directive,
    contactContext,
    contact,
    userName
  );

  if (result.channel === "both" && result.smsBody && result.emailBody) {
    await Promise.all([
      prisma.joshDraft.update({
        where: { id: draft.id },
        data: {
          channel: "sms",
          recipientType: result.recipientType,
          subject: null,
          body: result.smsBody,
          status: "pending",
        },
      }),
      prisma.joshDraft.create({
        data: {
          userId,
          contactId: draft.contactId,
          taskId: draft.taskId,
          channel: "email",
          recipientType: result.recipientType,
          subject: result.subject || null,
          body: result.emailBody,
          directive: draft.directive,
          status: "pending",
        },
      }),
    ]);
  } else {
    await prisma.joshDraft.update({
      where: { id: draft.id },
      data: {
        channel: result.channel,
        recipientType: result.recipientType,
        subject: result.subject || null,
        body: result.body,
        status: "pending",
      },
    });
  }
}
