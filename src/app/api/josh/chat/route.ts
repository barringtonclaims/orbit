import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganization } from "@/lib/actions/organizations";
import prisma from "@/lib/prisma";

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = "grok-4-fast";

// Chat history is persisted for 24 hours, then cleared
const CHAT_HISTORY_HOURS = 24;

const JOSH_SYSTEM_PROMPT = `You are Josh, a friendly and helpful AI assistant for a contractor CRM called Relay.

Your primary responsibilities:
1. Monitor and process incoming emails (you do this automatically in the background)
2. Create new leads from AccuLynx notifications and customer emails
3. Link emails to existing contacts
4. Help users understand their email activity and lead status

When responding:
- Be concise and friendly
- Use roofing industry terminology when appropriate
- Refer to yourself as Josh
- If asked about specific contacts or emails, explain that you've been processing their inbox
- If asked to do something you can't do, politely explain your limitations

You have access to information about:
- Recent email processing activities
- Contact database summary
- Tasks and follow-ups

Current context will be provided with each message.`;

/**
 * GET /api/josh/chat - Fetch chat history for the current user
 * Returns messages from the last 24 hours
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get messages from the last 24 hours
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - CHAT_HISTORY_HOURS);

    const messages = await prisma.joshMessage.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: cutoffDate },
      },
      orderBy: { createdAt: "asc" },
      take: 100, // Limit to prevent huge responses
    });

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Error fetching Josh chat history:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

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

    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    // Get context for the AI
    const context = await getJoshContext(user.id, org.id);

    // Store the user message
    await prisma.joshMessage.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: "USER",
        content: message,
      },
    });

    // Generate response with Gemini
    const response = await generateJoshResponse(message, context);

    // Store the assistant response
    await prisma.joshMessage.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: "ASSISTANT",
        content: response,
      },
    });

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Error in Josh chat:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function getJoshContext(userId: string, organizationId: string): Promise<string> {
  // Get recent activities
  const recentActivities = await prisma.joshActivity.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Get contact stats
  const contactCount = await prisma.contact.count({
    where: { organizationId },
  });

  const recentContacts = await prisma.contact.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      firstName: true,
      lastName: true,
      createdAt: true,
      source: true,
    },
  });

  // Get email processing stats
  const emailStats = await prisma.processedEmail.groupBy({
    by: ["classification"],
    where: { organizationId },
    _count: true,
  });

  // Check Gmail connection (via unified Google token)
  const googleToken = await prisma.googleToken.findUnique({
    where: { userId },
    select: { hasGmailAccess: true },
  });
  const gmailConnected = googleToken?.hasGmailAccess;

  let context = `
Current Context:
- Organization has ${contactCount} total contacts
- Gmail is ${gmailConnected ? "connected" : "not connected"}
`;

  if (recentActivities.length > 0) {
    context += `\nRecent Josh Activities:\n`;
    recentActivities.forEach((a) => {
      context += `- ${a.title} (${new Date(a.createdAt).toLocaleDateString()})\n`;
    });
  }

  if (recentContacts.length > 0) {
    context += `\nRecent Contacts:\n`;
    recentContacts.forEach((c) => {
      context += `- ${c.firstName} ${c.lastName} (${c.source || "unknown source"}, ${new Date(c.createdAt).toLocaleDateString()})\n`;
    });
  }

  if (emailStats.length > 0) {
    context += `\nEmail Processing Stats:\n`;
    emailStats.forEach((s) => {
      context += `- ${s.classification}: ${s._count} emails\n`;
    });
  }

  return context;
}

async function generateJoshResponse(message: string, context: string): Promise<string> {
  if (!XAI_API_KEY) {
    return "I'm having trouble connecting to my brain right now. Please make sure the AI is properly configured.";
  }

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
          { role: "system", content: JOSH_SYSTEM_PROMPT },
          { role: "system", content: `Current Context:\n${context}` },
          { role: "user", content: message },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      console.error("Grok API error:", await response.text());
      return "Sorry, I'm having trouble thinking right now. Please try again in a moment.";
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content;

    return generatedText?.trim() || "I'm not sure how to respond to that. Can you try rephrasing?";
  } catch (error) {
    console.error("Error generating Josh response:", error);
    return "Sorry, I encountered an error. Please try again.";
  }
}

