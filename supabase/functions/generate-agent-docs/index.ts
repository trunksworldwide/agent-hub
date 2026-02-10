import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GenerateInput {
  agentName: string;
  purposeText: string;
  globalSoul: string;
  globalUser: string;
}

interface GenerateOutput {
  soul: string;
  user: string;
  memory: string;
  description: string;
}

const SYSTEM_PROMPT = `You are an expert OpenClaw agent configurator. Your job is to generate tailored agent brain documents (SOUL.md, USER.md, MEMORY.md) based on a global template and the agent's specific purpose.

## Rules

1. **SOUL.md** (200-400 lines): The agent's personality, behavior rules, and role-specific instructions.
   - Preserve the project's communication style from the global SOUL template
   - Add role-specific guidance, decision-making frameworks, and boundaries
   - Include sections: Core Identity, Role & Responsibilities, Communication Style, Decision Framework, Boundaries & Constraints
   - CRITICAL: Preserve any "no markdown headers in messages" rules from the global SOUL
   - The agent should feel like a specialized team member, not a generic bot

2. **USER.md** (150-300 lines): What this agent needs to know about the user/operator.
   - Filter the global USER context to what's relevant for this agent's role
   - Add role-specific preferences (e.g., a research agent needs to know preferred sources)
   - Include sections: User Profile, Role-Relevant Preferences, Interaction Guidelines, Permissions & Access

3. **MEMORY.md** (100-200 lines): Seed template with role-appropriate sections.
   - Create empty-but-structured sections the agent will fill over time
   - Include sections relevant to the role (e.g., "Research Findings" for a research agent, "Code Patterns" for a coder)
   - Add a "Key Learnings" section and a "Working Notes" section

4. **description**: A clean 1-2 sentence blurb for display on agent cards. Not the full purpose — a concise, human-readable summary of what this agent does.

## Output Format

You MUST call the \`generate_agent_docs\` function with the generated documents.`;

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

    const { agentName, purposeText, globalSoul, globalUser } =
      (await req.json()) as GenerateInput;

    if (!agentName || !purposeText) {
      return new Response(
        JSON.stringify({ error: "agentName and purposeText are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userMessage = `Agent Name: "${agentName}"
Agent Purpose: "${purposeText}"

--- GLOBAL SOUL.md (reference template) ---
${(globalSoul || "").substring(0, 12000)}

--- GLOBAL USER.md (reference) ---
${(globalUser || "").substring(0, 8000)}

Generate tailored SOUL.md, USER.md, MEMORY.md, and a short description for this agent.`;

    const tools = [
      {
        type: "function" as const,
        function: {
          name: "generate_agent_docs",
          description:
            "Output the generated agent brain documents and description",
          parameters: {
            type: "object",
            properties: {
              soul: {
                type: "string",
                description:
                  "Complete SOUL.md content for this agent (200-400 lines)",
              },
              user: {
                type: "string",
                description:
                  "Complete USER.md content for this agent (150-300 lines)",
              },
              memory: {
                type: "string",
                description:
                  "Complete MEMORY.md seed content for this agent (100-200 lines)",
              },
              description: {
                type: "string",
                description:
                  "1-2 sentence card description (not the full purpose)",
              },
            },
            required: ["soul", "user", "memory", "description"],
          },
        },
      },
    ];

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          tools,
          tool_choice: {
            type: "function",
            function: { name: "generate_agent_docs" },
          },
          temperature: 0.7,
        }),
      }
    );

    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text();
      console.error("OpenAI error:", status, errorText);

      if (status === 429 || status === 402) {
        return new Response(
          JSON.stringify({ success: false, reason: "rate_limit" }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      throw new Error(`OpenAI error: ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== "generate_agent_docs") {
      throw new Error("No tool call in response");
    }

    const parsed = JSON.parse(toolCall.function.arguments) as GenerateOutput;

    return new Response(
      JSON.stringify({
        success: true,
        soul: parsed.soul || "",
        user: parsed.user || "",
        memory: parsed.memory || "",
        description: parsed.description || "",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-agent-docs error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
