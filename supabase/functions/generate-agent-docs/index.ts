import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Per-doc system prompts (verbatim from user specs) ──────────────────

const SOUL_SYSTEM_PROMPT = `You are an expert OpenClaw agent configurator. You write SOUL.md files.

Write a SOUL.md for a specific agent working inside a specific project. The goal is to produce a practical operating manual that shapes the agent's behavior (tone, defaults, boundaries, and workflow). It must be consistent with the project's global SOUL style, but specialized for this agent's role.

Hard requirements:
- Output MUST be valid Markdown.
- Keep it short and sharp. No fluff. If a rule isn't actionable, delete it.
- Include: "Answer first", "Brevity", "Strong opinions", "Be useful before asking", "Call it out", "Humor allowed", "Swearing allowed when it lands", "Don't be corporate".
- Include safety boundaries: do not take external actions unless explicitly asked; protect private data; don't spam group chats.
- IMPORTANT: The agent must NOT use Markdown headers in messages to Zack (no lines starting with \`#\`/\`##\`). This is a messaging formatting rule, not a file formatting rule.
- Prefer bullet rules over paragraphs.
- Keep it compatible with a dashboard/editor workflow (no giant essays).
- Add a short "How I report findings" section tailored to the agent.

Style requirements:
- Mirror the vibe of the global SOUL template.
- Do not copy it verbatim. Specialize it to the agent's purpose.
- No generic corporate language.

Output format:
- Title line: "SOUL.md — <AgentName>"
- Sections: Operating Rules, Boundaries, Vibe, Reporting

You MUST call the \`generate_soul\` function with the generated document.`;

const USER_SYSTEM_PROMPT = `You are an expert OpenClaw agent configurator. You write USER.md files.

Write a USER.md that gives the agent the right context about the human (Zack) and how to work with them, but only what's relevant for this agent's role. It should be consistent with the global USER template, but narrower and purpose-specific.

Hard requirements:
- Output MUST be valid Markdown.
- Keep it concise and role-specific.
- Include the user's name (Zack) and timezone (America/New_York).
- Include communication preferences (fast execution, minimal drama; plain text messages; no markdown headers in messages).
- Include "When to interrupt Zack" rules tailored to the agent's job.
- Include "What to do when blocked" (e.g., missing web search key, missing access).
- Do not include sensitive/private details that aren't necessary for the agent's job.

Output format:
- Title: "USER.md"
- Sections: User, Preferences, Interrupt Policy, Task Output Format, Blockers

You MUST call the \`generate_user\` function with the generated document.`;

const MEMORY_SYSTEM_PROMPT = `You are an expert OpenClaw agent configurator. You write initial MEMORY.md seed templates.

Write a starter long-term memory template for a new agent. This is NOT a filled memory; it's a structured place to store durable facts over time.

Hard requirements:
- Output MUST be valid Markdown.
- Do not invent facts. Use placeholders when necessary.
- Keep it short and structured.
- Must include:
  - People (Zack)
  - Project facts (what this project is)
  - Agent-specific "Things to remember" categories tailored to the purpose
  - "Do not store secrets" reminder
- Include a small "Changelog / Decisions" section for durable decisions the agent learns.

Output format:
- Title: "MEMORY.md"
- Sections: People, Project, Preferences/Style, Running Notes, Decisions, Sources/Links

You MUST call the \`generate_memory\` function with the generated document.`;

const DESCRIPTION_SYSTEM_PROMPT = `You are writing a one-to-two sentence description for an agent card in an admin dashboard.

Hard requirements:
- 1–2 sentences only.
- No hype. No buzzwords.
- Must clearly say what the agent does and what it outputs.
- Must mention cadence if provided ("daily digest", "hourly scan"), otherwise omit.

Output example:
"Tracks OpenClaw releases/PRs and proposes 1–3 concrete dashboard tasks per day with links and effort estimates."`;

// ── Types ──────────────────────────────────────────────────────────────

interface GenerateInput {
  agentName: string;
  purposeText: string;
  roleShort?: string;
  globalSoul: string;
  globalUser: string;
  projectName?: string;
  projectPurpose?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

function buildUserMessage(input: GenerateInput): string {
  const parts: string[] = [];

  if (input.projectName) {
    parts.push(`Project:\n- Name: ${input.projectName}`);
    if (input.projectPurpose) parts.push(`- Purpose: ${input.projectPurpose}`);
  }

  parts.push(`\nAgent:\n- Name: ${input.agentName}`);
  if (input.roleShort) parts.push(`- role_short: ${input.roleShort}`);
  parts.push(`- purpose_text: ${input.purposeText}`);

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

    // Four parallel calls -- one per document type
    const [soul, user, memory, description] = await Promise.all([
      callWithTool(OPENAI_API_KEY, SOUL_SYSTEM_PROMPT, userMessage, "generate_soul", "soul", "Complete SOUL.md content (200-400 lines)"),
      callWithTool(OPENAI_API_KEY, USER_SYSTEM_PROMPT, userMessage, "generate_user", "user", "Complete USER.md content (150-300 lines)"),
      callWithTool(OPENAI_API_KEY, MEMORY_SYSTEM_PROMPT, userMessage, "generate_memory", "memory", "Complete MEMORY.md seed content (100-200 lines)"),
      callSimple(OPENAI_API_KEY, DESCRIPTION_SYSTEM_PROMPT, userMessage),
    ]);

    return new Response(
      JSON.stringify({ success: true, soul, user, memory, description }),
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
