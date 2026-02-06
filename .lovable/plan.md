
# Context Flow Architecture: Complete Implementation Plan

## Executive Summary

This plan implements a **centralized, predictable context system** for ClawdOS that ensures every agent receives exactly the right information at the right time—without bloating context windows or relying on agents to "remember" to fetch things.

The core principle: **Context Pack is generated centrally and attached to task execution events.** Documents are stored and indexed once; the Context Pack is the curated, minimal bundle delivered at runtime.

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONTEXT FLOW HIERARCHY                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   PROJECT OVERVIEW (brain_docs.doc_type = 'project_overview')               │
│   └── "What is this project about?" - shown at top of Knowledge page        │
│                                                                             │
│   GLOBAL DOCUMENTS (project_documents.agent_key = NULL)                     │
│   └── Available to ALL agents in project                                    │
│       └── Pinned = always in Context Pack                                   │
│       └── Unpinned = available on-demand                                    │
│                                                                             │
│   AGENT-SPECIFIC DOCUMENTS (project_documents.agent_key = 'agent:X:main')   │
│   └── Available only to THAT agent                                          │
│       └── Pinned = always in that agent's Context Pack                      │
│       └── Unpinned = available on-demand                                    │
│                                                                             │
│   SOUL TEMPLATE (brain_docs.doc_type = 'agent_soul_template')               │
│   └── Used when creating new agents - includes Context Pack rule            │
│                                                                             │
│   RECENT CHANGES (generated on-demand from activities)                      │
│   └── Always included in Context Pack                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema Changes

### 1.1 Extend `project_documents` Table

Add columns for scoping and context pack inclusion:

```sql
-- Add agent scoping: NULL = global, specific key = agent-only
ALTER TABLE project_documents ADD COLUMN agent_key TEXT DEFAULT NULL;

-- Pin/always-load flag: pinned docs go in every Context Pack
ALTER TABLE project_documents ADD COLUMN pinned BOOLEAN DEFAULT false;

-- Document type classification for extraction behavior
ALTER TABLE project_documents ADD COLUMN doc_type TEXT DEFAULT 'general';
-- Values: general, playbook, reference, credentials, style_guide

-- Sensitivity flag: credentials docs get pointer-only treatment
ALTER TABLE project_documents ADD COLUMN sensitivity TEXT DEFAULT 'normal';
-- Values: normal, contains_secrets

-- Structured extraction (populated on upload, one-time AI cost)
ALTER TABLE project_documents ADD COLUMN doc_notes JSONB DEFAULT NULL;
-- Structure: { summary: string[], key_facts: string[], rules: string[], keywords: string[] }

-- Index for Context Pack queries
CREATE INDEX idx_project_docs_agent ON project_documents(project_id, agent_key);
CREATE INDEX idx_project_docs_pinned ON project_documents(project_id, pinned) WHERE pinned = true;
```

### 1.2 Extend `brain_docs` for Project-Level Documents

Brain docs already supports `agent_key = NULL` for project-wide docs. Add new doc_type values:

- `project_overview` — the project description/brief
- `agent_soul_template` — editable template for new agent SOULs
- `project_user` — project-wide USER.md (shared preferences)

No schema change needed—just use new doc_type values.

### 1.3 Add Context Pack Snapshot (Optional, for Auditing)

```sql
-- Optional: store the context pack delivered with each task start
ALTER TABLE tasks ADD COLUMN context_snapshot JSONB DEFAULT NULL;
-- Stores: { built_at, docs_included: [{id, title, type}], project_overview_preview, recent_changes_preview }
```

---

## Phase 2: Document Extraction Pipeline

### 2.1 New Edge Function: `extract-document-notes`

One-time extraction when a document is created/uploaded. Produces structured notes, not narrative summaries.

**Input:**
```json
{
  "document_id": "uuid",
  "title": "Meta Ads Playbook",
  "content": "...",
  "doc_type": "playbook"
}
```

**Output (stored in `doc_notes`):**
```json
{
  "summary": ["5-10 bullet points"],
  "key_facts": ["Entity: Meta Ads", "Budget: $50k/month"],
  "rules": ["Never pause campaigns without approval", "Always A/B test creatives"],
  "keywords": ["meta", "ads", "facebook", "marketing"],
  "extracted_at": "2026-02-06T..."
}
```

**Why structured extraction?**
- Reduces misses vs. prose summaries
- Enables precise retrieval (search by keywords, filter by rules)
- One-time cost per document, not per task

### 2.2 Sensitivity Detection

For documents containing credentials:
- Set `sensitivity = 'contains_secrets'`
- Context Pack includes pointer only: "Credentials in 'Meta Ads Login'"
- Never include actual secrets in Context Pack

---

## Phase 3: Context Pack Builder

### 3.1 Core Function: `buildContextPack()`

Located in `src/lib/context-pack.ts`:

```typescript
interface ContextPack {
  builtAt: string;
  projectOverview: string;           // Short project description
  globalDocs: DocReference[];        // Pinned global docs (notes + link)
  agentDocs: DocReference[];         // Pinned agent-specific docs
  recentChanges: string;             // Last 10-20 activities summarized
  taskContext?: string;              // Thread highlights for this task
}

interface DocReference {
  id: string;
  title: string;
  docType: string;
  notes: string[];                   // Extracted summary bullets
  rules: string[];                   // Extracted constraints
  isCredential: boolean;             // If true, no content included
}

async function buildContextPack(
  projectId: string,
  agentKey: string,
  taskId?: string
): Promise<ContextPack>
```

### 3.2 What Gets Included

1. **Always included:**
   - Project overview (from `brain_docs` where `doc_type = 'project_overview'`)
   - Recent changes (generated from last 20 activities)

2. **Pinned documents (max 10 total):**
   - Global pinned docs (`agent_key = NULL`, `pinned = true`)
   - Agent-specific pinned docs (`agent_key = agentKey`, `pinned = true`)
   - Include `doc_notes.summary` and `doc_notes.rules`, not full content
   - For credential docs, include title/pointer only

3. **Task-specific (if taskId provided):**
   - Task description
   - Thread highlights (recent comments)

### 3.3 Output Format (Text for LLM)

```markdown
# Context Pack for Agent: Research
Built: 2026-02-06T10:30:00Z

## Project: Front Office
AI assistant management for personal productivity and business operations.

## Recent Changes
- [10:15] Completed task "Update Meta Ads targeting"
- [09:30] Created document "Q1 Marketing Plan"
- [09:00] Agent Trunks started shift

## Reference Documents

### Global Knowledge
- **Meta Ads Playbook** (playbook)
  - Budget: $50k/month across 3 accounts
  - Never pause campaigns without approval
  - Always A/B test creatives

- **Brand Voice Guide** (style_guide)
  - Casual but professional tone
  - Avoid jargon, prefer clarity

### Your Knowledge (Research)
- **Research Methodology** (reference)
  - Use 3+ sources for any claim
  - Cite sources in footnotes

### Credential References
- Meta Ads Login (see document for credentials)
- AWS Access Keys (see document for credentials)
```

---

## Phase 4: Agent Creation with Default Brain Docs

### 4.1 SOUL Template System

Store an editable template in `brain_docs`:
- `project_id` = current project
- `agent_key` = NULL (project-wide)
- `doc_type` = 'agent_soul_template'

**Default template content:**

```markdown
# SOUL.md - {{AGENT_NAME}}

> {{AGENT_PURPOSE}}

## Core Behavior

### Context Awareness
Before acting on any task, you receive a **Context Pack** containing:
- Project overview and goals
- Relevant documents assigned to you
- Recent changes in the project
- Task-specific context

Read and apply this context. Do not assume information not provided.

### Communication
- Be direct and clear
- Match the project's communication style
- Ask clarifying questions when context is insufficient

## Your Role
{{AGENT_ROLE_DETAILS}}

## Tools Available
{{TOOLS_LIST}}
```

### 4.2 Updated Agent Creation Flow

When "Create Agent" is clicked:

1. Generate `agent_key` from name (existing logic)
2. Fetch SOUL template from `brain_docs`
3. Replace variables:
   - `{{AGENT_NAME}}` → agent name
   - `{{AGENT_PURPOSE}}` → purpose field
   - `{{AGENT_ROLE_DETAILS}}` → expanded from purpose
   - `{{TOOLS_LIST}}` → "Default tools enabled" (v1)
4. Create `brain_docs` rows:
   - `doc_type = 'soul'`, `agent_key = new_key`
   - Optionally: `doc_type = 'memory_long'` (blank)
5. Create agent roster row (existing)
6. Create agent_status row (existing)
7. Open agent detail panel

### 4.3 Optional: AI-Enhanced SOUL Generation

If `OPENAI_API_KEY` is configured:
- "Enhance with AI" button in agent creation dialog
- Takes name + purpose, generates richer SOUL content
- Uses template as base, expands role details

---

## Phase 5: UI Changes

### 5.1 Documents Page Updates

**A) Project Overview Section (Top of Page)**

```
┌─────────────────────────────────────────────────────────────────┐
│ 📋 Project Overview                                    [Edit]   │
├─────────────────────────────────────────────────────────────────┤
│ Front Office is an AI-powered personal assistant system        │
│ managing productivity, communications, and business ops.       │
│                                                                 │
│ This overview is included in every agent's context.            │
└─────────────────────────────────────────────────────────────────┘
```

**B) Document Scoping in Add Dialog**

Add to `AddDocumentDialog`:
- **Scope** dropdown: "All Agents (Global)" | "Specific Agent: [dropdown]"
- **Pin to Context Pack** toggle (with info tooltip)
- **Document Type** dropdown: General, Playbook, Reference, Credentials, Style Guide

**C) Document List Visual Updates**

Show badges:
- 📌 for pinned docs
- 🔒 for credential docs
- Agent emoji for agent-specific docs

**D) SOUL Template Editor**

New section in Documents or Settings:
- Edit the project's agent SOUL template
- Preview with variable placeholders
- "Reset to Default" button

### 5.2 Agent Creation Dialog Updates

**Current fields:**
- Name, Purpose, Emoji, Color

**Add:**
- Tools selection (v1: display only, future: affects SOUL)
- "Preview SOUL" expandable section showing generated content
- Optional "Enhance with AI" button

### 5.3 Task Detail: Context Pack Preview (Optional)

Add collapsible section showing what context was/will be delivered:
- List of included documents
- Recent changes preview
- "View Full Context Pack" button

---

## Phase 6: Integration Points

### 6.1 Where Context Pack Gets Consumed

The executor (Mac mini) should call `buildContextPack()` when:
1. A task is assigned to an agent
2. A cron job triggers work
3. An agent starts a new session

**Implementation options:**
- **API Endpoint**: New edge function `get-context-pack` that executor calls
- **Task Table Field**: Store snapshot when task moves to `in_progress`
- **Real-time**: Executor subscribes to task changes, builds pack on assignment

**Recommended v1:** Edge function that executor calls:

```typescript
// supabase/functions/get-context-pack/index.ts
// Input: { projectId, agentKey, taskId? }
// Output: { contextPack: ContextPack, markdown: string }
```

### 6.2 Sync Considerations

The existing `brain-doc-sync.mjs` handles SOUL/USER/MEMORY sync. For context pack:
- No sync needed—it's generated on-demand
- Project overview syncs as `doc_type = 'project_overview'` in brain_docs

---

## Phase 7: Keeping Context Windows Small

### Hard Limits (Enforced)

| Item | Limit | Rationale |
|------|-------|-----------|
| Pinned docs per agent | 10 | Prevent context bloat |
| Doc summary bullets | 10 | Focus on key points |
| Recent changes | 20 | Enough context, not overwhelming |
| Full doc text | Never auto-included | Always notes + pointer |

### UI Enforcement

- Warn when pinning 11th document
- Show estimated context size in UI
- Allow "Expand full doc" as explicit action

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/...` | Create | Add columns to `project_documents` |
| `src/lib/context-pack.ts` | Create | Context Pack builder function |
| `src/lib/api.ts` | Edit | Add doc scoping, template CRUD |
| `supabase/functions/extract-document-notes/` | Create | One-time doc extraction |
| `supabase/functions/get-context-pack/` | Create | Executor-callable endpoint |
| `src/components/documents/AddDocumentDialog.tsx` | Edit | Add scope/pin/type fields |
| `src/components/documents/DocumentList.tsx` | Edit | Show scope/pin badges |
| `src/components/pages/DocumentsPage.tsx` | Edit | Add Project Overview section |
| `src/components/pages/AgentsPage.tsx` | Edit | Create brain_docs on agent create |
| `src/components/settings/SoulTemplateEditor.tsx` | Create | Template editing UI |
| `docs/CONTEXT-FLOW.md` | Create | Architecture documentation |
| `changes.md` | Edit | Document the feature |

---

## Implementation Order

### Batch 1: Database + Core Logic
1. Database migration (add columns)
2. Create `context-pack.ts` builder
3. Create `get-context-pack` edge function
4. Update `createAgent` to generate SOUL from template

### Batch 2: Document Extraction
5. Create `extract-document-notes` edge function
6. Call extraction on document create/upload
7. Update document APIs to handle new fields

### Batch 3: UI Updates
8. Update `AddDocumentDialog` with scope/pin/type
9. Update `DocumentList` with badges
10. Add Project Overview section to DocumentsPage
11. Create SOUL Template editor

### Batch 4: Integration + Docs
12. Create `docs/CONTEXT-FLOW.md`
13. Update `changes.md`
14. Test end-to-end flow

---

## Success Criteria

1. **New agents get working SOUL** with Context Pack rule built-in
2. **Documents can be scoped** to global or specific agent
3. **Pinned docs appear in Context Pack** (notes, not full text)
4. **Credential docs** show pointer only, never secrets
5. **Context Pack is generated centrally** and available via edge function
6. **Context size is predictable** — never unbounded

---

## Future Enhancements (Not in This Plan)

- Semantic search / embeddings for relevant doc retrieval
- Tool/skill gating in SOUL generation
- Context Pack analytics (what docs get used?)
- Multi-project context sharing
- Agent-to-agent context handoff
