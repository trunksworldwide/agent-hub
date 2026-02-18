

# OpenClaw Anatomy Integration

## Overview

Add a reference cheat sheet to the Knowledge page and enrich the agent detail tabs with tooltips, so operators can quickly understand and navigate the OpenClaw file system. Also expand the "Generate with AI" capability to cover additional doc types.

---

## Part A: Anatomy Cheat Sheet on Knowledge Page

**File: `src/components/documents/AnatomyCheatSheet.tsx`** (new)

A collapsible card listing all OpenClaw doc types with info-icon tooltips. Each item that maps to an agent tab includes a short description and what goes there. Structure:

| Doc | Tooltip | Links to |
|-----|---------|----------|
| SOUL.md | Personality, behavior rules, and boundaries | Agent > Soul tab |
| IDENTITY.md | Agent name, role, and avatar identity | Agent > Overview tab |
| USER.md | Operator preferences, timezone, formatting | Agent > User tab |
| AGENTS.md | Operating rules and handbook | (future: brain_docs) |
| TOOLS.md | Environment-specific apps, APIs, device notes | Agent > Tools tab |
| MEMORY.md | Durable decisions, lessons, runbooks | Agent > Memory tab |
| SKILLS.md | How-to playbooks per capability | Agent > Skills tab |
| HEARTBEAT.md | Periodic wake check-in instructions | Schedule page |
| Cron jobs | Scheduled wake-ups at exact times | Schedule page |

Uses existing `Collapsible`, `Card`, and `InfoTooltip` components. No new dependencies.

**File: `src/components/pages/DocumentsPage.tsx`** (edit)

Insert `<AnatomyCheatSheet />` between the Project Overview card and the Recent Changes card (around line 318).

---

## Part B: Tooltips on Agent Tabs

**File: `src/components/AgentDetail.tsx`** (edit)

The agent tabs already have tooltip text defined in the `agentTabs` array (lines 22-30) and render `InfoTooltip` next to each tab label. These will be updated to use the canonical OpenClaw Anatomy descriptions:

- soul: "Defines the agent's personality, behavior rules, and boundaries (SOUL.md)."
- user: "Who the operator is: preferences, timezone, formatting rules (USER.md)."
- memory: "Durable long-term memory: decisions, lessons learned, runbooks (MEMORY.md)."
- tools: "Environment-specific notes: apps, APIs, device names (TOOLS.md)."
- skills: "Installed capabilities and how-to playbooks (SKILLS.md)."
- overview: "Agent profile, purpose, doc status, and quick actions."
- sessions: "Active and previous sessions for status and messaging."

---

## Part C: Expand Brain Docs to Support AGENTS.md

Currently `AgentFile['type']` supports `'soul' | 'agents' | 'user' | 'memory_long' | 'memory_today'`. The `'agents'` type already exists but has no dedicated editor tab.

**File: `src/components/agent-tabs/AgentsDocEditor.tsx`** (new)

A simple markdown editor (same pattern as SoulEditor) for the `agents` doc type. Title: "AGENTS.md -- Operating Rules". Uses `getAgentFile(agentId, 'agents')` and `saveAgentFile(agentId, 'agents', content)` which already work.

**File: `src/lib/store.ts`** (edit)

No change needed -- `AgentTab` type and tabs array are defined in `AgentDetail.tsx`, not in the store. The store `AgentTab` type will be extended to include `'agents_doc'`.

Wait -- looking more carefully, `AgentTab` is defined in `store.ts` line 13. It needs to be extended:

```
export type AgentTab = 'overview' | 'soul' | 'user' | 'memory' | 'tools' | 'skills' | 'sessions' | 'agents_doc';
```

**File: `src/components/AgentDetail.tsx`** (edit)

Add a new tab entry in the `agentTabs` array:
```
{ id: 'agents_doc', label: 'Handbook', icon: '📖', tooltip: 'Operating rules and universal instructions (AGENTS.md).' }
```

Add the case in `renderTabContent()`:
```
case 'agents_doc':
  return <AgentsDocEditor />;
```

---

## Part D: "Generate with AI" for Individual Doc Types

The existing `generateAgentDocs` edge function generates SOUL.md and USER.md together. We will add a lightweight wrapper that can generate a single doc type on demand, reusing the same edge function but allowing per-doc invocation.

**File: `src/components/agent-tabs/AgentsDocEditor.tsx`** (new, included from Part C)

Include a "Generate with AI" button that:
1. Calls `generateAgentDocs(agentKey)` (existing)
2. Since the edge function doesn't currently produce AGENTS.md content, we add a new optional `docTypes` parameter to the edge function request body
3. Falls back gracefully if the edge function doesn't support it yet

**File: `supabase/functions/generate-agent-docs/index.ts`** (edit)

Add support for generating AGENTS.md content. Add a new system prompt `AGENTS_DOC_SYSTEM_PROMPT` that produces operating rules based on project context. When `docTypes` includes `'agents'`, generate and return an `agents` field in the response.

This is additive -- existing callers that don't pass `docTypes` get the same behavior (soul + user only).

---

## Part E: Project Rulebook Document

**File: `src/components/documents/ProjectOverviewCard.tsx`** (edit)

Add a third section below Mission and Overview: "Project Rulebook". This is stored as a `brain_docs` row with `doc_type = 'project_rules'` and `agent_key = 'project'`.

Uses the same edit/save pattern as Mission and Overview. Include a pin toggle so it appears in context packs.

**Database migration**: Add `'project_rules'` to the `brain_docs_doc_type_check` constraint (it currently allows: soul, agents, user, memory_long, memory_today, mission, project_overview, capabilities, project_mission).

**File: `src/lib/api.ts`** (edit)

Add `getProjectRulebook()` and `saveProjectRulebook()` functions, following the same pattern as `getProjectMission()` / `saveProjectMission()`.

---

## Part F: Documentation

**File: `changes.md`** (edit)

Log all changes with date and descriptions.

---

## Summary of Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/components/documents/AnatomyCheatSheet.tsx` | New | Collapsible cheat sheet card |
| `src/components/pages/DocumentsPage.tsx` | Edit | Import and render AnatomyCheatSheet |
| `src/components/AgentDetail.tsx` | Edit | Update tooltip text, add agents_doc tab |
| `src/lib/store.ts` | Edit | Extend AgentTab type |
| `src/components/agent-tabs/AgentsDocEditor.tsx` | New | Editor for AGENTS.md |
| `src/components/documents/ProjectOverviewCard.tsx` | Edit | Add Project Rulebook section |
| `src/lib/api.ts` | Edit | Add getProjectRulebook/saveProjectRulebook, extend AgentFile type |
| `supabase/functions/generate-agent-docs/index.ts` | Edit | Add AGENTS.md generation support |
| `changes.md` | Edit | Log changes |
| DB migration | New | Add 'project_rules' to doc_type check constraint |

## What This Does NOT Change

- No redesign of existing pages or components
- No changes to provisioning flow
- No changes to brain-doc-sync behavior
- No changes to existing Soul/User/Memory editors
- IDENTITY.md and HEARTBEAT.md remain informational references in the cheat sheet (not new editor tabs -- IDENTITY maps to the existing Overview tab, HEARTBEAT maps to the Schedule page)

