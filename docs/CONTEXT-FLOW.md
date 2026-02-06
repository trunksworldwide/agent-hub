# Context Flow Architecture

## Overview

ClawdOS implements a **centralized, predictable context system** that ensures every agent receives exactly the right information at the right time—without bloating context windows or relying on agents to "remember" to fetch things.

**Core Principle:** Context Pack is generated centrally and attached to task execution events. Documents are stored and indexed once; the Context Pack is the curated, minimal bundle delivered at runtime.

## Architecture Diagram

```
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

## Key Concepts

### 1. Document Scoping

Every document in `project_documents` has a scope:

| `agent_key` | Scope | Who sees it |
|-------------|-------|-------------|
| `NULL` | Global | All agents in the project |
| `agent:name:main` | Agent-specific | Only that specific agent |

### 2. Pinning

Documents can be **pinned** (`pinned = true`), which means they're automatically included in every Context Pack for their scope.

- **Pinned Global**: Included for all agents
- **Pinned Agent-specific**: Included only for that agent
- **Unpinned**: Stored but not auto-included (available on-demand)

### 3. Document Types

| Type | Purpose |
|------|---------|
| `general` | General knowledge, notes |
| `playbook` | Step-by-step procedures |
| `reference` | Technical specs, links, resources |
| `credentials` | Login info, API keys (handled specially) |
| `style_guide` | Voice, tone, brand guidelines |

### 4. Sensitivity

| `sensitivity` | Handling |
|---------------|----------|
| `normal` | Full notes included in Context Pack |
| `contains_secrets` | Only title/pointer included, never actual content |

## Context Pack

The Context Pack is a structured bundle generated on-demand when:
1. A task is assigned to an agent
2. A cron job triggers work
3. An agent starts a new session

### What's Included

1. **Always included:**
   - Project overview
   - Recent changes (last 20 activities)

2. **Pinned documents (max 10 total):**
   - Global pinned docs
   - Agent-specific pinned docs
   - Uses `doc_notes` (summary + rules), not full content
   - Credential docs show pointer only

3. **Task-specific (if taskId provided):**
   - Task description
   - Recent thread comments (last 5)

### Example Output

```markdown
# Context Pack
Built: 2026-02-06T10:30:00Z
Agent: agent:research:main

## Project Overview
Front Office is an AI-powered personal assistant system 
managing productivity, communications, and business ops.

## Recent Changes
- [10:15] Completed task "Update Meta Ads targeting" _(agent:trunks:main)_
- [09:30] Created document "Q1 Marketing Plan" _(dashboard)_
- [09:00] Agent Trunks started shift _(agent:trunks:main)_

## Global Knowledge
### Meta Ads Playbook (playbook)
- Budget: $50k/month across 3 accounts
- Never pause campaigns without approval
- Always A/B test creatives
**Rules:**
- Get approval before budget changes over $1000
- Document all targeting changes

### Brand Voice Guide (style_guide)
- Casual but professional tone
- Avoid jargon, prefer clarity

## Your Knowledge
### Research Methodology (reference)
- Use 3+ sources for any claim
- Cite sources in footnotes
```

## Document Extraction Pipeline

When a document is created/uploaded, the `extract-document-notes` edge function performs one-time AI extraction:

```json
{
  "summary": ["5-10 bullet points"],
  "key_facts": ["Entity: Meta Ads", "Budget: $50k/month"],
  "rules": ["Never pause campaigns without approval"],
  "keywords": ["meta", "ads", "facebook", "marketing"],
  "extracted_at": "2026-02-06T..."
}
```

This is stored in `project_documents.doc_notes` and used by Context Pack builder.

**Why structured extraction?**
- Reduces misses vs. prose summaries
- Enables precise retrieval
- One-time cost per document, not per task

## Agent Initialization

When an agent is created:

1. A SOUL.md is generated from the project's template (`brain_docs.doc_type = 'agent_soul_template'`)
2. Variables are replaced:
   - `{{AGENT_NAME}}` → agent name
   - `{{AGENT_PURPOSE}}` → purpose field
   - `{{AGENT_ROLE_DETAILS}}` → expanded from purpose
   - `{{TOOLS_LIST}}` → tool configuration
3. The SOUL includes the **Context Pack rule**: agents are instructed to read and apply context before acting

## API Endpoints

### Edge Function: `get-context-pack`

Executor-callable endpoint for retrieving context packs.

**Request:**
```json
{
  "projectId": "front-office",
  "agentKey": "agent:research:main",
  "taskId": "optional-task-uuid"
}
```

**Response:**
```json
{
  "contextPack": { /* ContextPack object */ },
  "markdown": "# Context Pack\n..."
}
```

### Edge Function: `extract-document-notes`

Called on document creation to extract structured notes.

**Request:**
```json
{
  "documentId": "uuid",
  "title": "Meta Ads Playbook",
  "content": "...",
  "docType": "playbook"
}
```

**Response:**
```json
{
  "success": true,
  "notes": {
    "summary": [...],
    "key_facts": [...],
    "rules": [...],
    "keywords": [...]
  }
}
```

## Hard Limits

To keep context windows small:

| Item | Limit |
|------|-------|
| Pinned docs per agent | 10 |
| Doc summary bullets | 10 |
| Recent changes | 20 |
| Full doc text | Never auto-included |

## Database Schema

### project_documents (extended)

| Column | Type | Description |
|--------|------|-------------|
| `agent_key` | TEXT | NULL = global, specific key = agent-only |
| `pinned` | BOOLEAN | Include in Context Pack |
| `doc_type` | TEXT | general, playbook, reference, credentials, style_guide |
| `sensitivity` | TEXT | normal, contains_secrets |
| `doc_notes` | JSONB | Extracted structured notes |

### brain_docs (new doc_types)

| doc_type | agent_key | Purpose |
|----------|-----------|---------|
| `project_overview` | NULL | Project description |
| `agent_soul_template` | NULL | Template for new agents |
| `project_user` | NULL | Project-wide USER.md |

### tasks (extended)

| Column | Type | Description |
|--------|------|-------------|
| `context_snapshot` | JSONB | Snapshot of Context Pack delivered |

## Integration with Executor

The Mac mini executor should:

1. Call `get-context-pack` when starting a task
2. Include the markdown in the agent's system prompt or first message
3. Optionally store the snapshot in `tasks.context_snapshot` for auditing

```bash
# Example executor call
curl -X POST https://bsqeddnaiojvvckpdvcu.supabase.co/functions/v1/get-context-pack \
  -H "Content-Type: application/json" \
  -d '{"projectId": "front-office", "agentKey": "agent:trunks:main", "taskId": "abc123"}'
```

## File Locations

| File | Purpose |
|------|---------|
| `src/lib/context-pack.ts` | Client-side Context Pack builder |
| `supabase/functions/get-context-pack/` | Edge function for executor |
| `supabase/functions/extract-document-notes/` | Document extraction pipeline |
| `docs/CONTEXT-FLOW.md` | This documentation |

## Scheduled Job Context

When a scheduled job runs, the executor:

1. Resolves the target agent from job configuration (`target_agent_key`)
2. Calls `get-context-pack` with project + agent + optional task
3. Prepends the context markdown to the job's instructions
4. Runs the agent turn with full context

This ensures consistent context delivery regardless of:
- Whether the job is main-session or isolated
- The job's schedule frequency
- Manual vs automated execution

Database fields for cron jobs:
- `target_agent_key`: Agent that owns/runs this job
- `job_intent`: Semantic category (daily_brief, monitoring, sync, etc.)
- `context_policy`: How much context to include (minimal, default, expanded)

## Future Enhancements

- Semantic search / embeddings for relevant doc retrieval
- Tool/skill gating in SOUL generation
- Context Pack analytics (what docs get used?)
- Multi-project context sharing
- Agent-to-agent context handoff
