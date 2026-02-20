import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { parseGmailMessage, type ParsedEmail } from "@/lib/gmail";
import { isAccuLynxEmail, parseAccuLynxEmail, isNewLeadNotification } from "@/lib/josh/acculynx-parser";
import { getValidAccessToken } from "@/lib/google-oauth";
import { generateTaskTitle } from "@/lib/scheduling";
import { revalidatePath } from "next/cache";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

// Intake status stored in memory (in production, use Redis or DB)
const intakeProgress: Map<string, {
  status: "running" | "completed" | "error" | "cancelled";
  total: number;
  processed: number;
  leadsCreated: number;
  notesAdded: number;
  errors: string[];
  startedAt: Date;
  completedAt?: Date;
}> = new Map();

/**
 * GET - Check intake status
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const progress = intakeProgress.get(user.id);
  
  if (!progress) {
    return NextResponse.json({ 
      status: "idle",
      message: "No intake in progress" 
    });
  }

  return NextResponse.json(progress);
}

/**
 * POST - Start intake process
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { range } = body; // "3days", "1week", "1month", "6months", "1year", "2years"
    
    // Check if already running
    const existingProgress = intakeProgress.get(user.id);
    if (existingProgress?.status === "running") {
      return NextResponse.json({ 
        error: "Intake already in progress",
        progress: existingProgress 
      }, { status: 400 });
    }

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    
    switch (range) {
      case "3days":
        startDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        break;
      case "1week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "1month":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "6months":
        startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case "1year":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case "2years":
        startDate = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
        break;
      default:
        return NextResponse.json({ error: "Invalid range" }, { status: 400 });
    }

    // Get user's ACTIVE organization
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
        include: { organization: true },
      });
    }

    if (!membership) {
      membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id },
        include: { organization: true },
        orderBy: { joinedAt: "asc" },
      });
    }

    if (!membership) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }
    

    // Initialize progress
    intakeProgress.set(user.id, {
      status: "running",
      total: 0,
      processed: 0,
      leadsCreated: 0,
      notesAdded: 0,
      errors: [],
      startedAt: new Date(),
    });

    // Start the intake process in the background
    processIntake(user.id, membership.organizationId, startDate, now);

    return NextResponse.json({ 
      success: true,
      message: `Starting intake from ${startDate.toLocaleDateString()} to ${now.toLocaleDateString()}`,
      status: "running"
    });
  } catch (error) {
    console.error("Intake error:", error);
    return NextResponse.json({ error: "Failed to start intake" }, { status: 500 });
  }
}

/**
 * DELETE - Cancel intake process
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const progress = intakeProgress.get(user.id);
  if (progress?.status === "running") {
    progress.status = "cancelled";
    intakeProgress.set(user.id, progress);
  }

  return NextResponse.json({ success: true, message: "Intake cancelled" });
}

/**
 * Background intake processing
 */
async function processIntake(
  userId: string,
  organizationId: string,
  startDate: Date,
  endDate: Date
) {
  const progress = intakeProgress.get(userId)!;
  
  try {
    // Check if Google token exists for this organization
    const googleToken = await prisma.googleToken.findUnique({
      where: { organizationId },
      select: { hasGmailAccess: true },
    });
    
    if (!googleToken?.hasGmailAccess) {
      throw new Error("Gmail not connected for this organization");
    }
    
    // Get default stage for new leads
    const newLeadStage = await prisma.leadStage.findFirst({
      where: { organizationId, name: "New Lead" },
    });

    // Build Gmail query for AccuLynx emails
    const startEpoch = Math.floor(startDate.getTime() / 1000);
    const endEpoch = Math.floor(endDate.getTime() / 1000);
    const query = `from:acculynx after:${startEpoch} before:${endEpoch}`;
    
    
    // Fetch all matching emails (paginated)
    const allEmails: ParsedEmail[] = [];
    let pageToken: string | undefined;
    
    do {
      // Check if cancelled
      if (intakeProgress.get(userId)?.status === "cancelled") {
        return;
      }

      const accessToken = await getValidAccessToken(organizationId);
      if (!accessToken) {
        throw new Error("Failed to get access token");
      }

      const listParams = new URLSearchParams({
        maxResults: "100",
        q: query,
      });
      if (pageToken) {
        listParams.set("pageToken", pageToken);
      }

      const listResponse = await fetch(
        `${GMAIL_API}/users/me/messages?${listParams}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!listResponse.ok) {
        throw new Error(`Gmail API error: ${await listResponse.text()}`);
      }

      const listData = await listResponse.json();
      
      if (listData.messages?.length) {
        // Fetch full message details
        for (const msg of listData.messages) {
          const msgResponse = await fetch(
            `${GMAIL_API}/users/me/messages/${msg.id}?format=full`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          
          if (msgResponse.ok) {
            const fullMessage = await msgResponse.json();
            const parsed = parseGmailMessage(fullMessage);
            allEmails.push(parsed);
          }
        }
      }
      
      pageToken = listData.nextPageToken;
      progress.total = allEmails.length;
      intakeProgress.set(userId, progress);
      
    } while (pageToken);


    // Sort by date (oldest first)
    allEmails.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

    // Process each email
    for (const email of allEmails) {
      // Check if cancelled
      if (intakeProgress.get(userId)?.status === "cancelled") {
        return;
      }

      try {
        // Check if we've already processed this email
        const existingNote = await prisma.note.findFirst({
          where: {
            metadata: {
              path: ["emailId"],
              equals: email.id,
            },
          },
        });

        if (existingNote) {
          progress.processed++;
          intakeProgress.set(userId, progress);
          continue; // Skip already processed
        }

        // Process AccuLynx email
        if (isAccuLynxEmail(email)) {
          const leadData = parseAccuLynxEmail(email);
          
          if (leadData) {
            // Try to find existing contact by email, phone, or name
            let contact = await findExistingContact(organizationId, {
              name: `${leadData.firstName} ${leadData.lastName}`,
              email: leadData.email,
              phone: leadData.phone,
            });
            
            if (!contact) {
              // Create new contact with backdated timestamp
              const firstName = leadData.firstName || "Unknown";
              const lastName = leadData.lastName || "";
              
              contact = await prisma.contact.create({
                data: {
                  organizationId,
                  createdById: userId,
                  firstName,
                  lastName,
                  email: leadData.email || null,
                  phone: leadData.phone || null,
                  address: leadData.address || null,
                  city: leadData.city || null,
                  state: leadData.state || null,
                  zipCode: leadData.zipCode || null,
                  source: `AccuLynx (from ${email.receivedAt.toLocaleDateString()})`,
                  stageId: newLeadStage?.id,
                  // Note: createdAt will use current time, but we track original date in source
                },
              });

              // Create initial task
              const contactName = `${firstName} ${lastName}`.trim();
              
              await prisma.task.create({
                data: {
                  contactId: contact.id,
                  userId,
                  title: generateTaskTitle(contactName, "FIRST_MESSAGE"),
                  dueDate: new Date(), // Set to today so it's actionable
                  status: "PENDING",
                  taskType: "FIRST_MESSAGE",
                },
              });

              progress.leadsCreated++;
            }

            // Add note to timeline (regardless of new or existing contact)
            const noteContent = buildNoteContent(email, leadData);
            
            await prisma.note.create({
              data: {
                contactId: contact.id,
                userId,
                content: noteContent,
                noteType: isNewLeadNotification(email) ? "SYSTEM" : "EMAIL_RECEIVED",
                metadata: {
                  emailId: email.id,
                  source: "intake",
                  originalDate: email.receivedAt.toISOString(),
                },
                // Note: createdAt will use current time, but originalDate in metadata preserves the real date
              },
            });

            progress.notesAdded++;
          }
        }

        progress.processed++;
        intakeProgress.set(userId, progress);

      } catch (emailError) {
        console.error(`[Intake] Error processing email ${email.id}:`, emailError);
        progress.errors.push(`Error processing email: ${email.subject}`);
        progress.processed++;
        intakeProgress.set(userId, progress);
      }
    }

    // Complete
    progress.status = "completed";
    progress.completedAt = new Date();
    intakeProgress.set(userId, progress);
    

    // Revalidate pages
    revalidatePath("/contacts");
    revalidatePath("/dashboard");
    revalidatePath("/tasks");

  } catch (error) {
    console.error("[Intake] Fatal error:", error);
    progress.status = "error";
    progress.errors.push(error instanceof Error ? error.message : "Unknown error");
    intakeProgress.set(userId, progress);
  }
}

/**
 * Find existing contact by email, phone, or name
 */
async function findExistingContact(
  organizationId: string,
  leadData: { name: string; email?: string; phone?: string }
) {
  // Try email first
  if (leadData.email) {
    const byEmail = await prisma.contact.findFirst({
      where: { organizationId, email: leadData.email },
    });
    if (byEmail) return byEmail;
  }

  // Try phone
  if (leadData.phone) {
    const normalizedPhone = leadData.phone.replace(/\D/g, "");
    const byPhone = await prisma.contact.findFirst({
      where: {
        organizationId,
        phone: { contains: normalizedPhone.slice(-10) },
      },
    });
    if (byPhone) return byPhone;
  }

  // Try name (less reliable)
  const nameParts = leadData.name.split(" ");
  if (nameParts.length >= 2) {
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ");
    const byName = await prisma.contact.findFirst({
      where: {
        organizationId,
        firstName: { equals: firstName, mode: "insensitive" },
        lastName: { equals: lastName, mode: "insensitive" },
      },
    });
    if (byName) return byName;
  }

  return null;
}

/**
 * Build note content from email
 */
function buildNoteContent(email: ParsedEmail, leadData: ReturnType<typeof parseAccuLynxEmail>): string {
  const subject = email.subject;
  
  if (isNewLeadNotification(email)) {
    return `📥 **New Lead from AccuLynx**\n\n${leadData?.notes || email.snippet}`;
  }
  
  // Other AccuLynx notification types
  if (subject.includes("Appointment")) {
    return `📅 **AccuLynx Appointment Update**\n\n${email.snippet}`;
  }
  if (subject.includes("Estimate") || subject.includes("Quote")) {
    return `💰 **AccuLynx Estimate Update**\n\n${email.snippet}`;
  }
  if (subject.includes("Invoice")) {
    return `📄 **AccuLynx Invoice Update**\n\n${email.snippet}`;
  }
  if (subject.includes("Contract")) {
    return `📝 **AccuLynx Contract Update**\n\n${email.snippet}`;
  }
  if (subject.includes("Photo")) {
    return `📷 **AccuLynx Photo Added**\n\n${email.snippet}`;
  }
  if (subject.includes("Note")) {
    return `📝 **AccuLynx Note**\n\n${email.snippet}`;
  }
  
  return `📧 **AccuLynx Update**\n\nSubject: ${subject}\n\n${email.snippet}`;
}

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max for long intake

