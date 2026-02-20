import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  composeWithActions,
  type ComposeAction,
  type StageInfo,
  type ToolData,
} from "@/lib/josh/compose";

const CONCURRENCY_LIMIT = 5;

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
      select: { fullName: true, activeOrganizationId: true },
    });
    const userName =
      dbUser?.fullName || user.email?.split("@")[0] || "the user";

    const orgId = dbUser?.activeOrganizationId ?? "";

    const org = orgId
      ? await prisma.organization.findUnique({
          where: { id: orgId },
          select: { name: true },
        })
      : null;
    const companyName = org?.name || "";

    // Fetch org-level config once (small data, always in prompt)
    const [stages, templates, customTaskTypes, customAppointmentTypes, resourceCompanies] = await Promise.all([
      prisma.leadStage.findMany({
        where: { organizationId: orgId || undefined },
        select: { id: true, name: true },
        orderBy: { order: "asc" },
      }),
      prisma.messageTemplate.findMany({
        where: { organizationId: orgId || undefined },
        select: { name: true, body: true, templateType: true, category: true, stageName: true, taskTypeName: true },
        take: 20,
      }),
      prisma.customTaskType.findMany({
        where: { organizationId: orgId },
        select: { name: true, stageId: true },
        orderBy: { order: "asc" },
      }),
      prisma.customAppointmentType.findMany({
        where: { organizationId: orgId },
        select: { name: true, includesLocation: true },
        orderBy: { order: "asc" },
      }),
      prisma.resourceCompany.findMany({
        where: { organizationId: orgId || undefined },
        include: { contacts: true },
      }),
    ]);

    const stageInfos: StageInfo[] = stages.map((s) => ({ id: s.id, name: s.name }));
    const taskTypeNames = customTaskTypes.map((t) => t.name);
    const appointmentTypeNames = customAppointmentTypes.map((t) => t.name);

    // Build stage -> task type mapping for Josh AI context
    const stageTaskTypes = stages.map((s) => ({
      stageName: s.name,
      taskTypes: customTaskTypes.filter((t) => t.stageId === s.id).map((t) => t.name),
    }));

    // Pre-build org-wide tool data that's shared across all drafts
    const orgResourceContacts = resourceCompanies.flatMap((company) =>
      company.contacts.map((c) => ({
        companyName: company.name,
        companyType: company.type,
        contactName: c.name,
        role: c.role,
        phone: c.phone,
        email: c.email,
        notes: c.notes,
      }))
    );
    const orgTemplates = templates.map((t) => ({
      name: t.name,
      body: t.body,
      templateType: t.templateType,
      category: t.category,
      taskTypeName: t.taskTypeName,
    }));

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
            await composeDraft(
              draft,
              user.id,
              userName,
              companyName,
              stageInfos,
              stages,
              taskTypeNames,
              appointmentTypeNames,
              orgTemplates,
              orgResourceContacts,
              stageTaskTypes
            );
            processed++;
          } catch (err) {
            console.error(`Failed to compose draft ${draft.id}:`, err);
            await prisma.joshDraft.update({
              where: { id: draft.id },
              data: {
                status: "pending",
                draftType: "message",
                channel: "sms",
                body: "Unable to generate — please edit manually or discard.",
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
  userName: string,
  companyName: string,
  stageInfos: StageInfo[],
  stages: { id: string; name: string }[],
  taskTypeNames: string[],
  appointmentTypeNames: string[],
  orgTemplates: { name: string; body: string; templateType: string; category: string; taskTypeName: string | null }[],
  orgResourceContacts: { companyName: string; companyType: string; contactName: string; role: string | null; phone: string | null; email: string | null; notes: string | null }[],
  stageTaskTypes: { stageName: string; taskTypes: string[] }[]
) {
  const contact = await prisma.contact.findUnique({
    where: { id: draft.contactId },
    include: {
      stage: true,
      tasks: {
        where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
        orderBy: { dueDate: "asc" },
        take: 3,
        select: { title: true, dueDate: true, taskType: true },
      },
      timeline: {
        orderBy: { createdAt: "desc" },
        take: 15,
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
        draftType: "add_note",
        channel: "system",
        body: "Contact not found — please discard this draft.",
        actionPayload: { content: "Contact not found — please discard this draft." },
      },
    });
    return;
  }

  // Build per-contact tool data
  const toolData: ToolData = {
    templates: orgTemplates,
    resourceContacts: orgResourceContacts,
    timeline: contact.timeline,
    documents: contact.files,
    carrierRef: contact.carrierRef,
    adjusterEmail: contact.adjusterEmail,
    stageTaskTypes,
  };

  const result = await composeWithActions(
    draft.directive,
    contact,
    userName,
    companyName,
    stageInfos,
    taskTypeNames,
    appointmentTypeNames,
    toolData
  );

  if (result.actions.length === 0) {
    await prisma.joshDraft.update({
      where: { id: draft.id },
      data: {
        status: "pending",
        draftType: "add_note",
        channel: "system",
        body: "Could not determine actions — please handle manually.",
        actionPayload: { content: "Could not determine actions — please handle manually." },
      },
    });
    return;
  }

  const firstAction = result.actions[0];
  const remainingActions = result.actions.slice(1);

  await updateDraftFromAction(draft.id, firstAction, stages);

  for (const action of remainingActions) {
    const data = buildDraftData(action, userId, draft.contactId, draft.taskId, draft.directive, stages);
    if (data) {
      await prisma.joshDraft.create({ data });
    }
  }
}

async function updateDraftFromAction(
  draftId: string,
  action: ComposeAction,
  stages: { id: string; name: string }[]
) {
  switch (action.type) {
    case "send_message": {
      if (action.channel === "both" && action.smsBody && action.emailBody) {
        const existingDraft = await prisma.joshDraft.findUnique({ where: { id: draftId } });
        await prisma.joshDraft.update({
          where: { id: draftId },
          data: {
            draftType: "message",
            channel: "sms",
            recipientType: action.recipientType || "customer",
            subject: null,
            body: action.smsBody,
            status: "pending",
          },
        });
        if (existingDraft) {
          await prisma.joshDraft.create({
            data: {
              userId: existingDraft.userId,
              contactId: existingDraft.contactId,
              taskId: existingDraft.taskId,
              directive: existingDraft.directive,
              draftType: "message",
              channel: "email",
              recipientType: action.recipientType || "customer",
              subject: action.subject || null,
              body: action.emailBody,
              status: "pending",
            },
          });
        }
      } else {
        await prisma.joshDraft.update({
          where: { id: draftId },
          data: {
            draftType: "message",
            channel: action.channel || "sms",
            recipientType: action.recipientType || "customer",
            subject: action.subject || null,
            body: action.body || "",
            status: "pending",
          },
        });
      }
      break;
    }
    case "progress_task": {
      const matchedStage = stages.find(
        (s) => s.name.toLowerCase() === (action.stageName || "").toLowerCase()
      );
      await prisma.joshDraft.update({
        where: { id: draftId },
        data: {
          draftType: "progress_task",
          channel: "system",
          body: `Progress to: ${action.stageName || "next stage"}`,
          actionPayload: {
            stageName: action.stageName,
            stageId: matchedStage?.id || null,
            nextTaskType: action.nextTaskType || null,
            customTaskName: action.customTaskName || null,
            dueDate: action.dueDate || null,
          },
          status: "pending",
        },
      });
      break;
    }
    case "add_note": {
      await prisma.joshDraft.update({
        where: { id: draftId },
        data: {
          draftType: "add_note",
          channel: "system",
          body: action.content || "",
          actionPayload: { content: action.content || "" },
          status: "pending",
        },
      });
      break;
    }
    case "set_date": {
      await prisma.joshDraft.update({
        where: { id: draftId },
        data: {
          draftType: "set_date",
          channel: "system",
          body: action.reason || `Set date to ${action.date}`,
          actionPayload: {
            date: action.date || null,
            reason: action.reason || null,
          },
          status: "pending",
        },
      });
      break;
    }
    case "schedule_appointment": {
      await prisma.joshDraft.update({
        where: { id: draftId },
        data: {
          draftType: "schedule_appointment",
          channel: "internal",
          body: `Schedule ${action.appointmentType || "appointment"} for ${action.datetime || "TBD"}`,
          actionPayload: {
            appointmentType: action.appointmentType || null,
            datetime: action.datetime || null,
            description: action.description || null,
          },
          status: "pending",
        },
      });
      break;
    }
    case "contact_resource": {
      await prisma.joshDraft.update({
        where: { id: draftId },
        data: {
          draftType: "contact_resource",
          channel: action.resourceChannel || "sms",
          recipientType: "resource",
          subject: action.resourceSubject || null,
          body: action.resourceBody || "",
          actionPayload: {
            resourceCompanyName: action.resourceCompanyName || null,
            resourceContactName: action.resourceContactName || null,
          },
          status: "pending",
        },
      });
      break;
    }
  }
}

function buildDraftData(
  action: ComposeAction,
  userId: string,
  contactId: string,
  taskId: string | null,
  directive: string,
  stages: { id: string; name: string }[]
): Prisma.JoshDraftUncheckedCreateInput | null {
  const base = { userId, contactId, taskId, directive, status: "pending" };

  switch (action.type) {
    case "send_message": {
      if (action.channel === "both" && action.smsBody && action.emailBody) {
        return null;
      }
      return {
        ...base,
        draftType: "message",
        channel: action.channel || "sms",
        recipientType: action.recipientType || "customer",
        subject: action.subject || null,
        body: action.body || "",
        actionPayload: Prisma.DbNull,
      };
    }
    case "progress_task": {
      const matchedStage = stages.find(
        (s) => s.name.toLowerCase() === (action.stageName || "").toLowerCase()
      );
      return {
        ...base,
        draftType: "progress_task",
        channel: "system",
        recipientType: "customer",
        subject: null,
        body: `Progress to: ${action.stageName || "next stage"}`,
        actionPayload: {
          stageName: action.stageName,
          stageId: matchedStage?.id || null,
          nextTaskType: action.nextTaskType || null,
          customTaskName: action.customTaskName || null,
          dueDate: action.dueDate || null,
        },
      };
    }
    case "add_note":
      return {
        ...base,
        draftType: "add_note",
        channel: "system",
        recipientType: "customer",
        subject: null,
        body: action.content || "",
        actionPayload: { content: action.content || "" },
      };
    case "set_date":
      return {
        ...base,
        draftType: "set_date",
        channel: "system",
        recipientType: "customer",
        subject: null,
        body: action.reason || `Set date to ${action.date}`,
        actionPayload: {
          date: action.date || null,
          reason: action.reason || null,
        },
      };
    case "schedule_appointment":
      return {
        ...base,
        draftType: "schedule_appointment",
        channel: "internal",
        recipientType: "customer",
        subject: null,
        body: `Schedule ${action.appointmentType || "appointment"} for ${action.datetime || "TBD"}`,
        actionPayload: {
          appointmentType: action.appointmentType || null,
          datetime: action.datetime || null,
          description: action.description || null,
        },
      };
    case "contact_resource":
      return {
        ...base,
        draftType: "contact_resource",
        channel: action.resourceChannel || "sms",
        recipientType: "resource",
        subject: action.resourceSubject || null,
        body: action.resourceBody || "",
        actionPayload: {
          resourceCompanyName: action.resourceCompanyName || null,
          resourceContactName: action.resourceContactName || null,
        },
      };
    default:
      return null;
  }
}
