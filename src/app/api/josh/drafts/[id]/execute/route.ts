import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { updateContactStage } from "@/lib/actions/stages";
import { completeTask, rescheduleTask } from "@/lib/actions/tasks";

interface ProgressPayload {
  stageName?: string;
  stageId?: string | null;
  nextTaskType?: string | null;
  customTaskName?: string | null;
  dueDate?: string | null;
}

interface NotePayload {
  content: string;
}

interface DatePayload {
  date: string | null;
  reason?: string | null;
}

/**
 * POST /api/josh/drafts/[id]/execute
 * Executes an approved workflow action (progress_task, add_note, set_date).
 * Message-type drafts continue to use /send for client-side SMS/email opening.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const draft = await prisma.joshDraft.findUnique({
      where: { id, userId: user.id },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            stageId: true,
            stage: { select: { name: true } },
          },
        },
        task: { select: { id: true, title: true } },
      },
    });

    if (!draft) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    if (draft.status !== "pending") {
      return NextResponse.json(
        { error: "Draft is not in pending state" },
        { status: 400 }
      );
    }

    // Prefer payload from request body (client override) over stored payload
    const payload = (body.actionPayload ?? draft.actionPayload) as Record<string, unknown> | null;

    switch (draft.draftType) {
      case "progress_task": {
        const p = (payload || {}) as ProgressPayload;
        if (!p.stageId) {
          return NextResponse.json(
            { error: "No stage ID in action payload" },
            { status: 400 }
          );
        }

        // Parse with noon offset to avoid UTC midnight rolling back a day
        const dueDateOverride = p.dueDate ? new Date(p.dueDate + "T12:00:00") : undefined;

        await updateContactStage(draft.contactId, p.stageId, dueDateOverride);

        if (draft.taskId) {
          await completeTask(draft.taskId, {
            reschedule: false,
            notes: `Progressed to ${p.stageName || "new stage"} via Josh AI`,
          });
        }

        await prisma.note.create({
          data: {
            contactId: draft.contactId,
            userId: user.id,
            content: `Josh AI: Progressed ${draft.contact.firstName} ${draft.contact.lastName} from "${draft.contact.stage?.name || "unknown"}" to "${p.stageName || "new stage"}"${dueDateOverride ? ` — next task due ${dueDateOverride.toLocaleDateString()}` : ""}`,
            noteType: "SYSTEM",
          },
        });
        break;
      }

      case "add_note": {
        const p = payload as unknown as NotePayload | null;
        await prisma.note.create({
          data: {
            contactId: draft.contactId,
            userId: user.id,
            content: p?.content || draft.body,
            noteType: "NOTE",
          },
        });
        break;
      }

      case "set_date": {
        const p = payload as unknown as DatePayload | null;
        if (!p?.date) {
          return NextResponse.json(
            { error: "No date in action payload" },
            { status: 400 }
          );
        }

        const taskId = draft.taskId;
        if (!taskId) {
          return NextResponse.json(
            { error: "No task associated with this draft" },
            { status: 400 }
          );
        }

        const parsedDate = new Date(p.date + "T12:00:00");
        await rescheduleTask(taskId, parsedDate);

        await prisma.note.create({
          data: {
            contactId: draft.contactId,
            userId: user.id,
            content: `Josh AI: Rescheduled task to ${parsedDate.toLocaleDateString()}${p.reason ? ` — ${p.reason}` : ""}`,
            noteType: "SYSTEM",
          },
        });
        break;
      }

      case "contact_resource": {
        const rp = (payload || {}) as { resourceCompanyName?: string; resourceContactName?: string };

        const resourceContact = rp.resourceContactName
          ? await prisma.resourceContact.findFirst({
              where: {
                name: rp.resourceContactName,
                company: { name: rp.resourceCompanyName || undefined },
              },
              include: { company: { select: { name: true } } },
            })
          : null;

        const recipientLabel = resourceContact
          ? `${resourceContact.name} at ${resourceContact.company.name}`
          : rp.resourceContactName || "resource contact";

        await prisma.note.create({
          data: {
            contactId: draft.contactId,
            userId: user.id,
            content: `Josh AI: Sent ${draft.channel} to ${recipientLabel} re: ${draft.contact.firstName} ${draft.contact.lastName}${draft.body ? ` — "${draft.body.substring(0, 120)}${draft.body.length > 120 ? "..." : ""}"` : ""}`,
            noteType: "SYSTEM",
          },
        });
        break;
      }

      case "schedule_appointment": {
        const p = (payload || {}) as { appointmentType?: string; datetime?: string; description?: string };
        if (!p.appointmentType || !p.datetime) {
          return NextResponse.json({ error: "Missing appointment data" }, { status: 400 });
        }

        const { createAppointment } = await import("@/lib/actions/appointments");
        const startTime = new Date(p.datetime);

        const result = await createAppointment({
          contactId: draft.contactId,
          type: p.appointmentType,
          startTime,
          description: p.description,
        });

        if (result?.error) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown draft type: ${draft.draftType}` },
          { status: 400 }
        );
    }

    const updated = await prisma.joshDraft.update({
      where: { id },
      data: {
        status: "sent",
        ...(body.actionPayload ? { actionPayload: body.actionPayload } : {}),
      },
    });

    return NextResponse.json({ draft: updated });
  } catch (error) {
    console.error("Error executing draft action:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
