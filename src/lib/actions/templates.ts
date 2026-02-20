"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { DEFAULT_TEMPLATES } from "@/lib/templates";

export interface CreateTemplateInput {
  name: string;
  subject?: string;
  body: string;
  templateType: "SMS" | "EMAIL";
  category: string;
  taskTypeName?: string | null;
  stageName?: string | null;
  isDefault?: boolean;
}

export async function getTemplates(options?: {
  category?: string;
  templateType?: "SMS" | "EMAIL";
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: [] };
  }

  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    if (!membership) {
      return { data: [] };
    }

    const where: Record<string, unknown> = {
      organizationId: membership.organizationId,
    };

    if (options?.category) {
      where.category = options.category;
    }

    if (options?.templateType) {
      where.templateType = options.templateType;
    }

    const templates = await prisma.messageTemplate.findMany({
      where,
      orderBy: [
        { isDefault: "desc" },
        { category: "asc" },
        { name: "asc" },
      ],
    });

    return { data: templates };
  } catch (error) {
    console.error("Error fetching templates:", error);
    return { error: "Failed to fetch templates", data: [] };
  }
}

export async function getTemplate(id: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const template = await prisma.messageTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return { error: "Template not found" };
    }

    return { data: template };
  } catch (error) {
    console.error("Error fetching template:", error);
    return { error: "Failed to fetch template" };
  }
}

export async function createTemplate(input: CreateTemplateInput) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    if (!membership) {
      return { error: "No organization found" };
    }

    // If setting as default, unset other defaults in same category/type
    if (input.isDefault) {
      await prisma.messageTemplate.updateMany({
        where: {
          organizationId: membership.organizationId,
          category: input.category,
          templateType: input.templateType,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const template = await prisma.messageTemplate.create({
      data: {
        organizationId: membership.organizationId,
        name: input.name,
        subject: input.subject,
        body: input.body,
        templateType: input.templateType,
        category: input.category,
        taskTypeName: input.taskTypeName ?? null,
        stageName: input.stageName ?? null,
        isDefault: input.isDefault || false,
      },
    });

    revalidatePath("/settings");

    return { data: template };
  } catch (error) {
    console.error("Error creating template:", error);
    return { error: "Failed to create template" };
  }
}

export async function updateTemplate(id: string, input: Partial<CreateTemplateInput>) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const existing = await prisma.messageTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return { error: "Template not found" };
    }

    // If setting as default, unset other defaults
    if (input.isDefault) {
      await prisma.messageTemplate.updateMany({
        where: {
          organizationId: existing.organizationId,
          category: input.category || existing.category,
          templateType: input.templateType || existing.templateType,
          isDefault: true,
          NOT: { id },
        },
        data: { isDefault: false },
      });
    }

    const template = await prisma.messageTemplate.update({
      where: { id },
      data: {
        name: input.name,
        subject: input.subject,
        body: input.body,
        templateType: input.templateType,
        category: input.category,
        taskTypeName: input.taskTypeName,
        stageName: input.stageName,
        isDefault: input.isDefault,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/settings");

    return { data: template };
  } catch (error) {
    console.error("Error updating template:", error);
    return { error: "Failed to update template" };
  }
}

export async function deleteTemplate(id: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    await prisma.messageTemplate.delete({
      where: { id },
    });

    revalidatePath("/settings");

    return { success: true };
  } catch (error) {
    console.error("Error deleting template:", error);
    return { error: "Failed to delete template" };
  }
}

// Initialize default templates for an organization
export async function initializeDefaultTemplates(organizationId: string) {
  const existingTemplates = await prisma.messageTemplate.findFirst({
    where: { organizationId },
  });

  // Only create defaults if none exist
  if (existingTemplates) {
    return { success: true, message: "Templates already exist" };
  }

  const templatesToCreate: Array<{
    name: string;
    subject?: string;
    body: string;
    templateType: "SMS" | "EMAIL";
    category: string;
    isDefault: boolean;
  }> = [];

  for (const [category, templates] of Object.entries(DEFAULT_TEMPLATES)) {
    if (templates.sms) {
      templatesToCreate.push({
        name: `Default ${category.replace(/_/g, ' ').toLowerCase()} SMS`,
        body: templates.sms,
        templateType: "SMS",
        category,
        isDefault: true,
      });
    }
    
    if (templates.email) {
      const emailTemplate = templates.email as { subject: string; body: string };
      templatesToCreate.push({
        name: `Default ${category.replace(/_/g, ' ').toLowerCase()} email`,
        subject: emailTemplate.subject,
        body: emailTemplate.body,
        templateType: "EMAIL",
        category,
        isDefault: true,
      });
    }
  }

  // Bulk create templates
  await prisma.messageTemplate.createMany({
    data: templatesToCreate.map(t => ({
      ...t,
      organizationId,
    })),
  });

  return { success: true, created: templatesToCreate.length };
}

/**
 * Seed default templates for all workflow categories
 * This creates default templates for any categories that don't have templates yet
 */
export async function seedWorkflowTemplates() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    if (!membership) {
      return { error: "No organization found" };
    }

    const organizationId = membership.organizationId;

    // Get existing templates and their categories
    const existingTemplates = await prisma.messageTemplate.findMany({
      where: { organizationId },
      select: { category: true, templateType: true },
    });

    const existingCategories = new Set(
      existingTemplates.map(t => `${t.category}_${t.templateType}`)
    );

    const templatesToCreate: Array<{
      name: string;
      subject?: string;
      body: string;
      templateType: "SMS" | "EMAIL";
      category: string;
      isDefault: boolean;
      organizationId: string;
    }> = [];

    for (const [category, templates] of Object.entries(DEFAULT_TEMPLATES)) {
      if (templates.sms && !existingCategories.has(`${category}_SMS`)) {
        templatesToCreate.push({
          name: `${category.replace(/_/g, ' ')} - Default SMS`,
          body: templates.sms,
          templateType: "SMS",
          category,
          isDefault: true,
          organizationId,
        });
      }
      
      if (templates.email && !existingCategories.has(`${category}_EMAIL`)) {
        const emailTemplate = templates.email as { subject: string; body: string };
        templatesToCreate.push({
          name: `${category.replace(/_/g, ' ')} - Default Email`,
          subject: emailTemplate.subject,
          body: emailTemplate.body,
          templateType: "EMAIL",
          category,
          isDefault: true,
          organizationId,
        });
      }
    }

    if (templatesToCreate.length === 0) {
      return { success: true, created: 0, message: "All categories already have templates" };
    }

    // Bulk create templates
    await prisma.messageTemplate.createMany({
      data: templatesToCreate,
    });

    revalidatePath("/settings");

    return { success: true, created: templatesToCreate.length };
  } catch (error) {
    console.error("Error seeding workflow templates:", error);
    return { error: "Failed to seed templates" };
  }
}

// Get the default template for a category and type
export async function getDefaultTemplate(
  category: string,
  templateType: "SMS" | "EMAIL"
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: null };
  }

  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    if (!membership) {
      return { data: null };
    }

    let template = await prisma.messageTemplate.findFirst({
      where: {
        organizationId: membership.organizationId,
        category,
        templateType,
        isDefault: true,
      },
    });

    if (!template) {
      template = await prisma.messageTemplate.findFirst({
        where: {
          organizationId: membership.organizationId,
          category,
          templateType,
        },
        orderBy: { createdAt: "asc" },
      });
    }

    return { data: template };
  } catch (error) {
    console.error("Error fetching default template:", error);
    return { error: "Failed to fetch template", data: null };
  }
}
