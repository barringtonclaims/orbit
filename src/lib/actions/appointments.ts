"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { startOfMonth, endOfMonth } from "date-fns";

export interface CreateAppointmentInput {
  contactId: string;
  type: string;
  startTime: Date;
  endTime?: Date;
  location?: string;
  description?: string;
}

export async function createAppointment(input: CreateAppointmentInput) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { error: "Unauthorized" };

  try {
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        address: true,
        city: true,
        state: true,
      },
    });

    if (!contact) return { error: "Contact not found" };

    const contactName = `${contact.firstName} ${contact.lastName}`;
    const title = `${contactName} - ${input.type}`;

    let location = input.location ?? null;
    if (!location && input.type !== "Phone Call Only") {
      const parts = [contact.address, contact.city, contact.state].filter(Boolean);
      if (parts.length > 0) location = parts.join(", ");
    }

    const appointment = await prisma.appointment.create({
      data: {
        contactId: input.contactId,
        userId: user.id,
        title,
        type: input.type,
        startTime: input.startTime,
        endTime: input.endTime ?? null,
        location,
        description: input.description ?? null,
      },
    });

    await prisma.note.create({
      data: {
        contactId: input.contactId,
        userId: user.id,
        content: `Scheduled ${input.type}: ${input.startTime.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}${input.description ? ` — ${input.description}` : ""}`,
        noteType: "APPOINTMENT_SCHEDULED",
      },
    });

    revalidatePath("/calendar");
    revalidatePath(`/contacts/${input.contactId}`);
    revalidatePath("/tasks");

    return { data: appointment };
  } catch (error) {
    console.error("Error creating appointment:", error);
    return { error: "Failed to create appointment" };
  }
}

export async function updateAppointment(
  id: string,
  input: Partial<Omit<CreateAppointmentInput, "contactId">>
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { error: "Unauthorized" };

  try {
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return { error: "Appointment not found" };
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        ...(input.type !== undefined && { type: input.type }),
        ...(input.startTime !== undefined && { startTime: input.startTime }),
        ...(input.endTime !== undefined && { endTime: input.endTime }),
        ...(input.location !== undefined && { location: input.location }),
        ...(input.description !== undefined && { description: input.description }),
      },
    });

    await prisma.note.create({
      data: {
        contactId: existing.contactId,
        userId: user.id,
        content: `Updated appointment: ${appointment.type} on ${appointment.startTime.toLocaleDateString()}`,
        noteType: "SYSTEM",
      },
    });

    revalidatePath("/calendar");
    revalidatePath(`/contacts/${existing.contactId}`);

    return { data: appointment };
  } catch (error) {
    console.error("Error updating appointment:", error);
    return { error: "Failed to update appointment" };
  }
}

export async function deleteAppointment(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { error: "Unauthorized" };

  try {
    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return { error: "Appointment not found" };
    }

    await prisma.appointment.delete({ where: { id } });

    await prisma.note.create({
      data: {
        contactId: existing.contactId,
        userId: user.id,
        content: `Cancelled ${existing.type} appointment on ${existing.startTime.toLocaleDateString()}`,
        noteType: "SYSTEM",
      },
    });

    revalidatePath("/calendar");
    revalidatePath(`/contacts/${existing.contactId}`);

    return { success: true };
  } catch (error) {
    console.error("Error deleting appointment:", error);
    return { error: "Failed to delete appointment" };
  }
}

export async function getAppointments(month?: Date) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) return { error: "Unauthorized", data: [] };

  try {
    const currentMonth = month || new Date();
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    const appointments = await prisma.appointment.findMany({
      where: {
        userId: user.id,
        startTime: { gte: start, lte: end },
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
      orderBy: { startTime: "asc" },
    });

    return { data: appointments };
  } catch (error) {
    console.error("Error fetching appointments:", error);
    return { error: "Failed to fetch appointments", data: [] };
  }
}
