### 3-Column Kanban Consolidation
- **TasksPage.tsx**: `COLUMNS` reduced to 3 stages (Inbox / In Progress / Done). All intermediate statuses (assigned, review, blocked) fold into In Progress; stopped folds into Done. Removed `inboxProposed`/`inboxRegular` split — inbox is now flat.
- **TaskCard.tsx**: `STATUS_COLUMNS` dropdown reduced to 3 options (Inbox / In Progress / Done). No more Assigned/Review/Blocked in card dropdown.
- DB schema and `TaskStatus` type unchanged — mapping is UI-only.

### OpenClaw Anatomy Integration
- **AnatomyCheatSheet** (`src/components/documents/AnatomyCheatSheet.tsx`): New collapsible card on Knowledge page listing all OpenClaw doc types (SOUL, IDENTITY, USER, AGENTS, TOOLS, MEMORY, SKILLS, HEARTBEAT, Cron) with info tooltips and "maps to" labels.
- **Agent Handbook tab** (`src/components/agent-tabs/AgentsDocEditor.tsx`): New "Handbook" tab (📖) on agent detail for viewing/editing AGENTS.md — universal operating rules. Includes "Generate with AI" button for empty docs.
- **Agent tab tooltips** (`AgentDetail.tsx`): Updated all agent tab tooltips to use canonical OpenClaw Anatomy descriptions with file references.
- **AgentTab type** (`store.ts`): Extended to include `'agents_doc'`.
- **Project Rulebook** (`ProjectOverviewCard.tsx`): Added third card below Mission and Overview for project-level operating rules (stored as `brain_docs` doc_type `'project_rules'`).
- **API** (`api.ts`): Added `getProjectRulebook()` and `saveProjectRulebook()` following existing Mission/Overview pattern.
- **Edge function** (`generate-agent-docs`): Added `AGENTS_DOC_SYSTEM_PROMPT` and `docTypes` parameter support. Callers can now request specific doc types (`['agents']`) instead of always generating soul+user. Backward compatible.
- **Database**: Expanded `brain_docs_doc_type_check` constraint to include `'project_rules'`.

### Heartbeat toggle: network-error fallback to queue
- **CronPage.tsx**: Toggle catch block now detects network-level errors (`Failed to fetch`, etc.) and automatically falls back to `queueCronPatchRequest` instead of showing a hard failure. Real API errors (4xx/5xx) still fail loudly. This fixes toggling heartbeats from the Lovable cloud preview when the Mac mini is unreachable.

### Context Pack Preview Dialog
- **New component** (`ContextPackPreviewDialog.tsx`): Operator can select an agent + optional task, generate a full Context Pack preview showing section-by-section character counts with budget bars, included/excluded pinned docs, retrieved knowledge chunks, and full markdown output.
- **context-pack.ts**: Added `ExcludedDoc` interface and `excludedDocs` field to `ContextPack`. `fetchPinnedDocs` now returns `{ docs, excluded }` with titles of dropped documents and reasons. Updated callers accordingly.
- **DocumentsPage**: Added "Preview" button in header to open the dialog.

### Lean & Smart Context Packs: Pinning UI + Per-Task Retrieval + Hard Caps
- **DocumentList** (`DocumentList.tsx`): Added clickable pin/unpin toggle button per document (Pin/PinOff icons) with toast feedback. "Pinned" badge shown on pinned docs. Removed old static pin indicator.
- **Edge function** (`get-context-pack`): Reduced `MAX_PINNED_DOCS` from 10→5, added `MAX_PINNED_CHARS=8000` with accumulation-based enforcement (drops docs exceeding cap). Increased `MAX_KNOWLEDGE_RESULTS` from 3→5, added `MAX_KNOWLEDGE_CHARS=6000` with per-chunk truncation. Renamed markdown sections to "Pinned Knowledge (Global)".
- **Client-side builder** (`context-pack.ts`): Added `KnowledgeExcerpt` interface and `relevantKnowledge` field to `ContextPack`. Added `fetchRelevantKnowledge()` for per-task knowledge retrieval via knowledge-worker edge function. Mirrored same hard caps (5 pinned docs/8k chars, 5 chunks/6k chars). Updated markdown renderer with consistent section ordering: Mission → Overview → Pinned Knowledge → Your Knowledge → Task Context → Relevant Knowledge → Recent Changes.

### Mission in Context Pack
- **Context Pack** (`src/lib/context-pack.ts`, `supabase/functions/get-context-pack/index.ts`): Added `mission` field to `ContextPack` interface and `fetchMission()` to both builders. Mission is now fetched in parallel and rendered as `## Mission` before `## Project Overview` in the markdown output. No schema changes.

### Image-to-Text Knowledge Caption + Editable Metadata
- **Control API** (`server/index.mjs`): Added `POST /api/documents/:id/caption/generate` (calls GPT-4o vision with tool calling for structured output, creates companion `project_documents` note with analysis, fires knowledge ingest) and `POST /api/documents/:id/caption/update` (updates caption text/tags on companion doc, re-ingests).
- **Frontend API** (`src/lib/api.ts`): Added `generateImageCaption()` and `updateImageCaption()` helpers via Control API.
- **DocumentsPage** (`DocumentsPage.tsx`): Auto-triggers caption generation on image upload (non-blocking, best-effort).
- **DocumentList** (`DocumentList.tsx`): Added ✨ caption button for image documents. Shows "Captioned" badge when companion analysis exists. Button generates caption if none exists, or opens edit modal if one does.
- **ImageCaptionModal** (`ImageCaptionModal.tsx`): New lightweight dialog for editing caption text and tags, with save triggering update + re-index.

### Vector Search, Auto-Ingestion, and Agent Knowledge Awareness (Phases 1-2, 4-8)
- **Database (pgvector)**: Enabled `vector` extension. Created `knowledge_sources` (dedupe via `content_hash`, `normalized_url`, indexing status) and `knowledge_chunks` (1536-dim embeddings) tables with zero RLS policies (deny all direct browser access). Added `match_knowledge_chunks` RPC with `SECURITY DEFINER` for similarity search.
- **Edge Function `knowledge-worker`** (`verify_jwt=true`): Single source of truth for embed + search actions. Chunking (800-1200 chars, paragraph-aware, max 200 chunks/500K chars). Embeds via OpenAI `text-embedding-3-small`. Only callable with service-role credentials.
- **Context Pack** (`get-context-pack`): Now injects top 3 relevant knowledge excerpts into task contexts via knowledge-worker search. Includes `capabilities_version` from project_settings.
- **SOUL Prompt** (`generate-agent-docs`): Added "How to Operate Mission Control" subsection listing knowledge search/ingest, task, and artifact endpoints.
- **Dashboard API** (`src/lib/api.ts`): Added `searchKnowledge()` and `ingestKnowledge()` helpers via Control API. Auto-ingestion hooks in `createNoteDocument()` and `uploadDocument()` (best-effort, non-blocking).
- **Knowledge Page** (`DocumentsPage.tsx`): Added search bar with debounced query, compact results list (title, excerpt, source type badge). No similarity scores shown.
- **Schedule Page** (`CronPage.tsx`): Added mirror staleness banner (amber warning when >10 min stale) and per-job "Mirror" badge when executor is offline.
- **Control API Phase 3** (`server/index.mjs`): Added three new routes:
  - `POST /api/knowledge/ingest`: Async ingestion with YouTube transcript (oEmbed, no yt-dlp), URL extraction with junk-page heuristics (strip nav/footer/script, captcha detection, <500 char rejection), dedupe via SHA-256 content hash + normalized URL, placeholder records for unsupported file types, fire-and-forget embed via knowledge-worker edge function.
  - `POST /api/knowledge/search`: Proxy to knowledge-worker edge function with service-role auth.
  - `POST /api/health/report`: Checks executor version, cron mirror staleness (>10 min), chat delivery queue stuck items (>5 min), posts formatted report to war room.

### Autonomous Agent Wake Routine — War Room + Heartbeat
- **Edge Function** (`generate-agent-docs`):
  - SOUL.md prompt now requires a "War Room + Wake Routine (Policy)" section: contribution rules, anti-spam (0–2 posts/wake), bounded context reads, and capabilities_contract awareness
  - USER.md prompt now requires an "Interrupt / Participation" section: war room vs direct ping guidance
- **Agent Creation** (`src/lib/api.ts`):
  - `createAgent()` now automatically queues a default hourly heartbeat cron job for sub-agents (when role is provided)
  - Heartbeat follows 5-step structure: check mentions → read war room → read tasks → contribute one action → unblock if stuck
  - Fire-and-forget; won't block agent creation if queue fails
  - Server-side provisioning already creates heartbeats; this covers the Supabase-only (executor-offline) path

### Delete Agent with Safe Cascade Cleanup
- **Control API** (`server/index.mjs`):
  - Added `DELETE /api/agents/:agentKey` endpoint with full cascade cleanup
  - Step A: Lists and deletes cron jobs targeting the agent via `openclaw cron list/delete`
  - Step B: Removes OpenClaw agent via `openclaw agents remove <agentIdShort>`
  - Step C: Removes workspace directory `~/.openclaw/workspace-<agentIdShort>/` with strict path validation
  - Step D: Supabase cleanup (service role, all best-effort): agent_status, agent_mention_cursor, agent_provision_requests, brain_docs, cron_mirror, chat_delivery_queue (queued/claimed), mentions, agents row
  - Logs `agent_deleted` activity entry
  - Blocks deletion of `agent:main:main` (returns 403)
  - Idempotent: safe to call multiple times
  - Updated CORS to allow DELETE method
- **Dashboard API** (`src/lib/api.ts`):
  - `deleteAgent()` now calls `DELETE /api/agents/:agentKey` on Control API as primary path
  - Falls back to enhanced direct Supabase cleanup if Control API unavailable
  - Fallback now includes chat_delivery_queue, mentions, and agent_mention_cursor cleanup (previously missing)
- **UI** (`src/components/agent-tabs/AgentOverview.tsx`):
  - Updated delete confirmation dialog copy to clarify what gets deleted vs kept

**What gets DELETED:** OpenClaw agent runtime, workspace directory, cron jobs, agent_status, agent_mention_cursor, agent_provision_requests, brain_docs, cron_mirror, chat_delivery_queue, mentions, agents row
**What gets KEPT:** tasks, task_events, task_outputs, project_chat_messages, activities

**Verification checklist:**
1. Delete agent via dashboard — OpenClaw no longer lists it
2. Workspace directory removed
3. No cron jobs targeting deleted agent remain
4. Supabase: no operational rows (agent_status, brain_docs, cron_mirror, etc.) for deleted agent
5. Supabase: queued chat_delivery_queue rows removed
6. Supabase: agents row gone
7. Supabase: task_events and project_chat_messages authored by agent still exist
8. Supabase: tasks assigned to agent still exist
9. Deleting again returns `{ ok: true }` (idempotent)
10. Cannot delete `agent:main:main` (blocked)


- **CronPage UI** (`src/components/pages/CronPage.tsx`):
  - Removed "Unassigned" option from Agent filter dropdown
  - Removed filter logic branch for `agentFilter === 'unassigned'`
  - Create dialog: agent selector defaults to `agent:main:main`, removed "No specific agent" option
  - Edit dialog: agent selector defaults to `agent:main:main`, removed "No agent assigned" option
  - `getEffectiveTargetAgent` now returns `'agent:main:main'` instead of `null` when no agent found
  - Toast text no longer falls back to "Unassigned"
- **AgentAssignmentDropdown** (`src/components/schedule/AgentAssignmentDropdown.tsx`):
  - Removed "Unassigned" option from compact popover
  - Removed "No specific agent" option from full mode
  - Null/empty values now display main agent instead of "Needs assignment" amber warning
  - `onChange` handler defaults to `agent:main:main` instead of `null`
- **Cron mirror** (`scripts/cron-mirror.mjs`):
  - Mirror rows now include `target_agent_key` extracted from instructions `@agent:` header or `sessionTarget`
  - Falls back to `'agent:main:main'` if no agent found
  - One-time cleanup: updates all null/empty `target_agent_key` rows to `'agent:main:main'`
- **Control API** (`server/index.mjs`):
  - `GET /api/cron` response now includes normalized `targetAgentKey` (default `'agent:main:main'`)
  - Edit endpoint best-effort mirror includes `target_agent_key` from patch

**Verification checklist:**
1. Open Schedule page — no "Unassigned" filter option in Agent dropdown
2. Existing jobs with no agent show "Trunks (main)" or main agent badge
3. Create new job — agent defaults to main, no "No specific agent" option
4. Edit a job — no "No agent assigned" option, defaults to main
5. Run cron-mirror — all `cron_mirror` rows have non-null `target_agent_key`
6. Inline agent dropdown — no "Unassigned" or "Needs assignment" display

### Task Stop/Delete, @Mentions, and War Room Context
- **Task Stop & Delete** (`server/index.mjs`, `src/lib/api.ts`):
  - `POST /api/tasks/:taskId/stop` — sets status to `stopped`, emits `status_change` event with optional reason
  - `POST /api/tasks/:taskId/delete` — soft-deletes (sets `deleted_at`/`deleted_by`), emits `task_deleted` event, idempotent
  - Dashboard helpers: `stopTask()`, `softDeleteTask()` with Control API + Supabase fallback
  - `TaskStatus` type updated to include `'stopped'`; `Task` interface includes `deletedAt`/`deletedBy`
  - `getTasks()` now filters out soft-deleted tasks (`deleted_at IS NOT NULL`)
- **UI** (`TaskDetailSheet.tsx`, `TaskListView.tsx`):
  - Stop button (Square icon, orange) and Delete button (Trash2 icon, destructive) in TaskDetailSheet header
  - `StopTaskDialog` — confirmation with optional reason (same pattern as RejectConfirmDialog)
  - `DeleteTaskConfirmDialog` — confirmation with accurate soft-delete copy
  - `stopped` added to STATUS_COLUMNS, STATUS_LABELS, STATUS_COLORS
  - "Show Stopped" filter checkbox in TaskListView
- **@Mentions system** (`server/index.mjs`, DB migration):
  - `mentions` table (RLS enabled, no anon policies — service-role only via Control API)
  - `agent_mention_cursor` table for per-agent last-seen tracking
  - `extractMentionKeys()` — matches `@ricky` and `@agent:ricky:main`, normalizes to short key, validates against agents table
  - Mentions auto-populated on `POST /api/tasks/:taskId/events` and `POST /api/chat/post`
  - `GET /api/mentions?agent_key=<key>&since=<ISO>` — read new mentions
  - `POST /api/mentions/ack` — update cursor with GREATEST semantics (prevents regression)
- **Heartbeat prompt updates** (`buildHeartbeatInstructions`):
  - New STEP 0: check @mentions first, respond in-thread, then ack
  - STEP 3 (War Room): bounded read (`limit=100`), include "Context (war room)" section when proposing tasks from chat
- **Documentation**: Updated `docs/CONTROL-API-BRIDGE.md` with stop, delete, mentions, and ack endpoints

**Verification checklist:**
1. Stop a task from TaskDetailSheet → status changes to `stopped`, event in timeline
2. Delete a task → disappears from board, `deleted_at` set, task_event logged
3. Type `@ricky` in war room chat via Control API → mention row created in `mentions` table
4. Call `GET /api/mentions?agent_key=ricky&since=...` → returns new mentions
5. Call `POST /api/mentions/ack` with max created_at → cursor updated
6. Re-call GET /api/mentions with new cursor → returns empty
7. Agent heartbeat responds to mention, then acks → no re-response on next run

### Agent Heartbeat v2: Autonomous hourly wake with task proposals, war room, and task adoption
- **New Control API read endpoints** (`server/index.mjs`):
  - `GET /api/tasks` — list tasks by status/limit/updated_since from Supabase (replaces file-based version)
  - `GET /api/tasks/:taskId/events` — read recent task_events for context
  - `GET /api/chat/recent` — read war room messages (null thread_id = general channel)
- **New Control API write endpoints**:
  - `POST /api/tasks/:taskId/assign` — update assignment + emit `assignment_change` event
  - `POST /api/tasks/:taskId/status` — update status + emit `status_change` event
- **Auto-heartbeat at provisioning**: Both `server/index.mjs` (direct) and `scripts/cron-mirror.mjs` (queued) now auto-create an hourly heartbeat cron job (`heartbeat-{agentIdShort}`) for every new agent. Deterministic naming prevents duplicates on re-provision.
- **Heartbeat prompt**: 4-step autonomous behavior baked into cron instructions — propose tasks, assist active work, contribute to war room, complete own tasks. Role-based guidance (Builder/QA/PM) and anti-spam rules included.
- **Dashboard helpers** (`src/lib/api.ts`): Added `fetchTasksViaControlApi`, `fetchTaskEventsViaControlApi`, `fetchRecentChatViaControlApi`, `assignTaskViaControlApi`, `updateTaskStatusViaControlApi` — all with Supabase fallback.
- **Documentation**: Updated `docs/CONTROL-API-BRIDGE.md` with full endpoint contracts.

**Verification checklist:**
1. Provision a new agent → heartbeat cron job appears in Schedule page
2. Run heartbeat once manually → proposed tasks appear in Inbox
3. Heartbeat posts a comment on an active task (check TaskTimeline)
4. Heartbeat posts at most 2 war room messages (check Chat page)
5. Re-provisioning same agent does NOT create duplicate heartbeat job


- Removed the "Job Intent" filter dropdown from the Schedule page filters.
- Removed the "Job Intent" field from the Create dialog.
- Removed the "Job Intent" field from the Edit dialog.
- Removed JobIntentBadge import and all intent-related state/logic from CronPage.
- Intent metadata is no longer needed for filtering or UI categorization.

### Rename: Team Room → War Room
- Renamed "Team Room" to "War Room" across sidebar and chat page header. No route or feature flag changes.

### Agent → Dashboard Bridge (Control API)
- Added `postTaskEventViaControlApi()` and `postChatMessageViaControlApi()` in `api.ts` — route writes through Control API when healthy, fall back to direct Supabase inserts when offline.
- Documented Control API contract in `docs/CONTROL-API-BRIDGE.md` (endpoint shapes, auth model, fallback flow).

- **DM panels**: Fixed infinite vertical expansion on long messages; panels now scroll internally with fixed header/composer.

### Wiring Gap Fixes: Reconcile UI with Reality
- **Fix 1 — Task events on status change**: `updateTask()` now fetches the old status and emits a `task_events` row (`event_type: 'status_change'`) with `{old_status, new_status}` metadata whenever the status actually changes. Best-effort, non-blocking.
- **Fix 2 — Health TTL**: `isControlApiHealthy()` now enforces a 60-second TTL via `lastExecutorCheckAt` in the store. `setExecutorCheck` automatically sets the timestamp. Stale checks return `false`.
- **Fix 3 — Heartbeat grouping fallback**: CronPage now treats `schedule_kind='every'` jobs with no explicit `job_intent` as heartbeats, preventing misfiling.
- **Fix 4 — Queue idempotency**: Added unique constraint on `chat_delivery_queue(message_id, target_agent_key)` with duplicate cleanup migration. All queue inserts switched from `.insert()` to `.upsert()`.
- **Fix 5 — Mac-side gap documentation**: Added code comments in `api.ts` documenting that `/api/chat/deliver` endpoint and queue worker are not yet implemented (Mac-side work).


- **Mission doc_type**: New `brain_docs` doc_type `'mission'` for short project mission statements.
- **API functions**: `getProjectMission()` and `saveProjectMission()` added to `api.ts`.
- **ProjectOverviewCard**: Now shows both Mission (short, input-based) and Overview (long, textarea-based) cards.
- **Activity page**: Pinned mission banner at the top of the activity feed when mission text exists.
- **Labs toggles**: Settings page now has a "Labs" tab with toggles for all feature flags.

### Phase 5: Heartbeat vs Cron + Skills Usability
- **Schedule page split**: Jobs are now visually grouped into "💓 Heartbeats" (job_intent='heartbeat') and "📅 Scheduled Jobs" (everything else) sections with counts.
- **Page title**: Renamed from "Scheduled Jobs" to "Schedule" with updated description.
- **Skills "Check again"**: SkillDetailDrawer now has a "Check again" button that calls `POST /api/skills/:id/check`. Disabled with tooltip when executor is offline.
- **API**: `checkSkillEligibility()` added for skill re-check via Control API.

### Phase 4: Multi-Agent DMs
- **New page `DMsPage`**: Split-pane layout with agent list sidebar and up to 2 concurrent DM panels (1 on mobile). Each panel has its own thread, composer, delivery badges, and realtime subscription.
- **DM threads**: Uses existing `project_chat_threads` with `title = 'DM:<agent_key>'` naming convention. Auto-creates thread on first message via `getOrCreateDMThread()`.
- **Delivery integration**: Reuses Phase 3 `chat_delivery_queue` for all DM messages. Each panel independently shows delivery status badges.
- **Sidebar**: "DMs" nav item appears behind `multi_dm` Labs feature flag.
- **Route**: `/dms` added to app router.
- **Mobile**: Compact icon-only agent list, single panel at a time.
- **Resizable panels**: Desktop uses `ResizablePanelGroup` for side-by-side agent conversations.

### Phase 3: Operator Chat — Direct + Queued Delivery
- **New table `chat_delivery_queue`**: Tracks message delivery to agents. Columns: `message_id` (FK), `target_agent_key`, `status` (queued/delivered/processed/failed), timestamps, `result`. RLS enabled, added to `supabase_realtime` publication with index on `(project_id, status, created_at)`.
- **Direct + Queued delivery**: `sendChatMessage()` now checks Control API health. If healthy, delivers via `POST /api/chat/deliver` and mirrors to queue as `processed`. If unhealthy, enqueues as `queued` for executor to poll later. Falls back gracefully on direct delivery failure.
- **Delivery status UI**: Each outgoing agent-targeted message shows a delivery badge (✓ processed, ✓ delivered, ⏱ queued, ✗ failed with retry). Realtime subscription on `chat_delivery_queue` updates badges without refresh.
- **Mode indicator in composer**: Shows Live/Backup dot with tooltip explaining delivery mode. When targeting an agent, displays "Will deliver directly" or "Will queue for later delivery".
- **Retry**: Failed deliveries show a retry button that resets status to `queued`.
- **API functions**: `getChatDeliveryStatus()`, `retryChatDelivery()`, `isControlApiHealthy()`.
- **Realtime**: `chat_delivery_queue` added to `subscribeToProjectRealtime`.

### Phase 1: Task Threads & Unified Timeline
- **New table `task_events`**: Canonical timeline for all task activity (comments, status changes, outputs, agent updates, approval requests/resolutions). RLS enabled, added to `supabase_realtime` publication.
- **API functions**: `getTaskEvents()`, `createTaskEvent()`, `resolveApproval()` in `api.ts`. New `TaskEvent`, `TaskEventType`, `CreateTaskEventInput` types.
- **Unified timeline component**: `TaskTimeline.tsx` merges `task_events` with legacy `task_comments` and `task_outputs` into a single chronological thread. Includes realtime subscription for instant updates.
- **Approval cards**: `approval_request` events render as structured cards with Approve/Reject buttons. Resolutions write `approval_resolved` events.
- **Status change events**: Status changes from `TaskDetailSheet` now write `status_change` events to the timeline with `old_status`/`new_status` metadata.
- **Data ownership**: All new writes go to `task_events`. Legacy comments/outputs still read for backward compatibility but no new data is written to old tables.
- **TaskDetailSheet refactored**: Removed inline comments section, replaced with `TaskTimeline` component. Removed ~130 lines of comment state/handlers.

### Phase 0: Mission Control Foundation
- **Realtime publication fix**: Added 15 tables to `supabase_realtime` publication. Previously only `brain_docs`, `cron_mirror`, and `cron_run_requests` were publishing — all other realtime subscriptions were silently receiving nothing.
- **Labs feature flag system**: New `useLabsFeature(key)` hook reads from `project_settings` table (`labs_features` JSON). New features can be toggled per-project. Includes `getLabsFlags()` and `setLabsFlags()` for the Settings page.
- **Mode Indicator**: Replaced the static connection dot in the top bar with a `ConnectionStatus` component that polls the Control API every 30s and shows **Live** (green), **Backup** (amber), or **Offline** (red) with tooltip details.
- **Realtime subscription**: Added `skills_mirror` to `subscribeToProjectRealtime` for future Skills usability work.

### AI-powered doc generation + disk sync
- **Database**: Added `description` column to `agents` table for AI-generated card blurbs.
- **New edge function `generate-agent-docs`**: Calls OpenAI (gpt-4o) with tool calling to generate tailored SOUL.md, USER.md, MEMORY.md, and a short description from the agent's purpose and global templates. Enforces line-count constraints.
- **API** (`src/lib/api.ts`): `createDocOverride()` now generates AI docs instead of copying globals. Added `generateAgentDocs()`, `trySyncToControlApi()` for disk-first sync. `saveAgentFile()` now best-effort syncs agent-specific docs to Control API. Added `description` to `Agent` interface.
- **AgentOverview**: Added "Regenerate with AI" button (requires purpose text). Shows loading state during generation.
- **DocSourceBanner**: "Create agent override" now shows "Generating with AI..." during creation.
- **AgentsPage**: Cards show `role` as subtitle + `description` (AI-generated) as body with `line-clamp-3`. Removed `purposeText` from cards.
- **Sync priority**: Disk-first when Control API reachable, Supabase fallback when not.

### Sub-agent detail: distinct Overview tab, doc source indicators, purpose editor
- **Database**: Added `purpose_text` column to `agents` table. Migrated Ricky's long role into `purpose_text`, set `role` to short label. Seeded agent-specific `brain_docs` rows (USER.md, MEMORY.md) for Ricky.
- **New component `AgentOverview`**: Overview tab showing editable purpose/mission textarea, brain doc status (inherited vs override) with "Create override" buttons, and action buttons (Run Once, Schedule Digest).
- **New component `DocSourceBanner`**: Subtle banner in Soul/User/Memory editors showing "Inherited (global)" or "Agent-specific docs" with a "Create agent override" button for sub-agents.
- **AgentDetail**: Added Overview as a new tab (default for sub-agents, primary agent defaults to Soul). Imports and renders `AgentOverview`.
- **API** (`src/lib/api.ts`): Added `purposeText` to `Agent` interface, `updateAgentPurpose()`, `createDocOverride()`, `getDocOverrideStatus()`, `scheduleAgentDigest()`.
- **Store**: Added `'overview'` to `AgentTab` type.
- **AgentsPage**: Cards now show short `role` label with `purposeText` as secondary italic text (line-clamp-2 each).

### Agent Provisioning: create runnable OpenClaw agents from the dashboard
- **Database**: Added `agent_id_short`, `workspace_path`, `provisioned` columns to `agents` table. Created `agent_provision_requests` queue table.
- **Control API** (`server/index.mjs`):
  - `POST /api/agents/provision`: Creates an OpenClaw agent on the Mac mini (`openclaw agents add` + `set-identity`), seeds SOUL/USER/MEMORY files, updates Supabase.
  - `GET /api/agents/runtime`: Returns runnable agents from `openclaw agents list --json`.
  - Agent file endpoints (`/api/agents/:agentKey/files/:type`) now support any provisioned agent (not just trunks). Resolves workspace via `agents.workspace_path` in Supabase.
  - On POST (write), mirrors doc content to Supabase `brain_docs` with correct `agent_key`.
- **Offline worker** (`scripts/cron-mirror.mjs`): Added `processProvisionRequests()` — polls `agent_provision_requests` every 10s, runs same provisioning steps, added to stuck-request watchdog.
- **Dashboard** (`src/lib/api.ts`): `createAgent()` now derives `agent_id_short`, attempts direct provisioning via Control API, falls back to queue. `Agent` type includes `provisioned`, `agentIdShort`, `workspacePath`.
- **Dashboard** (`src/components/pages/AgentsPage.tsx`): Shows "Provisioning…" badge on agents where `provisioned === false`.
- **brain-doc-sync**: No changes (Approach B — Control API handles per-agent docs).


- **Edit dialog** now uses the same friendly preset selector as the Create dialog (Every 5 min, Every 1 hour, Daily at..., Weekly, Custom cron). No more raw cron expressions.
- **Removed Job Intent** field from the edit dialog — intent is implicit in the instructions.
- Schedule changes are properly tracked as dirty to avoid sending unchanged `--system-event` or `--cron` flags.

### Fix cron edit: --cron vs --every schedule kind detection
- **Bug**: Editing a job title on an interval-based job (`every 3600000`) would send `--cron "3600000"` to the executor, which fails with `isolated cron jobs require payload.kind="agentTurn"`. The server now auto-detects numeric-only schedules as `every` kind, and the frontend sends `scheduleKind` explicitly. Schedule is also only included in the edit payload when actually changed.

### Cron edit persistence: offline patch processing + immediate mirror upsert
- **`scripts/cron-mirror.mjs`**: Added `processPatchRequests()` — polls `cron_job_patch_requests` for queued patches and applies them via `openclaw cron edit` CLI (name → `--name`, instructions → `--system-event`, schedule → `--cron`/`--every`, enabled → `--enable`/`--disable`). Runs on 10s interval. Added to stuck-request watchdog.
- **`server/index.mjs`**: After a successful direct edit via `/api/cron/:jobId/edit`, the server now best-effort upserts changed fields (name, instructions, enabled) into `cron_mirror` so the UI updates instantly via realtime instead of waiting up to 60s.

### Fix schedule interval parsing + add hourly interval presets
- **Bug fix**: `parseScheduleToConfig` silently defaulted unknown `every` intervals (e.g. 1 hour / 3600000ms) to "Every 15 minutes", risking accidental overwrites when editing.
- **New presets**: Added interval presets for 1h, 2h, 4h, 8h, 12h alongside existing 5m/15m/30m.
- **Safe fallback**: Unknown intervals now fall back to `custom` instead of `every-15`.
- **Label clarity**: Cron-based "Hourly" renamed to "Hourly (on the hour)" to distinguish from interval-based "Every 1 hour".

### Brain doc editors: auto-refresh via Supabase Realtime
- **New hook `useBrainDocSubscription`**: Subscribes to Realtime `UPDATE` events on `brain_docs` filtered by `project_id` and `doc_type`. When a remote change arrives and the editor is clean, content updates silently. If the editor has unsaved changes, a toast notifies the user instead of overwriting.
- **SoulEditor, UserEditor, MemoryEditor**: All three editors now use the hook — SOUL.md, USER.md, MEMORY.md, and today's memory auto-refresh when `brain-doc-sync` pushes changes from the Mac mini.
- Ignores updates where `updated_by = 'dashboard'` to avoid echo loops.


- **brain-doc-sync.mjs**: Added `archiveDailyMemoryIfDateChanged()` — at midnight rollover, the current `memory_today` row is copied to a new `memory_day` row with a `<!-- date: YYYY-MM-DD -->` prefix before being overwritten with the new day's file. Prevents loss of previous day's memory data.

### Memory: daily sync + empty state UX + promote button + QMD awareness
- **brain-doc-sync.mjs**: Now syncs daily memory file (`memory/YYYY-MM-DD.md`) as `memory_today` with date-rolling logic. Previous days are not synced.
- **MemoryEditor**: Empty long-term memory shows friendly empty state with "Seed template" button. Promote button appends today's content (or text selection) to long-term with date header.
- **saveAgentFile**: `memory_today` now included in global doc types for correct NULL-key saves.
- **HealthPanel**: New "Memory Backend" section shows current backend (sqlite/qmd), QMD CLI availability, and explanatory text.
- **server/index.mjs**: New `GET /api/memory/status` endpoint reads `~/.openclaw/openclaw.json` and checks `qmd` CLI availability.
- **api.ts**: Added `getMemoryBackendStatus()` with graceful fallback when Control API unavailable.

### Fix: Brain doc editors now read/write global rows (NULL agent_key fallback)
- `getAgentFile()` now tries agent-specific row first, then falls back to the global row (`agent_key IS NULL`) written by `brain-doc-sync.mjs`.
- `saveAgentFile()` detects when a global row exists (and no agent-specific override) and updates it in-place, so changes flow back to the Mac mini via brain-doc-sync.
- Fixes blank SOUL.md / USER.md / MEMORY.md editors for the primary agent.

### Control API URL: Supabase persistence (cross-session)
- Created `project_settings` table (key-value, project-scoped) with open RLS matching existing patterns.
- `control-api.ts` now has `fetchControlApiUrlFromSupabase()` and `saveControlApiUrlToSupabase()` for reading/writing the URL.
- Store gains `initControlApiUrl()` — called on app mount in `AppShell`. If localStorage is empty, it fetches the URL from Supabase and caches it locally.
- HealthPanel **Save** now upserts to Supabase alongside localStorage. **Clear** deletes the Supabase setting too.
- Priority chain: localStorage (instant) → Supabase (persistent) → env var → empty string.

### Cron: Fix scheduled job deletion ghost-back behavior
- **`CronDeleteRequest`** now includes parsed `removed` boolean from executor result `stdoutTail`.
- **`getCronDeleteRequests`** parses `stdoutTail` JSON to extract `removed` status; falls back to `exitCode === 0` when JSON parsing fails.
- **`CronPage`** replaces `pendingDeletes` Set with a `deleteStates` Map tracking `'pending' | 'failed' | 'removed'` per job.
- Jobs with `removed: true` (or ambiguous success) are hidden from the list immediately, preventing ghost-back before mirror cleanup.
- Jobs with `removed: false` or error status show a "Delete failed — click to retry" badge.
- Retry button re-queues the delete request without requiring the confirmation dialog again.

### Skills: Capabilities Manager upgrade (rich metadata, detail drawer, add skill)
- **Expanded `Skill` interface** with `emoji`, `eligible`, `disabled`, `blockedByAllowlist`, `missing` (bins/env/config/os), `source`, `homepage`.
- **Server `/api/skills`** now passes through rich metadata from `openclaw skills list --json` and directory scan fallback parses emoji from SKILL.md frontmatter.
- **Server `POST /api/skills/install`**: New endpoint runs `openclaw skill install <identifier>` with input sanitization.
- **Mirror sync** now includes `extra_json` column for rich metadata persistence.
- **DB migration**: Added `extra_json` JSONB column to `skills_mirror`, created `skill_requests` table (request queue pattern).
- **SkillsPage redesigned**: Status-aware cards (Ready/Needs setup/Blocked/Disabled), sorted by readiness then alphabetical, emoji from metadata (fallback 🧩), source badges, relative timestamps.
- **SkillDetailDrawer**: Right-side drawer showing full description, missing requirements with copyable fix commands (brew install, export), status pills, source/version info, homepage links.
- **AddSkillDialog**: Paste a ClawdHub slug, npm package, or git URL to install. Falls back to Supabase request queue when Control API is unavailable.
- **Pending requests**: Shows queued install requests on the Skills page.


- **`/api/skills`**: Now uses `openclaw skills list --json` (CLI-first) instead of requiring `EXECUTOR_SKILLS_DIR`. Falls back to directory scan at common paths if CLI fails.
- **`/api/channels`**: New endpoint reads `~/.openclaw/openclaw.json` channels config and returns normalized array. Returns `[]` gracefully if file missing (no more 404).
- **Mirror sync**: Both endpoints now best-effort upsert results into `skills_mirror` and `channels_mirror` Supabase tables (throttled, non-blocking) so the dashboard shows data even when executor is offline.

### Skills & Channels: Supabase mirror fallback
- Created `skills_mirror` and `channels_mirror` Supabase tables (mirror pattern, matching `cron_mirror`).
- `getSkills()` and `getChannels()` now fall back to their respective mirror tables when the Control API is unavailable or fails, instead of returning empty arrays.
- No page changes needed — `SkillsPage` and `ChannelsPage` automatically render whatever the API returns.

### Cron toggle/run: fail loudly when Control API is connected + pending patch overlay
- **Toggle/Run** no longer silently fall back to the Supabase queue when the Control API is connected and the direct call fails. Instead, a destructive error toast is shown and the UI state stays unchanged so the toggle accurately reflects reality.
- **Pending patch overlay**: On page load, pending `cron_job_patch_requests` (queued/running) are fetched and merged on top of mirror data via `effectiveJobs` useMemo. This prevents toggles from reverting on page reload when the executor hasn't processed the patch yet.
- Offline/queue mode (Control API disconnected) continues to work as before.

### Cron actions: fallback-to-queue on direct API failure + stale mirror cleanup (legacy)
- **cron-mirror.mjs** now deletes mirror rows for jobs that no longer exist on the executor, preventing stale entries from accumulating.


- **ConfigPage auto-fetches** status and executor health on mount — no more manual "Refresh" required to see Online/Offline.
- **OpenClaw version card** replaces the old "Port" card, showing the version from `/api/executor-check`.
- **Status card** now reflects real executor connectivity (green/red based on health check results).
- **Executor check shared via Zustand** (`executorCheck` state) so HealthPanel and status cards stay in sync.
- **Skills tab**: removed 7 hardcoded mock skills; now fetches from Control API `/api/skills` or shows empty state with guidance.
- **Channels tab**: removed 3 hardcoded mock channels; now fetches from Control API `/api/channels` or shows empty state.
- **Removed** `mockSkills`, `mockCronJobs`, `mockChannels` arrays from `api.ts`.


- **Created `src/lib/control-api.ts`**: Runtime URL management — reads localStorage → VITE_API_BASE_URL → ''. Includes `testControlApi()` for `/api/executor-check`.
- **Created `src/components/settings/HealthPanel.tsx`**: Card with URL input, Test/Save/Clear buttons, and diagnostic results (binary, version, sessions/cron pass/fail).
- **Updated `src/lib/api.ts`**: `requestJson()` and `getStatus()` now use runtime URL getter instead of compile-time constant.
- **Updated `src/lib/store.ts`**: Added `controlApiUrl` and `setControlApiUrl` for reactive propagation.
- **Updated `src/components/pages/ConfigPage.tsx`**: Renders HealthPanel between status cards and actions.

### Safe Migration: Clawdbot → OpenClaw (executor compatibility wrapper)
- **Created `server/executor.mjs`**: Compatibility wrapper that resolves CLI binary (`openclaw` first, `clawdbot` fallback). Supports `EXECUTOR_BIN` env var for absolute path (launchd-safe). Uses `command -v` instead of `which`.
- **Updated `server/index.mjs`**: All 11 `exec('clawdbot ...')` calls replaced with `execExecutor(...)`. Hardcoded skills paths replaced with `EXECUTOR_SKILLS_DIR` env var (returns empty gracefully when unset).
- **Added `/api/executor-check`**: Non-destructive smoke test endpoint that checks binary resolution, `--version`, sessions, and cron list. No restart/stop/start.
- **Updated UI labels**: "Restart ClawdOffice?" → "Restart OpenClaw?", "Update Claw" → "Update OpenClaw", removed hardcoded `~/clawdbot/` paths from ConfigPage.
- **Updated `.env.example`**: Added `EXECUTOR_BIN` and `EXECUTOR_SKILLS_DIR` commented examples.
- **Updated docs**: README.md and docs/OVERVIEW.md now reference OpenClaw instead of Clawdbot. ClawdOS brand name preserved.
- **Not renamed**: `useClawdOffice` store hook, `ClawdOS` brand, Supabase tables, API routes.


- **Problem**: Jobs showed "Unassigned" even when agents were selected because agent info was only in DB columns, not the job payload itself.
- **Solution**: Dual-path persistence — agent/intent now stored in **both** DB columns AND as `@agent:`/`@intent:` headers in instructions.
- **New functions**: `encodeJobHeaders()` and `decodeJobHeaders()` in `schedule-utils.ts` handle header encoding/decoding.
- **Create flow**: New jobs encode agent + intent into instructions via headers for durable assignment.
- **Reassign flow**: Changing agent parses existing instructions, re-encodes with new agent, queues patch with both fields and updated instructions.
- **Display logic**: `getEffectiveTargetAgent()` and `getEffectiveIntent()` check DB fields first, fallback to parsing instructions.
- **UI polish**: AgentAssignmentDropdown compact mode now shows "Needs assignment" amber badge; layout improved with inline agent + intent badges.
- **Migration**: Users can manually reassign legacy jobs — dropdown click queues patch that durably updates instructions.

### Context Flow Architecture: centralized, predictable context system for agents
- **Database schema**: Extended `project_documents` with `agent_key` (scoping), `pinned`, `doc_type`, `sensitivity`, and `doc_notes` (structured extraction).
- **Project Overview**: New `brain_docs.doc_type = 'project_overview'` for project description, editable in Knowledge page, auto-included in every Context Pack.
- **Document scoping**: Documents can now be **Global** (all agents) or **Agent-specific**. Pinned docs are auto-included in Context Pack.
- **Document types**: general, playbook, reference, credentials, style_guide. Credentials get pointer-only treatment (no secrets in Context Pack).
- **Context Pack Builder**: New `src/lib/context-pack.ts` builds minimal, curated bundles with project overview, pinned doc summaries, and recent changes.
- **Edge Functions**: 
  - `get-context-pack` — Executor-callable endpoint returning structured ContextPack + markdown.
  - `extract-document-notes` — One-time AI extraction of summary/facts/rules/keywords per document.
- **Agent Creation**: New agents now get auto-generated SOUL.md from project template (includes Context Pack rule).
- **SOUL Template**: Editable per-project template stored in `brain_docs.doc_type = 'agent_soul_template'`.
- **UI Updates**: Knowledge page now shows Project Overview card, document scope/pin badges, and enhanced Add Document dialog with context settings.
- **Documentation**: See `docs/CONTEXT-FLOW.md` for full architecture details.

### Activity → Task Output Viewer: click task-linked activities to preview outputs
- Activity items with a linked task now show a chevron indicator and are clickable.
- Clicking opens a lightweight **TaskOutputPreview** sheet showing task title, status badge, and outputs (read-only).
- "View Full Task" button navigates to the Tasks page.
- Added `getTaskById(taskId)` API function for fetching single tasks.
- TaskOutputSection now supports `readOnly` prop to hide add/delete buttons.

### Task Outputs: capture structured deliverables for completed tasks
- Added `task_outputs` table to store summaries, files, links, and auto-generated log summaries per task.
- New **Outputs** collapsible section in TaskDetailSheet between description and thread.
- **Add Output** dialog with tabs: Summary (text), Link (URL), File (upload), and Auto (AI summarization from task activities).
- Files stored in `clawdos-documents/{projectId}/tasks/{taskId}/` path convention.
- `generateTaskLogSummary()` queries task-related activities and calls `summarize-activity` edge function.

### Manage: realtime refresh for Agents + Activity (presence + feed)
- **Agents** and **Activity** pages now listen to Supabase realtime (`activities`, `agents`, `agent_status`) and refresh within ~500ms.
- Debounced to avoid hammering when many events fire.

### brain-doc-sync: write Supabase activities for local brain doc edits (brain-doc sync)
- When `scripts/brain-doc-sync.mjs` detects a local file change and upserts it to Supabase, it now also inserts a `brain_doc_updated` activity row.
- Keeps the Live Feed consistent even when edits happen outside the dashboard UI.

### TopBar: auto-recover when selected project id is missing (projects scoping)
- If `localStorage` (or a deep-link) points at a project id that isn't in the current projects list, we now auto-select the first available project.
- Prevents a controlled `<select>` from rendering with an empty/invalid value in flaky-load scenarios.

### Manage → Agents: reload brain docs from server (sync-friendly)
- Added a **Reload** button to SOUL/USER/MEMORY editors.
- If you have unsaved changes, we confirm before discarding.
- Makes it easy to pull fresh Supabase/remote edits without a full page refresh.

### Dashboard: realtime patches for activity + presence (Supabase)
- `subscribeToProjectRealtime()` now forwards realtime event details instead of just “something changed”.
- Dashboard applies **activity INSERTs** + **agent_status updates** incrementally for snappier UI, while still falling back to a debounced full refresh for everything else.

### Dashboard: subtle textured gradient background (mobile polish)
- Applied the existing `.dashboard-texture` CSS to the Dashboard view wrapper.
- Gives the main screen a slightly more “alive” mission-control feel without adding any image assets.

### Server: bump agent_status.last_activity_at when logging Supabase activities (presence)
- `POST /api/activity` → server-side `logSupabaseActivity()` now best-effort updates `agent_status.last_activity_at` for real agent actors.
- Helps prevent agents from looking stale in Supabase-first deployments where presence is driven mostly by activity events.

### AgentProfilePanel: Presence “Last seen” shows relative + absolute time
- Presence section now includes a **Last seen** row that combines a relative timestamp (e.g. "5m ago") with the absolute datetime.
- Makes it easier to sanity-check presence freshness at a glance.

### Dashboard Live Feed: taller, responsive scroll region (mobile polish)
- Live Feed now uses a responsive max height (`60vh` up to ~520px) instead of a hard 300px cap.
- Makes the activity feed usable on larger screens while still behaving nicely on mobile.

### Dashboard agent list: show presence status note (agent_status.note)
- Agents sidebar + mobile drawer now surface the current `agent_status.note` as a short secondary line.
- Collapsed sidebar tooltips include the note as well.

### AgentProfilePanel: mobile-friendly tab strip (horizontal scroll)
- AgentProfilePanel tabs now scroll horizontally on small screens (no more squished/overflowed tab labels).
- Desktop behavior unchanged (tabs still distribute evenly).

### Manage TopBar: mobile-friendly tab strip (horizontal scroll)
- Manage-mode navigation tabs now scroll horizontally on small screens (no more overflow/clipping).
- Reduced nav tab padding on mobile for a denser, more usable header.

### AgentProfilePanel: run cron jobs directly from the Schedule tab
- AgentProfilePanel Schedule tab now includes a **Run** button per matched cron job.
- Uses the existing Control API `runCronJob()` wiring and shows a toast on success/failure.

### AgentProfilePanel: patch presence edits immediately (status + note)
- When you edit an agent’s `agent_status` from the AgentProfilePanel, the Dashboard roster + open panel now update immediately (no “wait for refresh” confusion).
- Includes a lightweight derived `status` so the header pill reflects the change right away.

### Activity: dashboard actor key honors VITE_DASHBOARD_PRESENCE_AGENT_KEY
- `createActivity()` now defaults the actor to `VITE_DASHBOARD_PRESENCE_AGENT_KEY` when set (otherwise `dashboard`).
- AgentProfilePanel “Send message” now relies on this default so session notes attribute cleanly to the dashboard agent.

### Manage → Activity: click an activity author to jump to the agent editor
- In the full-page **Manage → Activity** feed, the author label is now clickable when it refers to an `agent:*` key.
- Clicking it jumps you to **Manage → Agents** with that agent selected (handy for presence debugging / brain docs edits).

### Datetime helpers: shared relative timestamps (feed + agent profile)
- Added `formatRelativeTime()` to `src/lib/datetime.ts` so relative timestamps are consistent across the app.
- Dashboard Live Feed now uses the shared helper (with a stable `now` tick).
- AgentProfilePanel Timeline/Messages now show relative time with absolute time on hover.

### Agents sidebar: smarter default emoji when creating a new agent
- The **New Agent** prompt now suggests an emoji based on the agent key/name/role (keyword match + deterministic fallback).
- Helps keep agents visually distinct out of the box (pairs nicely with the existing suggested theme color).

### Manage → Activity: new full-page project activity feed
- Added a dedicated **Activity** tab in the Manage navbar.
- Shows the full project-scoped activity feed (Supabase `activities` + git commits fallback) with type filter + search + load more.
- Activity entries now generate **non-technical AI summaries** (stored on `activities.summary`) for quick scanning.

### Dashboard Live Feed: filter/search against full fetched feed (not just visible 25)
- Live Feed filters/search now operate across the full fetched activity range (up to ~200 items), instead of only the first 25.
- The UI still renders a compact 25-item window for performance.

### AgentProfilePanel: show more Timeline/Messages (activity feed polish)
- Timeline and Messages tabs now show a count badge and support a **Show more / Show less** toggle.
- Defaults remain compact (12 timeline rows / 10 messages) but you can expand up to 50 for deep debugging.

### Dashboard Live Feed: quick search (persisted)
- Added a small **Search…** box to the Live Feed header.
- Filters by title/subtitle/message and persists per project via `localStorage` (`clawdos.feedSearch.<projectId>`).

### Dashboard Live Feed: filter by agent (persisted)
- Added an **All agents / <agent>** dropdown next to the type filter in the Live Feed.
- Filter persists per project via `localStorage` (`clawdos.feedAgent.<projectId>`).
- Activity rows match on **actor** or **recipient**; cron rows match by scanning job name/instructions for the agent key/name.

### Presence: prevent “stuck WORKING” status when an agent hasn’t been seen recently
- Dashboard presence now degrades a `working` agent to **OFFLINE** if we haven’t seen heartbeat/activity in ~30 minutes.
- Prevents permanently-running “ghost” agents when a session crashes or presence updates stop flowing.

### Agents sidebar: “Seen … ago” now uses newest heartbeat/activity (presence accuracy)
- Sidebar no longer prioritizes heartbeat over activity; it now chooses whichever timestamp is newest.
- Prevents agents from looking stale when they recently emitted activity but have an older heartbeat (or vice versa).

### Notifications: filter global activity bell by type (persisted)
- Added a lightweight **All types / <type>** filter in the TopBar notification bell.
- Filter persists via `localStorage` (`clawdos.globalActivity.type`) so the bell stays focused across reloads.

### TopBar: pulse the “Connected” status dot (alive UI polish)
- Online/connected status dot now has a subtle pulse so the header feels less static.
- Respects `prefers-reduced-motion` (animation disabled).

### AgentProfilePanel: quick-jump to brain doc editors (SOUL/USER/MEMORY)
- Added a small **Brain docs** section in the AgentProfilePanel with one-click buttons to open the selected agent directly in **Manage → Agents** on the right editor tab.
- Makes it much faster to go from “who is this agent?” → editing their brain docs without hunting through navigation.

### AgentProfilePanel: patch roster immediately after saving emoji/color (mobile polish)
- After saving an agent’s **Emoji**/**Color**, the Dashboard roster + open AgentProfilePanel update immediately (no refresh needed).
- Implemented via an optional `onAgentPatched` callback from Dashboard → AgentProfilePanel.

### Manage → Agents: project-scoped selection (no stale agent keys)
- When switching projects, if the previously selected agent doesn’t exist in the new project, the sidebar auto-selects the first available agent (or clears selection).
- AgentDetail now reloads on project change and shows a soft “Agent not found in this project” state instead of rendering a broken header.

### AgentProfilePanel: better “Send message” UX (toast + safer Enter)
- Sending a message now shows a success toast and surfaces errors via a destructive toast.
- Enter-to-send now avoids firing while IME composition is active (prevents accidental sends while typing in Japanese/Chinese/etc).

### Presence: main agent status uses per-agent session count (more accurate)
- `/api/status` no longer marks `agent:main:main` as WORKING just because *any* agent has active sessions.
- We now count sessions whose key normalizes to `agent:main:main` and use that for the main presence row.

### Supabase projects typing: include `tag` in SupabaseProject
- Updated `src/lib/supabase-data.ts` to include the `projects.tag` field in the SupabaseProject interface.
- Keeps TypeScript types aligned with the `projects` table now that system/highlight tags are supported.

### Brain-doc sync: avoid clobbering newer Supabase edits (conflict-safe)
- `scripts/brain-doc-sync.mjs` now checks `brain_docs.updated_at` vs local file mtime before upserting.
- If Supabase is newer, it writes a local `.bak` conflict copy and re-applies the remote canonical content instead of overwriting.
- Reduces accidental “last writer wins” damage during simultaneous dashboard + local edits.

### Dashboard Live Feed: persist type filter per project
- The Live Feed type filter now saves to `localStorage` (`clawdos.feedType.<projectId>`) and restores on reload/project switch.
- Makes it easier to keep the feed focused (e.g. build_update/session) while iterating.

### Dashboard: clear selected agent when switching projects
- Prevents the AgentProfilePanel from showing stale data from the previously selected project.
- Keeps roster/tasks/activity context correctly project-scoped (mobile sheet closes too).

### Dashboard Live Feed: filter by activity type
- Added a compact **All types / build_update / session / …** filter dropdown in the Live Feed header.
- Makes it easier to scan the firehose while keeping the existing feed + cron quick-links intact.

### Notifications: ensure clicked project exists in selector (fails soft)
- When clicking an item in the global activity bell, we now best-effort add the referenced project into the local projects list if it isn't already present.
- Prevents the project dropdown from briefly showing an unknown/blank value when the bell references a project the UI hasn’t loaded yet (or if project fetch failed).

### Dashboard Live Feed: Details dialog can open sender vs recipient agents
- Feed item Details dialog now offers clearer navigation:
  - For `session` items: **Open recipient** and (when different) **Open sender**.
  - For other activity items: keeps a single **Open agent** button.
- Makes it faster to jump to the right agent when reading dashboard → agent messages.

### AgentProfilePanel: Messages tab renders clean "inbox" messages
- Session activity messages like `To agent:main:main: ...` now render as a clean message body (without the routing prefix).
- Shows a lightweight **From <author>** line so per-agent inboxes are easier to scan.

### AgentProfilePanel: edit agent emoji + theme color
- Agent profile header now includes inline **Emoji** + **Color** inputs with a **Save** button.
- Persists updates to Supabase `agents` (upsert) and emits an `agent_updated` activity.

### Dashboard: subtle textured background gradient (mobile polish)
- Adds a lightweight, image-free “mission control” texture behind the Dashboard main column.
- Implemented as layered CSS gradients (`.dashboard-texture`) so it stays fast + theme-aware.

### Agents sidebar: reduce re-render churn for “Seen … ago” labels (mobile polish)
- Sidebar no longer re-renders every second just to update “Seen … ago”.
- Timestamp tick is now every ~10s, and very recent activity shows as “Seen just now” / “Seen <1m ago”.

### Dashboard Live Feed: don’t truncate activity list at 20 items
- The feed renderer no longer hard-caps Supabase activity items to 20; it now renders the full fetched list (respecting the configured fetch limit / “Load more”).

### Presence: seed missing agent_status rows using agents.created_at (less misleading)
- When an agent exists in `agents` but is missing a matching `agent_status` row, we still upsert a default presence row so the dashboard can render.
- Instead of seeding `last_activity_at` with "now" (which made agents look freshly online), we now prefer the agent's `created_at` timestamp when available.

### AgentProfilePanel: copy agent key button
- Agent profile header now shows the agent key (e.g. `agent:main:main`) with a one-click **Copy** action.
- Handy for wiring cron heuristics, activity debugging, and quick “message routing” tests.

### Dashboard Live Feed: keep cron “upcoming” links from floating above real activity
- Cron jobs in the Live Feed are now anchored to epoch time so upcoming schedules (future timestamps) don’t sort above real recent activity.
- Still shows the next run time in the subtitle ("Next: …") and remains clickable for quick navigation to Cron manager.

### Dashboard Live Feed: feed item details dialog
- Added an inline **Details** (ⓘ) button on each Live Feed card to open a dialog with raw fields.
- Includes quick actions (Open agent/Open Cron manager when applicable) + a **Copy JSON** button for debugging.

### TopBar: Load more for global activity notifications
- Global activity bell now supports **Load more** (increments fetch limit in steps of 10, clamped to 200).
- The popover keeps auto-refreshing at the currently selected limit.

### Dashboard Live Feed: Load more button + configurable activity fetch limit
- `getActivity(limit)` now accepts a limit (clamped 1–200) instead of hardcoding 50.
- Dashboard Live Feed shows a **Load more** button when the feed hits the current limit, so you can pull older history without a reload.

### Projects: persist selected project in localStorage
- Switching projects now writes the selected project id to `localStorage` (key: `clawdos.project`).
- Fixes the project selector resetting back to the default project on refresh/reload.

### Agents sidebar: subtle “working/online” glow around active agents
- Mobile + desktop sidebar agent tiles now get a subtle ring/glow when an agent is **online** or **working**.
- Makes the left rail feel more “alive” without deleting/changing any major UI.

### Presence: normalize agent keys when bumping agent_status from activity writes
- When `createActivity()` writes directly to Supabase, presence updates now normalize actor keys like `agent:main:main:cron` → `agent:main:main`.
- Prevents presence rows from splitting into duplicate keys and keeps the sidebar/profile status accurate.

### AgentProfilePanel: standardize timestamps via shared datetime helpers
- Agent profile Timeline/Messages now uses `formatDateTime()` for consistent 12h month/day timestamps.
- Schedule tab “Next run” label now uses the same formatter when `nextRunAtMs` is available.

### Dashboard Live Feed: session items open the recipient agent
- Live Feed session entries now prefer the **recipient** agent (when present) for avatar tinting + click-through.
  - Example: a feed item showing `dashboard → Research` now opens **Research** instead of the sender.

### Datetime formatting: standardize on 12h “normal time” across UI
- Added `src/lib/datetime.ts` helpers (`formatDateTime`, `formatTime`) for consistent month/day + 12h timestamps.
- Cron page now uses the shared formatter for next-run + run history + “Updated” label.
- Notifications tooltip now uses the same 12h time formatting.

### TopBar: visually highlight Front Office (system) project
- When the selected project is tagged `system` (Front Office), the top bar now gets a subtle amber tint.
- Makes it obvious you’re editing the admin system itself (without deleting/changing any major UI).

### Presence: optional Supabase-only dashboard keepalive (agent_status)
- Dashboard can now *optionally* upsert presence directly to Supabase every 60s (for Supabase-only deployments where the Control API isn’t available).
- Opt-in via:
  - `VITE_DASHBOARD_PRESENCE_AGENT_KEY=agent:ui:dashboard` (or any agent key)
  - optional `VITE_DASHBOARD_PRESENCE_CREATE_AGENT=true` to also seed an `agents` roster row.

### AgentProfilePanel: open scheduled job in Cron manager
- Schedule tab now includes an **Open** button per matched cron job.
- Clicking it switches to **Manage → Cron**, auto-expands that job, and scrolls it into view.

### Dashboard: tint agent avatars in sidebar using theme color
- When an agent has a `color` (from Supabase `agents.color`), their avatar tile in the sidebar now gets a subtle tint + top stripe.
- Applies to both **desktop** (collapsed + expanded) and **mobile** agent lists.

### Dashboard: show agent “last active” in sidebar (desktop + mobile)
- Added a subtle `Last active …` line under each agent (when available) so presence is readable at a glance.
- Collapsed sidebar tooltips now include last active info.

### Supabase realtime: use the auth-aware client everywhere
- `src/lib/supabase.ts` now re-exports the generated `@/integrations/supabase/client` instance (instead of creating a separate env-based client).
- Fixes a subtle realtime bug where Dashboard realtime could be "disabled" (or unauthenticated) even though the rest of the app was using Supabase.

### TopBar: responsive notifications popover width
- Notifications bell popover now uses a responsive width (`min(24rem, 100vw - 2rem)`) so it doesn’t overflow on mobile.

### TopBar: global activity bell deep-links cron entries
- Clicking a `cron` / `cron_run_requested` notification now jumps straight to **Manage → Cron**.
- If the activity message includes a job id (e.g. `Requested cron run: <jobId>`), the Cron page auto-expands + scrolls to that job.

### Brain-doc sync: avoid echo loops + redundant writes
- `scripts/brain-doc-sync.mjs` now skips writing local brain docs when content is unchanged.
- The local polling watcher now initializes from existing file contents (avoids an immediate first-tick upsert).
- Added an in-memory `lastLocal` cache so remote updates don't immediately bounce back into Supabase as a redundant `local_file` upsert.

### Supabase: add per-agent brain_docs (SOUL/USER/MEMORY) + realtime subscription
- Added a `brain_docs` table migration with RLS + updated_at trigger (`supabase/migrations/20260203000001_add_brain_docs.sql`).
- Fixed Supabase-mode agent file reads/writes to scope by `agent_key` (was incorrectly shared across all agents in a project).
- Live project realtime subscription now listens to `brain_docs` changes so doc edits refresh immediately.

### Projects: centralize selected project persistence
- Added `src/lib/project.ts` with safe `getSelectedProjectId()` / `setSelectedProjectId()` helpers.
- Switched API layer, Zustand store init, TopBar persistence, and `supabase-data.ts` to use the shared helper.
  - Prevents subtle SSR/localStorage edge cases and keeps `x-clawdos-project` scoping consistent.

### Supabase-only builds: create projects via Supabase (no Control API required)
- `createProject()` now supports Supabase mode by upserting the `projects` row directly (workspace_path can be set later).
- TopBar “New project” now alerts on failure instead of silently reloading.

### Supabase-only builds: status fetch fails soft + restart disabled without Control API
- `getStatus()` now returns a **Supabase connectivity** status when Supabase is configured but `VITE_API_BASE_URL` is missing.
  - Prevents the UI from crashing in Supabase-first deployments.
- TopBar now **catches status errors** and renders `activeSessions` as `—` when unknown.
- Restart is automatically **disabled** when `VITE_API_BASE_URL` isn’t configured (with a helpful tooltip).

### AgentProfilePanel: Schedule tab shows cron jobs (with instructions)
- AgentProfilePanel now includes a **Schedule** tab that lists cron jobs that appear to belong to the agent.
- Shows schedule, enabled/disabled, next run, and lets you expand to view the job’s full instructions.
- v1 heuristic: matches jobs by scanning the job name/instructions for the agent key or display name.

### Agents sidebar: New Agent prompt includes theme color (suggested)
- Creating a new agent from the sidebar now asks for an optional **theme color** (hex).
- We suggest a deterministic color from a small palette based on the agent key, so new agents get a consistent visual identity by default.

### Dashboard Live Feed: click cron entries to open Cron page
- Clicking a Live Feed item for `cron` (or `cron_run_requested`) now switches to **Manage → Cron**.
  - Makes the feed actionable instead of a dead list.

### Tooling: log-build-update prefers service role key
- `scripts/log-build-update.mjs` now prefers `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_KEY` when present.
  - Makes build-update activity logging reliable even when RLS blocks anon inserts.
  - Still falls back to anon keys when service keys aren’t available.

### Dashboard Live Feed: relative timestamps + hover absolute
- Live Feed now shows a relative timestamp (e.g. "5m ago") for faster scanning.
- Hovering the time reveals the full absolute timestamp for precision.

### AgentProfilePanel: resolve current task title from tasks
- Presence section now shows the **task title** (when available in the dashboard task list) alongside the raw `current_task_id`.
- Falls back to displaying the raw task id when we don't have the task locally yet.

### Dashboard Live Feed: show agent avatars + type in subtitle
- Live Feed items attributed to a known agent now render the agent’s emoji in a tinted tile (uses agent `color` when present).
- Feed subtitle prefers the agent’s display name (instead of raw `actor_agent_key`) and also shows the activity `type` (monospace) for fast scanning.

### AgentProfilePanel: show agent theme color in profile header
- AgentProfilePanel now tints the avatar tile with the agent’s `color` (when present) and shows a small color dot next to the name.

### Agents sidebar: optional drag-to-reorder (custom sort mode)
- Agents sidebar now supports a per-project **Custom** ordering mode (toggle button).
- In custom mode, agent cards are draggable and the order persists in `localStorage` (`clawdos.agentOrder.<projectId>`).
- Default behavior remains status-priority sorting.

### AgentProfilePanel: Messages tab shows logged session notes
- AgentProfilePanel now renders a lightweight “Messages” tab by filtering `type=session` activity rows.
- Sending a message now encodes the recipient agent key in the activity message (`To agent:<name>:<kind>:`) so the per-agent inbox works without a dedicated messages table.

### Activity feed: display-friendly author labels
- Supabase-backed activity items now derive `authorLabel` as a human-friendly display name (e.g. `agent:main:main` → `main`).
- AgentProfilePanel timeline matching still works with both raw keys and legacy/looser author formats.

### Notifications: click global activity to switch projects
- Global activity items in the notification bell are now clickable.
- Clicking an item switches the selected project to that activity’s project and returns you to Dashboard view.

### Notifications: clear unread badge when you open the bell
- The global activity bell now keeps a `lastSeenAt` value in React state (not only `localStorage`).
- When the notifications popover opens, we update both `localStorage` *and* state so the unread badge clears immediately (no refresh required).

### Presence: upsert agent_status for *all* active agents from /api/sessions
- Control API `GET /api/sessions` now upserts Supabase `agent_status` for every inferred `agent:<name>:<kind>` key (not just `agent:main:main`).
  - Ensures multi-agent dashboards show accurate online/working + last_activity_at.
  - Still guarantees a default `agent:main:main` presence row even when no sessions are active.

### Activity feed: agent key parsing (click-through to profile)
- Fixed Dashboard Live Feed click-through to agent profiles when `actor_agent_key` uses colon-delimited keys (e.g. `agent:main:main`).
  - Feed now normalizes agent keys to `agent:<name>:<kind>` so `agentByKey` lookups succeed.

### Dashboard: subtle background gradient
- Added a very light vertical gradient to the Dashboard main scroll area so the page feels less flat (matches the “alive” UI direction without deleting any UI).

### Presence: sync agent_status from live sessions
- Control API `GET /api/sessions` now derives a base `agentKey` from each session key (e.g. `agent:main:cron:...` → `agent:main:main`) and uses it to best-effort upsert Supabase `agent_status`.
  - Keeps `last_activity_at` aligned with the most recently updated session.
  - Sets a lightweight `note` like `N active session(s)` so the profile panel has context.
- `/api/status` now also sets a similar note when it refreshes main-agent presence.

### Activity: fix agent key normalization for per-agent timelines
- Fixed a subtle Supabase activity parsing bug where `actor_agent_key` like `agent:main:main` was being truncated to `main`.
  - `getActivity()` now normalizes agent keys as `agent:<name>:<kind>` and strips only *extra* trailing segments (e.g. `agent:main:main:cron` → `agent:main:main`).
  - AgentProfilePanel uses the same normalization so the Timeline tab correctly filters activity for agents.

### TopBar: notification bell (global activity)
- Added a notification bell in the top bar that shows the most recent 10 Supabase `activities` across **all projects**.
  - Includes per-project labels, timestamps, and type-based icons.
  - Tracks a simple unread count using localStorage (marks all seen when you open the popover).
- Control API: added `GET /api/activity/global?limit=N` (service-role Supabase) to power the bell.

### Dashboard: switch timestamps to 12-hour time
- Dashboard clock and feed timestamps now use normal 12-hour time (with seconds) instead of 24h.
- Agent profile panel timestamps match for consistency.

### Agents sidebar: “New Agent” button (Supabase)
- Added a lightweight “+” button in the Agents sidebar to create a new agent roster entry (Supabase `agents`) and seed presence (`agent_status`).
- Uses simple prompts for now (key/name/emoji/role) to avoid heavy UI work while wiring is in progress.

### Activity UI: icons for new activity types
- Dashboard Live Feed and AgentProfilePanel now recognize:
  - `brain_doc_updated` → 🧠
  - `cron_run_requested` → ▶️
- Feed item typing is now `string` so new activity event types render without requiring a frontend update.

### Activity feed: log brain doc edits in Supabase mode
- When the dashboard saves SOUL/USER/MEMORY via Supabase `brain_docs`, we now best-effort insert an `activities` row (`type=brain_doc_updated`).
  - Keeps the Live Feed accurate even when bypassing the Control API.

### Dashboard: follow active project for realtime + refresh
- Dashboard now uses the shared store’s `selectedProjectId` for Supabase realtime subscriptions.
  - Fixes a subtle bug where switching projects would keep the dashboard subscribed to the old project until a full reload.

### Build: remove TopBar dynamic import warning
- TopBar now imports `createProject()` statically instead of via `await import()`.
  - Fixes Vite warning about `src/lib/api.ts` being both dynamically and statically imported (and keeps chunking predictable).

### Agents sidebar: manual refresh + "updated" timestamp
- Agents sidebar now shows how recently the roster was refreshed and provides a one-click refresh button (with spinner), matching the Live Feed UX.

### Dashboard: presence keepalive (agent_status)
- Dashboard now pings `/api/status` every 60s while open (best effort).
  - This keeps Supabase `agent_status` fresh (server-side upsert happens on `/api/status`) so agents don’t drift offline when the UI is idle.

### Server: Supabase service-role support + presence heartbeat
- `server/index.mjs` now prefers `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`) when present.
  - This fixes server-side inserts/upserts that were blocked by RLS when only anon keys were available.
- `/api/status` now best-effort upserts `agent_status` for the main agent (`agent:main:main`) so presence stays fresh.

### Projects dropdown (workspace selector)
- Added `projects.json` and a Project selector in the top bar.
- Control API now supports scoping by project via `x-clawdos-project` header.
- UI stores the selected project in localStorage (key: `clawdos.project`).

### Dashboard restored to a task manager
- Dashboard is now a task board again (Kanban) backed by `memory/tasks.json` in the selected project workspace.
- Added basic Create Task and Move Task actions.
- Sessions are no longer the primary dashboard object (they were confusing in the UI).

### Supabase integration (start)
- Added `@supabase/supabase-js` and `src/lib/supabase.ts`.
- `getProjects()`, `getAgents()`, and task APIs now prefer Supabase tables when Supabase env vars are present.
- Mock data now requires explicit `VITE_ALLOW_MOCKS=true` in dev to prevent ghost agents.
- Added `scripts/supabase-admin.mjs` to seed/repair DB state (projects + agents).
- Activity feed:
  - `getActivity()` now prefers Supabase `activities`.
  - Task create/move now writes activity rows (best effort).

### Supabase admin script can now log activities + agent presence
- `scripts/supabase-admin.mjs` accepts `--activity "..."` to insert an `activities` row.
- Supports `--type` (default `build_update`) and `--actor` (default `agent:main:main`).
- Now also supports `--status` / `--heartbeat` to upsert `agent_status` (presence), with `--state`, `--note`, and `--agent-key`.
- Intended for quickly recording build updates and keeping agent presence fresh while wiring is in progress.
- Also loads `.env.local` (in addition to `.env`) so service role keys don’t have to live in `.env`.

### Cron: enable/disable wired (Control API)
- Added `POST /api/cron/:id/toggle` (plus `/enable` and `/disable`) to the Control API.
- `toggleCronJob()` now hits the Control API so the Cron UI switch actually enables/disables real jobs.

### Bidirectional brain docs (Supabase + Mac mini sync)
- Added Supabase `brain_docs` table (project_id + doc_type + content + updated_at + updated_by) and dev RLS policies.
- Frontend SOUL/USER/MEMORY editors now read/write via Supabase `brain_docs` when Supabase is configured.
- Added `scripts/brain-doc-sync.mjs` (Mac mini) to keep workspace files in lockstep:
  - seeds missing docs from local files
  - subscribes to Supabase realtime changes and writes to local files
  - watches local files and upserts back to Supabase
  - git-commits synced file changes (best effort)
- Installed always-on launchd service:
  - `~/Library/LaunchAgents/com.trunks.clawdos.brain-doc-sync.plist`
  - log: `~/Library/Logs/clawdos-brain-doc-sync.log`
  - docs: `docs/OPERATIONS.md`

### New project scaffolding (v1)
- Control API can now create a new workspace on disk under `/Users/trunks/clawd-projects/<projectId>` and register it.
- Top bar now includes a “+” button to create a new project (id + name).

## Next planned work
- New agent button per project (roster + agent_status + later cron heartbeat).
- Add a watchdog automation to prevent long idle gaps (alert if no commits in 60m).
- Agents sidebar alignment:
  - Treat agents as session keys (per the Mission Control article).
  - Show “Runs” separately (cron wakeups, isolated runs).
- UI: display commit hash returned on save + add diff/rollback UI.
- Cron: edit endpoints + UI (schedule/instructions) + run history status.
- Add safer “reload” behaviors (lightweight reload vs full gateway restart) with guardrails.
- UI polish: animations, empty states, error states, realtime updates.
- Remote access path (Tailscale/Cloudflare) + authentication.

### Agent presence (Supabase agent_status)
- `getAgents()` now merges `agents` + `agent_status` (when Supabase is configured).
- Dashboard status is derived from `agent_status.state` + recency of `last_activity_at` (online/idle/offline) with `working → running`.
- Agent profile panel now shows the real `agent_status.note` (when present) and a rough "since" based on `last_activity_at`.

### Activity feed (Supabase activities)
- `getActivity()` now returns structured activity items when Supabase is configured (preserves `type` and `taskId`).
- Dashboard feed now shows activity-specific icons (task_created/task_moved/build_update) and formats timestamps.

### Mobile polish: AgentProfilePanel
- Agent profile now opens as a right-side **Sheet** on mobile (instead of trying to render a fixed-width sidebar).
- Desktop keeps the persistent right sidebar panel.
- `AgentProfilePanel` supports a `variant` prop (`sidebar` | `sheet`) to control layout/borders.

### Fix: project scoping header (CORS)
- Server now allows the browser to send the `x-clawdos-project` header by including it in CORS `access-control-allow-headers`.
- This unblocks real per-project workspace routing (instead of always defaulting to `front-office`).

### Fix: Control API server startup log
- Fixed a `ReferenceError` on server startup (`WORKSPACE` was undefined) by logging `DEFAULT_WORKSPACE` instead.

### AgentProfilePanel wiring: real attention + timeline
- Agent profile panel now accepts `tasks` + `activity` from the Dashboard.
- **Attention** tab shows real assigned (non-done) tasks for the agent.
- **Timeline** tab shows recent activity rows authored by the agent (from Supabase `activities` when configured).
- Replaced mock “about/skills” placeholders with lightweight, real presence fields (state/current task/last heartbeat/activity) and skillCount.

### Fix: Control API can create project memory/ files on first write
- Control API now `mkdir -p`s the parent directory before writing agent files (`memory/YYYY-MM-DD.md`) and `memory/tasks.json`.
- This prevents 500s when a new project workspace doesn’t already have a `memory/` folder.

### Front Office project highlighting
- Top bar now shows a **Front Office** badge when the selected project is tagged `system`.
- Project selector prefixes system projects with a star ("★") so it’s obvious when you’re editing the admin system itself.

### Cron: run history endpoint + UI
- Control API: added `GET /api/cron/:id/runs?limit=N` (calls `clawdbot cron runs`) so the UI can fetch JSONL-backed run history.
- Cron page: when you expand a job, it fetches and shows the last few runs (status, duration, summary).

### Agent file editors: show commit hash on save
- SOUL/USER/MEMORY editors now display the short git commit hash returned by the Control API after a successful save.
- Also ensures saving state clears reliably via `finally`.

### Presence: dashboard agent status now considers heartbeat timestamps
- When resolving an agent's dashboard status (online/idle/offline), we now use the most recent of `last_activity_at` and `last_heartbeat_at` from Supabase `agent_status`.
- This prevents agents from showing as "idle" when they are heartbeating but not emitting activity events.
- Agent profile panel now shows its "Since …" helper based on the same "last seen" concept (newest activity/heartbeat).

### Presence: auto-create missing agent_status rows
- When Supabase is configured, `getAgents()` now upserts default `agent_status` rows for any agents missing presence.
- This keeps the dashboard/profile panel presence fields populated without manual seeding.

### Activity UI: display-friendly actor labels (while keeping raw keys)
- Supabase activities now carry both a raw `author` (e.g. `agent:main:main`) and a display-friendly `authorLabel` (e.g. `main`).
- Dashboard Live Feed uses the friendly label so the feed reads cleanly, while exact matching still works elsewhere.

### Fix: restore selected project on reload
- Zustand store now initializes `selectedProjectId` from `localStorage` (`clawdos.project`) so project scoping stays consistent across refreshes.

### Activity feed: human-readable task move messages
- When a task is moved in Supabase mode, we now look up the task title and write activity messages like `Moved “Title” → in_progress` instead of `taskId -> status`.

### Tooling: log build updates to Supabase
- Added `scripts/log-build-update.mjs` to insert a short `activities` row (`type=build_update`) from the CLI.
- Now loads `.env.local` as well as `.env` so local Supabase keys work out of the box.

### Live Feed: manual refresh + "updated" timestamp
- Dashboard Live Feed header now shows how recently the data was refreshed and provides a one-click refresh button (with spinner).

### Brain-doc sync: log agent file edits to Supabase activity feed
- Control API now best-effort inserts an `activities` row (`type=brain_doc_updated`) when saving SOUL/USER/MEMORY files.
- This makes doc edits show up in the Live Feed when Supabase is configured.

### Agents sidebar: live refresh + status-priority sorting
- Agents list now auto-refreshes every 30s (fails soft if the request errors).
- Sidebar sorts agents by status priority (running → online → idle → offline), then name.

### Agents sidebar: show per-agent color theme
- Agent roster now carries through the Supabase `agents.color` field (when present).
- Sidebar renders a small colored dot on each agent card, making distinct agents easier to scan.

### Dashboard: Supabase realtime subscriptions
- When Supabase is configured, Dashboard now subscribes to realtime changes on `activities`, `agent_status`, and `tasks` for the selected project.
- Falls back to a slower poll (30s) so it self-heals if a realtime channel drops.

### Agents sidebar: subtle glow for running agents
- Sidebar now adds a subtle animated halo/glow around agents whose status resolves to `running`.
- Respects `prefers-reduced-motion`.

### Cron page: refresh jobs + run history
- Added a “Refresh” button with last-updated timestamp for the cron jobs list.
- Added per-job “Refresh runs” to re-fetch run history on demand (useful during debugging).

### Agents page: richer agent header
- Agent detail header now displays the real agent emoji/avatar, role, status badge, and color dot (when available) instead of a hard-coded 🤖.
- Fetches agent roster best-effort and fails soft so file editors still work if roster fetch fails.

### AgentProfilePanel: timeline now matches normalized Supabase actor keys
- Fixed AgentProfilePanel timeline filtering to handle compound actor keys (e.g. `agent:<agentKey>:<sessionKind>`), so per-agent activity shows up reliably.

### Cron: edit job name/schedule/instructions (Control API + UI)
- Control API now supports `POST /api/cron/:id/edit` (maps to `clawdbot cron edit`) so jobs can be updated from the web UI.
- Cron page now has an **Edit** dialog for updating a job's name, cron expression, and instructions.
- Increased cron list/enable/disable/run timeouts in the Control API to avoid gateway timeouts on slower responses.

### Build: vendor chunking (Vite)
- Added a simple Rollup `manualChunks` strategy so production builds split `node_modules` into vendor chunks.
- Prevents the main JS bundle from growing into a single monolith (and removes the >500k chunk warning).

### Cron: stable next-run timestamps (nextRunAtMs)
- Control API now passes through `nextRunAtMs` (when provided by `clawdbot cron list`).
- Cron page and Dashboard feed prefer the numeric timestamp for rendering/sorting, and fall back to the old `nextRun` string.

### Build: suppress noisy Browserslist old-data warning
- Build scripts now set BROWSERSLIST_IGNORE_OLD_DATA=1 so CI/local builds aren’t spammed by the caniuse-lite age warning (until bun is available for update-browserslist-db).

### Cron: log run requests to Supabase activity feed
- `POST /api/cron/:id/run` now best-effort inserts an `activities` row (`type=cron_run_requested`) before triggering `clawdbot cron run`.

### Server: cleanup duplicate Supabase import
- Removed a duplicate `createClient` import in `server/index.mjs`.

### Activity feed: write activities via Control API
- Added `POST /api/activity` to best-effort insert a Supabase `activities` row (`type`, `message`, optional `actor`).
- Enables build updates (and other UI actions) to publish to the live feed without bundling Supabase keys into the browser.

### Agents sidebar: show real "seen" timestamps (Supabase presence)
- Agents sidebar now prefers Supabase presence timestamps (`last_heartbeat_at` / `last_activity_at`) to render a reliable “Seen … ago” label.
- Falls back to the existing `lastActive` string when timestamps aren’t available.

### Agents page: show agent_status presence in agent header
- Agent detail header now surfaces Supabase-backed presence fields: `state`, “Seen …” relative timestamp, and an optional status note.
- Includes a tooltip with the raw last heartbeat/activity timestamp when available.

### Activity feed: server now merges Supabase activities + git commits
- `GET /api/activity` now best-effort fetches recent rows from Supabase `activities` for the selected project and merges them with recent brain-repo git commits.
- This makes the Dashboard “Live Feed” work even when the browser doesn’t have Supabase keys configured.

### Dashboard feed: click activity to open agent profile
- Dashboard live feed items now parse the activity `author` field (e.g. `agent:main:main`) and, when an agent match exists, clicking the feed entry opens that agent’s AgentProfilePanel.
- Makes the feed feel like a real “activity inbox” instead of a dead list.

### Build: avoid Rollup empty chunk warnings (detect-node-es)
- Updated Vite manualChunks logic to *not* force fully tree-shaken packages (like `detect-node-es`) into their own chunk.
  - Prevents Rollup from emitting “Generated an empty chunk” warnings during production builds.

### AgentProfilePanel: “Send message” logs to activity feed
- Wired the AgentProfilePanel message box to `createActivity(type=session)` so sending a note shows up in the Live Feed.
- Uses Supabase directly when configured, and falls back to the Control API endpoint (`POST /api/activity`).

### Projects: add `tag` (system highlighting) to Supabase-backed project list
- Added a `projects.tag` column (migration) so the UI can consistently highlight special/system projects like Front Office.
- Server `/api/projects` creation now upserts `tag` into Supabase (best-effort).
- Client `getProjects()` now selects + returns `tag` (with a fallback for `front-office`).

### Dashboard feed: session messages target the recipient agent
- Dashboard live feed now parses `session` activity messages (e.g. `To agent:main:main: ...`) and treats the recipient as the clickable agent.
- This makes “Send message” entries open the right AgentProfilePanel even though the activity actor is `dashboard`.

### UI: icons for agent_created + project_created activities
- Activity icon mapping now includes:
  - `agent_created` → 🤖
  - `project_created` → 📁
- Applied across Dashboard Live Feed, AgentProfilePanel timelines, and TopBar notifications.

### Presence: bump agent_status on Supabase activity inserts
- When createActivity() writes to Supabase and the actor is a real agent key (starts with `agent:`), we now best-effort upsert `agent_status.last_activity_at`.
- This keeps dashboard presence accurate in Supabase-only builds where presence updates aren’t coming from the Control API.

### Presence: dashboard keepalive no longer requires Supabase Auth session
- Dashboard UI keepalive now attempts Supabase `agents` / `agent_status` upserts even when there is no active Supabase Auth session.
- This improves presence reliability for Supabase setups that allow anon presence writes (or use RLS policies keyed off the anon/service key).

### UI: subtle glow for working agents
- Agents marked as WORKING now get a gentle pulse/glow around their avatar in sidebars to make active work feel more alive without reworking layout.

### Presence: sync agent_status from /api/status (throttled)
- Added a throttled presence sync in the Control API `/api/status` handler that reads active Clawdbot sessions and upserts `agent_status` for any agent keys it can infer.
- Keeps the Dashboard presence (ONLINE/WORKING + last seen) accurate even if the user never opens the Sessions tab.

### Presence: bump agent_status when logging activities via scripts
- Updated `scripts/log-activity.mjs` and `scripts/log-build-update.mjs` to best-effort upsert `agent_status.last_activity_at` for agent actors.
- This keeps presence accurate when activities are emitted outside the UI (cron/CI/dev scripts).

### Realtime: subscribe to Supabase `agents` roster updates
- Supabase realtime subscription now includes the `agents` table (scoped to the current project).
- This makes emoji/color/name/role edits show up without a manual refresh.

### Dev tooling: add `npm run log:activity`
- Added a tiny helper script + npm script for emitting a Supabase `activities` row from the CLI.

### Dev tooling: log-activity loads .env.local automatically
- `scripts/log-activity.mjs` now reads `.env.local`/`.env` via dotenv so cron/dev runs can emit Supabase activities without manual env exports.

### UI: better load error visibility + correct default agent selection
- Agent sidebar now shows an inline error banner when agent roster fetch fails.
- Dashboard refresh failures now render an actionable error panel (with retry) instead of failing silently.
- Default `selectedAgentId` now uses the canonical Supabase agent key (`agent:main:main`) so the right agent opens on first load.

### Brain-doc sync: scope to global docs (agent_key is null)
- `scripts/brain-doc-sync.mjs` now reads/writes only the “global” project brain docs (`agent_key IS NULL`) so it won’t collide with per-agent docs.
- Upserts now use the full conflict key (`project_id, agent_key, doc_type`) to match the Supabase schema.

### TopBar: close notifications popover after navigation
- Made the notifications (global activity) Popover controlled so clicking an activity now closes it after switching projects / deep-linking.
- Keeps the UI feeling snappy on mobile and avoids the popover lingering over the dashboard.

### AgentProfilePanel: edit agent presence (agent_status state + note)
- Added a small **Edit presence** box to the AgentProfilePanel.
- Lets you set `agent_status.state` (idle/working/blocked/sleeping) and a short note.
- Persists via a new `updateAgentStatus()` API helper and emits an `agent_status_updated` activity entry.

### Dashboard: cron feed deep-links now focus the job
- Clicking a cron (or cron_run_requested) item in the Dashboard “Live Feed” now opens **Manage → Cron** and auto-focuses the referenced job id when available.
- The feed details modal’s “Open Cron manager” button now does the same.

### Dashboard: mobile-friendly Live Feed controls
- Live Feed filter controls (type/agent/search/refresh) now wrap on small screens, with a full-width search field.
- Keeps the dashboard usable on phones without horizontal overflow.

### Presence: allow clearing agent_status.state ("auto" mode)
- Fixed `updateAgentStatus()` so passing `state: null` clears the `agent_status.state` field instead of forcing it to `idle`.
- This makes the AgentProfilePanel “(auto)” presence state actually work.

### Supabase-only presence: bump agent_status on local logActivity() writes
- `src/lib/supabase-data.ts` `logActivity()` now:
  - defaults the actor to `VITE_DASHBOARD_PRESENCE_AGENT_KEY` when `actor_agent_key` isn't provided
  - best-effort upserts `agent_status.last_activity_at` for agent actors (normalized) after inserting the activity
- Keeps presence accurate even when the app is using the lightweight Supabase data helpers (tasks CRUD etc).

### UI: subtle dashboard texture background
- Applied the existing `dashboard-texture` background to the Dashboard root container for a light mission-control gradient/texture without changing layout.

### Dashboard presence: show BLOCKED/SLEEPING badges from agent_status
- Agent list badges now reflect `agent_status.state` for more accurate presence at a glance:
  - `blocked` → **BLOCKED** (red)
  - `sleeping` → **SLEEPING** (muted)
- Keeps the high-level status colors but surfaces “why idle” without opening the profile panel.
