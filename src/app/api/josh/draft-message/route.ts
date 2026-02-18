import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganization } from "@/lib/actions/organizations";
import prisma from "@/lib/prisma";

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = "grok-4-fast";

// Message type determines the template/context for AI generation
type MessageType = 
  | "first_message" 
  | "first_message_follow_up"
  | "appointment_reminder"
  | "quote_follow_up"
  | "claim_rec_follow_up"
  | "pa_follow_up"
  | "claim_follow_up"
  | "seasonal_follow_up"
  | "general_follow_up";

interface DraftMessageRequest {
  contactId: string;
  messageType: MessageType;
  customContext?: string; // Additional context from user
}

const MESSAGE_TYPE_PROMPTS: Record<MessageType, string> = {
  first_message: `Generate a friendly first contact SMS message for a new roofing lead.
The message should:
- Introduce yourself/company briefly
- Reference how they found you (if known)
- Ask about their roofing needs/concerns
- Be warm and professional but not too formal
- Be short enough for SMS (under 160 characters if possible, max 320)
- Do NOT include any greeting like "Hi [Name]" - the CRM will add that automatically`,

  first_message_follow_up: `Generate a friendly follow-up SMS for a lead who hasn't responded to our first message.
The message should:
- Be polite and not pushy
- Remind them of our previous outreach
- Offer help with any roofing questions
- Include a soft call to action
- Be SMS-length (under 160 characters if possible, max 320)
- Do NOT include any greeting - the CRM adds that automatically`,

  appointment_reminder: `Generate a friendly appointment reminder SMS.
The message should:
- Confirm the scheduled appointment date/time
- Remind them what to expect during the inspection
- Provide any necessary preparation tips
- Include your contact info for questions
- Be SMS-length (under 320 characters)
- Do NOT include any greeting - the CRM adds that automatically`,

  quote_follow_up: `Generate a professional follow-up email for a sent quote.
The message should:
- Reference the quote that was sent
- Highlight key benefits or value
- Ask if they have any questions
- Include a soft call to action to schedule a call
- Be brief but thorough (2-3 paragraphs)`,

  claim_rec_follow_up: `Generate a follow-up email for a claim recommendation that was sent.
The message should:
- Reference the claim recommendation
- Explain the next steps in the claims process
- Offer to answer any questions about insurance claims
- Encourage them to move forward with filing
- Be informative and supportive`,

  pa_follow_up: `Generate a follow-up email for a Public Adjuster agreement.
The message should:
- Reference the PA agreement that was sent
- Explain the benefits of having a PA represent them
- Address common concerns about the process
- Include a clear call to action to sign
- Be professional and reassuring`,

  claim_follow_up: `Generate a follow-up email for an active insurance claim.
The message should:
- Ask for any updates on their claim status
- Offer assistance with the claims process
- Remind them you're there to help
- Be supportive and professional`,

  seasonal_follow_up: `Generate a friendly spring follow-up message for a past customer or lead.
The message should:
- Be warm and reconnecting
- Ask how their roof has been since winter
- Offer a free inspection or check-up
- Be personable and not too salesy
- Reference the changing seasons`,

  general_follow_up: `Generate a general follow-up message.
The message should:
- Be friendly and professional
- Check in on their status
- Offer assistance
- Include a soft call to action`,
};

/**
 * POST /api/josh/draft-message - Generate an AI-drafted message for a contact
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: org } = await getOrganization();
    if (!org) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const body: DraftMessageRequest = await request.json();
    const { contactId, messageType, customContext } = body;

    if (!contactId || !messageType) {
      return NextResponse.json(
        { error: "Contact ID and message type required" },
        { status: 400 }
      );
    }

    // Get contact details
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        stage: true,
        tasks: {
          where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
          orderBy: { dueDate: "asc" },
          take: 3,
        },
        timeline: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Fetch user's display name so the message is signed as them
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true },
    });
    const userName = dbUser?.fullName || user.email?.split("@")[0] || "the user";

    // Build context for the AI
    const contactContext = buildContactContext(contact);
    const typePrompt = MESSAGE_TYPE_PROMPTS[messageType] || MESSAGE_TYPE_PROMPTS.general_follow_up;

    // Generate the message
    const draftMessage = await generateDraftMessage(
      typePrompt,
      contactContext,
      userName,
      customContext
    );

    return NextResponse.json({
      message: draftMessage,
      contact: {
        id: contact.id,
        name: `${contact.firstName} ${contact.lastName}`,
        email: contact.email,
        phone: contact.phone,
      },
      messageType,
    });
  } catch (error) {
    console.error("Error generating draft message:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function buildContactContext(contact: {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  source: string | null;
  carrier: string | null;
  quoteType: string | null;
  dateOfLoss: Date | null;
  firstMessageSentAt: Date | null;
  quoteSentAt: Date | null;
  claimRecSentAt: Date | null;
  stage: { name: string } | null;
  tasks: { title: string; dueDate: Date }[];
  timeline: { content: string; noteType: string; createdAt: Date }[];
}): string {
  const parts: string[] = [];

  parts.push(`Contact: ${contact.firstName} ${contact.lastName}`);
  
  if (contact.address) {
    parts.push(`Address: ${contact.address}${contact.city ? `, ${contact.city}` : ""}${contact.state ? `, ${contact.state}` : ""}`);
  }

  if (contact.stage) {
    parts.push(`Current Stage: ${contact.stage.name}`);
  }

  if (contact.source) {
    parts.push(`Lead Source: ${contact.source}`);
  }

  if (contact.carrier) {
    parts.push(`Insurance Carrier: ${contact.carrier}`);
  }

  if (contact.quoteType) {
    parts.push(`Quote Type: ${contact.quoteType}`);
  }

  if (contact.dateOfLoss) {
    parts.push(`Date of Loss: ${new Date(contact.dateOfLoss).toLocaleDateString()}`);
  }

  // Communication history
  if (contact.firstMessageSentAt) {
    parts.push(`First message sent: ${new Date(contact.firstMessageSentAt).toLocaleDateString()}`);
  }

  if (contact.quoteSentAt) {
    parts.push(`Quote sent: ${new Date(contact.quoteSentAt).toLocaleDateString()}`);
  }

  if (contact.claimRecSentAt) {
    parts.push(`Claim recommendation sent: ${new Date(contact.claimRecSentAt).toLocaleDateString()}`);
  }

  // Recent timeline entries
  if (contact.timeline.length > 0) {
    parts.push("\nRecent activity:");
    contact.timeline.slice(0, 3).forEach((entry) => {
      const date = new Date(entry.createdAt).toLocaleDateString();
      parts.push(`- ${date}: ${entry.content.substring(0, 100)}${entry.content.length > 100 ? "..." : ""}`);
    });
  }

  return parts.join("\n");
}

async function generateDraftMessage(
  typePrompt: string,
  contactContext: string,
  userName: string,
  customContext?: string
): Promise<string> {
  if (!XAI_API_KEY) {
    return "Unable to generate message - AI not configured.";
  }

  try {
    const systemPrompt = `You are a ghostwriter for a roofing contractor named ${userName}.
You write messages in ${userName}'s voice -- friendly, professional, personable.
All messages must sound like they come directly from ${userName}, NOT from an AI assistant.

Guidelines:
- Write as ${userName} in first person
- Be friendly, professional, and genuine
- Use the contact's first name naturally when appropriate
- Reference specific details about their situation when relevant
- Keep the tone warm but businesslike
- Never mention that you're an AI or that this is auto-generated
- If the message warrants a sign-off, sign as ${userName}`;

    const userPrompt = `${typePrompt}

Contact Information:
${contactContext}
${customContext ? `\nAdditional Context from ${userName}:\n${customContext}` : ""}

Generate only the message body - no subject line, just the message content.`;

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
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      console.error("Grok API error:", await response.text());
      return "Unable to generate message at this time. Please try again.";
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content;

    return generatedText?.trim() || "Unable to generate message.";
  } catch (error) {
    console.error("Error generating draft message:", error);
    return "Unable to generate message due to an error.";
  }
}

