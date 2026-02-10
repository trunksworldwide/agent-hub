
# AI-Powered Doc Override Generation + Disk Sync (Revised)

## Summary

Replace the current "copy global docs" override with AI-generated, purpose-tailored agent docs. Add a new `description` column (not clobber `role`). Sync doc changes to disk via Control API (disk-first when reachable). Add echo-loop protection.

## Database Migration

Add one column to `agents`:

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `description` | text | NULL | AI-generated 1-2 sentence blurb for agent cards |

No brain_docs schema change needed -- the unique constraint is already `(project_id, agent_key, doc_type)` (verified).

## New Edge Function: `generate-agent-docs`

Creates `supabase/functions/generate-agent-docs/index.ts` using the existing `OPENAI_API_KEY` secret (same pattern as `extract-document-notes`).

**Input:** `{ agentName, purposeText, globalSoul, globalUser }`

**Output (via tool calling / structured JSON):**
```text
{
  soul: string,       // max ~300 lines
  user: string,       // max ~200 lines
  memory: string,     // max ~150 lines
  description: string // 1-2 sentences for card display
}
```

**Prompt strategy:**
- System prompt: "You are an expert OpenClaw agent configurator. Given a global SOUL.md template and purpose, generate tailored agent documents."
- Enforces hard line limits (SOUL 200-400 lines, USER 150-300, MEMORY 100-200)
- Enforces project communication rules from global SOUL (e.g., no markdown headers in messages to Zack)
- Uses tool calling for structured output (same pattern as `extract-document-notes`)
- `description` is a clean 1-2 sentence blurb, NOT the long purpose

Register in `supabase/config.toml` with `verify_jwt = false`.

## API Changes (`src/lib/api.ts`)

### 1. Update `createDocOverride` to use AI generation

Current behavior: copies global content verbatim.

New behavior:
1. Fetch agent's `purpose_text` and `name` from `agents` table
2. Fetch global SOUL and USER templates from `brain_docs`
3. Call `generate-agent-docs` edge function
4. **Disk-first sync**: If Control API reachable, POST each file to `/api/agents/:agentKey/files/:type` (which writes disk + mirrors to Supabase with `updated_by='control_api'`). If unreachable, write to Supabase directly with `updated_by='dashboard'`.
5. Update `agents.description` with AI-generated blurb
6. Return `{ ok: true }`

### 2. Add `generateAgentDocs` function

New exported function that calls the edge function and returns the generated content. Used by both `createDocOverride` and a new "Regenerate Docs" button.

### 3. Add disk sync to `saveAgentFile`

After saving to Supabase, best-effort POST to Control API:
- Derive `agentIdShort` from `agentKey` (split on `:`, take index 1)
- POST to `/api/agents/:agentIdShort/files/:type` with content
- This uses the existing multi-agent file endpoint in `server/index.mjs` (already resolves `workspace_path` from Supabase)

**Write ordering (sync priority):**
- If Control API reachable: call Control API first (writes disk + mirrors Supabase with `updated_by='control_api'`), skip the Supabase write in `saveAgentFile`
- If Control API unreachable: write Supabase only (current behavior), disk catches up later

### 4. Add `description` to Agent interface

Add `description?: string | null` to the `Agent` type. Read it in `getAgents()`.

## Echo-Loop Protection

The existing architecture already has protections:
- `brain-doc-sync` uses a `lastLocal` hash map (line 46 of brain-doc-sync.mjs) to skip identical content
- `brain-doc-sync` only watches global docs (`agent_key IS NULL`), so agent-specific overrides never trigger it
- Control API file POST sets `updated_by='dashboard'` in its Supabase mirror
- `brain-doc-sync` compares remote `updated_at` vs local `mtimeMs` and skips if remote is newer

No additional changes needed -- the existing guards are sufficient because:
1. Agent-specific docs bypass brain-doc-sync entirely (it only watches `agent_key=null`)
2. Global docs edited via dashboard -> Supabase -> brain-doc-sync sees `updated_by='dashboard'` and writes to disk -> local watcher sees same content via `lastLocal` map -> no echo

## UI Changes

### `AgentsPage.tsx` -- card layout fix

- Card subtitle: `agent.role` (short stable label like "Research Agent")
- Card body: `agent.description` (AI-generated 1-2 sentences) -- with `line-clamp-3`
- `purposeText` stays in the agent detail view only, not on cards

### `AgentOverview.tsx` -- add "Regenerate Docs" button

- New button in the doc status section: "Regenerate with AI"
- Calls `generateAgentDocs()` then `createDocOverride()` for each type
- Shows a loading state during generation
- Preview step: NOT included in v1 (adds complexity). "Auto-apply" is the default. A preview step can be added later as a follow-up.

### `DocSourceBanner.tsx` -- update "Create override" to show generating state

- When clicked, shows "Generating with AI..." instead of "Creating..."
- On completion, triggers a reload of the doc editor content

## Control API (`server/index.mjs`)

No changes needed. The multi-agent file endpoints already exist (lines 526-621) and correctly:
- Resolve `workspace_path` from Supabase for non-trunks agents
- Write to disk
- Mirror to Supabase `brain_docs` with `updated_by='dashboard'`

## Files to create/modify

| File | Action |
|------|--------|
| `supabase/migrations/xxx_agent_description.sql` | Add `description` column to `agents` |
| `supabase/functions/generate-agent-docs/index.ts` | New edge function for AI doc generation |
| `supabase/config.toml` | Register new function |
| `src/lib/api.ts` | Update `createDocOverride`, add `generateAgentDocs`, add disk sync to `saveAgentFile`, add `description` to Agent |
| `src/components/agent-tabs/AgentOverview.tsx` | Add "Regenerate Docs" button |
| `src/components/agent-tabs/DocSourceBanner.tsx` | Update generating state |
| `src/components/pages/AgentsPage.tsx` | Fix card layout: role + description + remove purposeText from card |
| `changes.md` | Document changes |

## What this does NOT change

- No changes to `server/index.mjs` (endpoints already support multi-agent)
- No changes to `brain-doc-sync` (only watches global docs; echo protection already exists)
- No changes to `cron-mirror.mjs`
- No per-agent tool restrictions
- No preview-before-apply step (follow-up)
- `role` field is never overwritten by AI -- it stays as a stable short label
