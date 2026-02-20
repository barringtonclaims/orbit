/**
 * Authentication and Organization helpers
 * 
 * These functions provide consistent access to the current user and organization
 * across all server actions.
 */

import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
}

export interface CurrentOrganization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

/**
 * Get the active organization ID for a given user.
 * Useful in API routes where the userId is already known from Supabase auth.
 */
export async function getActiveOrgId(userId: string): Promise<string | null> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeOrganizationId: true },
  });
  if (dbUser?.activeOrganizationId) {
    const m = await prisma.organizationMember.findFirst({
      where: { userId, organizationId: dbUser.activeOrganizationId },
    });
    if (m) return m.organizationId;
  }
  const m = await prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
  });
  return m?.organizationId ?? null;
}

/**
 * Get the currently authenticated user
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return null;
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, fullName: true },
  });

  return dbUser;
}

/**
 * Get the current user's active organization
 * Respects the user's activeOrganizationId preference
 */
export async function getCurrentOrganization(): Promise<CurrentOrganization | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return null;
  }

  // Get user's active organization preference
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { activeOrganizationId: true },
  });

  // If user has an active org set, try to get that one
  let membership;
  if (dbUser?.activeOrganizationId) {
    membership = await prisma.organizationMember.findFirst({
      where: { 
        userId: user.id,
        organizationId: dbUser.activeOrganizationId,
      },
      include: {
        organization: true,
      },
    });
  }

  // Fall back to first organization if active one not found
  if (!membership) {
    membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: {
        organization: true,
      },
      orderBy: { joinedAt: "asc" },
    });
  }

  if (!membership) {
    return null;
  }

  return {
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    role: membership.role,
  };
}

/**
 * Get both user and organization in one call (more efficient)
 */
export async function getCurrentUserAndOrg(): Promise<{
  user: CurrentUser | null;
  organization: CurrentOrganization | null;
}> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return { user: null, organization: null };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, fullName: true, activeOrganizationId: true },
  });

  if (!dbUser) {
    return { user: null, organization: null };
  }

  // Get membership for active org
  let membership;
  if (dbUser.activeOrganizationId) {
    membership = await prisma.organizationMember.findFirst({
      where: { 
        userId: user.id,
        organizationId: dbUser.activeOrganizationId,
      },
      include: {
        organization: true,
      },
    });
  }

  // Fall back to first organization
  if (!membership) {
    membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: {
        organization: true,
      },
      orderBy: { joinedAt: "asc" },
    });
  }

  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.fullName,
    },
    organization: membership ? {
      id: membership.organization.id,
      name: membership.organization.name,
      slug: membership.organization.slug,
      role: membership.role,
    } : null,
  };
}

