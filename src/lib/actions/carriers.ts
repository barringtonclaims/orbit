"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function getCarriers() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { data: [], error: "Unauthorized" };

  const orgId = await getActiveOrgId(user.id);
  if (!orgId) return { data: [] };

  const carriers = await prisma.carrier.findMany({
    where: { organizationId: orgId },
    orderBy: { name: "asc" },
  });
  return { data: carriers };
}

export async function createCarrier(input: {
  name: string;
  emailType: "UNIFIED" | "PER_ADJUSTER";
  unifiedEmail?: string;
  requiresClaimInSubject?: boolean;
  subjectFormat?: string;
  notes?: string;
}) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized" };

  const orgId = await getActiveOrgId(user.id);
  if (!orgId) return { error: "No organization" };

  try {
    const carrier = await prisma.carrier.create({
      data: {
        organizationId: orgId,
        name: input.name,
        emailType: input.emailType,
        unifiedEmail: input.unifiedEmail || null,
        requiresClaimInSubject: input.requiresClaimInSubject ?? true,
        subjectFormat: input.subjectFormat || null,
        notes: input.notes || null,
      },
    });
    revalidatePath("/settings");
    return { data: carrier };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create carrier";
    if (msg.includes("Unique constraint")) {
      return { error: "A carrier with that name already exists" };
    }
    return { error: msg };
  }
}

export async function updateCarrier(
  carrierId: string,
  input: {
    name?: string;
    emailType?: "UNIFIED" | "PER_ADJUSTER";
    unifiedEmail?: string | null;
    requiresClaimInSubject?: boolean;
    subjectFormat?: string | null;
    notes?: string | null;
  }
) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized" };

  try {
    const carrier = await prisma.carrier.update({
      where: { id: carrierId },
      data: input,
    });
    revalidatePath("/settings");
    return { data: carrier };
  } catch {
    return { error: "Failed to update carrier" };
  }
}

export async function deleteCarrier(carrierId: string) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized" };

  try {
    await prisma.carrier.delete({ where: { id: carrierId } });
    revalidatePath("/settings");
    return { success: true };
  } catch {
    return { error: "Failed to delete carrier" };
  }
}

const DEFAULT_CARRIERS = [
  { name: "State Farm", emailType: "UNIFIED" as const, unifiedEmail: "statefarmfireclaims@statefarm.com", requiresClaimInSubject: true, subjectFormat: "Claim #{{claimNumber}} - {{customerName}}" },
  { name: "Allstate", emailType: "UNIFIED" as const, unifiedEmail: "claims@claims.allstate.com", requiresClaimInSubject: true, subjectFormat: "Claim #{{claimNumber}} - {{customerName}}" },
  { name: "USAA", emailType: "PER_ADJUSTER" as const, requiresClaimInSubject: true },
  { name: "Travelers", emailType: "PER_ADJUSTER" as const, requiresClaimInSubject: true },
  { name: "Farmers", emailType: "PER_ADJUSTER" as const, requiresClaimInSubject: true },
  { name: "Nationwide", emailType: "PER_ADJUSTER" as const, requiresClaimInSubject: true },
  { name: "Liberty Mutual", emailType: "PER_ADJUSTER" as const, requiresClaimInSubject: true },
  { name: "Progressive", emailType: "PER_ADJUSTER" as const, requiresClaimInSubject: true },
  { name: "Erie Insurance", emailType: "PER_ADJUSTER" as const, requiresClaimInSubject: true },
  { name: "American Family", emailType: "PER_ADJUSTER" as const, requiresClaimInSubject: true },
  { name: "Encompass", emailType: "PER_ADJUSTER" as const, requiresClaimInSubject: true },
];

export async function seedDefaultCarriers(organizationId: string) {
  const existing = await prisma.carrier.count({ where: { organizationId } });
  if (existing > 0) return;

  for (const c of DEFAULT_CARRIERS) {
    await prisma.carrier.create({
      data: {
        organizationId,
        name: c.name,
        emailType: c.emailType,
        unifiedEmail: c.unifiedEmail || null,
        requiresClaimInSubject: c.requiresClaimInSubject,
        subjectFormat: c.subjectFormat || null,
      },
    }).catch(() => {});
  }
}
