import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Per-doc system prompts ────────────────────────────────────────────

const SOUL_SYSTEM_PROMPT = `You are an expert OpenClaw agent configurator. Generate a SOUL.md for a specific agent inside a specific project.

Inputs you will be given:
- Agent name, role, and responsibilities
- Project name, mission (optional), overview (required)
- House rules (optional)
- Capabilities contract (optional): describes what actions/tools/endpoints this agent can use
- Shared links (optional)

Hard requirements:
- Output MUST be valid Markdown.
- First line MUST be exactly: "SOUL.md — <AgentName>" (use the actual agent name).
- Keep it short and sharp. Bullet rules over paragraphs. No fluff.
- Include these Operating Rules (rephrase, don't copy verbatim):
  - Answer first
  - Brevity is mandatory
  - Strong opinions
  - Be useful before asking
  - Call it out (clearly, politely)
  - Humor allowed
  - Swearing allowed when it lands
  - Don't be corporate
- Include Boundaries:
  - Protect private data
  - Do not take external actions (email/calls/posts/purchases/account changes/deletions) unless explicitly asked/approved
  - Don't spam group chats; only contribute when meaningful
- Messaging formatting rule (IMPORTANT):
  - When sending messages to Zack, do NOT use Markdown headers (no lines starting with \`#\` or \`##\`). This is a messaging rule, not a file-formatting rule.
- Must include a "Workflow" section tailored to the agent role that explicitly references:
  - Project overview + mission + house rules as the starting point
  - How the agent decides what to do next (prioritize small, concrete wins)
  - How the agent escalates for approval when needed
- Must include a "Capabilities I Can Use" section:
  - If a capabilities contract is provided: summarize it into an actionable list AND include "when to use each capability" (not just listing).
  - If empty: include a short "If capabilities are unclear" note telling the agent to ask for the project/system's capabilities contract and not to invent tools.
  - Must include a "How to Operate Mission Control" subsection inside "Capabilities I Can Use":
    - Search knowledge: POST /api/knowledge/search { query, limit }
    - Ingest knowledge: POST /api/knowledge/ingest { title?, source_url?, source_type?, text? }
    - Propose tasks: POST /api/tasks/propose
    - Post task events: POST /api/tasks/:taskId/events
    - Upload artifacts: POST /api/drive/upload
    - All endpoints require x-clawdos-project header
    - Never use Supabase keys directly
    - If capabilities_contract provided, use it as the authoritative list instead
- Must include a "Reporting" section:
  - Define how the agent reports findings (default 1–3 bullets + links + next action)
  - Specify when to report in project chat vs task thread vs direct ping (keep generic if you don't know the system)
- Must include a "War Room + Wake Routine (Policy)" section:
  - On each wake, check for ways to contribute (war room + active tasks)
  - Contribution rules: be additive, do not spam (default 0–2 posts per wake unless urgent)
  - If tagged/DM'd, respond first (before proposing new work)
  - Bounded context rule: never read endless history; prefer "last N messages" and "recent task events"
  - If you find actionable work, either:
    - comment on an active task thread, or
    - propose a small task for approval, or
    - post one concise war room message
  - Always make work visible: link outputs, write a task event, or post to war room
  - If capabilities_contract is provided, reference it for available endpoints
  - If capabilities_contract is empty, include: "Ask what the war room is and how to read it."

Output only the SOUL.md content. No code blocks. No extra commentary.

You MUST call the \`generate_soul\` function with the generated document.`;

const USER_SYSTEM_PROMPT = `You are an expert OpenClaw agent configurator. Generate a USER.md that gives an agent the right context about the human user (Zack) and how to work with them, but only what's relevant to this agent's role in this project.

Inputs you will be given:
- Agent role and responsibilities
- Project name, mission (optional), overview (required)
- Communication surface (optional)
- House rules (optional)

Hard requirements:
- Output MUST be valid Markdown.
- Title must be exactly: "USER.md"
- Keep it concise and role-specific.
- Include:
  - User name: Zack
  - Timezone: America/New_York
- Include Preferences:
  - Fast execution, minimal drama
  - Plain text messages
  - No Markdown headers in messages to Zack (no lines starting with \`#\` or \`##\`)
- Include an Interrupt Policy tailored to the agent's role:
  - When to interrupt immediately (security/privacy risk, money impact, external outreach/calls/emails, destructive changes, unclear instruction)
  - When to batch updates instead
- Include Task Output Format:
  - Default: 1–3 bullets, include links, end with "Next action"
  - Keep it easy to skim
- Include Blockers / Missing Access:
  - What to do when missing tools/credentials/access
  - Ask a specific question or propose a next-best step
  - Do not stall silently
- Include Interrupt / Participation:
  - When to speak in war room vs when to ping Zack directly
  - Default: don't interrupt Zack; post updates where the project prefers
  - Interrupt only on urgent/high-impact items (security, money, external actions)

Output only the USER.md content. No code blocks. No extra commentary.

You MUST call the \`generate_user\` function with the generated document.`;

const DESCRIPTION_SYSTEM_PROMPT = `You are writing a one-to-two sentence description for an agent card in an admin dashboard.

Hard requirements:
- 1–2 sentences only.
- No hype. No buzzwords.
- Must clearly say what the agent does and what it outputs.
- Must mention cadence if provided ("daily digest", "hourly scan"), otherwise omit.

Output example:
"Tracks OpenClaw releases/PRs and proposes 1–3 concrete dashboard tasks per day with links and effort estimates."`;

const AGENTS_DOC_SYSTEM_PROMPT = `You are an expert OpenClaw agent configurator. Generate an AGENTS.md (operating rules handbook) for a specific agent.

Inputs you will be given:
- Agent name, role, and responsibilities
- Project name, mission (optional), overview (optional)
- House rules (optional)

Hard requirements:
- Output MUST be valid Markdown.
- Title must be exactly: "AGENTS.md — <AgentName>"
- This is the "company handbook" for the agent — universal operating instructions.
- Include:
  - What "done" looks like for this agent's work
  - Where to store outcomes (task events, war room, documents)
  - How to check tools before saying "I can't"
  - Default escalation path (when to ask vs when to proceed)
  - Communication rules (where to post updates, when to stay quiet)
  - Quality bar (what counts as a useful contribution)
- Keep it concise and actionable. Bullet rules, not paragraphs.
- DO NOT duplicate SOUL.md content (personality/vibe). This is purely operational.

Output only the AGENTS.md content. No code blocks. No extra commentary.

You MUST call the \`generate_agents_doc\` function with the generated document.`;

// ── Types ──────────────────────────────────────────────────────────────

interface GenerateInput {
  agentName: string;
  purposeText: string;
  roleShort?: string;
  globalSoul: string;
  globalUser: string;
  projectName?: string;
  projectPurpose?: string;
  projectOverview?: string;
  projectMission?: string;
  houseRules?: string;
  capabilitiesContract?: string;
  docTypes?: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────

function buildUserMessage(input: GenerateInput): string {
  const parts: string[] = [];

  // Project context
  if (input.projectName) {
    parts.push(`Project:\n- Name: ${input.projectName}`);
    if (input.projectPurpose) parts.push(`- Purpose: ${input.projectPurpose}`);
  }

  if (input.projectOverview) {
    parts.push(`\n--- Project Overview ---\n${input.projectOverview.substring(0, 12000)}`);
  }

  if (input.projectMission) {
    parts.push(`\n--- Project Mission ---\n${input.projectMission.substring(0, 4000)}`);
  }

  if (input.houseRules) {
    parts.push(`\n--- House Rules ---\n${input.houseRules.substring(0, 8000)}`);
  }

  if (input.capabilitiesContract) {
    parts.push(`\n--- Capabilities Contract ---\n${input.capabilitiesContract.substring(0, 8000)}`);
  }

  // Agent context
  parts.push(`\nAgent:\n- Name: ${input.agentName}`);
  if (input.roleShort) parts.push(`- role_short: ${input.roleShort}`);
  parts.push(`- purpose_text (responsibilities): ${input.purposeText}`);

  // Global templates as style reference
  if (input.globalSoul) {
    parts.push(`\n--- Global SOUL.md (style reference) ---\n${input.globalSoul.substring(0, 12000)}`);
  }
  if (input.globalUser) {
    parts.push(`\n--- Global USER.md (reference) ---\n${input.globalUser.substring(0, 8000)}`);
  }

  parts.push(`\nConstraints:\n- Messages to Zack must be plain text (no markdown headers).`);

  return parts.join("\n");
}

/** Make a single OpenAI call with tool calling for structured output (single string field). */
async function callWithTool(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  toolName: string,
  fieldName: string,
  fieldDesc: string,
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: toolName,
            description: `Output the generated ${fieldName} document`,
            parameters: {
              type: "object",
              properties: {
                [fieldName]: { type: "string", description: fieldDesc },
              },
              required: [fieldName],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: toolName } },
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const errorText = await response.text();
    console.error(`OpenAI error (${toolName}):`, status, errorText);
    if (status === 429 || status === 402) {
      throw new Error("rate_limit");
    }
    throw new Error(`OpenAI error: ${status}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.function.name !== toolName) {
    throw new Error(`No tool call in response for ${toolName}`);
  }
  const parsed = JSON.parse(toolCall.function.arguments);
  return parsed[fieldName] || "";
}

/** Make a simple completion call (no tool calling) for the description. */
async function callSimple(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.5,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    const errorText = await response.text();
    console.error("OpenAI error (description):", status, errorText);
    if (status === 429 || status === 402) throw new Error("rate_limit");
    throw new Error(`OpenAI error: ${status}`);
  }

  const data = await response.json();
  return (data.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");
}

// ── Main handler ───────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, reason: "no_api_key" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const input = (await req.json()) as GenerateInput;

    if (!input.agentName || !input.purposeText) {
      return new Response(
        JSON.stringify({ error: "agentName and purposeText are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userMessage = buildUserMessage(input);
    const requestedDocs = input.docTypes || ['soul', 'user'];

    // Build parallel calls based on requested doc types
    const calls: Promise<[string, string]>[] = [];

    if (requestedDocs.includes('soul')) {
      calls.push(
        callWithTool(OPENAI_API_KEY, SOUL_SYSTEM_PROMPT, userMessage, "generate_soul", "soul", "Complete SOUL.md content")
          .then(r => ['soul', r] as [string, string])
      );
    }
    if (requestedDocs.includes('user')) {
      calls.push(
        callWithTool(OPENAI_API_KEY, USER_SYSTEM_PROMPT, userMessage, "generate_user", "user", "Complete USER.md content")
          .then(r => ['user', r] as [string, string])
      );
    }
    if (requestedDocs.includes('agents')) {
      calls.push(
        callWithTool(OPENAI_API_KEY, AGENTS_DOC_SYSTEM_PROMPT, userMessage, "generate_agents_doc", "agents_doc", "Complete AGENTS.md content")
          .then(r => ['agents', r] as [string, string])
      );
    }

    // Always generate description if soul or user is requested
    const needsDescription = requestedDocs.includes('soul') || requestedDocs.includes('user');
    if (needsDescription) {
      calls.push(
        callSimple(OPENAI_API_KEY, DESCRIPTION_SYSTEM_PROMPT, userMessage)
          .then(r => ['description', r] as [string, string])
      );
    }

    const results = await Promise.all(calls);
    const output: Record<string, string> = { success: 'true' };
    for (const [key, value] of results) {
      output[key] = value;
    }

    return new Response(
      JSON.stringify({ success: true, ...output }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-agent-docs error:", error);

    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "rate_limit") {
      return new Response(
        JSON.stringify({ success: false, reason: "rate_limit" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
