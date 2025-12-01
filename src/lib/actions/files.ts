"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

export async function saveFileRecord(input: {
  contactId: string;
  fileName: string;
  fileUrl: string;
  fileType: "PHOTO" | "DOCUMENT";
  fileSize: number;
  mimeType: string;
}) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    const file = await prisma.contactFile.create({
      data: {
        contactId: input.contactId,
        fileName: input.fileName,
        fileUrl: input.fileUrl,
        fileType: input.fileType,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
      },
    });

    // Add timeline entry
    await prisma.note.create({
      data: {
        contactId: input.contactId,
        userId: user.id,
        content: `Uploaded ${input.fileName}`,
        noteType: "FILE_UPLOADED",
      },
    });

    revalidatePath(`/contacts/${input.contactId}`);

    return { data: file };
  } catch (error) {
    console.error("Error saving file record:", error);
    return { error: "Failed to save file record" };
  }
}

export async function deleteFile(id: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  try {
    // Get file info first to verify ownership/context if needed
    // For now, assume access if authenticated
    
    // Note: We don't delete from storage here as we'd need the path
    // Ideally we should store the storage path in the DB too
    
    await prisma.contactFile.delete({
      where: { id },
    });

    // We can't revalidate path easily as we don't have contactId
    // But usually this is called from the contact page
    revalidatePath("/contacts/[id]", "page");

    return { success: true };
  } catch (error) {
    console.error("Error deleting file:", error);
    return { error: "Failed to delete file" };
  }
}

