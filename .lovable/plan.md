

# ClawdOS Mission Control Expansion Plan (Revised with Reliability Constraints)

## Critical Finding: Realtime Publication Gap

Before any new features, there is a **silent failure** in the current system. The client subscribes to realtime changes on 13 tables via `subscribeToProjectRealtime`, but only **3 tables** are actually in the `supabase_realtime` publication:

- `brain_docs`
- `cron_mirror`
- `cron_run_requests`

Tables like `activities`, `agents`, `agent_status`, `tasks`, `task_comments`, `project_chat_messages`, and all other request tables are **not publishing realtime events**. The subscriptions exist but receive nothing. This must be fixed in Phase 0.

---

## Phase 0: Foundation (Prerequisites)

### 0A. Fix Realtime Publication for Existing Tables

**Migration**: Add all subscribed tables to the publication:

```text
activities, agents, agent_status, tasks, task_comments, task_outputs,
project_chat_messages, project_chat_threads, cron_job_patch_requests,
cron_create_requests, cron_delete_requests, agent_provision_requests
```

Use idempotent DO block pattern (already established in brain_docs migration).

**Verification**: Insert a row into each table and confirm the UI updates without refresh.

### 0B. Labs Feature Flag System

Store in `project_settings` table (already exists):
- Key: `labs_features`
- Value: JSON string `{ "task_threads": false, "team_room": false, ... }`

Create `useLabsFeature(key: string): boolean` hook. Wrap new sidebar items and routes.

### 0C. Mode Indicator Component

A shared `ConnectionStatus` component showing:
- **Live** (green dot): Control API healthy, last check time
- **Backup** (amber dot): Using Supabase only, last successful API check time
- **Offline** (red dot): No connectivity

Display in the top bar. Derive from `executorCheck` in the store + a periodic health poll (every 30s).

**Uniform execution rules** (enforced in `api.ts` helper):

```text
function executeWithFallback(controlApiCall, supabaseFallback):
  if controlApiHealthy:
    result = controlApiCall()
    mirrorToSupabase()   // best-effort
    return result
  else:
    supabaseFallback()   // queue or direct write
    return { mode: 'backup' }
```

This pattern applies to: Operator Chat delivery, Cron controls, Agent provisioning, Skills checks, Doc edits.

### 0D. Prerequisite Schema Constraint (already satisfied)

The unique constraint `(project_id, agent_key, doc_type)` on `brain_docs` already exists (migration `20260203141000`). No action needed.

---

## Phase 1: Task Threads and Approvals

### User Story

Zack opens a task. He sees a single chronological thread: the original description, status changes, agent progress notes, comments, outputs, and approval requests. He can reply, approve/reject proposals, and add outputs -- all in one scrollable timeline.

### Data Model

**New table: `task_events`**

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| project_id | text | NOT NULL | |
| task_id | uuid | NOT NULL | |
| event_type | text | NOT NULL | comment, status_change, output_added, agent_update, approval_request, approval_resolved |
| author | text | NOT NULL | agent key, 'ui', or 'dashboard' |
| content | text | nullable | message text |
| metadata | jsonb | nullable | structured data per event_type |
| created_at | timestamptz | now() | |

#### Realtime + RLS + Publication Checklist

- [ ] **RLS policies**: SELECT anon = true, INSERT anon = true (agents and dashboard both write). No UPDATE or DELETE.
- [ ] **Publication**: `ALTER publication supabase_realtime ADD TABLE public.task_events;` (idempotent DO block)
- [ ] **Client subscription**: Add `task_events` to `subscribeToProjectRealtime` with `project_id` filter
- [ ] **Verify**: Create a task_event row and confirm the TaskDetailSheet updates without refresh

### Data Ownership (Avoiding Dual-History Drift)

- `task_events` is the canonical timeline going forward
- Existing `task_comments` rows: read for backward compatibility (render in thread with event_type='comment')
- Existing `task_outputs` rows: read for backward compatibility (render in thread with event_type='output_added')
- **All NEW writes** go to `task_events` only. New comments write to `task_events` with `event_type='comment'`. New outputs write to `task_events` with `event_type='output_added'` and metadata containing the output details.
- Later backfill migration (optional, Phase 6): convert old `task_comments` and `task_outputs` rows into `task_events` for a unified stream, then deprecate direct reads from the old tables.

### Control API Endpoints

- `POST /api/tasks/:taskId/events` -- agents write progress updates and approval requests
- Executor writes directly to Supabase `task_events` table (same as it does for activities)

### Safety / Approval Rules

- `event_type = 'approval_request'`: rendered as a card with Approve/Reject buttons
- Metadata schema:

```text
{
  action_type: string,       // e.g. "send_email", "create_file", "api_call"
  params: object,            // action-specific parameters
  risk_level: "low" | "med" | "high",
  requires_approval: true,
  status: "proposed",        // proposed -> approved | rejected -> executed | failed
  proposed_by: string,       // agent key
  proposed_at: string        // ISO timestamp
}
```

- Approval writes an `approval_resolved` event:

```text
{
  status: "approved" | "rejected",
  resolved_by: "ui",
  resolved_at: string,
  original_event_id: uuid    // links back to the request
}
```

- Executor polls for resolved approvals on its tasks.
- **No auto-approval. Everything waits for Zack.**

### Mode Indicator

TaskDetailSheet shows the connection mode badge. When in Backup mode, the "Agent is working..." indicators show last-known state with a staleness warning.

### Failure Modes

- Supabase down: agent event writes fail silently (best-effort). Task execution on executor continues.
- Executor down: thread is read-only (comments from Zack only). No new agent updates. UI shows "Agent offline" on the task.
- Approval timeout: no auto-resolution. Proposals stay pending until Zack acts. UI shows age of pending proposals.

---

## Phase 2: Team Room

### User Story

Zack opens "Team Room" (the existing Chat page, reframed). All agents post findings, status notes, and proposals. Zack can approve proposals inline or dismiss them.

### Data Model Changes

**Add columns to `project_chat_messages`:**

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| message_type | text | 'text' | text, task_proposal, action_proposal, system |
| metadata | jsonb | nullable | structured data per message_type |
| status | text | 'sent' | sent, delivered, read, failed |

#### Realtime + RLS + Publication Checklist

- [ ] **RLS policies**: Already exist (select/insert anon). Add UPDATE anon for status changes.
- [ ] **Publication**: Add `project_chat_messages` to `supabase_realtime` (currently missing!)
- [ ] **Client subscription**: Already in `subscribeToProjectRealtime`
- [ ] **Verify**: Send a message and confirm it appears in realtime

### Action Proposal Schema (strict)

All proposals (chat and task threads) use this schema in `metadata`:

```text
{
  action_type: "create_task" | "schedule_job" | "edit_doc" | "send_message" | "api_call" | "file_write",
  params: {
    // Per action_type -- validated schemas:
    // create_task: { title, description, assignee_agent_key }
    // schedule_job: { name, schedule_expr, instructions, target_agent_key }
    // edit_doc: { doc_type, agent_key, content_preview }
    // send_message: { channel, recipient, content }
    // api_call: { url, method, body_preview }
    // file_write: { path, content_preview }
  },
  risk_level: "low" | "med" | "high",
  requires_approval: boolean,
  status: "proposed" | "approved" | "rejected" | "executed" | "failed",
  proposed_by: string,
  proposed_at: string,
  approved_by: string | null,
  approved_at: string | null,
  executed_at: string | null,
  execution_result: string | null
}
```

UI renders proposals as cards with Approve/Reject buttons, never as freeform text.

### UI Changes

- Rename "Chat" to "Team Room" in sidebar
- Add approval cards for `task_proposal` and `action_proposal` messages
- "Promote to task" flow remains for regular text messages

### Safety

- Task proposals require explicit approval
- Agents cannot create tasks directly in Team Room
- Dismissed proposals get `status: 'rejected'` in metadata

### Failure Modes

- Executor offline: no new agent posts arrive. Existing messages remain visible.
- Stale proposals: show age badge ("2 hours ago"). No auto-expiry (Zack decides).

---

## Phase 3: Operator Chat (Dispatch)

### User Story

Zack talks to Trunks (or any agent) and it can create tasks, schedule jobs, edit docs, trigger actions. All risky actions require approval.

### Data Model

**New table: `chat_delivery_queue`**

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid | gen_random_uuid() | PK |
| project_id | text | NOT NULL | |
| message_id | uuid | NOT NULL | FK to project_chat_messages |
| target_agent_key | text | NOT NULL | |
| status | text | 'queued' | queued, delivered, processed, failed |
| picked_up_at | timestamptz | nullable | |
| completed_at | timestamptz | nullable | |
| result | jsonb | nullable | |
| created_at | timestamptz | now() | |

#### Realtime + RLS + Publication Checklist

- [ ] **RLS policies**: SELECT anon = true, INSERT anon = true (dashboard writes), UPDATE anon = true (executor updates status)
- [ ] **Publication**: `ALTER publication supabase_realtime ADD TABLE public.chat_delivery_queue;`
- [ ] **Client subscription**: Add to `subscribeToProjectRealtime` with `project_id` filter
- [ ] **Verify**: Send a message, confirm delivery queue row appears, executor picks it up, response message appears in thread

### Delivery: Direct + Queued Fallback

Consistent with the Control API source-of-truth principle:

```text
When Zack sends a message to an agent:

1. Check Control API health
2. IF healthy (Direct mode):
   - POST /api/chat/deliver { message_id, target_agent_key, message }
   - Executor processes immediately, writes response to project_chat_messages
   - Mirror: also insert into chat_delivery_queue with status='processed'
3. IF unhealthy (Queued fallback):
   - Insert into chat_delivery_queue with status='queued'
   - Executor polls queue when it comes back online
   - Executor processes backlog, writes responses, updates status='processed'
```

UI shows delivery status per message:
- Direct mode: "Delivered" instantly
- Queued mode: "Queued - agent will process when online"
- Failed: "Delivery failed" with retry button

### Watchdog

2-minute timeout (matching existing cron pattern). Stale `queued` or `delivered` entries auto-fail. UI shows retry option.

### Mode Indicator

Chat composer shows current mode (Live/Backup). When in Backup mode, message shows "Will be delivered when agent comes online."

---

## Phase 4: Multi-Agent DMs

### User Story

Zack opens "DMs" page. Agent list on the left. Click agents to open side-by-side chat panels. Each panel is an independent thread.

### Data Model

No new tables. Use existing `project_chat_threads` with naming convention `title = 'DM:<agent_key>'`. Auto-create thread on first message to an agent.

Messages use `target_agent_key` for routing. Delivery uses the same `chat_delivery_queue` from Phase 3.

#### Realtime + RLS + Publication Checklist

- [ ] `project_chat_threads` publication: add to `supabase_realtime` (currently missing)
- [ ] Client subscription: already in `subscribeToProjectRealtime`
- [ ] Verify: create a DM thread, send a message, confirm it appears in the correct panel

### UI Changes

- New sidebar item: "DMs" (behind Labs flag)
- New route: `/dms`
- Split-pane layout: 2 columns on desktop, swipeable on mobile
- Agent list sidebar within DMs page
- Each panel filters messages by `thread_id`

### Direct + Queued Delivery

Same as Phase 3 -- uses `chat_delivery_queue`. Each DM panel independently shows delivery status.

---

## Phase 5: Heartbeat vs Cron + Skills Usability

### Feature A: Heartbeat vs Cron

Both run through the same cron system. The difference is **product framing and defaults**:

| | Heartbeat | Cron |
|---|-----------|------|
| Schedule kind | `every` | `cron` |
| Job intent | `heartbeat` | any |
| Default output | Activity feed | Depends on job |
| Default safety | No external actions; can only propose (requires approval) | Can run anything, but risky actions still require approval |
| UI | Hides cron expressions; shows interval picker + "non-destructive periodic check" label | Full schedule editor |
| Agent prompt injection | Appends: "This is a periodic check. Do NOT take external actions. Report findings to the activity feed. If action is needed, propose it for approval." | No special injection |

**No new tables or endpoints.** Add `job_intent='heartbeat'` as a recognized value. The UI groups Schedule page into two sections: "Heartbeats" and "Scheduled Jobs."

The heartbeat prompt constraint is enforced in the executor's prompt builder -- when `job_intent='heartbeat'`, it appends the safety prefix.

### Feature F: Skills Usability

**Control API endpoint**: `POST /api/skills/:id/check` -- re-run eligibility check, return updated status.

**UI changes**:
- "Check again" button in `SkillDetailDrawer` (calls Control API directly, falls back to showing "Executor offline")
- Group skills by status: Ready, Needs Setup, Blocked
- Step-by-step setup section with copy-to-clipboard commands

#### Realtime for skills_mirror

- [ ] **Publication**: Add `skills_mirror` to `supabase_realtime`
- [ ] **Client subscription**: Add to `subscribeToProjectRealtime`
- [ ] **Verify**: Run a skill check, confirm UI updates without refresh

### Mode Indicator

Schedule page and Skills page both show connection mode badge. Skills "Check again" button disabled in Backup mode with tooltip "Requires executor connection."

---

## Phase 6: Project Mission + Polish

### Data Model

New `brain_docs.doc_type = 'mission'`. Short text. Already synced via brain-doc-sync.

### UI

- Mission field on `ProjectOverviewCard`
- Pinned mission banner on Activity page
- Include in context pack generation (`get-context-pack` edge function)

### Backfill Migration (Optional)

Convert old `task_comments` and `task_outputs` into `task_events` rows:

```text
INSERT INTO task_events (project_id, task_id, event_type, author, content, metadata, created_at)
SELECT project_id, task_id, 'comment', COALESCE(author_agent_key, 'ui'), content, NULL, created_at
FROM task_comments;

INSERT INTO task_events (project_id, task_id, event_type, author, content, metadata, created_at)
SELECT project_id, task_id, 'output_added', COALESCE(created_by, 'ui'), title,
  jsonb_build_object('output_type', output_type, 'storage_path', storage_path, 'link_url', link_url),
  created_at
FROM task_outputs;
```

Run only after confirming `task_events` is stable. Keep old tables read-only (do not drop).

---

## Sidebar Navigation (Final)

```text
Activity
Tasks
Team Room     [Phase 2, Labs flag]
DMs           [Phase 4, Labs flag]
Agents
Knowledge
Schedule
---
Settings
```

Chat route `/chat` becomes Team Room. DMs get `/dms`. Both behind Labs flags.

---

## Migration Summary

| Phase | Table/Column | Realtime | RLS |
|-------|-------------|----------|-----|
| 0 | (fix publication for 10+ existing tables) | Yes | N/A |
| 0 | project_settings (Labs flags) | Already works | Already exists |
| 1 | NEW: task_events | Add to publication + subscription | SELECT/INSERT anon |
| 2 | ADD: project_chat_messages.message_type, .metadata, .status | Fix publication (missing!) | Add UPDATE anon |
| 3 | NEW: chat_delivery_queue | Add to publication + subscription | SELECT/INSERT/UPDATE anon |
| 4 | (no new tables) | Fix project_chat_threads publication | N/A |
| 5 | (no new tables) | Fix skills_mirror publication | N/A |
| 6 | (no new tables, new doc_type value) | Already covered | Already covered |

---

## Risk Mitigation

1. **No rewrites**: every change is additive. Existing tables continue to work.
2. **Feature flags**: nothing ships without explicit opt-in via Labs toggles.
3. **Request queue pattern**: all executor interactions use the proven queue pattern.
4. **Ghost row prevention**: delivery queue has 2-minute watchdog. Stale entries auto-fail.
5. **Offline resilience**: every feature degrades gracefully. UI reads from Supabase, shows mode indicator, queues actions.
6. **Dual-history prevention**: single canonical timeline (`task_events`) with backward-compatible reads from old tables.
7. **Publication verification**: every new table has a checklist item to verify realtime actually works before moving on.
8. **Strict proposal schema**: action proposals are structured data, not freeform text. UI enforces card rendering with Approve/Reject.

