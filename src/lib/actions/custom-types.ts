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
    membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });
  }

  return membership?.organizationId ?? null;
}

// ──────────────────────────────────────
// Custom Task Types
// ──────────────────────────────────────

export async function getCustomTaskTypes() {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized", data: [] };

  const types = await prisma.customTaskType.findMany({
    where: { organizationId: orgId },
    include: { stage: { select: { id: true, name: true, color: true } } },
    orderBy: { order: "asc" },
  });

  return { data: types };
}

export async function createCustomTaskType(input: {
  name: string;
  description?: string;
  defaultDueDays?: number;
  stageId?: string | null;
}) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  try {
    const maxOrder = await prisma.customTaskType.aggregate({
      where: { organizationId: orgId },
      _max: { order: true },
    });

    const type = await prisma.customTaskType.create({
      data: {
        organizationId: orgId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        defaultDueDays: input.defaultDueDays ?? null,
        stageId: input.stageId || null,
        isSystem: false,
        order: (maxOrder._max.order ?? -1) + 1,
      },
      include: { stage: { select: { id: true, name: true, color: true } } },
    });

    revalidatePath("/settings");
    return { data: type };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { error: "A task type with that name already exists" };
    }
    console.error("Error creating custom task type:", error);
    return { error: "Failed to create task type" };
  }
}

export async function updateCustomTaskType(
  id: string,
  input: { name?: string; description?: string; defaultDueDays?: number | null; stageId?: string | null }
) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  try {
    const existing = await prisma.customTaskType.findUnique({ where: { id } });
    if (!existing || existing.organizationId !== orgId) {
      return { error: "Task type not found" };
    }

    const type = await prisma.customTaskType.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && { description: input.description?.trim() || null }),
        ...(input.defaultDueDays !== undefined && { defaultDueDays: input.defaultDueDays }),
        ...(input.stageId !== undefined && { stageId: input.stageId }),
      },
      include: { stage: { select: { id: true, name: true, color: true } } },
    });

    revalidatePath("/settings");
    return { data: type };
  } catch (error) {
    console.error("Error updating custom task type:", error);
    return { error: "Failed to update task type" };
  }
}

export async function deleteCustomTaskType(id: string) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const existing = await prisma.customTaskType.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== orgId) {
    return { error: "Task type not found" };
  }
  if (existing.isSystem) {
    return { error: "Cannot delete a system task type" };
  }

  await prisma.customTaskType.delete({ where: { id } });
  revalidatePath("/settings");
  return { success: true };
}

export async function reorderCustomTaskTypes(orderedIds: string[]) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.customTaskType.update({ where: { id }, data: { order: index } })
    )
  );

  revalidatePath("/settings");
  return { success: true };
}

// ──────────────────────────────────────
// Custom Appointment Types
// ──────────────────────────────────────

export async function getCustomAppointmentTypes() {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized", data: [] };

  const types = await prisma.customAppointmentType.findMany({
    where: { organizationId: orgId },
    orderBy: { order: "asc" },
  });

  return { data: types };
}

export async function createCustomAppointmentType(input: {
  name: string;
  includesLocation?: boolean;
}) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  try {
    const maxOrder = await prisma.customAppointmentType.aggregate({
      where: { organizationId: orgId },
      _max: { order: true },
    });

    const type = await prisma.customAppointmentType.create({
      data: {
        organizationId: orgId,
        name: input.name.trim(),
        includesLocation: input.includesLocation ?? true,
        isSystem: false,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    revalidatePath("/settings");
    return { data: type };
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return { error: "An appointment type with that name already exists" };
    }
    console.error("Error creating custom appointment type:", error);
    return { error: "Failed to create appointment type" };
  }
}

export async function updateCustomAppointmentType(
  id: string,
  input: { name?: string; includesLocation?: boolean }
) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const existing = await prisma.customAppointmentType.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== orgId) {
    return { error: "Appointment type not found" };
  }

  const type = await prisma.customAppointmentType.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.includesLocation !== undefined && { includesLocation: input.includesLocation }),
    },
  });

  revalidatePath("/settings");
  return { data: type };
}

export async function deleteCustomAppointmentType(id: string) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  const existing = await prisma.customAppointmentType.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== orgId) {
    return { error: "Appointment type not found" };
  }
  if (existing.isSystem) {
    return { error: "Cannot delete a system appointment type" };
  }

  await prisma.customAppointmentType.delete({ where: { id } });
  revalidatePath("/settings");
  return { success: true };
}

export async function reorderCustomAppointmentTypes(orderedIds: string[]) {
  const orgId = await getOrgId();
  if (!orgId) return { error: "Unauthorized" };

  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.customAppointmentType.update({ where: { id }, data: { order: index } })
    )
  );

  revalidatePath("/settings");
  return { success: true };
}
