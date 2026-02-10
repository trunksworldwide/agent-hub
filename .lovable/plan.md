

# Make Sub-Agent Detail View Distinct and Functional

## Problem

When you click on Ricky (or any sub-agent), the detail panel looks identical to Trunks because:

1. Ricky has zero agent-specific `brain_docs` rows -- Soul/User/Memory all fall back to Trunks' global docs
2. The long mission prompt is crammed into `agents.role` (which should be a short label like "Research Agent")
3. There is no way to tell whether you are viewing inherited global docs or agent-specific overrides
4. There are no "start working" controls (Run Once, Schedule Digest)
5. The sub-tabs (Soul, User, Memory, Tools, Skills, Sessions) are identical for every agent with no context about what is inherited vs overridden

## Changes

### 1. Database: add `purpose_text` column to `agents`

Add a new text column `purpose_text` (nullable) to hold the long mission prompt. Migrate Ricky's current `role` content into `purpose_text` and set `role` to a short label.

This keeps `role` as a short display label (shown on cards, headers) while `purpose_text` holds the full instructions.

### 2. Seed agent-specific brain_docs for Ricky

Insert agent-specific `brain_docs` rows for Ricky (`agent_key = 'agent:ricky:main'`) for `soul`, `user`, and `memory_long` doc types. Content will be generated from templates using Ricky's name and purpose. This ensures Ricky immediately has his own docs instead of falling back to Trunks' global docs.

### 3. AgentDetail header: show purpose and doc source indicator

Update `AgentDetail.tsx` to:
- Show `purpose_text` (truncated with expand) below the role label in the header
- Add an editable purpose textarea (inline edit with Save) so the user can update the mission prompt directly
- Display a small banner/badge on each doc tab indicating whether it is "Inherited (global)" or "Agent override", based on the `_globalRow` flag already returned by `getAgentFile`

### 4. Doc editors: show inherited vs override indicator + "Create Override" button

Update `SoulEditor`, `UserEditor`, and `MemoryEditor` to:
- Show a subtle banner in the toolbar: "Viewing global docs (shared with all agents)" when `source === 'global'`
- Add a "Create agent override" button that copies the current global content into a new agent-specific `brain_docs` row, then reloads
- Once overridden, show "Agent-specific docs" indicator instead
- This replaces the concept of a "Docs Mode toggle" with something more intuitive -- you see what you have, and can override when ready

### 5. Add "Start Working" controls to AgentDetail

Add a new section (or a new sub-tab called "Overview") at the top of the agent detail that shows:

**For all agents:**
- "Run Once" button: sends a cron run request targeting that agent (inserts into `cron_run_requests` or calls Control API directly)
- "Schedule Digest" button: opens a small dialog to create a daily cron job assigned to that agent (name: "Daily Digest -- {agent name}", default 9am, writes to Activities)

**For sub-agents specifically:**
- Purpose text (editable)
- Provisioning status
- Quick stats: number of assigned tasks, last activity time

### 6. Add "Overview" as the default tab for sub-agents

Add a new `AgentTab` value `'overview'` that shows the agent's profile, purpose, doc status, and action buttons. This is the landing tab when clicking a sub-agent.

For the primary agent (Trunks / `agent:main:main`), the default tab remains `soul` (existing behavior).

Tab content for Overview:
- Agent card (emoji, name, role, status)
- Purpose text (editable textarea + Save)
- Doc status summary: "Soul: inherited | User: inherited | Memory: inherited" with "Create overrides" action
- Action buttons: Run Once, Schedule Digest, Assign Task
- Recent activity for this agent (filtered from activities table)

### 7. API changes

**`src/lib/api.ts`:**
- Add `purposeText` to the `Agent` interface
- Read `purpose_text` in `getAgents()`
- Add `updateAgentPurpose(agentKey, purposeText)` function
- Add `createDocOverride(agentKey, docType)` function that copies global content to an agent-specific row
- Add `triggerAgentRun(agentKey)` function (queues a cron run request or calls Control API)

**`src/lib/store.ts`:**
- Add `'overview'` to the `AgentTab` type

### 8. Cron integration for "Schedule Digest"

When the user clicks "Schedule Digest", insert a row into `cron_create_requests` with:
- `name`: "Daily Digest -- {agent name}"
- `schedule_expr`: "0 9 * * *" (daily at 9am)
- `target_agent_key`: the agent's key
- `job_intent`: "digest"
- `instructions`: "Summarize new findings and propose 1-3 tasks"

The existing cron-mirror worker will pick this up.

## Files to modify

| File | Change |
|------|--------|
| `supabase/migrations/xxx_agent_purpose.sql` | Add `purpose_text` column, migrate Ricky's role, seed brain_docs rows |
| `src/lib/store.ts` | Add `'overview'` to AgentTab type |
| `src/lib/api.ts` | Add `purposeText` to Agent, new functions for override/run/schedule |
| `src/components/AgentDetail.tsx` | Add overview tab, purpose display, doc source indicators |
| `src/components/agent-tabs/AgentOverview.tsx` | New component: overview tab with purpose editor, doc status, action buttons |
| `src/components/agent-tabs/SoulEditor.tsx` | Add inherited/override banner + "Create override" button |
| `src/components/agent-tabs/UserEditor.tsx` | Same inherited/override banner |
| `src/components/agent-tabs/MemoryEditor.tsx` | Same inherited/override banner |
| `src/components/pages/AgentsPage.tsx` | Show short `role` on cards (not the long purpose text) |
| `changes.md` | Document changes |

## What this does NOT change

- No changes to the provisioning flow (already working)
- No changes to brain-doc-sync (approach B: Control API handles agent docs)
- No per-agent tool restrictions
- No AI-generated docs (template-based seeding for now)
- No redesign of the existing tab UI structure

