/**
 * Orbit AI Integration - Google Gemini
 * 
 * Provides AI-assisted message generation as a fallback option when templates don't fit.
 * Uses Google's Gemini API for generating professional roofing sales messages.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

// System prompt for roofing sales context
const SYSTEM_PROMPT = `You are a professional sales assistant for a roofing contractor. 
You help write professional, friendly, and effective messages to homeowners about their roofing needs.

Guidelines:
- Be professional but warm and approachable
- Keep messages concise and to the point
- Use proper grammar and punctuation
- Never use aggressive sales tactics
- Focus on helping the homeowner, not pushing a sale
- Include relevant details when provided (names, addresses, dates)
- For SMS, keep messages under 160 characters when possible
- For emails, use proper email format with greeting and signature placeholder

Context: You work for a roofing company that handles both retail (direct to homeowner) and insurance claim work.
`;

export interface MessageContext {
  messageType: "sms" | "email";
  category: string; // e.g., "first_message", "quote_follow_up", etc.
  contact: {
    firstName: string;
    lastName?: string;
    address?: string | null;
    city?: string | null;
    carrier?: string | null;
    dateOfLoss?: string | null;
    quoteType?: string | null;
  };
  userDescription: string; // What the user wants to say
  userName?: string;
}

export interface GeneratedMessage {
  message: string;
  subject?: string; // For emails
}

/**
 * Generate a custom message using Gemini AI
 */
export async function generateCustomMessage(
  context: MessageContext
): Promise<GeneratedMessage | null> {
  if (!GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not configured");
    return null;
  }

  const { messageType, category, contact, userDescription, userName } = context;

  // Build the prompt
  const categoryDescriptions: Record<string, string> = {
    FIRST_MESSAGE: "initial outreach to a new lead",
    QUOTE_FOLLOW_UP: "following up on a quote that was sent",
    CLAIM_RECOMMENDATION: "recommending they file an insurance claim",
    CLAIM_REC_FOLLOW_UP: "following up on a claim recommendation",
    PA_AGREEMENT: "sending a Public Adjuster agreement",
    PA_FOLLOW_UP: "following up on a PA agreement",
    CLAIM_FOLLOW_UP: "following up on an open insurance claim",
    SEASONAL: "reaching out to a seasonal lead (waited for warmer weather)",
    GENERAL: "general communication",
  };

  const categoryDesc = categoryDescriptions[category] || "general communication";

  let prompt = `Generate a ${messageType === "sms" ? "text message (SMS)" : "professional email"} for ${categoryDesc}.

Contact Information:
- Name: ${contact.firstName}${contact.lastName ? ` ${contact.lastName}` : ""}
${contact.address ? `- Address: ${contact.address}${contact.city ? `, ${contact.city}` : ""}` : ""}
${contact.carrier ? `- Insurance Carrier: ${contact.carrier}` : ""}
${contact.dateOfLoss ? `- Date of Loss: ${contact.dateOfLoss}` : ""}
${contact.quoteType ? `- Quote Type: ${contact.quoteType}` : ""}
${userName ? `- Your Name (salesperson): ${userName}` : ""}

User's Description of What to Say:
"${userDescription}"

`;

  if (messageType === "sms") {
    prompt += `
Requirements for SMS:
- Keep it brief (ideally under 160 characters)
- Be friendly and professional
- Include a clear next step or question
- Don't include a formal signature

Return ONLY the message text, no labels or formatting.`;
  } else {
    prompt += `
Requirements for Email:
- Include an appropriate subject line
- Use proper email format with greeting
- Be professional but personable
- End with a signature placeholder like "[Your Name]" or the provided name
- Keep it concise but thorough

Return the response in this exact format:
SUBJECT: [subject line here]
BODY:
[email body here]`;
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: SYSTEM_PROMPT },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Gemini API error:", error);
      return null;
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      console.error("No text generated from Gemini");
      return null;
    }

    // Parse the response
    if (messageType === "email") {
      // Extract subject and body for email
      const subjectMatch = generatedText.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
      const bodyMatch = generatedText.match(/BODY:\s*([\s\S]+)/i);

      return {
        subject: subjectMatch ? subjectMatch[1].trim() : "Follow Up",
        message: bodyMatch ? bodyMatch[1].trim() : generatedText.trim(),
      };
    } else {
      // SMS - just return the message
      return {
        message: generatedText.trim(),
      };
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return null;
  }
}

/**
 * Server action for generating custom messages
 */
export async function generateMessage(context: MessageContext): Promise<{
  data: GeneratedMessage | null;
  error?: string;
}> {
  try {
    const result = await generateCustomMessage(context);
    
    if (!result) {
      return { 
        data: null, 
        error: "Failed to generate message. Please check your API configuration." 
      };
    }

    return { data: result };
  } catch (error) {
    console.error("Error generating message:", error);
    return { 
      data: null, 
      error: "An unexpected error occurred while generating the message." 
    };
  }
}

