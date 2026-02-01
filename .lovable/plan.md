

# ClawdOffice Supabase Backend Integration Plan

## Overview

This plan upgrades ClawdOffice to use Supabase as the source of truth for "Mission Control" data (tasks, agents, activities) while keeping the existing local Control API for brain files (SOUL/USER/MEMORY) and gateway actions.

## Architecture Summary

```text
+------------------+     +------------------+     +------------------+
|   ClawdOffice    |     |    Supabase      |     |   Control API    |
|   (Frontend)     |     |   (Live Ops)     |     |   (Brain Files)  |
+------------------+     +------------------+     +------------------+
         |                        |                        |
         |  Tasks, Agents,        |  SOUL.md, USER.md,     |
         |  Activities, Status    |  MEMORY.md, Sessions,  |
         |                        |  Cron, Restart         |
         +------------------------+------------------------+
```

**Supabase handles:** Projects, Tasks, Agents roster, Agent status, Activities, Comments
**Control API handles:** Brain files (SOUL/USER/MEMORY), Sessions, Cron jobs, Gateway restart

---

## Phase 1: Fix Build Error

Before starting the main implementation, fix the TypeScript error in DashboardPage.tsx on line 358 where `item.type === 'session'` is compared against a type that only includes `'commit' | 'cron'`.

**Change:** Update the `FeedItem` type to include `'session'` or remove the `'session'` case from the conditional.

---

## Phase 2: Database Schema

Create the following tables via SQL migration:

### Table: `projects`
| Column | Type | Notes |
|--------|------|-------|
| id | text | Primary key (e.g., 'front-office') |
| name | text | Not null |
| workspace_path | text | Optional display |
| created_at | timestamptz | Default now() |

### Table: `agents`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key, auto-generated |
| project_id | text | FK to projects(id), cascade delete |
| agent_key | text | e.g., "agent:main:main" |
| name | text | Not null |
| role | text | Optional |
| emoji | text | Optional avatar |
| color | text | Optional hex color |
| created_at | timestamptz | Default now() |

Unique constraint on (project_id, agent_key)

### Table: `agent_status`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| project_id | text | FK to projects(id) |
| agent_key | text | Not null |
| state | text | Check: idle, working, blocked, sleeping |
| current_task_id | uuid | Nullable FK to tasks(id) |
| last_heartbeat_at | timestamptz | Optional |
| last_activity_at | timestamptz | Default now() |
| note | text | Optional |

Unique constraint on (project_id, agent_key)

### Table: `tasks`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| project_id | text | FK to projects(id) |
| title | text | Not null |
| description | text | Optional |
| status | text | Check: inbox, assigned, in_progress, review, done, blocked |
| assignee_agent_key | text | Nullable |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

Add trigger to auto-update `updated_at` on row modification.

### Table: `task_comments`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| project_id | text | FK to projects(id) |
| task_id | uuid | FK to tasks(id), cascade delete |
| author_agent_key | text | Optional |
| content | text | Not null |
| created_at | timestamptz | Default now() |

### Table: `activities`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| project_id | text | FK to projects(id) |
| type | text | e.g., task_created, task_updated, agent_status |
| message | text | Not null |
| actor_agent_key | text | Optional |
| task_id | uuid | Nullable FK to tasks(id) |
| created_at | timestamptz | Default now() |

---

## Phase 3: Row Level Security (RLS)

Enable RLS on all tables with authenticated-user policies:

1. **projects**: SELECT/INSERT/UPDATE/DELETE for authenticated
2. **agents**: SELECT/INSERT/UPDATE/DELETE for authenticated
3. **agent_status**: SELECT/INSERT/UPDATE for authenticated
4. **tasks**: SELECT/INSERT/UPDATE/DELETE for authenticated
5. **task_comments**: SELECT/INSERT/UPDATE/DELETE for authenticated
6. **activities**: SELECT/INSERT for authenticated

These are dev-friendly policies. For production, scope by user organization or project membership.

---

## Phase 4: Authentication (Minimal)

Implement Supabase Auth with magic link email:

1. **Create `src/components/AuthProvider.tsx`**
   - Wrap app with auth context
   - Listen to `onAuthStateChange` events
   - Provide `user`, `signIn`, `signOut` functions

2. **Create `src/components/LoginPage.tsx`**
   - Simple email input for magic link
   - Handle loading and success states

3. **Update `src/App.tsx`**
   - Show LoginPage if not authenticated
   - Show main app if authenticated

4. **No profiles table needed** for this use case (just using auth.users)

---

## Phase 5: Supabase Data Layer

### Create `src/lib/supabase-data.ts`

New file with Supabase-specific data functions:

```typescript
// Helper to get current project ID
function getProjectId(): string {
  return localStorage.getItem('clawdos.project') || 'front-office';
}

// Tasks
export async function getSupabaseTasks(): Promise<Task[]>
export async function createSupabaseTask(input): Promise<Task>
export async function updateSupabaseTask(id, patch): Promise<void>

// Projects
export async function getSupabaseProjects(): Promise<Project[]>

// Agents (roster)
export async function getSupabaseAgents(): Promise<Agent[]>

// Agent Status
export async function getAgentStatuses(): Promise<AgentStatus[]>

// Activities
export async function getActivities(): Promise<Activity[]>
export async function logActivity(data): Promise<void>
```

### Update `src/lib/api.ts`

Modify existing functions to use Supabase when available:

```typescript
export async function getTasks(): Promise<Task[]> {
  // Check if user is authenticated with Supabase
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    return getSupabaseTasks();
  }
  // Fall back to Control API for local-only mode
  return requestJson<Task[]>('/api/tasks');
}
```

Same pattern for `createTask`, `updateTask`, `getProjects`.

---

## Phase 6: Dashboard Integration

### Update `src/components/pages/DashboardPage.tsx`

1. Import Supabase data functions
2. Replace mock feed data with real activities from Supabase
3. Add auth check - show "Sign in to manage tasks" if not authenticated
4. Update the Kanban board to use real Supabase tasks
5. Add real-time subscription for live updates (optional enhancement)

### Update `src/components/TopBar.tsx`

1. Add user avatar/email display when logged in
2. Add sign out button
3. Projects dropdown reads from Supabase

---

## Phase 7: Activity Logging

When tasks are created or updated via Supabase:

1. After successful `createTask`: Insert activity with type `task_created`
2. After successful `updateTask`: Insert activity with type `task_updated`

This populates the Live Feed with real data.

---

## Phase 8: Seed Data

Create seed data on first run or via migration:

```sql
-- Seed default project
INSERT INTO projects (id, name, workspace_path)
VALUES ('front-office', 'Front Office', '/Users/trunks/clawd')
ON CONFLICT (id) DO NOTHING;

-- Seed default agent
INSERT INTO agents (project_id, agent_key, name, role, emoji)
VALUES ('front-office', 'agent:main:main', 'Trunks', 'Primary Agent', '⚡')
ON CONFLICT (project_id, agent_key) DO NOTHING;
```

---

## File Changes Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/components/pages/DashboardPage.tsx` | Edit | Fix TS error, integrate Supabase tasks |
| `src/lib/supabase-data.ts` | Create | Supabase data access functions |
| `src/lib/api.ts` | Edit | Add Supabase fallback for tasks/projects |
| `src/components/AuthProvider.tsx` | Create | Auth context and provider |
| `src/components/LoginPage.tsx` | Create | Magic link login UI |
| `src/App.tsx` | Edit | Wrap with AuthProvider, show login if needed |
| `src/components/TopBar.tsx` | Edit | Add user display and sign out |
| `src/lib/store.ts` | Edit | Add auth state if needed |
| `supabase/migrations/*.sql` | Create | Schema + RLS + seed data |

---

## Technical Notes

1. **Hybrid Backend**: Control API remains for brain files, sessions, cron, restart. Supabase is additive, not a replacement.

2. **Project Scoping**: All Supabase queries filter by `project_id` matching the selected project from localStorage.

3. **No Mock Data in Production**: When Supabase is configured and user is authenticated, only real data is shown. Mock data remains available in dev mode without Supabase.

4. **Type Safety**: After schema creation, Supabase types will auto-generate. The `src/integrations/supabase/types.ts` file will update automatically.

5. **Real-time (Future)**: Supabase subscriptions can be added later for live task board updates without polling.

---

## Implementation Order

1. Fix the TypeScript build error first
2. Create database schema migration
3. Add RLS policies
4. Implement auth (AuthProvider + LoginPage)
5. Create supabase-data.ts with task functions
6. Update api.ts to use Supabase for tasks
7. Update DashboardPage to show real tasks
8. Add activity logging
9. Seed initial data
10. Test end-to-end flow

