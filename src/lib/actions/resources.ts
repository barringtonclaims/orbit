"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

async function getOrgId() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { activeOrganizationId: true },
  });
  let membership;
  if (dbUser?.activeOrganizationId) {
    membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id, organizationId: dbUser.activeOrganizationId },
    });
  }
  if (!membership) {
    membership = await prisma.organizationMember.findFirst({ where: { userId: user.id } });
  }
  return membership?.organizationId ?? null;
}

// ──────────────────────────────────────
// Resource Companies
// ──────────────────────────────────────

export async function getResourceCompanies() {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized", data: [] };

  const companies = await prisma.resourceCompany.findMany({
    where: { organizationId: orgId },
    include: { contacts: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });

  return { data: companies };
}

export async function createResourceCompany(input: {
  name: string;
  type: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  try {
    const company = await prisma.resourceCompany.create({
      data: {
        organizationId: orgId,
        name: input.name.trim(),
        type: input.type,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });
    revalidatePath("/settings");
    return { data: company };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { error: "A company with that name already exists" };
    }
    console.error("Error creating resource company:", error);
    return { error: "Failed to create company" };
  }
}

export async function updateResourceCompany(
  id: string,
  input: { name?: string; type?: string; phone?: string; email?: string; address?: string; notes?: string }
) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const existing = await prisma.resourceCompany.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== orgId) return { error: "Company not found" };

  const company = await prisma.resourceCompany.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.phone !== undefined && { phone: input.phone?.trim() || null }),
      ...(input.email !== undefined && { email: input.email?.trim() || null }),
      ...(input.address !== undefined && { address: input.address?.trim() || null }),
      ...(input.notes !== undefined && { notes: input.notes?.trim() || null }),
    },
  });

  revalidatePath("/settings");
  return { data: company };
}

export async function deleteResourceCompany(id: string) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const existing = await prisma.resourceCompany.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== orgId) return { error: "Company not found" };

  await prisma.resourceCompany.delete({ where: { id } });
  revalidatePath("/settings");
  return { success: true };
}

// ──────────────────────────────────────
// Resource Contacts (people within companies)
// ──────────────────────────────────────

export async function createResourceContact(input: {
  companyId: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  notes?: string;
}) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const company = await prisma.resourceCompany.findUnique({ where: { id: input.companyId } });
  if (!company || company.organizationId !== orgId) return { error: "Company not found" };

  try {
    const contact = await prisma.resourceContact.create({
      data: {
        companyId: input.companyId,
        name: input.name.trim(),
        role: input.role?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        notes: input.notes?.trim() || null,
      },
    });
    revalidatePath("/settings");
    return { data: contact };
  } catch (error) {
    console.error("Error creating resource contact:", error);
    return { error: "Failed to create contact" };
  }
}

export async function updateResourceContact(
  id: string,
  input: { name?: string; role?: string; phone?: string; email?: string; notes?: string }
) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const existing = await prisma.resourceContact.findUnique({
    where: { id },
    include: { company: { select: { organizationId: true } } },
  });
  if (!existing || existing.company.organizationId !== orgId) return { error: "Contact not found" };

  const contact = await prisma.resourceContact.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.role !== undefined && { role: input.role?.trim() || null }),
      ...(input.phone !== undefined && { phone: input.phone?.trim() || null }),
      ...(input.email !== undefined && { email: input.email?.trim() || null }),
      ...(input.notes !== undefined && { notes: input.notes?.trim() || null }),
    },
  });

  revalidatePath("/settings");
  return { data: contact };
}

export async function deleteResourceContact(id: string) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const existing = await prisma.resourceContact.findUnique({
    where: { id },
    include: { company: { select: { organizationId: true } } },
  });
  if (!existing || existing.company.organizationId !== orgId) return { error: "Contact not found" };

  await prisma.resourceContact.delete({ where: { id } });
  revalidatePath("/settings");
  return { success: true };
}
