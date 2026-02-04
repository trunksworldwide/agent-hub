

# ClawdOS Multi-Feature Improvement Plan (Revised)

## Overview

This plan implements five major improvements to ClawdOS additively, without breaking existing functionality:

- A) Create Agent flow with a proper dialog (name, purpose, emoji)
- B) Tasks: "New Task from Agent" flow (dialog already exists in TasksPage)
- C) Schedule: Inline quick schedule editor with human-friendly UI + agent targeting
- D) Schedule: Improve New Job flow with human-friendly language + agent targeting
- E) Add a project-scoped Chat page with **dedicated tables** (not reusing activities)

---

## Current State Analysis

### What Already Exists
- **Agent Creation**: `createAgent()` API exists in `api.ts` and works with Supabase, but no UI button
- **Task Assignment**: Already fully implemented in `TasksPage.tsx` - New Task dialog has Assignee dropdown
- **Schedule/Cron**: Comprehensive `CronPage.tsx` with create/edit/delete/run via queue pattern
- **Messaging**: Uses `createActivity()` with `type: 'session'` - but we want Chat to be separate
- **No Chat Page**: Currently no dedicated Chat page

### What Needs to Be Built
- Create Agent UI dialog in AgentsPage
- "New Task" button in AgentDetail (reusing existing dialog pattern)
- Schedule editor component with human-friendly presets
- Target agent field for cron jobs
- **NEW: Dedicated chat tables + ChatPage**

---

## Phase 1: Database Schema - Chat Tables

### Table: `project_chat_threads` (optional but recommended)

```sql
CREATE TABLE public.project_chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  title text DEFAULT 'General',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_chat_threads_project_idx 
  ON public.project_chat_threads(project_id);

ALTER TABLE public.project_chat_threads ENABLE ROW LEVEL SECURITY;

-- Match existing app access model
CREATE POLICY "project_chat_threads_select_anon" ON public.project_chat_threads
  FOR SELECT USING (true);
CREATE POLICY "project_chat_threads_insert_anon" ON public.project_chat_threads
  FOR INSERT WITH CHECK (true);
CREATE POLICY "project_chat_threads_update_anon" ON public.project_chat_threads
  FOR UPDATE USING (true) WITH CHECK (true);
```

### Table: `project_chat_messages`

```sql
CREATE TABLE public.project_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  thread_id uuid REFERENCES public.project_chat_threads(id) ON DELETE CASCADE,
  author text NOT NULL,  -- e.g. 'zack', 'ui', 'agent:main:main'
  target_agent_key text,  -- optional: if user selected a target agent
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_chat_messages_project_time_idx 
  ON public.project_chat_messages(project_id, created_at DESC);
CREATE INDEX project_chat_messages_thread_time_idx 
  ON public.project_chat_messages(thread_id, created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_chat_messages;

ALTER TABLE public.project_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_chat_messages_select_anon" ON public.project_chat_messages
  FOR SELECT USING (true);
CREATE POLICY "project_chat_messages_insert_anon" ON public.project_chat_messages
  FOR INSERT WITH CHECK (true);
CREATE POLICY "project_chat_messages_update_anon" ON public.project_chat_messages
  FOR UPDATE USING (true) WITH CHECK (true);
```

---

## Phase 2: A) Create Agent Flow

### Current State
- No "Create Agent" button in AgentsPage
- `createAgent()` API exists in `api.ts` and works correctly

### Implementation

**1. Add "New Agent" Button to AgentsPage Header**

Location: `src/components/pages/AgentsPage.tsx`

Add a "+ New Agent" button next to the Refresh button.

**2. Create Agent Dialog Fields**

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | Display name for the agent |
| Purpose | Yes | Stored in `agents.role` column |
| Emoji | Yes | Default: auto-suggest based on name (first letter or random) |
| Color | No | Optional theme color (predefined palette or hex) |

**3. Auto-generate Agent Key**

Generate `agent_key` automatically from name:
```typescript
function generateAgentKey(name: string, existingKeys: string[]): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'agent';
  
  let base = `agent:${slug}:main`;
  let candidate = base;
  let suffix = 2;
  
  while (existingKeys.includes(candidate)) {
    candidate = `agent:${slug}-${suffix}:main`;
    suffix++;
  }
  
  return candidate;
}
```

**4. Post-Creation Flow**
- Call `createAgent()` API
- On success: add to local agents state, select the new agent, open detail panel
- Show toast confirmation

**File Changes:**
- `src/components/pages/AgentsPage.tsx`: Add dialog, button, and creation logic

---

## Phase 3: B) New Task from Agent Detail

### Current State
- Task assignment already works in `TasksPage.tsx`
- `AgentDetail.tsx` doesn't have a "New Task" button

### Implementation

**1. Extract Reusable NewTaskDialog Component**

Create `src/components/dialogs/NewTaskDialog.tsx` by extracting the dialog from TasksPage:

```typescript
interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  defaultAssignee?: string; // agent_key to pre-select
  onCreated?: () => void;
}
```

**2. Add "New Task" Button to AgentDetail Header**

In `AgentDetail.tsx`, add a button that:
- Opens the NewTaskDialog
- Pre-selects the current agent as assignee via `defaultAssignee={agent?.id}`

**3. Update TasksPage to Use Shared Dialog**

Refactor `TasksPage.tsx` to import and use the new shared component.

**File Changes:**
- New file: `src/components/dialogs/NewTaskDialog.tsx`
- `src/components/pages/TasksPage.tsx`: Import and use shared dialog
- `src/components/AgentDetail.tsx`: Add "New Task" button and dialog

---

## Phase 4: C) Schedule - Inline Quick Schedule Editor

### Current State
- Schedule displays like "Daily at 9:00 AM ET" or "Every 15 minutes"
- No inline editing capability
- Edit opens a full dialog (Control API only)

### Implementation

**1. Create Schedule Utilities**

New file: `src/lib/schedule-utils.ts`

```typescript
export interface ScheduleConfig {
  frequency: 'every-5' | 'every-15' | 'every-30' | 'hourly' | 'daily' | 'weekdays' | 'weekly' | 'custom';
  time?: string; // HH:mm for daily/weekly
  days?: string[]; // ['mon', 'tue', ...] for weekly
  cronExpr?: string; // for custom
  tz?: string;
}

export const SCHEDULE_PRESETS = [
  { id: 'every-5', label: 'Every 5 minutes', kind: 'every', expr: '300000' },
  { id: 'every-15', label: 'Every 15 minutes', kind: 'every', expr: '900000' },
  { id: 'every-30', label: 'Every 30 minutes', kind: 'every', expr: '1800000' },
  { id: 'hourly', label: 'Hourly', kind: 'cron', expr: '0 * * * *' },
  { id: 'daily', label: 'Daily at...', kind: 'cron', requiresTime: true },
  { id: 'weekdays', label: 'Weekdays at...', kind: 'cron', requiresTime: true },
  { id: 'weekly', label: 'Weekly on...', kind: 'cron', requiresTime: true, requiresDays: true },
  { id: 'custom', label: 'Custom cron', kind: 'cron', isCustom: true },
];

export function parseScheduleToConfig(kind: string, expr: string, tz?: string): ScheduleConfig
export function configToScheduleExpression(config: ScheduleConfig): { kind: 'cron' | 'every'; expr: string }
```

**2. Create ScheduleEditor Component**

New file: `src/components/schedule/ScheduleEditor.tsx`

A popover/dropdown component with:
- Frequency dropdown (presets)
- Time picker for daily/weekly (hour:minute)
- Day checkboxes for weekly
- Timezone display
- Advanced toggle showing raw cron expression

**3. Add Inline Edit to CronJobRow**

In `CronPage.tsx`, add a small edit icon next to schedule display that opens ScheduleEditor in a popover.

On save:
- If Control API connected: call existing edit API
- If offline: queue via `queueCronPatchRequest()` with schedule changes

**4. Target Agent Field**

Add "Target Agent" dropdown to schedule editor:
- Dropdown: "Unassigned" + all project agents from `getAgents()`
- Store in instructions using structured prefix: `@target:agent:<key>\n<instructions>`
- Display target agent badge in job row

**File Changes:**
- New file: `src/lib/schedule-utils.ts`
- New file: `src/components/schedule/ScheduleEditor.tsx`
- `src/components/pages/CronPage.tsx`: Add inline edit popover and target agent

---

## Phase 5: D) Improve New Job Flow Language

### Current State
- Create dialog uses technical cron/interval terminology
- No target agent selection
- Technical placeholders

### Implementation

**1. Redesign Create Dialog UI**

Replace:
```
Cron Expression: [input]
Interval (ms): [input]
```

With:
```
Runs...
[Dropdown: Every 5 min | Every 15 min | ... | Custom cron]

At time: [Time picker - for Daily/Weekly]
On days: [Day checkboxes - for Weekly]
Timezone: [Dropdown]

Target Agent: [Dropdown: None + project agents]
Job Name: [Input]
Instructions: [Textarea]

[Advanced ▾]
  Cron expression: [readonly/editable]
```

**2. Creation Behavior**

On submit:
- Convert human selections to schedule expression
- If target agent selected, prefix instructions: `@target:agent:<key>\n<body>`
- If Control API connected: create directly
- If offline: queue via `queueCronCreateRequest()`

**File Changes:**
- `src/components/pages/CronPage.tsx`: Redesign create dialog

---

## Phase 6: E) Project-Scoped Chat Page (Dedicated Tables)

### Design Principle
Chat uses dedicated tables (`project_chat_threads`, `project_chat_messages`) instead of polluting the activities feed. This keeps:
- Activity feed for system events (task changes, agent actions, cron runs)
- Chat for human-agent conversations

### Implementation

**1. API Layer Updates**

Add to `src/lib/api.ts`:

```typescript
export interface ChatThread {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  projectId: string;
  threadId: string | null;
  author: string;
  targetAgentKey: string | null;
  message: string;
  createdAt: string;
}

export async function getChatThreads(): Promise<ChatThread[]>
export async function getOrCreateDefaultThread(): Promise<ChatThread>
export async function getChatMessages(threadId?: string, limit?: number): Promise<ChatMessage[]>
export async function sendChatMessage(input: { 
  threadId?: string; 
  message: string; 
  targetAgentKey?: string 
}): Promise<{ ok: boolean; message?: ChatMessage; error?: string }>
```

**2. Realtime Subscriptions**

Update `src/lib/supabase.ts` to subscribe to `project_chat_messages`.

**3. Create ChatPage Component**

New file: `src/components/pages/ChatPage.tsx`

Layout:
```
┌─────────────────────────────────────────────────────┐
│ Chat                                                │
│ Project conversations                               │
├─────────────────────────────────────────────────────┤
│                                                     │
│ [Message list - scrollable area]                    │
│                                                     │
│ 📬 Today                                            │
│ ┌───────────────────────────────────────────────┐  │
│ │ 🤖 Trunks: Completed daily summary task       │  │
│ │ 2:30 PM                                       │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
│ ┌───────────────────────────────────────────────┐  │
│ │ 👤 You → Research: Can you look into X?       │  │
│ │ 11:45 AM                           [→ Task]   │  │
│ └───────────────────────────────────────────────┘  │
│                                                     │
├─────────────────────────────────────────────────────┤
│ To: [Dropdown ▾] [Message input            ] [→]   │
└─────────────────────────────────────────────────────┘
```

**4. Chat Behavior**

- Project-scoped: only show messages for current `selectedProjectId`
- Default thread: "General" per project (create on first visit if needed)
- Composer:
  - Target dropdown: "General" (no agent) + all project agents
  - Text input with Enter to send
  - Send button
- On send:
  - Insert into `project_chat_messages`
  - Optionally: also write a lightweight activity row like `type='chat_sent'` with short summary (NOT the full message)

**5. Optional: Create Task from Message**

Add a small button on each message to create a task:
- Opens NewTaskDialog with message as description
- Target agent pre-selected as assignee

**6. Routing + Sidebar**

Add to `src/App.tsx`:
```typescript
import { ChatPage } from './components/pages/ChatPage';
// ...
<Route path="/chat" element={<ChatPage />} />
```

Add to `src/components/layout/AppSidebar.tsx`:
```typescript
import { MessageSquare } from 'lucide-react';
// In navItems:
{ to: '/chat', label: 'Chat', icon: MessageSquare },
```

**7. Agent Message Delivery (Future)**

Banner: "Delivery to agents coming soon" if not implementing worker pickup yet.

When ready:
- When a message is inserted with `target_agent_key`, enqueue a request for the Mac mini executor to route to that agent's session.

**File Changes:**
- Migration: Create `project_chat_threads` and `project_chat_messages` tables
- `src/lib/api.ts`: Add chat interfaces and functions
- `src/lib/supabase.ts`: Add realtime subscription for chat messages
- New file: `src/components/pages/ChatPage.tsx`
- `src/App.tsx`: Add `/chat` route
- `src/components/layout/AppSidebar.tsx`: Add Chat nav item

---

## Implementation Order

1. **Database migrations** (2 tables):
   - Create `project_chat_threads` table
   - Create `project_chat_messages` table with realtime

2. **Shared Components**:
   - Extract `NewTaskDialog.tsx` from TasksPage
   - Create `src/lib/schedule-utils.ts`
   - Create `ScheduleEditor.tsx` component

3. **API layer updates** (`src/lib/api.ts`):
   - Add chat interfaces and functions

4. **Realtime updates** (`src/lib/supabase.ts`):
   - Add subscription for `project_chat_messages`

5. **AgentsPage: Create Agent Flow**:
   - Add dialog and button

6. **AgentDetail: New Task Button**:
   - Add button and integrate NewTaskDialog

7. **TasksPage: Refactor to Use Shared Dialog**

8. **CronPage: Human-Friendly Create Flow + Inline Edit + Target Agent**

9. **ChatPage: New Page**:
   - Create component
   - Add to routing and sidebar

---

## Technical Details

### Target Agent Encoding in Cron Instructions

```typescript
// Encode
function encodeTargetAgent(agentKey: string | null, instructions: string): string {
  if (!agentKey) return instructions;
  return `@target:${agentKey}\n${instructions}`;
}

// Decode  
function decodeTargetAgent(instructions: string): { targetAgent: string | null; body: string } {
  const match = instructions?.match(/^@target:([^\n]+)\n([\s\S]*)$/);
  if (match) {
    return { targetAgent: match[1], body: match[2] };
  }
  return { targetAgent: null, body: instructions || '' };
}
```

### Chat Message Author Format

- `ui` or `dashboard` for messages from the UI
- `agent:<slug>:main` for agent messages
- `user` or username for human users

### Emoji Auto-Suggest for Agents

Simple mapping by first letter or purpose keywords:
```typescript
function suggestEmoji(name: string, purpose?: string): string {
  const text = (purpose || name).toLowerCase();
  if (text.includes('research')) return '🔬';
  if (text.includes('code') || text.includes('dev')) return '💻';
  if (text.includes('write') || text.includes('content')) return '✍️';
  if (text.includes('data') || text.includes('analys')) return '📊';
  // Default: first letter or robot
  return '🤖';
}
```

---

## File Changes Summary

| File | Type | Changes |
|------|------|---------|
| `supabase/migrations/xxx.sql` | New | Create `project_chat_threads` and `project_chat_messages` tables |
| `src/lib/api.ts` | Edit | Add chat interfaces and CRUD functions |
| `src/lib/supabase.ts` | Edit | Add realtime subscription for chat messages |
| `src/lib/schedule-utils.ts` | New | Schedule parsing/generation utilities |
| `src/components/dialogs/NewTaskDialog.tsx` | New | Shared task creation dialog |
| `src/components/schedule/ScheduleEditor.tsx` | New | Human-friendly schedule editor component |
| `src/components/pages/ChatPage.tsx` | New | Project-scoped chat/messaging page |
| `src/components/pages/AgentsPage.tsx` | Edit | Add "New Agent" button and dialog |
| `src/components/AgentDetail.tsx` | Edit | Add "New Task" button |
| `src/components/pages/TasksPage.tsx` | Edit | Use shared NewTaskDialog |
| `src/components/pages/CronPage.tsx` | Edit | Human-friendly create, inline edit, target agent |
| `src/App.tsx` | Edit | Add `/chat` route |
| `src/components/layout/AppSidebar.tsx` | Edit | Add Chat nav item |

---

## QA Checklist

### Create Agent Flow
- [ ] "+ New Agent" button appears in AgentsPage header
- [ ] Dialog opens with Name, Purpose, Emoji, Color fields
- [ ] Agent key auto-generates from name
- [ ] Collision handling works (appends -2, -3, etc.)
- [ ] New agent appears in grid after creation
- [ ] Detail panel opens for newly created agent

### New Task from Agent
- [ ] "New Task" button appears in AgentDetail header
- [ ] Opens task dialog with agent pre-selected as assignee
- [ ] Task creates correctly with assignment
- [ ] TasksPage refactored to use shared dialog (no duplication)

### Inline Schedule Editor
- [ ] Edit affordance appears next to schedule label in job rows
- [ ] Popover opens with human-friendly frequency options
- [ ] Time picker works for daily/weekly schedules
- [ ] Target agent dropdown shows project agents
- [ ] Changes apply via queue when offline
- [ ] Changes apply directly when Control API connected

### Human-Friendly Create Job
- [ ] Create dialog uses "Runs..." with dropdown presets
- [ ] Time picker shown for daily/weekly options
- [ ] Target agent dropdown shows project agents
- [ ] Advanced section reveals cron expression
- [ ] Job creates with correct schedule
- [ ] Target agent encoded in instructions

### Chat Page (Dedicated Tables)
- [ ] Chat appears in sidebar navigation
- [ ] Route `/chat` works
- [ ] `project_chat_threads` table exists
- [ ] `project_chat_messages` table exists with realtime
- [ ] Default "General" thread created on first visit
- [ ] Message history loads from dedicated table (NOT activities)
- [ ] Target dropdown shows all project agents
- [ ] Sending message inserts into `project_chat_messages`
- [ ] Realtime updates show new messages instantly
- [ ] Messages display with sender/recipient info
- [ ] Optional: Create task from message works
- [ ] Activity feed remains unchanged (not polluted by chat)

### General
- [ ] All dropdowns are project-scoped
- [ ] No broken deep links
- [ ] Works when Control API is offline (queue mode)
- [ ] Mobile layout is responsive
- [ ] Error handling shows toast messages
- [ ] Loading states display correctly

