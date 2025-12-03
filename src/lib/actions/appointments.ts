"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { format } from "date-fns";
import { getNextOfficeDay, generateTaskTitle, getActionButtonForTaskType, getSpringReminderDate } from "@/lib/scheduling";
import { autoSyncAppointmentToCalendar } from "@/lib/actions/calendar";
import { STAGE_NAMES } from "@/types";

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

    // Cancel any existing pending tasks for this contact
    await prisma.task.updateMany({
      where: {
        contactId: input.contactId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      data: {
        status: "CANCELLED",
      },
    });

    // Get action button
    const actionButton = getActionButtonForTaskType("APPOINTMENT");

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
        actionButton: actionButton as "SEND_FIRST_MESSAGE" | "SCHEDULE_INSPECTION" | "ASSIGN_STATUS" | "SEND_QUOTE" | "SEND_QUOTE_FOLLOW_UP" | "SEND_CLAIM_REC" | "SEND_CLAIM_FOLLOW_UP" | "SEND_PA_AGREEMENT" | "SEND_PA_FOLLOW_UP" | "UPLOAD_PA" | "MARK_RESPONDED" | "MARK_JOB_SCHEDULED" | "MARK_JOB_IN_PROGRESS" | "MARK_JOB_COMPLETE" | null,
      },
    });

    // Update contact stage to "Scheduled Inspection"
    const inspectionStage = await prisma.leadStage.findFirst({
      where: {
        organizationId: contact.organizationId,
        name: STAGE_NAMES.SCHEDULED_INSPECTION,
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
          content: `Stage changed to "${STAGE_NAMES.SCHEDULED_INSPECTION}"`,
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

    // Sync to Google Calendar if connected
    await autoSyncAppointmentToCalendar(user.id, task.id);

    revalidatePath(`/contacts/${input.contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath("/calendar");

    return { data: task };
  } catch (error) {
    console.error("Error scheduling appointment:", error);
    return { error: "Failed to schedule appointment" };
  }
}

export async function completeAppointment(taskId: string, outcome: {
  nextAction: "SEND_QUOTE" | "CLAIM_RECOMMENDATION" | "FOLLOW_UP" | "NOT_INTERESTED" | "NONE";
  notes?: string;
  quoteType?: string;
  carrier?: string;
  dateOfLoss?: Date;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    // Get org settings for office days
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: true },
    });
    const officeDays = membership?.organization.officeDays || [1, 3, 5];

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
          noteType: "APPOINTMENT_COMPLETED",
        },
      });
    }

    // Create next task based on outcome
    if (outcome.nextAction !== "NONE" && outcome.nextAction !== "NOT_INTERESTED") {
      const nextMWF = getNextOfficeDay(new Date(), officeDays);
      
      let newStageName: string | null = null;
      let taskTitle = "";
      let taskType = outcome.nextAction;
      const actionButton = getActionButtonForTaskType(outcome.nextAction);

      // Determine stage and task based on action
      switch (outcome.nextAction) {
        case "SEND_QUOTE":
          newStageName = STAGE_NAMES.RETAIL_PROSPECT;
          taskTitle = generateTaskTitle(contactName, "SEND_QUOTE", { quoteType: outcome.quoteType });
          // Update contact with quote type
          if (outcome.quoteType) {
            await prisma.contact.update({
              where: { id: task.contactId },
              data: { quoteType: outcome.quoteType },
            });
          }
          break;
        case "CLAIM_RECOMMENDATION":
          newStageName = STAGE_NAMES.CLAIM_PROSPECT;
          taskTitle = generateTaskTitle(contactName, "CLAIM_RECOMMENDATION");
          // Update contact with claim info
          if (outcome.carrier || outcome.dateOfLoss) {
            await prisma.contact.update({
              where: { id: task.contactId },
              data: { 
                carrier: outcome.carrier,
                dateOfLoss: outcome.dateOfLoss,
              },
            });
          }
          break;
        case "FOLLOW_UP":
          taskTitle = generateTaskTitle(contactName, "FOLLOW_UP");
          break;
      }

      await prisma.task.create({
        data: {
          contactId: task.contactId,
          userId: user.id,
          title: taskTitle,
          dueDate: nextMWF,
          status: "PENDING",
          taskType: taskType,
          actionButton: actionButton as "SEND_FIRST_MESSAGE" | "SCHEDULE_INSPECTION" | "ASSIGN_STATUS" | "SEND_QUOTE" | "SEND_QUOTE_FOLLOW_UP" | "SEND_CLAIM_REC" | "SEND_CLAIM_FOLLOW_UP" | "SEND_PA_AGREEMENT" | "SEND_PA_FOLLOW_UP" | "UPLOAD_PA" | "MARK_RESPONDED" | "MARK_JOB_SCHEDULED" | "MARK_JOB_IN_PROGRESS" | "MARK_JOB_COMPLETE" | null,
        },
      });

      // Update stage if needed
      if (newStageName) {
        const newStage = await prisma.leadStage.findFirst({
          where: {
            organizationId: task.contact.organizationId,
            name: newStageName,
          },
        });

        if (newStage) {
          await prisma.contact.update({
            where: { id: task.contactId },
            data: {
              stageId: newStage.id,
              stageOrder: newStage.order,
            },
          });

          await prisma.note.create({
            data: {
              contactId: task.contactId,
              userId: user.id,
              content: `Stage changed to "${newStageName}"`,
              noteType: "STAGE_CHANGE",
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
            content: `Marked as "Not Interested"${outcome.notes ? `. Notes: ${outcome.notes}` : ""}`,
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

    // Update contact stage and initialize job status
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        stageId: approvedStage.id,
        stageOrder: approvedStage.order,
        jobStatus: "SCHEDULED",
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
        content: `🎉 Job approved!${notes ? `\n\nNotes: ${notes}` : ""}`,
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

    // Calculate follow-up date
    const futureDate = followUpDate || getSpringReminderDate();

    // Update contact stage
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        stageId: seasonalStage.id,
        stageOrder: seasonalStage.order,
        seasonalReminderDate: futureDate,
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

export async function markAsNotInterested(contactId: string, notes?: string) {
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

    // Find the "Not Interested" stage
    const notInterestedStage = await prisma.leadStage.findFirst({
      where: {
        organizationId: contact.organizationId,
        stageType: "NOT_INTERESTED",
      },
    });

    if (!notInterestedStage) {
      return { error: "Not Interested stage not found" };
    }

    // Update contact stage
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        stageId: notInterestedStage.id,
        stageOrder: notInterestedStage.order,
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
        content: `Marked as "Not Interested"${notes ? `\n\nNotes: ${notes}` : ""}`,
        noteType: "STAGE_CHANGE",
      },
    });

    revalidatePath(`/contacts/${contactId}`);
    revalidatePath("/contacts");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (error) {
    console.error("Error marking as not interested:", error);
    return { error: "Failed to mark as not interested" };
  }
}
