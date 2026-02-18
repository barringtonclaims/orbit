"use server";

import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { startOfDay, endOfDay } from "date-fns";

export async function getDashboardStats() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: null };
  }

  try {
    // Get active organization
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

    if (!membership) {
      return { data: null };
    }

    const orgId = membership.organizationId;
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const [totalContacts, activeLeads, tasksDueToday, overdueTasks] = await Promise.all([
      prisma.contact.count({
        where: { organizationId: orgId },
      }),
      prisma.contact.count({
        where: {
          organizationId: orgId,
          stage: {
            isTerminal: false,
          },
        },
      }),
      prisma.task.count({
        where: {
          userId: user.id,
          contact: { organizationId: orgId },
          status: { in: ["PENDING", "IN_PROGRESS"] },
          dueDate: { gte: todayStart, lte: todayEnd },
        },
      }),
      prisma.task.count({
        where: {
          userId: user.id,
          contact: { organizationId: orgId },
          status: { in: ["PENDING", "IN_PROGRESS"] },
          dueDate: { lt: todayStart },
        },
      }),
    ]);

    return {
      data: {
        totalContacts,
        activeLeads,
        tasksDueToday,
        overdueTasks,
      },
    };
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    return { error: "Failed to fetch dashboard stats", data: null };
  }
}

export async function getRecentTasks() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: [] };
  }

  try {
    // Get active organization
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

    if (!membership) {
      return { data: [] };
    }

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const tasks = await prisma.task.findMany({
      where: {
        userId: user.id,
        contact: { organizationId: membership.organizationId },
        status: { in: ["PENDING", "IN_PROGRESS"] },
        dueDate: { gte: todayStart, lte: todayEnd },
      },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 5,
    });

    return { data: tasks };
  } catch (error) {
    console.error("Error fetching recent tasks:", error);
    return { error: "Failed to fetch recent tasks", data: [] };
  }
}


