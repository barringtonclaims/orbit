import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/auth";
import prisma from "@/lib/prisma";
import * as XLSX from "xlsx";
import { generateTaskTitle } from "@/lib/scheduling";
import { revalidatePath } from "next/cache";

/**
 * POST /api/contacts/import - Import contacts from CSV/Excel
 * Expects multipart form data with a "file" field and a "mapping" JSON field
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const orgId = await getActiveOrgId(user.id);
    if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const mappingStr = formData.get("mapping") as string;

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    if (!mappingStr) return NextResponse.json({ error: "No column mapping provided" }, { status: 400 });

    const mapping: Record<string, string> = JSON.parse(mappingStr);

    // Parse the file
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    // Get default stage
    const defaultStage = await prisma.leadStage.findFirst({
      where: { organizationId: orgId, order: 0 },
    });

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const getValue = (field: string) => {
          const col = mapping[field];
          if (!col) return null;
          const val = row[col]?.toString().trim();
          return val || null;
        };

        const firstName = getValue("firstName");
        const lastName = getValue("lastName");

        if (!firstName && !lastName) {
          skipped++;
          continue;
        }

        const email = getValue("email");
        const phone = getValue("phone");

        // Duplicate check
        if (email) {
          const existing = await prisma.contact.findFirst({
            where: { organizationId: orgId, email: { equals: email, mode: "insensitive" } },
          });
          if (existing) { skipped++; continue; }
        }
        if (phone) {
          const digits = phone.replace(/\D/g, "");
          if (digits.length >= 7) {
            const existing = await prisma.contact.findFirst({
              where: { organizationId: orgId, phone: { contains: digits.slice(-7) } },
            });
            if (existing) { skipped++; continue; }
          }
        }

        const contact = await prisma.contact.create({
          data: {
            organizationId: orgId,
            createdById: user.id,
            assignedToId: user.id,
            firstName: firstName || "Unknown",
            lastName: lastName || "",
            email,
            phone,
            address: getValue("address"),
            city: getValue("city"),
            state: getValue("state"),
            zipCode: getValue("zipCode"),
            carrier: getValue("carrier"),
            source: getValue("source") || "Import",
            notes: getValue("notes"),
            stageId: defaultStage?.id,
          },
        });

        // Create first message task
        const contactName = `${contact.firstName} ${contact.lastName}`.trim();
        await prisma.task.create({
          data: {
            contactId: contact.id,
            userId: user.id,
            title: generateTaskTitle(contactName, "FIRST_MESSAGE"),
            dueDate: new Date(),
            status: "PENDING",
            taskType: "FIRST_MESSAGE",
          },
        });

        // Timeline entry
        await prisma.note.create({
          data: {
            contactId: contact.id,
            userId: user.id,
            content: "Contact imported from file",
            noteType: "SYSTEM",
          },
        });

        created++;
      } catch (rowError) {
        errors.push(`Row ${i + 2}: ${rowError instanceof Error ? rowError.message : "Unknown error"}`);
      }
    }

    revalidatePath("/contacts");
    revalidatePath("/tasks");
    revalidatePath("/dashboard");

    return NextResponse.json({
      success: true,
      created,
      skipped,
      total: rows.length,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Failed to import contacts" }, { status: 500 });
  }
}

/**
 * PUT /api/contacts/import - Parse file headers for column mapping preview
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    if (rows.length === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const headers = Object.keys(rows[0]);
    const preview = rows.slice(0, 3);

    // Auto-suggest mappings based on header names
    const suggestions: Record<string, string> = {};
    const fieldPatterns: Record<string, RegExp> = {
      firstName: /first.*name|fname|first/i,
      lastName: /last.*name|lname|last|surname/i,
      email: /email|e-mail/i,
      phone: /phone|tel|mobile|cell/i,
      address: /address|street/i,
      city: /city|town/i,
      state: /state|province/i,
      zipCode: /zip|postal|zip.*code/i,
      carrier: /carrier|insurance|insurer/i,
      source: /source|lead.*source|referral/i,
      notes: /note|notes|comment/i,
    };

    for (const header of headers) {
      for (const [field, pattern] of Object.entries(fieldPatterns)) {
        if (pattern.test(header) && !suggestions[field]) {
          suggestions[field] = header;
        }
      }
    }

    return NextResponse.json({
      headers,
      preview,
      totalRows: rows.length,
      suggestions,
    });
  } catch (error) {
    console.error("Parse error:", error);
    return NextResponse.json({ error: "Failed to parse file" }, { status: 500 });
  }
}
