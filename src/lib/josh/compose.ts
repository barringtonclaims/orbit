const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = "grok-4-fast";

export interface ComposeResult {
  body: string;
  subject: string | null;
  channel: string;
  recipientType: string;
  smsBody?: string;
  emailBody?: string;
}

export interface ContactForContext {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  carrier: string | null;
  quoteType: string | null;
  dateOfLoss: Date | null;
  claimNumber: string | null;
  policyNumber: string | null;
  adjusterEmail: string | null;
  stage: { name: string } | null;
  carrierRef: { name: string; unifiedEmail: string | null; emailType: string } | null;
  tasks: { title: string; dueDate: Date }[];
  timeline: { content: string; noteType: string; createdAt: Date }[];
  files: { fileName: string; fileType: string; createdAt: Date }[];
}

export interface ContactForCompose {
  phone: string | null;
  email: string | null;
  carrier: string | null;
  claimNumber: string | null;
  carrierRef: { name: string; unifiedEmail: string | null; emailType: string } | null;
}

export function buildContext(contact: ContactForContext): string {
  const parts: string[] = [];
  parts.push(`Contact: ${contact.firstName} ${contact.lastName}`);
  if (contact.phone) parts.push(`Phone: ${contact.phone}`);
  if (contact.email) parts.push(`Email: ${contact.email}`);
  if (contact.address) {
    parts.push(`Address: ${contact.address}${contact.city ? `, ${contact.city}` : ""}${contact.state ? `, ${contact.state}` : ""}`);
  }
  if (contact.stage) parts.push(`Stage: ${contact.stage.name}`);
  if (contact.carrier) parts.push(`Carrier: ${contact.carrier}`);
  if (contact.carrierRef) {
    parts.push(`Carrier details: ${contact.carrierRef.name} (type: ${contact.carrierRef.emailType})${contact.carrierRef.unifiedEmail ? ` email: ${contact.carrierRef.unifiedEmail}` : ""}`);
  }
  if (contact.claimNumber) parts.push(`Claim Number: ${contact.claimNumber}`);
  if (contact.policyNumber) parts.push(`Policy Number: ${contact.policyNumber}`);
  if (contact.quoteType) parts.push(`Quote Type: ${contact.quoteType}`);
  if (contact.dateOfLoss) parts.push(`Date of Loss: ${new Date(contact.dateOfLoss).toLocaleDateString()}`);
  if (contact.adjusterEmail) parts.push(`Adjuster Email: ${contact.adjusterEmail}`);

  if (contact.files.length > 0) {
    parts.push("\nDocuments on file:");
    contact.files.forEach((f) => {
      parts.push(`- ${f.fileName} (${f.fileType})`);
    });
  }

  if (contact.timeline.length > 0) {
    parts.push("\nRecent activity:");
    contact.timeline.slice(0, 3).forEach((entry) => {
      parts.push(`- ${new Date(entry.createdAt).toLocaleDateString()}: ${entry.content.substring(0, 100)}`);
    });
  }

  return parts.join("\n");
}

export async function composeMessage(
  directive: string,
  contactContext: string,
  contact: ContactForCompose,
  userName: string
): Promise<ComposeResult> {
  const defaultChannel = contact.phone ? "sms" : "email";
  const fallback: ComposeResult = {
    body: "Unable to generate message - AI not configured.",
    subject: null,
    channel: defaultChannel,
    recipientType: "customer",
  };

  if (!XAI_API_KEY) return fallback;

  const systemPrompt = `You are a ghostwriter for a roofing contractor named ${userName}.
You write messages in ${userName}'s voice -- friendly, professional, personable.
All messages must sound like they come from ${userName}, NOT from an AI assistant.
Sign off as ${userName} (first name only is fine for texts, full name for emails).

You MUST respond with valid JSON only, no markdown, no code fences. Use this exact format:

For SMS or email (single channel):
{
  "channel": "sms" or "email",
  "recipientType": "customer" or "carrier",
  "body": "The message content",
  "subject": "Email subject line (only for email, null for sms)"
}

For BOTH SMS and email (when both are appropriate):
{
  "channel": "both",
  "recipientType": "customer" or "carrier",
  "smsBody": "A short SMS version (under 320 chars)",
  "emailBody": "A longer, more detailed email version (2-3 paragraphs)",
  "subject": "Email subject line"
}

Rules:
- Decide channel based on the directive: "text" = sms, "email" = email, "email and text" / "both" = both
- If unclear and the contact has a phone, default to "sms"
- If the directive mentions the carrier or insurance company, set recipientType to "carrier"
- SMS must be under 320 characters -- concise and conversational
- Emails should be 2-3 concise paragraphs -- more detailed and professional
- When channel is "both", write TWO DISTINCT messages: a short text and a proper email. Do NOT just copy the same text into both.
- Use the contact's first name naturally
- Never mention you are an AI or that this was auto-generated

CARRIER FOLLOW-UP RULES (when recipientType is "carrier"):
- The email subject line must be ONLY the claim number (e.g. "12345"), nothing else -- no prefixes, no customer name, just the raw claim number
- Write the email to the carrier claims department, not to the customer
- Be professional and factual; reference the claim number, date of loss, and any documents on file
- Ask for a specific action or status update
- CC the customer by mentioning their name but address the carrier
- Do NOT include a greeting line with "Dear" or "To whom it may concern" -- get straight to the point
- Keep the tone professional but assertive -- you are advocating for the homeowner`;

  const userPrompt = `${userName}'s directive: "${directive}"

Contact Information:
${contactContext}

Generate the message(s) as JSON.`;

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
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      console.error("Grok API error:", await response.text());
      return { ...fallback, body: "Unable to generate message at this time." };
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || "";

    try {
      const parsed = JSON.parse(raw);
      const channel = parsed.channel || defaultChannel;
      const recipientType = parsed.recipientType || "customer";

      if (channel === "both") {
        const result: ComposeResult = {
          body: parsed.smsBody || parsed.body || "Unable to generate message.",
          subject: parsed.subject || null,
          channel: "both",
          recipientType,
          smsBody: parsed.smsBody || parsed.body || "",
          emailBody: parsed.emailBody || parsed.body || "",
        };
        if (recipientType === "carrier" && contact.claimNumber) {
          result.subject = contact.claimNumber;
        }
        return result;
      }

      const result: ComposeResult = {
        body: parsed.body || parsed.smsBody || parsed.emailBody || "Unable to generate message.",
        subject: parsed.subject || null,
        channel,
        recipientType,
      };
      if (recipientType === "carrier" && contact.claimNumber) {
        result.subject = contact.claimNumber;
      }
      return result;
    } catch {
      return { ...fallback, body: raw || "Unable to generate message.", channel: defaultChannel };
    }
  } catch (error) {
    console.error("Error composing message:", error);
    return { ...fallback, body: "Unable to generate message due to an error." };
  }
}
