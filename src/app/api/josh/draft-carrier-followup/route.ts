import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = "grok-4-fast";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { contactId, customContext } = await request.json();
    if (!contactId) return NextResponse.json({ error: "Contact ID required" }, { status: 400 });

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        carrierRef: true,
        stage: true,
        timeline: { orderBy: { createdAt: "desc" }, take: 15 },
        files: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

    const carrier = contact.carrierRef;
    const carrierName = carrier?.name || contact.carrier || "Unknown Carrier";

    // Determine the "to" email based on carrier type
    let toEmail: string | null = null;
    let needsAdjusterEmail = false;

    if (carrier) {
      if (carrier.emailType === "UNIFIED" && carrier.unifiedEmail) {
        toEmail = carrier.unifiedEmail;
      } else {
        // PER_ADJUSTER - use saved adjuster email or flag that we need it
        toEmail = contact.adjusterEmail || null;
        needsAdjusterEmail = !toEmail;
      }
    }

    // Build subject line
    let subject = "";
    if (carrier?.requiresClaimInSubject && carrier.subjectFormat) {
      subject = carrier.subjectFormat
        .replace("{{claimNumber}}", contact.claimNumber || "N/A")
        .replace("{{customerName}}", `${contact.firstName} ${contact.lastName}`)
        .replace("{{policyNumber}}", contact.policyNumber || "N/A");
    } else if (contact.claimNumber) {
      subject = `Claim #${contact.claimNumber} - ${contact.firstName} ${contact.lastName}`;
    } else {
      subject = `Claim Follow-Up - ${contact.firstName} ${contact.lastName}`;
    }

    // Build context for AI
    const contextParts: string[] = [
      `Customer: ${contact.firstName} ${contact.lastName}`,
      `Insurance Carrier: ${carrierName}`,
    ];
    if (contact.claimNumber) contextParts.push(`Claim Number: ${contact.claimNumber}`);
    if (contact.policyNumber) contextParts.push(`Policy Number: ${contact.policyNumber}`);
    if (contact.dateOfLoss) contextParts.push(`Date of Loss: ${new Date(contact.dateOfLoss).toLocaleDateString()}`);
    if (contact.address) contextParts.push(`Property Address: ${contact.address}${contact.city ? `, ${contact.city}` : ""}${contact.state ? `, ${contact.state}` : ""} ${contact.zipCode || ""}`);

    if (contact.files.length > 0) {
      contextParts.push("\nDocuments on File:");
      contact.files.forEach(f => {
        contextParts.push(`- ${f.fileName} (${f.fileType}, uploaded ${new Date(f.createdAt).toLocaleDateString()})`);
      });
    }

    if (contact.timeline.length > 0) {
      contextParts.push("\nRecent Activity History:");
      contact.timeline.slice(0, 10).forEach(entry => {
        const date = new Date(entry.createdAt).toLocaleDateString();
        contextParts.push(`- ${date}: ${entry.content.substring(0, 150)}`);
      });
    }

    // Generate the draft
    const draftBody = await generateCarrierFollowUp(
      contextParts.join("\n"),
      carrierName,
      customContext
    );

    return NextResponse.json({
      message: draftBody,
      subject,
      toEmail,
      needsAdjusterEmail,
      carrier: carrier ? {
        id: carrier.id,
        name: carrier.name,
        emailType: carrier.emailType,
      } : null,
      contact: {
        id: contact.id,
        name: `${contact.firstName} ${contact.lastName}`,
        claimNumber: contact.claimNumber,
        adjusterEmail: contact.adjusterEmail,
      },
    });
  } catch (error) {
    console.error("Error generating carrier follow-up:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function generateCarrierFollowUp(
  contactContext: string,
  carrierName: string,
  customContext?: string
): Promise<string> {
  if (!XAI_API_KEY) return "Unable to generate message - AI not configured.";

  const systemPrompt = `You are a professional roofing contractor writing a follow-up email to an insurance carrier claims department. 

Guidelines:
- Be professional, concise, and factual
- Reference specific claim numbers, policy numbers, and dates
- Mention any documents that have been submitted
- Ask for a specific action or status update
- Use formal business email tone
- Do NOT include a greeting/salutation or closing signature - those are added separately
- Keep it to 2-3 paragraphs maximum`;

  const userPrompt = `Draft a follow-up email to ${carrierName} for the following claim:

${contactContext}
${customContext ? `\nAdditional context: ${customContext}` : ""}

Generate the email body only (no subject line, no greeting, no signature).`;

  try {
    const response = await fetch(XAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 800,
      }),
    });

    if (!response.ok) return "Unable to generate message at this time.";
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || "Unable to generate message.";
  } catch {
    return "Unable to generate message due to an error.";
  }
}
