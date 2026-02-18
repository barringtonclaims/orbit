import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { buildContext, composeMessage } from "@/lib/josh/compose";

const MAX_BATCH_SIZE = 20;
const CONCURRENCY_LIMIT = 5;

interface DirectiveItem {
  contactId: string;
  taskId?: string | null;
  directive: string;
}

interface BatchResult {
  contactId: string;
  status: "success" | "error";
  error?: string;
  draftsCreated?: number;
}

/**
 * POST /api/josh/queue-directive-batch
 * Accepts up to 20 directives and processes them with concurrency control.
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

    const body = await request.json();
    const directives: DirectiveItem[] = body.directives;

    if (!Array.isArray(directives) || directives.length === 0) {
      return NextResponse.json(
        { error: "directives array is required" },
        { status: 400 }
      );
    }

    if (directives.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BATCH_SIZE} directives per batch` },
        { status: 400 }
      );
    }

    const results: BatchResult[] = [];

    // Process in chunks of CONCURRENCY_LIMIT
    for (let i = 0; i < directives.length; i += CONCURRENCY_LIMIT) {
      const chunk = directives.slice(i, i + CONCURRENCY_LIMIT);
      const chunkResults = await Promise.allSettled(
        chunk.map((item) => processDirective(item, user.id, userName))
      );

      for (let j = 0; j < chunkResults.length; j++) {
        const settled = chunkResults[j];
        const item = chunk[j];
        if (settled.status === "fulfilled") {
          results.push(settled.value);
        } else {
          results.push({
            contactId: item.contactId,
            status: "error",
            error: "Unexpected error processing directive",
          });
        }
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const totalDrafts = results.reduce((sum, r) => sum + (r.draftsCreated || 0), 0);

    return NextResponse.json({
      results,
      summary: {
        total: directives.length,
        succeeded: successCount,
        failed: directives.length - successCount,
        draftsCreated: totalDrafts,
      },
    });
  } catch (error) {
    console.error("Error in batch directive:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function processDirective(
  item: DirectiveItem,
  userId: string,
  userName: string
): Promise<BatchResult> {
  const { contactId, taskId, directive } = item;

  if (!contactId || !directive?.trim()) {
    return { contactId, status: "error", error: "Missing contactId or directive" };
  }

  try {
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
      return { contactId, status: "error", error: "Contact not found" };
    }

    const contactContext = buildContext(contact);
    const result = await composeMessage(directive, contactContext, contact, userName);

    let draftsCreated = 0;

    if (result.channel === "both" && result.smsBody && result.emailBody) {
      await Promise.all([
        prisma.joshDraft.create({
          data: {
            userId,
            contactId,
            taskId: taskId || null,
            channel: "sms",
            recipientType: result.recipientType,
            subject: null,
            body: result.smsBody,
            directive,
            status: "pending",
          },
        }),
        prisma.joshDraft.create({
          data: {
            userId,
            contactId,
            taskId: taskId || null,
            channel: "email",
            recipientType: result.recipientType,
            subject: result.subject || null,
            body: result.emailBody,
            directive,
            status: "pending",
          },
        }),
      ]);
      draftsCreated = 2;
    } else {
      await prisma.joshDraft.create({
        data: {
          userId,
          contactId,
          taskId: taskId || null,
          channel: result.channel,
          recipientType: result.recipientType,
          subject: result.subject || null,
          body: result.body,
          directive,
          status: "pending",
        },
      });
      draftsCreated = 1;
    }

    return { contactId, status: "success", draftsCreated };
  } catch (error) {
    console.error(`Error processing directive for contact ${contactId}:`, error);
    return { contactId, status: "error", error: "Failed to compose message" };
  }
}
