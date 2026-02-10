

# Upgrade generate-agent-docs with Specialized Per-Doc Prompts

## What changes

Replace the single generic system prompt in the `generate-agent-docs` edge function with the four specialized prompts you provided. Instead of one OpenAI call that generates all four outputs via a single tool call, the function will make four parallel calls -- one per document type -- each with its own tailored system prompt.

## Why parallel calls instead of one big call

- Each prompt is focused and produces higher-quality output
- Line limits and style rules are enforced per-doc, not crammed into one mega-prompt
- The description generator is intentionally minimal (no tool call needed, just a short string)
- Parallel execution keeps latency roughly the same as the current single call

## Edge function changes (`supabase/functions/generate-agent-docs/index.ts`)

### New input shape

Add two new optional fields to the input:

```text
{
  agentName: string,
  purposeText: string,
  roleShort: string,         // NEW - short label like "Research Agent"
  globalSoul: string,
  globalUser: string,
  projectName?: string,      // NEW - e.g. "Front Office"
  projectPurpose?: string    // NEW - 1-2 sentence project description
}
```

### Four system prompts (verbatim from your specs)

1. **SOUL_SYSTEM_PROMPT** -- the SOUL.md generator prompt you provided (operating rules, boundaries, vibe, reporting)
2. **USER_SYSTEM_PROMPT** -- the USER.md generator prompt (user context, interrupt policy, blockers)
3. **MEMORY_SYSTEM_PROMPT** -- the MEMORY.md seed generator prompt (people, project, running notes, decisions)
4. **DESCRIPTION_SYSTEM_PROMPT** -- the 1-2 sentence agent card description prompt

### Four parallel OpenAI calls

Each call gets:
- Its own system prompt (from above)
- A shared user message containing: project name/purpose, agent name, role_short, purpose_text, global SOUL/USER templates, and org constraints
- SOUL/USER/MEMORY use tool calling for structured output (single string field each)
- Description uses a simple completion (no tool call needed, just extract the text)

All four calls run via `Promise.all` for parallelism.

### Response shape stays the same

```text
{ success: true, soul: "...", user: "...", memory: "...", description: "..." }
```

No changes needed to `src/lib/api.ts` or the UI -- they already consume this shape.

## API layer change (`src/lib/api.ts`)

### Pass `roleShort` to the edge function

The `generateAgentDocs` function currently only sends `agentName`, `purposeText`, `globalSoul`, `globalUser`. Update it to also fetch and send:
- `role` from the agents table (as `roleShort`)
- Project name from the projects table (as `projectName`)

This is a small addition to the existing fetch query.

## Files to modify

| File | Change |
|------|--------|
| `supabase/functions/generate-agent-docs/index.ts` | Replace single prompt with four specialized prompts; four parallel OpenAI calls |
| `src/lib/api.ts` | Pass `roleShort` and `projectName` to the edge function |

## What stays the same

- Response shape from the edge function (no breaking change)
- `createDocOverride` logic (disk-first sync, Supabase fallback)
- UI components (AgentOverview, DocSourceBanner)
- All other edge functions
- No new migrations needed
