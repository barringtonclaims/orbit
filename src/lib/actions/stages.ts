"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

export async function getLeadStages(organizationId?: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: [] };
  }

  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    const orgId = organizationId || membership?.organizationId || user.id;

    let stages = await prisma.leadStage.findMany({
      where: { organizationId: orgId },
      orderBy: { order: "asc" },
    });

    // Create default stages if none exist
    if (stages.length === 0) {
      stages = await createDefaultStages(orgId);
    }

    return { data: stages };
  } catch (error) {
    console.error("Error fetching lead stages:", error);
    return { error: "Failed to fetch lead stages", data: [] };
  }
}

export async function updateContactStage(contactId: string, stageId: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const stage = await prisma.leadStage.findUnique({
      where: { id: stageId },
    });

    if (!stage) {
      return { error: "Stage not found" };
    }

    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: {
        stageId,
        stageOrder: stage.order,
        updatedAt: new Date(),
      },
      include: {
        stage: true,
      },
    });

    // Add timeline entry for stage change
    await prisma.note.create({
      data: {
        contactId,
        userId: user.id,
        content: `Stage changed to "${stage.name}"`,
        noteType: "STAGE_CHANGE",
        metadata: {
          fromStageId: contact.stageId,
          toStageId: stageId,
          stageName: stage.name,
        },
      },
    });

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/dashboard");

    return { data: contact };
  } catch (error) {
    console.error("Error updating contact stage:", error);
    return { error: "Failed to update stage" };
  }
}

export async function createLeadStage(input: {
  name: string;
  color: string;
  description?: string;
  stageType: "ACTIVE" | "APPROVED" | "SEASONAL" | "NOT_INTERESTED";
  isTerminal?: boolean;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    const orgId = membership?.organizationId || user.id;

    // Get the highest order
    const lastStage = await prisma.leadStage.findFirst({
      where: { organizationId: orgId },
      orderBy: { order: "desc" },
    });

    const stage = await prisma.leadStage.create({
      data: {
        organizationId: orgId,
        name: input.name,
        color: input.color,
        description: input.description,
        stageType: input.stageType,
        isTerminal: input.isTerminal || input.stageType !== "ACTIVE",
        order: (lastStage?.order || 0) + 1,
      },
    });

    revalidatePath("/settings");

    return { data: stage };
  } catch (error) {
    console.error("Error creating lead stage:", error);
    return { error: "Failed to create stage" };
  }
}

// Helper function to create default lead stages
async function createDefaultStages(organizationId: string) {
  const defaultStages = [
    { name: "New Lead", color: "#6366f1", order: 0, stageType: "ACTIVE" as const, isTerminal: false },
    { name: "First Contact", color: "#8b5cf6", order: 1, stageType: "ACTIVE" as const, isTerminal: false },
    { name: "Inspection Scheduled", color: "#14b8a6", order: 2, stageType: "ACTIVE" as const, isTerminal: false },
    { name: "Quote Sent", color: "#f59e0b", order: 3, stageType: "ACTIVE" as const, isTerminal: false },
    { name: "Approved", color: "#22c55e", order: 4, stageType: "APPROVED" as const, isTerminal: true },
    { name: "Seasonal Follow-up", color: "#06b6d4", order: 5, stageType: "SEASONAL" as const, isTerminal: true },
    { name: "Not Interested", color: "#ef4444", order: 6, stageType: "NOT_INTERESTED" as const, isTerminal: true },
  ];

  const stages = [];
  for (const stageData of defaultStages) {
    const stage = await prisma.leadStage.create({
      data: {
        ...stageData,
        organizationId,
      },
    });
    stages.push(stage);
  }

  return stages;
}

