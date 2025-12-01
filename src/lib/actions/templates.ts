"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

export async function getTemplates(type?: "SMS" | "EMAIL") {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized", data: [] };
  }

  try {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
    });

    const orgId = membership?.organizationId || user.id;

    let templates = await prisma.messageTemplate.findMany({
      where: {
        organizationId: orgId,
        ...(type && { templateType: type }),
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    // Create default templates if none exist
    if (templates.length === 0) {
      templates = await createDefaultTemplates(orgId);
      if (type) {
        templates = templates.filter(t => t.templateType === type);
      }
    }

    return { data: templates };
  } catch (error) {
    console.error("Error fetching templates:", error);
    return { error: "Failed to fetch templates", data: [] };
  }
}

export async function createTemplate(input: {
  name: string;
  body: string;
  templateType: "SMS" | "EMAIL";
  category?: string;
  isDefault?: boolean;
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

    // If setting as default, unset other defaults of same type
    if (input.isDefault) {
      await prisma.messageTemplate.updateMany({
        where: {
          organizationId: orgId,
          templateType: input.templateType,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const template = await prisma.messageTemplate.create({
      data: {
        organizationId: orgId,
        name: input.name,
        body: input.body,
        templateType: input.templateType,
        category: input.category,
        isDefault: input.isDefault || false,
      },
    });

    revalidatePath("/templates");

    return { data: template };
  } catch (error) {
    console.error("Error creating template:", error);
    return { error: "Failed to create template" };
  }
}

export async function updateTemplate(
  id: string,
  input: {
    name?: string;
    body?: string;
    category?: string;
    isDefault?: boolean;
  }
) {
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

    // If setting as default, unset other defaults of same type
    if (input.isDefault) {
      await prisma.messageTemplate.updateMany({
        where: {
          organizationId: template.organizationId,
          templateType: template.templateType,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.messageTemplate.update({
      where: { id },
      data: {
        ...input,
        updatedAt: new Date(),
      },
    });

    revalidatePath("/templates");

    return { data: updated };
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

    revalidatePath("/templates");

    return { success: true };
  } catch (error) {
    console.error("Error deleting template:", error);
    return { error: "Failed to delete template" };
  }
}

// Helper to create default templates
async function createDefaultTemplates(organizationId: string) {
  const defaults = [
    {
      name: "First Contact",
      body: "Hey {customer_name}, this is {user_name} with {company_name} following up about your roof. I'll be in the area on {date} and wanted to know if I could stop by to do my inspection. What time works best for you?",
      templateType: "SMS" as const,
      category: "First Contact",
      isDefault: true,
    },
    {
      name: "Follow Up - No Response",
      body: "Hi {customer_name}, just wanted to check in and see if you had any questions about setting up an inspection. Let me know if you'd like to schedule a time!",
      templateType: "SMS" as const,
      category: "Follow Up",
      isDefault: false,
    },
    {
      name: "Quote Follow Up",
      body: "Hey {customer_name}, wanted to follow up on the quote I sent over. Do you have any questions? I'm happy to go over everything with you.",
      templateType: "SMS" as const,
      category: "Quote",
      isDefault: false,
    },
    {
      name: "Appointment Reminder",
      body: "Hi {customer_name}, just a reminder about our appointment tomorrow at {time}. See you then!",
      templateType: "SMS" as const,
      category: "Appointment",
      isDefault: false,
    },
    {
      name: "Quote Email",
      body: "Dear {customer_name},\n\nThank you for the opportunity to provide a quote for your roofing project.\n\nPlease find the attached quote for the work we discussed. If you have any questions or would like to proceed, please don't hesitate to reach out.\n\nBest regards,\n{user_name}\n{company_name}",
      templateType: "EMAIL" as const,
      category: "Quote",
      isDefault: true,
    },
  ];

  const templates = [];
  for (const templateData of defaults) {
    const template = await prisma.messageTemplate.create({
      data: {
        ...templateData,
        organizationId,
      },
    });
    templates.push(template);
  }

  return templates;
}


