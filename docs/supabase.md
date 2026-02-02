# ClawdOS Supabase Database

> This document describes the Supabase database schema for ClawdOS Mission Control.
> Project ID: `bsqeddnaiojvvckpdvcu`

## Architecture Overview

ClawdOS uses a **hybrid backend**:
- **Supabase** → Live ops data (tasks, agents, activities, projects)
- **Control API** → Brain files (SOUL.md, USER.md, MEMORY.md), sessions, cron, restart

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   ClawdOffice   │     │    Supabase     │     │   Control API   │
│   (Frontend)    │     │   (Live Ops)    │     │  (Brain Files)  │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  Tasks, Agents,       │  SOUL.md, USER.md,    │
         │  Activities, Status   │  MEMORY.md, Sessions  │
         └───────────────────────┴───────────────────────┘
```

---

## Database Schema

### Table: `projects`

Primary workspace/project registry.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | text | PRIMARY KEY | Project slug (e.g., 'front-office') |
| `name` | text | NOT NULL | Display name |
| `workspace_path` | text | nullable | Local filesystem path (display only) |
| `created_at` | timestamptz | DEFAULT now() | Creation timestamp |

**Seeded data:** `front-office` project exists by default.

---

### Table: `agents`

Agent roster per project.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PRIMARY KEY, auto-gen | Unique ID |
| `project_id` | text | FK → projects(id), CASCADE | Parent project |
| `agent_key` | text | NOT NULL | Agent identifier (e.g., "agent:main:main") |
| `name` | text | NOT NULL | Display name |
| `role` | text | nullable | Agent role description |
| `emoji` | text | nullable | Avatar emoji |
| `color` | text | nullable | Hex color code |
| `created_at` | timestamptz | DEFAULT now() | Creation timestamp |

**Unique constraint:** `(project_id, agent_key)`

**Seeded data:** `agent:main:main` (Trunks) exists for front-office.

---

### Table: `agent_status`

Real-time agent state tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PRIMARY KEY, auto-gen | Unique ID |
| `project_id` | text | FK → projects(id), CASCADE | Parent project |
| `agent_key` | text | NOT NULL | Agent identifier |
| `state` | text | CHECK: idle, working, blocked, sleeping | Current state |
| `current_task_id` | uuid | FK → tasks(id), SET NULL | Active task |
| `last_heartbeat_at` | timestamptz | nullable | Last ping time |
| `last_activity_at` | timestamptz | DEFAULT now() | Last activity |
| `note` | text | nullable | Status note |

**Unique constraint:** `(project_id, agent_key)`

---

### Table: `tasks`

Kanban task board items.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PRIMARY KEY, auto-gen | Unique ID |
| `project_id` | text | FK → projects(id), CASCADE | Parent project |
| `title` | text | NOT NULL | Task title |
| `description` | text | nullable | Task details |
| `status` | text | CHECK: inbox, assigned, in_progress, review, done, blocked | Kanban column |
| `assignee_agent_key` | text | nullable | Assigned agent |
| `created_at` | timestamptz | DEFAULT now() | Creation timestamp |
| `updated_at` | timestamptz | DEFAULT now(), auto-updated | Last modification |

**Trigger:** `update_tasks_updated_at` auto-updates `updated_at` on modification.

---

### Table: `task_comments`

Comments on tasks.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PRIMARY KEY, auto-gen | Unique ID |
| `project_id` | text | FK → projects(id), CASCADE | Parent project |
| `task_id` | uuid | FK → tasks(id), CASCADE | Parent task |
| `author_agent_key` | text | nullable | Comment author |
| `content` | text | NOT NULL | Comment text |
| `created_at` | timestamptz | DEFAULT now() | Creation timestamp |

---

### Table: `activities`

Activity feed / audit log.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PRIMARY KEY, auto-gen | Unique ID |
| `project_id` | text | FK → projects(id), CASCADE | Parent project |
| `type` | text | NOT NULL | Event type (task_created, task_updated, etc.) |
| `message` | text | NOT NULL | Human-readable message |
| `actor_agent_key` | text | nullable | Who performed action |
| `task_id` | uuid | FK → tasks(id), SET NULL | Related task |
| `created_at` | timestamptz | DEFAULT now() | Event timestamp |

---

## Row Level Security (RLS)

All tables have RLS enabled with permissive authenticated-user policies:

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| projects | ✅ auth | ✅ auth | ✅ auth | ✅ auth |
| agents | ✅ auth | ✅ auth | ✅ auth | ✅ auth |
| agent_status | ✅ auth | ✅ auth | ✅ auth | ❌ |
| tasks | ✅ auth | ✅ auth | ✅ auth | ✅ auth |
| task_comments | ✅ auth | ✅ auth | ✅ auth | ✅ auth |
| activities | ✅ auth | ✅ auth | ❌ | ❌ |

> **Note:** These are dev-friendly policies. For production multi-tenant, scope by org/project membership.

---

## Frontend Data Layer

### Files

- `src/integrations/supabase/client.ts` → Supabase client initialization
- `src/lib/supabase-data.ts` → CRUD functions for all tables
- `src/lib/api.ts` → Hybrid layer (tries Supabase first, falls back to Control API)

### Key Functions (supabase-data.ts)

```typescript
// Projects
getSupabaseProjects(): Promise<SupabaseProject[]>

// Tasks
getSupabaseTasks(): Promise<SupabaseTask[]>
createSupabaseTask(input): Promise<SupabaseTask | null>
updateSupabaseTask(id, patch): Promise<boolean>
deleteSupabaseTask(id): Promise<boolean>

// Agents
getSupabaseAgents(): Promise<SupabaseAgent[]>

// Agent Status
getAgentStatuses(): Promise<SupabaseAgentStatus[]>

// Activities
getActivities(limit?): Promise<SupabaseActivity[]>
logActivity(input): Promise<void>
```

### Project Scoping

All queries filter by `project_id` from `localStorage.getItem('clawdos.project')` (default: `'front-office'`).

---

## Database Functions & Triggers

### `update_updated_at_column()`

Trigger function that auto-updates `updated_at` to `now()` on row modification.

**Applied to:** `tasks` table via `update_tasks_updated_at` trigger.

---

## Supabase Recent Changes

> Ongoing log of database modifications. Newest first.

### 2026-02-01 — Initial Schema

**Migration:** Created complete schema for ClawdOS Mission Control.

**Tables created:**
- `projects` — workspace registry
- `agents` — agent roster per project
- `agent_status` — real-time agent state
- `tasks` — Kanban task board
- `task_comments` — task discussion threads
- `activities` — activity feed / audit log

**RLS policies:** Enabled on all tables with authenticated-user access.

**Triggers:** Added `update_tasks_updated_at` for auto-updating timestamps.

**Seed data:**
- Project: `front-office` (Front Office)
- Agent: `agent:main:main` (Trunks, Primary Agent, ⚡)

---
