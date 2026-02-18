import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { STAGE_NAMES } from "@/types";

const CORRECT_STAGE_NAMES = new Set<string>(Object.values(STAGE_NAMES));

const OLD_TO_NEW: Record<string, string> = {
  "First Contact": STAGE_NAMES.NEW_LEAD,
  "Inspection Scheduled": STAGE_NAMES.SCHEDULED_INSPECTION,
  "Quote Sent": STAGE_NAMES.RETAIL_PROSPECT,
  "Approved": STAGE_NAMES.APPROVED,
  "Seasonal Follow-up": STAGE_NAMES.SEASONAL,
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized - visit this URL while logged into Orbit" }, { status: 401 });
  }

  try {
    // Get ALL organizations (not just this user's)
    const allOrgs = await prisma.organization.findMany({ select: { id: true, name: true } });
    const results: Array<{ org: string; migrated: number; deleted: string[]; nullsFixed: number; ensured: string[] }> = [];

    for (const org of allOrgs) {
      const orgId = org.id;
      let migrated = 0;
      const deleted: string[] = [];
      let nullsFixed = 0;
      const ensured: string[] = [];

      const allStages = await prisma.leadStage.findMany({ where: { organizationId: orgId } });

      // Build map of correct stages that exist
      const correctStages: Record<string, string> = {};
      for (const s of allStages) {
        if (CORRECT_STAGE_NAMES.has(s.name)) {
          correctStages[s.name] = s.id;
        }
      }

      // Migrate contacts from old stages to correct ones, then delete old stages
      for (const s of allStages) {
        if (CORRECT_STAGE_NAMES.has(s.name)) continue; // Skip correct stages

        const targetName = OLD_TO_NEW[s.name] || STAGE_NAMES.NEW_LEAD;
        const targetId = correctStages[targetName];

        if (targetId) {
          const updated = await prisma.contact.updateMany({
            where: { organizationId: orgId, stageId: s.id },
            data: { stageId: targetId },
          });
          migrated += updated.count;
        }

        // Delete the old stage
        await prisma.leadStage.delete({ where: { id: s.id } }).catch(() => {});
        deleted.push(s.name);
      }

      // Ensure all correct stages exist
      const { createDefaultStages } = await import("@/lib/actions/stages");
      const afterStages = await prisma.leadStage.findMany({ where: { organizationId: orgId } });
      const existingNames = new Set(afterStages.map((s) => s.name));

      for (const name of CORRECT_STAGE_NAMES) {
        if (!existingNames.has(name)) {
          // Need to create this stage - use createDefaultStages if none exist
          if (afterStages.length === 0) {
            await createDefaultStages(orgId);
            ensured.push("(all default stages created)");
            break;
          }
        }
      }

      // Fix null stageId contacts
      const newLeadId = correctStages[STAGE_NAMES.NEW_LEAD] || 
        (await prisma.leadStage.findFirst({ where: { organizationId: orgId, name: STAGE_NAMES.NEW_LEAD } }))?.id;

      if (newLeadId) {
        const fixed = await prisma.contact.updateMany({
          where: { organizationId: orgId, stageId: null },
          data: { stageId: newLeadId },
        });
        nullsFixed = fixed.count;
      }

      results.push({ org: org.name, migrated, deleted, nullsFixed, ensured });
    }

    return NextResponse.json({ success: true, organizations: allOrgs.length, results });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json({ error: "Migration failed", details: String(error) }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
