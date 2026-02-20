const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_API_URL = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL = "grok-4-fast";
const MAX_TOOL_ROUNDS = 3;

// ──────────────────────────────────────
// Shared interfaces (output format unchanged)
// ──────────────────────────────────────

export interface ComposeResult {
  body: string;
  subject: string | null;
  channel: string;
  recipientType: string;
  smsBody?: string;
  emailBody?: string;
}

export type ActionType =
  | "send_message"
  | "progress_task"
  | "add_note"
  | "set_date"
  | "schedule_appointment"
  | "contact_resource";

export interface ComposeAction {
  type: ActionType;
  channel?: string;
  recipientType?: string;
  body?: string;
  subject?: string | null;
  smsBody?: string;
  emailBody?: string;
  stageName?: string;
  stageId?: string;
  nextTaskType?: string;
  customTaskName?: string;
  dueDate?: string;
  content?: string;
  date?: string;
  reason?: string;
  appointmentType?: string;
  datetime?: string;
  description?: string;
  resourceCompanyName?: string;
  resourceContactName?: string;
  resourceChannel?: string;
  resourceBody?: string;
  resourceSubject?: string | null;
}

export interface ComposeWithActionsResult {
  actions: ComposeAction[];
}

export interface StageInfo {
  id: string;
  name: string;
}

export interface TemplateInfo {
  name: string;
  body: string;
  templateType: string;
  category: string;
  taskTypeName: string | null;
}

export interface AppointmentTypeInfo {
  name: string;
  includesLocation: boolean;
}

export interface ResourceContactInfo {
  companyName: string;
  companyType: string;
  contactName: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
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
  tasks: { title: string; dueDate: Date; taskType?: string }[];
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

export interface StageTaskTypeMapping {
  stageName: string;
  taskTypes: string[];
}

/**
 * Data that Josh AI can pull from on-demand via tool calls.
 * Pre-fetched from DB (fast) but only injected into context when requested.
 */
export interface ToolData {
  templates: TemplateInfo[];
  resourceContacts: ResourceContactInfo[];
  timeline: { content: string; noteType: string; createdAt: Date }[];
  documents: { fileName: string; fileType: string; createdAt: Date }[];
  carrierRef: { name: string; unifiedEmail: string | null; emailType: string } | null;
  adjusterEmail: string | null;
  stageTaskTypes: StageTaskTypeMapping[];
}

// ──────────────────────────────────────
// Tool definitions for Grok function calling
// ──────────────────────────────────────

const JOSH_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_resource_contacts",
      description:
        "Search the resource contacts directory (suppliers, subcontractors, adjusters, appraisers, etc.). Use when the directive mentions contacting a vendor, supplier, sub, adjuster, or any third-party business contact by name or company.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search query — person name, company name, or business type (e.g. 'wolverine', 'john', 'appraiser')",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_message_templates",
      description:
        "Retrieve the user's saved message templates to match their voice, tone, and preferred format when composing messages. Templates are linked to task types. Call this when composing any send_message or contact_resource to write in the user's style.",
      parameters: {
        type: "object",
        properties: {
          taskType: {
            type: "string",
            description:
              "Optional task type filter — match the contact's current task type to get the most relevant templates (e.g. 'First Message', 'Follow Up', 'Send Quote'). Pass the task type name, not the stage name.",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_contact_history",
      description:
        "Get the contact's recent activity timeline — notes, messages sent, status changes. Use when you need context about what has already happened with this contact before composing a response.",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of recent entries (default 5, max 15)",
          },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_contact_documents",
      description:
        "Get the list of documents/files on this contact's record (inspections, estimates, photos, contracts). Use when you need to reference specific documents in a message.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

// ──────────────────────────────────────
// Tool handlers — filter pre-fetched data
// ──────────────────────────────────────

function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  toolData: ToolData
): string {
  switch (name) {
    case "search_resource_contacts": {
      const query = String(args.query || "").toLowerCase();
      const terms = query.split(/\s+/).filter(Boolean);
      if (terms.length === 0) return JSON.stringify([]);

      const matches = toolData.resourceContacts.filter((rc) => {
        const haystack =
          `${rc.contactName} ${rc.companyName} ${rc.companyType} ${rc.role || ""}`.toLowerCase();
        return terms.some((term) => haystack.includes(term));
      });

      if (matches.length === 0) {
        return JSON.stringify({
          results: [],
          note: "No matching resource contacts found. You can still compose the action if you have enough info from the directive.",
        });
      }

      return JSON.stringify(
        matches.map((rc) => ({
          contactName: rc.contactName,
          companyName: rc.companyName,
          companyType: rc.companyType,
          role: rc.role,
          phone: rc.phone,
          email: rc.email,
          notes: rc.notes,
        }))
      );
    }

    case "get_message_templates": {
      const taskType = args.taskType ? String(args.taskType).toLowerCase() : null;
      let templates = toolData.templates;
      if (taskType) {
        const typeMatches = templates.filter(
          (t) => (t.taskTypeName || "").toLowerCase().includes(taskType)
        );
        const generalTemplates = templates.filter(
          (t) => !t.taskTypeName || t.taskTypeName === "" || (t.category || "").toLowerCase() === "general"
        );
        templates = typeMatches.length > 0
          ? [...typeMatches, ...generalTemplates]
          : templates;
      }
      if (templates.length === 0) {
        return JSON.stringify({ results: [], note: "No templates found. Compose in a professional, friendly tone." });
      }
      return JSON.stringify({
        instructions: "Use the most relevant template as your foundation. Replace {{variables}} with actual contact/directive data: {{first_name}}, {{last_name}}, {{address}}, {{carrier}}, {{claim_number}}, {{quote_type}}, {{user_name}}, {{preferred_date}}, {{today}}, etc. Adapt the template naturally — don't leave raw {{variables}} in the output.",
        templates: templates.slice(0, 10).map((t) => ({
          name: t.name,
          taskType: t.taskTypeName || "General",
          type: t.templateType,
          body: t.body,
        })),
      });
    }

    case "get_contact_history": {
      const limit = Math.min(Number(args.limit) || 5, 15);
      const entries = toolData.timeline.slice(0, limit);
      if (entries.length === 0) {
        return JSON.stringify({ results: [], note: "No activity history for this contact yet." });
      }
      return JSON.stringify(
        entries.map((e) => ({
          date: new Date(e.createdAt).toLocaleDateString(),
          type: e.noteType,
          content: e.content.substring(0, 200),
        }))
      );
    }

    case "get_contact_documents": {
      if (toolData.documents.length === 0) {
        return JSON.stringify({ results: [], note: "No documents on file for this contact." });
      }
      return JSON.stringify(
        toolData.documents.map((d) => ({
          name: d.fileName,
          type: d.fileType,
          date: new Date(d.createdAt).toLocaleDateString(),
        }))
      );
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ──────────────────────────────────────
// Build lean contact summary (always in context)
// ──────────────────────────────────────

function buildLeanContext(contact: ContactForContext): string {
  const parts: string[] = [];
  parts.push(`Contact: ${contact.firstName} ${contact.lastName}`);
  if (contact.phone) parts.push(`Phone: ${contact.phone}`);
  if (contact.email) parts.push(`Email: ${contact.email}`);
  if (contact.address) {
    parts.push(
      `Address: ${contact.address}${contact.city ? `, ${contact.city}` : ""}${contact.state ? `, ${contact.state}` : ""}`
    );
  }
  if (contact.stage) parts.push(`Stage: ${contact.stage.name}`);
  if (contact.carrier) parts.push(`Carrier: ${contact.carrier}`);
  if (contact.claimNumber) parts.push(`Claim #: ${contact.claimNumber}`);
  if (contact.policyNumber) parts.push(`Policy #: ${contact.policyNumber}`);
  if (contact.quoteType) parts.push(`Quote Type: ${contact.quoteType}`);
  if (contact.dateOfLoss) parts.push(`Date of Loss: ${new Date(contact.dateOfLoss).toLocaleDateString()}`);
  if (contact.tasks.length > 0) {
    parts.push(`Current tasks: ${contact.tasks.map((t) => `${t.title} (due ${new Date(t.dueDate).toLocaleDateString()})`).join(", ")}`);
  }
  return parts.join("\n");
}

/** @deprecated Use composeWithActions instead — kept for backward compat */
export function buildContext(contact: ContactForContext): string {
  return buildLeanContext(contact);
}

// ──────────────────────────────────────
// Chat message types for multi-turn tool loop
// ──────────────────────────────────────

interface ToolCallRef {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCallRef[] }
  | { role: "tool"; tool_call_id: string; content: string };

// ──────────────────────────────────────
// Simple message composer (unchanged, no tools)
// ──────────────────────────────────────

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

// ──────────────────────────────────────
// Main agentic composer with tool calling
// ──────────────────────────────────────

export async function composeWithActions(
  directive: string,
  contact: ContactForContext,
  userName: string,
  companyName: string,
  stages: StageInfo[],
  taskTypes: string[],
  appointmentTypeNames: string[],
  toolData: ToolData
): Promise<ComposeWithActionsResult> {
  const fallbackNote: ComposeAction = {
    type: "add_note",
    content: `Josh directive: "${directive}" — AI unavailable, please act manually.`,
  };

  if (!XAI_API_KEY) return { actions: [fallbackNote] };

  const stageList = stages.map((s) => s.name).join(", ");
  const taskTypeList = taskTypes.join(", ");
  const appointmentList = appointmentTypeNames.join(", ");
  const today = new Date().toISOString().split("T")[0];

  const companyIntro = companyName
    ? `${userName} at ${companyName}`
    : userName;

  // Build stage -> task types mapping for the system prompt
  const stageTaskMapping = toolData.stageTaskTypes
    .filter((m) => m.taskTypes.length > 0)
    .map((m) => `  ${m.stageName}: ${m.taskTypes.join(", ")}`)
    .join("\n");

  const systemPrompt = `You are a workflow assistant for ${companyIntro} (a roofing contractor).
You analyze the directive and decide which actions to take for the given contact.

CRITICAL — TEMPLATE REQUIREMENT:
You MUST call get_message_templates BEFORE composing ANY send_message or contact_resource action.
Templates are linked to task types. Pass the contact's current task type (from their active task) to get the best match.
Use the matching template as your foundation — replace {{variables}} with actual contact data.
If no template matches, compose in a professional, friendly tone — but always try templates first.

OTHER TOOLS:
- search_resource_contacts — if the directive mentions a vendor, supplier, sub, adjuster, or third-party by name. You MUST call this before composing a contact_resource action.
- get_contact_history — when you need to know what's already happened with this contact
- get_contact_documents — when you need to reference specific files or documents

For simple tasks (set a date, make a note, progress a status), you don't need any tools.

When you're ready, respond with valid JSON only (no markdown, no code fences):

{
  "actions": [
    { ... action objects ... }
  ]
}

Available action types:

1. "send_message" — Compose and send an SMS or email to the customer or their carrier.
   Fields: "type": "send_message", "channel": "sms"|"email"|"both", "recipientType": "customer"|"carrier", "body": "message text", "subject": "email subject or null"
   When channel is "both": use "smsBody" and "emailBody" instead of "body", plus "subject".

2. "progress_task" — Change the contact's workflow status/stage.
   Fields: "type": "progress_task", "stageName": "one of the available stages", "nextTaskType": "one of the available task types" (optional), "customTaskName": "free text task name" (optional), "dueDate": "YYYY-MM-DD" (suggested date for next task)

3. "add_note" — Record a note in the contact's file.
   Fields: "type": "add_note", "content": "note text"

4. "set_date" — Reschedule the contact's current task.
   Fields: "type": "set_date", "date": "YYYY-MM-DD", "reason": "brief explanation"

5. "schedule_appointment" — Schedule an appointment or call.
   Fields: "type": "schedule_appointment", "appointmentType": "one of the available types", "datetime": "YYYY-MM-DDTHH:MM", "description": "optional notes"

6. "contact_resource" — Reach out to a resource contact (supplier, sub, adjuster) on behalf of the user regarding this customer's job.
   Fields: "type": "contact_resource", "resourceCompanyName": "exact company name", "resourceContactName": "exact contact name", "resourceChannel": "sms"|"email", "resourceBody": "the message text", "resourceSubject": "email subject or null"
   Write the message AS ${userName} from ${companyName || "the company"}. Reference the current customer's job details.
   If the contact only has a phone, use sms. If only email, use email. Default to sms for quick asks, email for formal requests.

Available stages: ${stageList}
Available task types: ${taskTypeList}
Available appointment types: ${appointmentList}
${stageTaskMapping ? `\nStage -> Task Types:\n${stageTaskMapping}` : ""}
Today's date: ${today}

Rules:
- Match actions to the directive. "text this guy" = send_message. "set status to retail and text him" = progress_task + send_message.
- Do NOT include "add_note" automatically. Notes are auto-recorded by the system for every action. Only emit "add_note" when the user EXPLICITLY asks (e.g. "make a note that…").
- For send_message: "text" = sms, "email" = email, "both" = both. Default to sms if unclear and contact has a phone.
- If directive mentions the carrier/insurance, set recipientType to "carrier".
- SMS under 320 chars. Emails 2-3 concise paragraphs.
- Write as ${userName} from ${companyName || "the company"}, NOT as an AI. For texts, sign off with just "${userName}". For emails, use "${userName}" with "${companyName || ""}" in the signature.
- For set_date: resolve relative dates ("Tuesday", "next week") to YYYY-MM-DD from today (${today}).
- For dueDate on progress_task: suggest a sensible near-future business day.
- Return at least one action.

CARRIER RULES (when recipientType is "carrier"):
- Email subject = ONLY the claim number
- Write to carrier claims dept, not customer
- Professional, factual, assertive — advocating for the homeowner`;

  const contactSummary = buildLeanContext(contact);

  const currentTaskType = contact.tasks[0]?.taskType || "";

  const userMessage = `${userName}'s directive: "${directive}"

Contact:
${contactSummary}
${currentTaskType ? `Current task type: ${currentTaskType}` : ""}

Decide what to do. Call get_message_templates (with the task type if known) before composing any message, then generate the action(s) as JSON.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const isLastRound = round === MAX_TOOL_ROUNDS;

      const response = await fetch(XAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROK_MODEL,
          messages,
          ...(isLastRound ? {} : { tools: JOSH_TOOLS, tool_choice: "auto" }),
          temperature: 0.7,
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        console.error("Grok API error:", await response.text());
        return { actions: [fallbackNote] };
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      const msg = choice?.message;

      if (!msg) return { actions: [fallbackNote] };

      // If the model made tool calls, execute them and loop
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.tool_calls,
        });

        for (const toolCall of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.function.arguments || "{}");
          } catch {
            args = {};
          }

          const result = handleToolCall(toolCall.function.name, args, toolData);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
        }
        continue;
      }

      // No tool calls — this is the final response
      const raw = (msg.content || "").trim();
      return parseActionsResponse(raw, contact, fallbackNote);
    }

    // Exhausted rounds without a final answer
    return { actions: [fallbackNote] };
  } catch (error) {
    console.error("Error composing with actions:", error);
    return { actions: [fallbackNote] };
  }
}

// ──────────────────────────────────────
// Parse the final JSON response from AI
// ──────────────────────────────────────

const VALID_TYPES: ActionType[] = [
  "send_message",
  "progress_task",
  "add_note",
  "set_date",
  "schedule_appointment",
  "contact_resource",
];

function parseActionsResponse(
  raw: string,
  contact: ContactForContext,
  fallback: ComposeAction
): ComposeWithActionsResult {
  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const actions: ComposeAction[] = Array.isArray(parsed.actions) ? parsed.actions : [parsed];

    if (actions.length === 0) return { actions: [fallback] };

    const validActions = actions.filter((a) => VALID_TYPES.includes(a.type as ActionType));
    if (validActions.length === 0) return { actions: [fallback] };

    for (const action of validActions) {
      if (action.type === "send_message" && action.recipientType === "carrier" && contact.claimNumber) {
        action.subject = contact.claimNumber;
      }
    }

    return { actions: validActions };
  } catch {
    return { actions: [fallback] };
  }
}
