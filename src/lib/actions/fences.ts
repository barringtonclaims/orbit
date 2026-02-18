"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, polygon } from "@turf/helpers";

export interface FenceData {
  id: string;
  name: string;
  description: string | null;
  coordinates: number[][];
  color: string;
  createdAt: Date;
}

export interface FenceContactResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  latitude: number | null;
  longitude: number | null;
  stage: {
    id: string;
    name: string;
    color: string;
    stageType: string;
    workflowType: string;
  } | null;
  assignedTo: {
    id: string;
    fullName: string;
  } | null;
  jobStatus: string | null;
}

async function getOrgMembership() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { activeOrganizationId: true },
  });

  let membership;
  if (dbUser?.activeOrganizationId) {
    membership = await prisma.organizationMember.findFirst({
      where: {
        userId: user.id,
        organizationId: dbUser.activeOrganizationId,
      },
    });
  }
  if (!membership) {
    membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      orderBy: { joinedAt: "asc" },
    });
  }

  return membership
    ? { ...membership, userId: user.id }
    : null;
}

export async function getFences(): Promise<{
  data: FenceData[];
  error?: string;
}> {
  const ctx = await getOrgMembership();
  if (!ctx) return { data: [], error: "Unauthorized" };

  try {
    const fences = await prisma.fence.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
    });

    return {
      data: fences.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        coordinates: f.coordinates as number[][],
        color: f.color,
        createdAt: f.createdAt,
      })),
    };
  } catch (e) {
    console.error("Error fetching fences:", e);
    return { data: [], error: "Failed to fetch fences" };
  }
}

export async function createFence(input: {
  name: string;
  description?: string;
  coordinates: number[][];
  color?: string;
}): Promise<{ data?: FenceData; error?: string }> {
  const ctx = await getOrgMembership();
  if (!ctx) return { error: "Unauthorized" };

  try {
    const fence = await prisma.fence.create({
      data: {
        name: input.name,
        description: input.description || null,
        coordinates: input.coordinates,
        color: input.color || "#3b82f6",
        organizationId: ctx.organizationId,
        createdById: ctx.userId,
      },
    });

    revalidatePath("/fence");
    return {
      data: {
        id: fence.id,
        name: fence.name,
        description: fence.description,
        coordinates: fence.coordinates as number[][],
        color: fence.color,
        createdAt: fence.createdAt,
      },
    };
  } catch (e) {
    console.error("Error creating fence:", e);
    return { error: "Failed to create fence" };
  }
}

export async function updateFence(
  id: string,
  input: {
    name?: string;
    description?: string;
    coordinates?: number[][];
    color?: string;
  }
): Promise<{ data?: FenceData; error?: string }> {
  const ctx = await getOrgMembership();
  if (!ctx) return { error: "Unauthorized" };

  try {
    const fence = await prisma.fence.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.coordinates !== undefined && {
          coordinates: input.coordinates,
        }),
        ...(input.color !== undefined && { color: input.color }),
      },
    });

    revalidatePath("/fence");
    return {
      data: {
        id: fence.id,
        name: fence.name,
        description: fence.description,
        coordinates: fence.coordinates as number[][],
        color: fence.color,
        createdAt: fence.createdAt,
      },
    };
  } catch (e) {
    console.error("Error updating fence:", e);
    return { error: "Failed to update fence" };
  }
}

export async function deleteFence(
  id: string
): Promise<{ success?: boolean; error?: string }> {
  const ctx = await getOrgMembership();
  if (!ctx) return { error: "Unauthorized" };

  try {
    await prisma.fence.delete({ where: { id } });
    revalidatePath("/fence");
    return { success: true };
  } catch (e) {
    console.error("Error deleting fence:", e);
    return { error: "Failed to delete fence" };
  }
}

export async function getContactsInFence(
  coordinates: number[][],
  filters?: {
    stageIds?: string[];
    stageType?: string;
    jobStatus?: string;
    assignedToId?: string;
  }
): Promise<{ data: FenceContactResult[]; error?: string }> {
  const ctx = await getOrgMembership();
  if (!ctx) return { data: [], error: "Unauthorized" };

  try {
    const where: Record<string, unknown> = {
      organizationId: ctx.organizationId,
      latitude: { not: null },
      longitude: { not: null },
    };

    if (ctx.role === "MEMBER") {
      where.assignedToId = ctx.userId;
    } else if (filters?.assignedToId) {
      where.assignedToId = filters.assignedToId;
    }

    if (filters?.stageIds && filters.stageIds.length > 0) {
      where.stageId = { in: filters.stageIds };
    }

    if (filters?.stageType) {
      where.stage = { stageType: filters.stageType };
    }

    if (filters?.jobStatus) {
      where.jobStatus = filters.jobStatus;
    }

    const contacts = await prisma.contact.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        latitude: true,
        longitude: true,
        jobStatus: true,
        stage: {
          select: {
            id: true,
            name: true,
            color: true,
            stageType: true,
            workflowType: true,
          },
        },
        assignedTo: {
          select: { id: true, fullName: true },
        },
      },
    });

    // Close the polygon ring for Turf (first point must equal last point)
    const ring = [...coordinates];
    if (
      ring.length > 0 &&
      (ring[0][0] !== ring[ring.length - 1][0] ||
        ring[0][1] !== ring[ring.length - 1][1])
    ) {
      ring.push(ring[0]);
    }

    const poly = polygon([ring]);

    const matched = contacts.filter((c) => {
      if (c.latitude == null || c.longitude == null) return false;
      const pt = point([c.longitude, c.latitude]);
      return booleanPointInPolygon(pt, poly);
    });

    return { data: matched };
  } catch (e) {
    console.error("Error querying contacts in fence:", e);
    return { data: [], error: "Failed to query contacts in fence" };
  }
}

export async function getGeocodedContacts(): Promise<{
  data: {
    id: string;
    firstName: string;
    lastName: string;
    latitude: number;
    longitude: number;
    stage: { name: string; color: string } | null;
  }[];
  error?: string;
}> {
  const ctx = await getOrgMembership();
  if (!ctx) return { data: [], error: "Unauthorized" };

  try {
    const contacts = await prisma.contact.findMany({
      where: {
        organizationId: ctx.organizationId,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        latitude: true,
        longitude: true,
        stage: { select: { name: true, color: true } },
      },
    });

    return {
      data: contacts.map((c) => ({
        ...c,
        latitude: c.latitude!,
        longitude: c.longitude!,
      })),
    };
  } catch (e) {
    console.error("Error fetching geocoded contacts:", e);
    return { data: [], error: "Failed to fetch contacts" };
  }
}

export async function getTeamMembers(): Promise<{
  data: { id: string; fullName: string }[];
  error?: string;
}> {
  const ctx = await getOrgMembership();
  if (!ctx) return { data: [], error: "Unauthorized" };

  try {
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: ctx.organizationId },
      include: { user: { select: { id: true, fullName: true } } },
    });

    return { data: members.map((m) => m.user) };
  } catch (e) {
    console.error("Error fetching team members:", e);
    return { data: [], error: "Failed to fetch team" };
  }
}
