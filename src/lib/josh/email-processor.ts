/**
 * Josh Email Processor
 * 
 * Main email processing engine that:
 * 1. Fetches new emails from Gmail
 * 2. Classifies them using AI
 * 3. Takes appropriate action (create lead, link to contact, etc.)
 * 4. Logs activities for user notifications
 */

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { fetchMessages, parseGmailMessage, updateSyncState, getSyncState, ParsedEmail } from "@/lib/gmail";
import { isAccuLynxEmail, parseAccuLynxEmail, isNewLeadNotification } from "./acculynx-parser";
import { isCarrierEmail, isInternalEmail, findMatchingContacts, findContactsForCarrierEmail } from "./contact-matcher";
import type { EmailClassification, EmailProcessStatus } from "@prisma/client";

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = "grok-4-fast";

interface ProcessingResult {
  processed: number;
  created: number;
  linked: number;
  flagged: number;
  skipped: number;
  errors: number;
}

/**
 * Process all new emails for a user
 */
export async function processNewEmails(
  userId: string,
  organizationId: string
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    processed: 0,
    created: 0,
    linked: 0,
    flagged: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // Get sync state to know where to start
    const syncState = await getSyncState(organizationId);
    const afterDate = syncState?.lastSyncAt || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24 hours

    // Fetch new messages
    const messagesResult = await fetchMessages(organizationId, {
      maxResults: 50,
      after: afterDate,
    });

    if (!messagesResult || messagesResult.messages.length === 0) {
      await updateSyncState(organizationId);
      return result;
    }

    // Process each email
    for (const message of messagesResult.messages) {
      const parsed = parseGmailMessage(message);
      
      // Check if already processed
      const existing = await prisma.processedEmail.findUnique({
        where: { gmailMessageId: message.id },
      });

      if (existing) {
        result.skipped++;
        continue;
      }

      try {
        await processEmail(userId, organizationId, parsed, result);
        result.processed++;
      } catch (error) {
        console.error(`Error processing email ${message.id}:`, error);
        result.errors++;
        
        // Record the failed email
        await prisma.processedEmail.create({
          data: {
            organizationId,
            gmailMessageId: message.id,
            threadId: message.threadId,
            fromEmail: parsed.from.email,
            fromName: parsed.from.name,
            subject: parsed.subject,
            snippet: parsed.snippet,
            receivedAt: parsed.receivedAt,
            status: "FAILED",
          },
        });
      }
    }

    // Update sync state
    await updateSyncState(organizationId);

    // Log sync completion
    await createActivity(organizationId, userId, "SYNC_COMPLETED", 
      `Processed ${result.processed} emails`, 
      `Created: ${result.created}, Linked: ${result.linked}, Flagged: ${result.flagged}`
    );

    return result;
  } catch (error) {
    console.error("Error in processNewEmails:", error);
    await createActivity(organizationId, userId, "SYNC_ERROR", 
      "Email sync failed", 
      error instanceof Error ? error.message : "Unknown error"
    );
    throw error;
  }
}

/**
 * Process a single email
 */
async function processEmail(
  userId: string,
  organizationId: string,
  email: ParsedEmail,
  result: ProcessingResult
): Promise<void> {
  // 1. ALWAYS check for AccuLynx new lead emails FIRST
  // This handles both direct and forwarded AccuLynx emails
  // Important: Check this BEFORE internal email check, since forwarded AccuLynx
  // emails will appear to come from the user's own email address
  if (isAccuLynxEmail(email) && isNewLeadNotification(email)) {
    await handleAccuLynxLead(userId, organizationId, email, result);
    return;
  }

  // Skip internal/system emails (but only after checking for AccuLynx)
  if (isInternalEmail(email)) {
    await recordProcessedEmail(organizationId, email, "SKIPPED", "INTERNAL");
    result.skipped++;
    return;
  }

  // 2. Check for carrier emails
  if (isCarrierEmail(email)) {
    await handleCarrierEmail(userId, organizationId, email, result);
    return;
  }

  // 3. Try to match to existing contact
  const matches = await findMatchingContacts(organizationId, email);
  if (matches.length > 0 && matches[0].confidence >= 0.7) {
    await handleMatchedEmail(userId, organizationId, email, matches[0].contactId, result);
    return;
  }

  // 4. Use AI to classify unknown emails
  const classification = await classifyEmailWithAI(email);
  
  switch (classification) {
    case "NEW_CUSTOMER_EMAIL":
      await handleNewCustomerEmail(userId, organizationId, email, result);
      break;
    case "SPAM_MARKETING":
      await recordProcessedEmail(organizationId, email, "SKIPPED", "SPAM_MARKETING");
      result.skipped++;
      break;
    default:
      // Flag for manual review
      await recordProcessedEmail(organizationId, email, "COMPLETED", "UNKNOWN");
      await createActivity(organizationId, userId, "EMAIL_FLAGGED",
        `Email needs review: ${email.subject || "(no subject)"}`,
        `From: ${email.from.name || email.from.email}`,
        undefined,
        email.id
      );
      result.flagged++;
  }
}

/**
 * Handle AccuLynx new lead notification
 * 
 * This handles both direct AccuLynx emails and forwarded AccuLynx emails.
 * It extracts contact info from the EMAIL BODY (not the sender), then checks
 * for duplicates by email, phone, AND name before creating a new lead.
 */
async function handleAccuLynxLead(
  userId: string,
  organizationId: string,
  email: ParsedEmail,
  result: ProcessingResult
): Promise<void> {
  const leadData = parseAccuLynxEmail(email);
  
  if (!leadData) {
    // Failed to parse - flag for review
    await recordProcessedEmail(organizationId, email, "FAILED", "ACCULYNX_NEW_LEAD");
    await createActivity(
      organizationId,
      userId,
      "EMAIL_FLAGGED",
      `Could not parse AccuLynx email: ${email.subject || "(no subject)"}`,
      "Manual review required - could not extract lead information.",
      undefined,
      email.id
    );
    result.flagged++;
    return;
  }

  // === DUPLICATE CHECK: Email ===
  const existingByEmail = leadData.email
    ? await prisma.contact.findFirst({
        where: { organizationId, email: { equals: leadData.email, mode: "insensitive" } },
      })
    : null;

  if (existingByEmail) {
    // Already exists - link this email and add a note
    await handleExistingAccuLynxContact(userId, organizationId, email, existingByEmail.id, leadData, result);
    return;
  }

  // === DUPLICATE CHECK: Phone ===
  const existingByPhone = leadData.phone
    ? await prisma.contact.findFirst({
        where: { 
          organizationId, 
          phone: { contains: leadData.phone.replace(/\D/g, "").slice(-7) } // Match last 7 digits
        },
      })
    : null;

  if (existingByPhone) {
    await handleExistingAccuLynxContact(userId, organizationId, email, existingByPhone.id, leadData, result);
    return;
  }

  // === DUPLICATE CHECK: First + Last Name (fuzzy) ===
  // Only if we have a real name (not "Unknown")
  if (leadData.firstName && leadData.firstName !== "Unknown" && leadData.lastName) {
    const existingByName = await prisma.contact.findFirst({
      where: {
        organizationId,
        firstName: { equals: leadData.firstName, mode: "insensitive" },
        lastName: { equals: leadData.lastName, mode: "insensitive" },
      },
    });

    if (existingByName) {
      // Same name exists - update with new info and flag for review
      await handlePossibleDuplicateAccuLynx(userId, organizationId, email, existingByName.id, leadData, result);
      return;
    }
  }

  // Get the "New Lead" stage
  const newLeadStage = await prisma.leadStage.findFirst({
    where: {
      organizationId,
      name: { contains: "New", mode: "insensitive" },
    },
    orderBy: { order: "asc" },
  });

  // Create new contact (notes go in timeline, not contact.notes field)
  const contact = await prisma.contact.create({
    data: {
      organizationId,
      createdById: userId,
      firstName: leadData.firstName,
      lastName: leadData.lastName,
      email: leadData.email,
      phone: leadData.phone,
      address: leadData.address,
      city: leadData.city,
      state: leadData.state,
      zipCode: leadData.zipCode,
      source: leadData.source || "AccuLynx",
      // Don't put notes here - they go in timeline
      stageId: newLeadStage?.id,
    },
  });

  // Create initial timeline note WITH the AccuLynx notes
  const noteContent = leadData.notes
    ? `Lead created automatically by Josh from AccuLynx.\n\n**AccuLynx Notes:**\n${leadData.notes}\n\n---\nOriginal email subject: ${email.subject}`
    : `Lead created automatically by Josh from AccuLynx notification.\n\nOriginal email subject: ${email.subject}`;

  await prisma.note.create({
    data: {
      contactId: contact.id,
      userId,
      content: noteContent,
      noteType: "JOSH_CREATED",
      metadata: {
        source: "acculynx",
        emailId: email.id,
      },
    },
  });

  // Record processed email
  await recordProcessedEmail(organizationId, email, "COMPLETED", "ACCULYNX_NEW_LEAD", contact.id);

  // Create activity
  await createActivity(
    organizationId,
    userId,
    "LEAD_CREATED_ACCULYNX",
    `New lead created: ${leadData.firstName} ${leadData.lastName}`,
    `From AccuLynx notification. ${leadData.address ? `Address: ${leadData.address}` : ""}`,
    contact.id,
    email.id
  );

  result.created++;
  
  // Revalidate contacts pages to show the new lead immediately
  revalidatePath("/contacts");
  revalidatePath("/dashboard");
}

/**
 * Handle AccuLynx email for an existing contact (matched by email or phone)
 */
async function handleExistingAccuLynxContact(
  userId: string,
  organizationId: string,
  email: ParsedEmail,
  contactId: string,
  leadData: { firstName: string; lastName: string; notes?: string; source?: string },
  result: ProcessingResult
): Promise<void> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { firstName: true, lastName: true },
  });

  // Add note about the AccuLynx notification
  await prisma.note.create({
    data: {
      contactId,
      userId,
      content: `AccuLynx notification received - contact already exists.\n\nOriginal email subject: ${email.subject}${leadData.notes ? `\n\nAccuLynx Notes: ${leadData.notes}` : ""}`,
      noteType: "EMAIL_RECEIVED",
      metadata: {
        source: "acculynx",
        emailId: email.id,
        duplicateDetected: true,
      },
    },
  });

  await recordProcessedEmail(organizationId, email, "COMPLETED", "ACCULYNX_NEW_LEAD", contactId);

  await createActivity(
    organizationId,
    userId,
    "EMAIL_LINKED",
    `AccuLynx notification for existing contact: ${contact?.firstName} ${contact?.lastName}`,
    `Contact already in system - email linked to their profile.`,
    contactId,
    email.id
  );

  result.linked++;
}

/**
 * Handle possible duplicate when name matches existing contact
 * Updates the existing contact with any new info and flags for review
 */
async function handlePossibleDuplicateAccuLynx(
  userId: string,
  organizationId: string,
  email: ParsedEmail,
  existingContactId: string,
  leadData: { 
    firstName: string; 
    lastName: string; 
    email?: string; 
    phone?: string; 
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    notes?: string;
    source?: string 
  },
  result: ProcessingResult
): Promise<void> {
  const existingContact = await prisma.contact.findUnique({
    where: { id: existingContactId },
  });

  if (!existingContact) {
    result.errors++;
    return;
  }

  // Update contact with any new info they didn't have
  const updates: Record<string, string> = {};
  if (!existingContact.email && leadData.email) updates.email = leadData.email;
  if (!existingContact.phone && leadData.phone) updates.phone = leadData.phone;
  if (!existingContact.address && leadData.address) updates.address = leadData.address;
  if (!existingContact.city && leadData.city) updates.city = leadData.city;
  if (!existingContact.state && leadData.state) updates.state = leadData.state;
  if (!existingContact.zipCode && leadData.zipCode) updates.zipCode = leadData.zipCode;

  if (Object.keys(updates).length > 0) {
    await prisma.contact.update({
      where: { id: existingContactId },
      data: updates,
    });
  }

  // Add note about the AccuLynx notification
  await prisma.note.create({
    data: {
      contactId: existingContactId,
      userId,
      content: `AccuLynx notification received.\n\nNote: A contact with this name already existed. Updated with new info: ${Object.keys(updates).join(", ") || "none"}.\n\nOriginal email subject: ${email.subject}${leadData.notes ? `\n\nAccuLynx Notes: ${leadData.notes}` : ""}`,
      noteType: "EMAIL_RECEIVED",
      metadata: {
        source: "acculynx",
        emailId: email.id,
        nameMatchDuplicate: true,
        updatedFields: Object.keys(updates),
      },
    },
  });

  await recordProcessedEmail(organizationId, email, "COMPLETED", "ACCULYNX_NEW_LEAD", existingContactId);

  await createActivity(
    organizationId,
    userId,
    "EMAIL_LINKED",
    `AccuLynx: ${leadData.firstName} ${leadData.lastName} matched existing contact`,
    `Same name found in database. ${Object.keys(updates).length > 0 ? `Updated: ${Object.keys(updates).join(", ")}` : "No new info to add."}`,
    existingContactId,
    email.id
  );

  result.linked++;
}

/**
 * Handle email from insurance carrier
 */
async function handleCarrierEmail(
  userId: string,
  organizationId: string,
  email: ParsedEmail,
  result: ProcessingResult
): Promise<void> {
  // Try to match carrier email to existing contact
  const matches = await findContactsForCarrierEmail(organizationId, email);

  if (matches.length > 0 && matches[0].confidence >= 0.7) {
    const contactId = matches[0].contactId;
    
    // Link email and add note
    await prisma.note.create({
      data: {
        contactId,
        userId,
        content: `Email received from carrier:\n\nSubject: ${email.subject}\n\nSnippet: ${email.snippet}`,
        noteType: "EMAIL_RECEIVED",
        metadata: {
          emailId: email.id,
          from: email.from.email,
          carrierEmail: true,
        },
      },
    });

    await recordProcessedEmail(organizationId, email, "COMPLETED", "CARRIER_EMAIL", contactId);

    await createActivity(
      organizationId,
      userId,
      "CARRIER_EMAIL_RECEIVED",
      `Carrier email for ${(await prisma.contact.findUnique({ where: { id: contactId }, select: { firstName: true, lastName: true } }))?.firstName || "contact"}`,
      `Subject: ${email.subject}`,
      contactId,
      email.id
    );

    result.linked++;
  } else {
    // Flag for manual review
    await recordProcessedEmail(organizationId, email, "COMPLETED", "CARRIER_EMAIL");
    
    await createActivity(
      organizationId,
      userId,
      "EMAIL_FLAGGED",
      `Carrier email needs review: ${email.subject || "(no subject)"}`,
      `From: ${email.from.email}. Could not match to existing contact.`,
      undefined,
      email.id
    );

    result.flagged++;
  }
}

/**
 * Handle email matched to existing contact
 */
async function handleMatchedEmail(
  userId: string,
  organizationId: string,
  email: ParsedEmail,
  contactId: string,
  result: ProcessingResult
): Promise<void> {
  // Add note to contact timeline
  await prisma.note.create({
    data: {
      contactId,
      userId,
      content: `Email received:\n\nSubject: ${email.subject}\n\nSnippet: ${email.snippet}`,
      noteType: "EMAIL_RECEIVED",
      metadata: {
        emailId: email.id,
        from: email.from.email,
        fromName: email.from.name,
      },
    },
  });

  await recordProcessedEmail(organizationId, email, "COMPLETED", "CUSTOMER_EMAIL", contactId);

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { firstName: true, lastName: true },
  });

  await createActivity(
    organizationId,
    userId,
    "EMAIL_LINKED",
    `Email linked to ${contact?.firstName} ${contact?.lastName}`,
    `Subject: ${email.subject}`,
    contactId,
    email.id
  );

  result.linked++;
}

/**
 * Handle email from potential new customer
 */
async function handleNewCustomerEmail(
  userId: string,
  organizationId: string,
  email: ParsedEmail,
  result: ProcessingResult
): Promise<void> {
  // Extract name from email sender
  const senderName = email.from.name || email.from.email.split("@")[0];
  const nameParts = senderName.split(/\s+/);
  const firstName = nameParts[0] || "Unknown";
  const lastName = nameParts.slice(1).join(" ") || "";

  // Get the "New Lead" stage
  const newLeadStage = await prisma.leadStage.findFirst({
    where: {
      organizationId,
      name: { contains: "New", mode: "insensitive" },
    },
    orderBy: { order: "asc" },
  });

  // Create new contact (notes go in timeline, not contact.notes field)
  const contact = await prisma.contact.create({
    data: {
      organizationId,
      createdById: userId,
      firstName,
      lastName,
      email: email.from.email,
      source: "Email",
      stageId: newLeadStage?.id,
    },
  });

  // Add timeline note
  await prisma.note.create({
    data: {
      contactId: contact.id,
      userId,
      content: `Lead created automatically by Josh from incoming email.\n\nSubject: ${email.subject}\n\nSnippet: ${email.snippet}`,
      noteType: "JOSH_CREATED",
      metadata: {
        source: "email",
        emailId: email.id,
      },
    },
  });

  await recordProcessedEmail(organizationId, email, "COMPLETED", "NEW_CUSTOMER_EMAIL", contact.id);

  await createActivity(
    organizationId,
    userId,
    "LEAD_CREATED",
    `New lead created: ${firstName} ${lastName}`,
    `From incoming email: ${email.subject}`,
    contact.id,
    email.id
  );

  result.created++;
  
  // Revalidate contacts pages to show the new lead immediately
  revalidatePath("/contacts");
  revalidatePath("/dashboard");
}

/**
 * Use Grok AI to classify an email
 */
async function classifyEmailWithAI(email: ParsedEmail): Promise<EmailClassification> {
  if (!XAI_API_KEY) {
    return "UNKNOWN";
  }

  const prompt = `Classify this email into one of these categories:
- NEW_CUSTOMER_EMAIL: A potential new customer inquiring about roofing services
- SPAM_MARKETING: Marketing, promotional, or spam emails
- INTERNAL: Internal business communication
- UNKNOWN: Cannot determine, needs manual review

Email:
From: ${email.from.name || ""} <${email.from.email}>
Subject: ${email.subject}
Content: ${email.body.slice(0, 1000)}

Respond with ONLY the category name, nothing else.`;

  try {
    const response = await fetch(XAI_API_URL, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        messages: [
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 50,
      }),
    });

    if (!response.ok) {
      console.error("Grok API error:", await response.text());
      return "UNKNOWN";
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim().toUpperCase();

    // Validate the result
    const validCategories: EmailClassification[] = [
      "NEW_CUSTOMER_EMAIL",
      "SPAM_MARKETING",
      "INTERNAL",
      "UNKNOWN",
    ];

    if (validCategories.includes(result as EmailClassification)) {
      return result as EmailClassification;
    }

    return "UNKNOWN";
  } catch (error) {
    console.error("Error classifying email with AI:", error);
    return "UNKNOWN";
  }
}

/**
 * Record a processed email in the database
 */
async function recordProcessedEmail(
  organizationId: string,
  email: ParsedEmail,
  status: EmailProcessStatus,
  classification: EmailClassification,
  contactId?: string
): Promise<void> {
  await prisma.processedEmail.create({
    data: {
      organizationId,
      gmailMessageId: email.id,
      threadId: email.threadId,
      fromEmail: email.from.email,
      fromName: email.from.name,
      subject: email.subject,
      snippet: email.snippet,
      receivedAt: email.receivedAt,
      status,
      classification,
      contactId,
      processedAt: new Date(),
    },
  });
}

/**
 * Create a Josh activity record
 */
async function createActivity(
  organizationId: string,
  userId: string,
  activityType: "LEAD_CREATED" | "LEAD_CREATED_ACCULYNX" | "EMAIL_LINKED" | "EMAIL_FLAGGED" | "CARRIER_EMAIL_RECEIVED" | "SYNC_COMPLETED" | "SYNC_ERROR",
  title: string,
  description?: string,
  contactId?: string,
  emailId?: string
): Promise<void> {
  await prisma.joshActivity.create({
    data: {
      organizationId,
      userId,
      activityType,
      title,
      description,
      contactId,
      emailId,
    },
  });
}

/**
 * Get unread Josh activities for a user
 */
export async function getUnreadActivities(
  userId: string,
  organizationId: string
): Promise<{
  count: number;
  activities: Array<{
    id: string;
    activityType: string;
    title: string;
    description: string | null;
    contactId: string | null;
    createdAt: Date;
  }>;
}> {
  const activities = await prisma.joshActivity.findMany({
    where: {
      organizationId,
      OR: [
        { userId },
        { userId: null }, // Org-wide activities
      ],
      isRead: false,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return {
    count: activities.length,
    activities,
  };
}

/**
 * Mark activities as read
 */
export async function markActivitiesAsRead(
  activityIds: string[]
): Promise<void> {
  await prisma.joshActivity.updateMany({
    where: { id: { in: activityIds } },
    data: { isRead: true },
  });
}

