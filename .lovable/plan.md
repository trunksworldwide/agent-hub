

# Upgrade System Prompts for SOUL.md and USER.md Generation

## What Changes

Replace the two system prompts in the `generate-agent-docs` edge function with the improved versions from your OpenClaw conversation, and expand the data payload to include project overview, capabilities contract, and house rules (when available).

## Changes

### 1. Edge Function: `supabase/functions/generate-agent-docs/index.ts`

**Replace `SOUL_SYSTEM_PROMPT`** with the new version that adds:
- Explicit input variable listing (agent name, role, responsibilities, project name/mission/overview, house rules, capabilities contract, shared links)
- New "Workflow" section requirement (how agent decides what to do, escalation)
- New "Capabilities I Can Use" section (summarize capabilities contract, or note if missing)
- Improved "Reporting" section (project chat vs task thread vs direct ping)
- Keeps all existing hard requirements (bullet rules, no markdown headers in messages, boundaries, etc.)

**Replace `USER_SYSTEM_PROMPT`** with the new version that adds:
- Interrupt Policy with specific triggers (security/privacy, money impact, external outreach, destructive changes, unclear instruction)
- Task Output Format (1-3 bullets, links, "Next action")
- Blockers section (ask a specific question or propose next-best step, do not stall silently)

**Remove `MEMORY_SYSTEM_PROMPT`** entirely (memory is excluded from generation now).

**Expand `GenerateInput` interface** to accept new optional fields:
- `projectOverview` (from `brain_docs` where `doc_type = 'project_overview'`)
- `projectMission` (can be derived from project overview or purpose)
- `houseRules` (from `brain_docs` where `doc_type = 'house_rules'`, if it exists)
- `capabilitiesContract` (from `brain_docs` where `doc_type = 'capabilities'`)

**Update `buildUserMessage`** to include all the new context fields in the user message payload.

**Remove the memory generation call** from `Promise.all` -- only generate soul, user, and description.

### 2. Client-side caller: `src/lib/api.ts` -- `generateAgentDocs`

**Expand the parallel data fetch** to also load:
- `project_overview` doc (already exists as a doc type)
- `capabilities` doc (already exists in the DB)
- `house_rules` doc (optional, may not exist yet)

**Pass these new fields** in the edge function invocation body.

**Remove `memory` from the return type** since it is no longer generated.

### 3. Remove memory references from `createDocOverride`

Already done in the previous fix -- just confirming no regressions.

## Technical Details

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/generate-agent-docs/index.ts` | Replace SOUL and USER system prompts; remove MEMORY prompt; expand input type and user message builder; remove memory from parallel calls |
| `src/lib/api.ts` | Fetch project_overview, capabilities, house_rules docs; pass them to edge function; remove memory from return type |

### Data Already Available in Supabase

- `brain_docs` with `doc_type = 'capabilities'` -- exists, has content
- `brain_docs` with `doc_type = 'project_overview'` -- table supports it (no row yet, handled gracefully)
- `brain_docs` with `doc_type = 'house_rules'` -- may not exist yet, handled as optional
- `agents` table has `role` and `purpose_text` columns -- already fetched

### New System Prompt Highlights

**SOUL.md prompt** now requires:
- "Workflow" section: how agent decides what to do, references project overview/mission/house rules, prioritizes small concrete wins, escalation rules
- "Capabilities I Can Use" section: actionable list from capabilities contract with "when to use each" guidance; fallback note if no contract provided
- "Reporting" section: when to use project chat vs task thread vs direct ping

**USER.md prompt** now requires:
- Interrupt Policy with 5 specific triggers (security, money, external outreach, destructive changes, unclear instructions)
- Task Output Format (1-3 bullets + links + "Next action")
- Blockers: ask a specific question or propose next-best step, never stall silently

