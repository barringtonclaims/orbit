import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { generateTaskTitle, getNthOfficeDay, enforceOfficeDay, getSeasonalFollowUpDate } from "@/lib/scheduling";
import { STAGE_NAMES } from "@/types";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { checkContactsWithoutTasks } from "@/lib/workflow-engine";

// Extend serverless function timeout (Vercel Pro supports up to 300s)
export const maxDuration = 300;

// AccuLynx milestones we handle
const ACCULYNX_MILESTONES = ["Dead", "Unassigned Lead", "Assigned Lead", "Prospect"] as const;

// Dead lead reasons that should be skipped entirely
const SKIP_DEAD_REASONS = [
  "***RED FILE DO NOT CONTACT***",
  "Bad Lead from Lead Service",
];

const STALE_THRESHOLD_DAYS = 90;

/**
 * Fix doubled last names from AccuLynx API automation (e.g. "SheaShea" -> "Shea")
 */
function fixDoubledLastName(name: string): string {
  if (!name || name.length < 4) return name;
  const len = name.length;
  if (len % 2 === 0) {
    const half = len / 2;
    const first = name.substring(0, half);
    const second = name.substring(half);
    if (first === second) return first;
  }
  return name;
}

/**
 * Parse a date string in M/D/YY or M/D/YYYY format
 */
function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr?.trim()) return null;
  const parts = dateStr.trim().split("/");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0], 10) - 1;
  const day = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;
  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return null;
  return d;
}

function getVal(row: Record<string, string>, key: string): string | null {
  const val = row[key];
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed || null;
}

function parseIntLoose(val: string | null): number | null {
  if (!val) return null;
  const cleaned = val.replace(/,/g, "").trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? null : n;
}

interface ImportPreview {
  newLead: number;
  claimProspect: number;
  retailProspect: number;
  seasonal: number;
  notInterested: number;
  skippedJunk: number;
  skippedDeadFiltered: number;
  total: number;
}

interface ImportResult extends ImportPreview {
  created: number;
  skippedDuplicate: number;
  errors: string[];
}

/**
 * Determine which Orbit stage an AccuLynx row maps to.
 *
 * Rules (in order of priority):
 * 1. Dead (Do Not Contact / Bad Lead) → skip entirely
 * 2. Prospect (any milestone = "Prospect") → Claim Prospect
 * 3. Touched within 90 days (non-Prospect) → New Lead
 * 4. Everything else → Seasonal Follow Up
 */
function determineStage(
  milestone: string,
  lastTouchedDays: number | null,
  deadReason: string | null,
): { stage: string; skip: boolean; skipReason?: string } {
  // Skip the truly unsalvageable dead leads
  if (milestone === "Dead") {
    if (deadReason && SKIP_DEAD_REASONS.some(r => r === deadReason)) {
      return { stage: "", skip: true, skipReason: "filtered_dead" };
    }
    // All other dead leads → Seasonal Follow Up (worth a future re-engage)
    return { stage: STAGE_NAMES.SEASONAL, skip: false };
  }

  // Active prospect in AccuLynx → Claim Prospect regardless of last-touched
  if (milestone === "Prospect") {
    return { stage: STAGE_NAMES.CLAIM_PROSPECT, skip: false };
  }

  // Assigned or Unassigned Lead: recent activity → New Lead, stale → Seasonal
  const isRecent = lastTouchedDays !== null && lastTouchedDays <= STALE_THRESHOLD_DAYS;
  if (isRecent) {
    return { stage: STAGE_NAMES.NEW_LEAD, skip: false };
  }

  return { stage: STAGE_NAMES.SEASONAL, skip: false };
}

type TaskDecision =
  | { taskType: "FOLLOW_UP"; kind: "offset"; dueDateOffset: number }
  | { taskType: "SEASONAL_FOLLOW_UP"; kind: "seasonal" }
  | { taskType: "FOLLOW_UP"; kind: "fixed"; dueDate: Date };

/**
 * Determine the task to create for a contact based on their assigned stage.
 * Every imported contact gets a task so they surface in the task page.
 */
function determineTask(
  stageName: string,
  lastTouchedDays: number | null,
  now: Date,
): TaskDecision {
  // Seasonal Follow Up → SEASONAL_FOLLOW_UP task due at spring re-engage date
  if (stageName === STAGE_NAMES.SEASONAL) {
    return { taskType: "SEASONAL_FOLLOW_UP", kind: "seasonal" };
  }

  // Not Interested → low-priority FOLLOW_UP task 1 year out
  if (stageName === STAGE_NAMES.NOT_INTERESTED) {
    const oneYearOut = new Date(now);
    oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
    return { taskType: "FOLLOW_UP", kind: "fixed", dueDate: oneYearOut };
  }

  // Active contacts (New Lead, Claim Prospect, Retail Prospect)
  // Schedule based on how recently they were touched
  if (lastTouchedDays === null || lastTouchedDays === 0) {
    return { taskType: "FOLLOW_UP", kind: "offset", dueDateOffset: 0 };
  }
  if (lastTouchedDays <= 7) {
    return { taskType: "FOLLOW_UP", kind: "offset", dueDateOffset: 1 };
  }
  if (lastTouchedDays <= 30) {
    return { taskType: "FOLLOW_UP", kind: "offset", dueDateOffset: 3 };
  }
  return { taskType: "FOLLOW_UP", kind: "offset", dueDateOffset: 5 };
}

function parseRows(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, string>[];
}

/**
 * PUT /api/contacts/import/acculynx - Preview the import (dry run)
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = parseRows(buffer);

    if (rows.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const headers = Object.keys(rows[0]);
    const isAccuLynx = headers.includes("Current Milestone") && headers.includes("Last Touched Age (Days)");
    if (!isAccuLynx) {
      return NextResponse.json({
        error: "This doesn't appear to be an AccuLynx Lead Status Report. Missing required columns.",
      }, { status: 400 });
    }

    const preview: ImportPreview = {
      newLead: 0,
      claimProspect: 0,
      retailProspect: 0,
      seasonal: 0,
      notInterested: 0,
      skippedJunk: 0,
      skippedDeadFiltered: 0,
      total: rows.length,
    };

    for (const row of rows) {
      const milestone = getVal(row, "Current Milestone");
      if (!milestone || !ACCULYNX_MILESTONES.includes(milestone as typeof ACCULYNX_MILESTONES[number])) {
        preview.skippedJunk++;
        continue;
      }

      if (milestone === "Unassigned Lead") {
        const phone = getVal(row, "Phone Number");
        const email = getVal(row, "Primary Contact: Email");
        if (!phone && !email) { preview.skippedJunk++; continue; }
      }

      const lastTouched = parseIntLoose(getVal(row, "Last Touched Age (Days)"));
      const deadReason = getVal(row, "Dead Lead Reason");
      const { stage, skip } = determineStage(milestone, lastTouched, deadReason);

      if (skip) { preview.skippedDeadFiltered++; continue; }

      switch (stage) {
        case STAGE_NAMES.NEW_LEAD: preview.newLead++; break;
        case STAGE_NAMES.CLAIM_PROSPECT: preview.claimProspect++; break;
        case STAGE_NAMES.RETAIL_PROSPECT: preview.retailProspect++; break;
        case STAGE_NAMES.SEASONAL: preview.seasonal++; break;
        case STAGE_NAMES.NOT_INTERESTED: preview.notInterested++; break;
      }
    }

    return NextResponse.json({ preview });
  } catch (error) {
    console.error("AccuLynx preview error:", error);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }
}

/**
 * POST /api/contacts/import/acculynx - Execute the import
 *
 * Performance strategy:
 * 1. Pre-fetch all existing emails + phone suffixes in 2 bulk queries → O(1) dedup lookup
 * 2. Process all rows in JS memory → build contact/task/note payloads
 * 3. prisma.createMany for contacts → 1 query
 * 4. prisma.createMany for tasks   → 1 query
 * 5. prisma.createMany for notes   → 1 query
 * Total DB round trips: ~7 regardless of file size
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgId(user.id);
    if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = parseRows(buffer);

    if (rows.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    // ── 1. Load reference data (stages, org members) ──────────────────────
    const [stages, orgMembers] = await Promise.all([
      prisma.leadStage.findMany({ where: { organizationId: orgId } }),
      prisma.organizationMember.findMany({
        where: { organizationId: orgId },
        include: { user: { select: { id: true, fullName: true } } },
      }),
    ]);

    const stageMap = new Map(stages.map(s => [s.name, s]));

    function findMemberByName(name: string | null): string | null {
      if (!name) return null;
      const lower = name.toLowerCase().trim();
      return orgMembers.find(m => m.user.fullName.toLowerCase() === lower)?.user.id ?? null;
    }

    // ── 2. Bulk-fetch existing emails + phone suffixes for dedup ──────────
    const [existingEmailRecords, existingPhoneRecords] = await Promise.all([
      prisma.contact.findMany({
        where: { organizationId: orgId, email: { not: null } },
        select: { email: true },
      }),
      prisma.contact.findMany({
        where: { organizationId: orgId, phone: { not: null } },
        select: { phone: true },
      }),
    ]);

    const existingEmails = new Set(
      existingEmailRecords.map(r => r.email!.toLowerCase().trim())
    );
    const existingPhoneSuffixes = new Set(
      existingPhoneRecords
        .map(r => r.phone!.replace(/\D/g, ""))
        .filter(d => d.length >= 7)
        .map(d => d.slice(-7))
    );

    // ── 3. Process rows in memory ─────────────────────────────────────────
    const result: ImportResult = {
      newLead: 0, claimProspect: 0, retailProspect: 0,
      seasonal: 0, notInterested: 0,
      skippedJunk: 0, skippedDeadFiltered: 0,
      skippedDuplicate: 0, created: 0,
      total: rows.length, errors: [],
    };

    const contactPayloads: Prisma.ContactCreateManyInput[] = [];
    const taskPayloads: Prisma.TaskCreateManyInput[] = [];
    const notePayloads: Prisma.NoteCreateManyInput[] = [];

    const now = new Date();

    // Track emails/phones seen in this import batch to catch within-file dupes
    const seenEmailsThisBatch = new Set<string>();
    const seenPhoneSuffixesThisBatch = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const milestone = getVal(row, "Current Milestone");
        if (!milestone || !ACCULYNX_MILESTONES.includes(milestone as typeof ACCULYNX_MILESTONES[number])) {
          result.skippedJunk++;
          continue;
        }

        if (milestone === "Unassigned Lead") {
          const phone = getVal(row, "Phone Number");
          const email = getVal(row, "Primary Contact: Email");
          if (!phone && !email) { result.skippedJunk++; continue; }
        }

        const workType = getVal(row, "Work Type");
        const lastTouched = parseIntLoose(getVal(row, "Last Touched Age (Days)"));
        const deadReason = getVal(row, "Dead Lead Reason");

        const { stage: stageName, skip, skipReason } = determineStage(milestone, lastTouched, deadReason);
        if (skip) {
          if (skipReason === "filtered_dead") result.skippedDeadFiltered++;
          else result.skippedJunk++;
          continue;
        }

        const email = getVal(row, "Primary Contact: Email");
        const phone = getVal(row, "Phone Number");

        // Dedup against DB + within-batch
        if (email) {
          const lower = email.toLowerCase().trim();
          if (existingEmails.has(lower) || seenEmailsThisBatch.has(lower)) {
            result.skippedDuplicate++;
            continue;
          }
        }
        if (phone) {
          const digits = phone.replace(/\D/g, "");
          if (digits.length >= 7) {
            const suffix = digits.slice(-7);
            if (existingPhoneSuffixes.has(suffix) || seenPhoneSuffixesThisBatch.has(suffix)) {
              result.skippedDuplicate++;
              continue;
            }
          }
        }

        // Mark as seen
        if (email) seenEmailsThisBatch.add(email.toLowerCase().trim());
        if (phone) {
          const digits = phone.replace(/\D/g, "");
          if (digits.length >= 7) seenPhoneSuffixesThisBatch.add(digits.slice(-7));
        }

        // Build contact data
        let firstName = getVal(row, "Primary Contact: First Name") || "Unknown";
        let lastName = getVal(row, "Primary Contact: Last Name") || "";
        lastName = fixDoubledLastName(lastName);

        const address = getVal(row, "Job: Location Street 1");
        const city = getVal(row, "Job: Location City");
        const state = getVal(row, "Job: Location State");
        const zipCode = getVal(row, "Job: Location Zip Code");
        const carrier = getVal(row, "Insurance Company");
        const claimNumber = getVal(row, "Claim Number");
        const dateOfLoss = parseDate(getVal(row, "Date of Loss"));
        const source = getVal(row, "Lead Source") || "AccuLynx Import";
        const salesperson = getVal(row, "Primary Salesperson");
        const leadDate = getVal(row, "Lead Date");

        const noteParts: string[] = [];
        if (deadReason) noteParts.push(`Dead Lead Reason: ${deadReason}`);
        if (workType) noteParts.push(`AccuLynx Work Type: ${workType}`);
        const adjusterName = getVal(row, "Adjuster Name");
        const adjusterPhone = getVal(row, "Adjuster Phone");
        const adjusterEmail = getVal(row, "Adjuster Email");
        if (adjusterName) noteParts.push(`Adjuster: ${adjusterName}${adjusterPhone ? ` (${adjusterPhone})` : ""}${adjusterEmail ? ` - ${adjusterEmail}` : ""}`);
        const notes = noteParts.length > 0 ? noteParts.join("\n") : null;

        const stageRecord = stageMap.get(stageName);
        const assignedToId = findMemberByName(salesperson) || user.id;

        let quoteType: string | null = null;
        if (stageName === STAGE_NAMES.RETAIL_PROSPECT) {
          const tradeType = getVal(row, "Job Trade Type");
          if (tradeType) quoteType = tradeType;
        }

        // Pre-generate UUID so we can build task/note payloads now
        const contactId = randomUUID();

        contactPayloads.push({
          id: contactId,
          organizationId: orgId,
          createdById: user.id,
          assignedToId,
          firstName,
          lastName,
          email,
          phone,
          address,
          city,
          state,
          zipCode,
          carrier,
          claimNumber,
          dateOfLoss,
          source,
          notes,
          quoteType,
          stageId: stageRecord?.id ?? null,
          stageOrder: stageRecord?.order ?? 0,
        });

        // Task payload -- every contact gets a task to surface in the task page
        const taskDecision = determineTask(stageName, lastTouched, now);
        const contactName = `${firstName} ${lastName}`.trim();

        let taskDueDate: Date;
        if (taskDecision.kind === "seasonal") {
          taskDueDate = getSeasonalFollowUpDate(undefined, undefined, now);
        } else if (taskDecision.kind === "fixed") {
          taskDueDate = enforceOfficeDay(taskDecision.dueDate);
        } else {
          taskDueDate = taskDecision.dueDateOffset === 0
            ? enforceOfficeDay(now)
            : getNthOfficeDay(taskDecision.dueDateOffset, now);
        }

        taskPayloads.push({
          id: randomUUID(),
          contactId,
          userId: assignedToId,
          title: generateTaskTitle(contactName, taskDecision.taskType),
          dueDate: taskDueDate,
          status: "PENDING",
          taskType: taskDecision.taskType,
        });

        // Timeline note payload
        const timelineParts = [`Imported from AccuLynx (${milestone})`];
        if (leadDate) timelineParts.push(`Lead date: ${leadDate}`);
        if (lastTouched !== null) timelineParts.push(`Last touched: ${lastTouched} day${lastTouched !== 1 ? "s" : ""} ago`);

        notePayloads.push({
          id: randomUUID(),
          contactId,
          userId: user.id,
          content: timelineParts.join(" | "),
          noteType: "SYSTEM",
        });

        result.created++;

        switch (stageName) {
          case STAGE_NAMES.NEW_LEAD: result.newLead++; break;
          case STAGE_NAMES.CLAIM_PROSPECT: result.claimProspect++; break;
          case STAGE_NAMES.RETAIL_PROSPECT: result.retailProspect++; break;
          case STAGE_NAMES.SEASONAL: result.seasonal++; break;
          case STAGE_NAMES.NOT_INTERESTED: result.notInterested++; break;
        }
      } catch (rowError) {
        result.errors.push(`Row ${i + 2}: ${rowError instanceof Error ? rowError.message : "Unknown error"}`);
      }
    }

    // ── 4. Batch insert everything (3 queries total) ──────────────────────
    if (contactPayloads.length > 0) {
      await prisma.contact.createMany({ data: contactPayloads, skipDuplicates: true });
    }
    if (taskPayloads.length > 0) {
      await prisma.task.createMany({ data: taskPayloads, skipDuplicates: true });
    }
    if (notePayloads.length > 0) {
      await prisma.note.createMany({ data: notePayloads, skipDuplicates: true });
    }

    // Backfill tasks for any contacts in seasonal/not-interested stages that
    // were imported in a previous run (or moved manually) and are missing tasks.
    await checkContactsWithoutTasks(orgId);

    revalidatePath("/contacts");
    revalidatePath("/tasks");
    revalidatePath("/dashboard");

    return NextResponse.json({ success: true, ...result, errors: result.errors.slice(0, 20) });
  } catch (error) {
    console.error("AccuLynx import error:", error);
    return NextResponse.json({ error: "Failed to import contacts" }, { status: 500 });
  }
}
