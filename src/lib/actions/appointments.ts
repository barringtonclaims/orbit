"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { format } from "date-fns";
import { getNextMWFDate } from "@/lib/scheduling";

export async function scheduleAppointment(input: {
  contactId: string;
  appointmentDate: Date;
  appointmentTime?: string;
  notes?: string;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      include: { stage: true },
    });

    if (!contact) {
      return { error: "Contact not found" };
    }

    const contactName = `${contact.firstName} ${contact.lastName}`;
    
    // Parse the appointment time if provided
    let appointmentDateTime = new Date(input.appointmentDate);
    if (input.appointmentTime) {
      const [hours, minutes] = input.appointmentTime.split(":").map(Number);
      appointmentDateTime.setHours(hours, minutes, 0, 0);
    }

    const formattedDate = format(appointmentDateTime, "EEE, MMM d 'at' h:mm a");

    // Cancel any existing "Set Appointment" tasks for this contact
    await prisma.task.updateMany({
      where: {
        contactId: input.contactId,
        taskType: "SET_APPOINTMENT",
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: {
        status: "CANCELLED",
      },
    });

    // Create the appointment task
    const task = await prisma.task.create({
      data: {
        contactId: input.contactId,
        userId: user.id,
        title: `${contactName} - Inspection: ${formattedDate}`,
        description: input.notes,
        dueDate: appointmentDateTime,
        appointmentTime: appointmentDateTime,
        status: "PENDING",
        taskType: "APPOINTMENT",
      },
    });

    // Update contact stage to "Inspection Scheduled" if it exists
    const inspectionStage = await prisma.leadStage.findFirst({
      where: {
        organizationId: contact.organizationId,
        name: { contains: "Inspection", mode: "insensitive" },
      },
    });

    if (inspectionStage && contact.stageId !== inspectionStage.id) {
      await prisma.contact.update({
        where: { id: input.contactId },
        data: {
          stageId: inspectionStage.id,
          stageOrder: inspectionStage.order,
          updatedAt: new Date(),
        },
      });

      // Add stage change note
      await prisma.note.create({
        data: {
          contactId: input.contactId,
          userId: user.id,
          content: `Stage changed to "${inspectionStage.name}"`,
          noteType: "STAGE_CHANGE",
        },
      });
    }

    // Add timeline entry
    await prisma.note.create({
      data: {
        contactId: input.contactId,
        userId: user.id,
        content: `Inspection scheduled for ${formattedDate}${input.notes ? `\n\nNotes: ${input.notes}` : ""}`,
        noteType: "APPOINTMENT_SCHEDULED",
        metadata: {
          appointmentDate: appointmentDateTime.toISOString(),
        },
      },
    });

    revalidatePath(`/contacts/${input.contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/tasks");
    revalidatePath("/dashboard");

    return { data: task };
  } catch (error) {
    console.error("Error scheduling appointment:", error);
    return { error: "Failed to schedule appointment" };
  }
}

export async function completeAppointment(taskId: string, outcome: {
  nextAction: "WRITE_QUOTE" | "CLAIM_RECOMMENDATION" | "FOLLOW_UP" | "NOT_INTERESTED" | "NONE";
  notes?: string;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
      include: {
        contact: {
          include: { stage: true },
        },
      },
    });

    const contactName = `${task.contact.firstName} ${task.contact.lastName}`;

    // Add completion note
    if (outcome.notes) {
      await prisma.note.create({
        data: {
          contactId: task.contactId,
          userId: user.id,
          content: `Inspection completed.\n\nNotes: ${outcome.notes}`,
          noteType: "TASK_COMPLETED",
        },
      });
    }

    // Create next task based on outcome
    if (outcome.nextAction !== "NONE" && outcome.nextAction !== "NOT_INTERESTED") {
      const nextMWF = getNextMWFDate(new Date());
      
      const taskTitles: Record<string, string> = {
        WRITE_QUOTE: `${contactName} - Write Quote`,
        CLAIM_RECOMMENDATION: `${contactName} - Send Claim Recommendation`,
        FOLLOW_UP: `${contactName} - Follow Up`,
      };

      await prisma.task.create({
        data: {
          contactId: task.contactId,
          userId: user.id,
          title: taskTitles[outcome.nextAction],
          dueDate: nextMWF,
          status: "PENDING",
          taskType: outcome.nextAction,
        },
      });

      // Update stage to "Quote Sent" if writing quote
      if (outcome.nextAction === "WRITE_QUOTE" || outcome.nextAction === "CLAIM_RECOMMENDATION") {
        const quoteStage = await prisma.leadStage.findFirst({
          where: {
            organizationId: task.contact.organizationId,
            name: { contains: "Quote", mode: "insensitive" },
          },
        });

        if (quoteStage) {
          await prisma.contact.update({
            where: { id: task.contactId },
            data: {
              stageId: quoteStage.id,
              stageOrder: quoteStage.order,
            },
          });
        }
      }
    }

    // Handle "Not Interested" outcome
    if (outcome.nextAction === "NOT_INTERESTED") {
      const notInterestedStage = await prisma.leadStage.findFirst({
        where: {
          organizationId: task.contact.organizationId,
          stageType: "NOT_INTERESTED",
        },
      });

      if (notInterestedStage) {
        await prisma.contact.update({
          where: { id: task.contactId },
          data: {
            stageId: notInterestedStage.id,
            stageOrder: notInterestedStage.order,
          },
        });

        await prisma.note.create({
          data: {
            contactId: task.contactId,
            userId: user.id,
            content: `Marked as "Not Interested"`,
            noteType: "STAGE_CHANGE",
          },
        });
      }
    }

    revalidatePath(`/contacts/${task.contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/tasks");
    revalidatePath("/dashboard");

    return { data: task };
  } catch (error) {
    console.error("Error completing appointment:", error);
    return { error: "Failed to complete appointment" };
  }
}

export async function markAsApproved(contactId: string, notes?: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      return { error: "Contact not found" };
    }

    // Find the "Approved" stage
    const approvedStage = await prisma.leadStage.findFirst({
      where: {
        organizationId: contact.organizationId,
        stageType: "APPROVED",
      },
    });

    if (!approvedStage) {
      return { error: "Approved stage not found" };
    }

    // Update contact stage
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        stageId: approvedStage.id,
        stageOrder: approvedStage.order,
        updatedAt: new Date(),
      },
    });

    // Cancel all pending tasks
    await prisma.task.updateMany({
      where: {
        contactId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: {
        status: "CANCELLED",
      },
    });

    // Add note
    await prisma.note.create({
      data: {
        contactId,
        userId: user.id,
        content: `🎉 Lead approved!${notes ? `\n\nNotes: ${notes}` : ""}`,
        noteType: "STAGE_CHANGE",
      },
    });

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error marking as approved:", error);
    return { error: "Failed to mark as approved" };
  }
}

export async function markAsSeasonalFollowUp(contactId: string, followUpDate?: Date, notes?: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      return { error: "Contact not found" };
    }

    // Find the "Seasonal Follow-up" stage
    const seasonalStage = await prisma.leadStage.findFirst({
      where: {
        organizationId: contact.organizationId,
        stageType: "SEASONAL",
      },
    });

    if (!seasonalStage) {
      return { error: "Seasonal follow-up stage not found" };
    }

    // Update contact stage
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        stageId: seasonalStage.id,
        stageOrder: seasonalStage.order,
        updatedAt: new Date(),
      },
    });

    // Cancel current pending tasks
    await prisma.task.updateMany({
      where: {
        contactId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: {
        status: "CANCELLED",
      },
    });

    // Create a follow-up task for the specified date (or 3 months from now)
    const contactName = `${contact.firstName} ${contact.lastName}`;
    const futureDate = followUpDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

    await prisma.task.create({
      data: {
        contactId,
        userId: user.id,
        title: `${contactName} - Seasonal Follow Up`,
        dueDate: futureDate,
        status: "PENDING",
        taskType: "FOLLOW_UP",
      },
    });

    // Add note
    await prisma.note.create({
      data: {
        contactId,
        userId: user.id,
        content: `Moved to seasonal follow-up. Will follow up on ${format(futureDate, "MMM d, yyyy")}${notes ? `\n\nNotes: ${notes}` : ""}`,
        noteType: "STAGE_CHANGE",
      },
    });

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error marking as seasonal follow-up:", error);
    return { error: "Failed to mark as seasonal follow-up" };
  }
}

