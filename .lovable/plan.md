
# ClawdOS UI Enhancements Plan

This plan covers 6 improvement areas: agent status clarity, Schedule/Cron UX, project defaulting, agent detail tooltips, Documents feature, and Recent Changes integration.

---

## Overview

| Feature | Scope | Database Changes |
|---------|-------|------------------|
| 1. Agent Status Indicators | UI + Tooltips | None |
| 2. Schedule Page UX | Connection status + empty states | None |
| 3. Project Defaulting | Defensive logic in sidebar | None |
| 4. Agent Detail Tooltips | InfoTooltip component | None |
| 5. Documents Feature | Full CRUD page | New table + storage bucket |
| 6. Recent Changes | Virtual doc from activities | None |

---

## 1. Clarify Agent Status Indicators

### Current State
The status dot and badge are derived from `agent_status.state` and `last_heartbeat_at`/`last_activity_at` in `src/lib/api.ts:645-665`. The logic exists but is not explained to users.

### Changes

**Create `src/components/ui/StatusTooltip.tsx`**
- Wrap the status badge in a Tooltip showing:
  - State label: ONLINE/IDLE/WORKING/BLOCKED/SLEEPING/OFFLINE
  - Last heartbeat timestamp
  - Last activity timestamp
  - Warning if data is missing

**Update `src/components/pages/AgentsPage.tsx`**
- Wrap the badge with `StatusTooltip`
- Add a small help icon next to "Agents" header with inline explanation

**Update `src/components/AgentDetail.tsx`**
- Add same tooltip to the status badge in the detail header

### Status Derivation Rules (display in tooltip)

```text
OFFLINE (red): No heartbeat/activity in 60+ minutes OR state=sleeping
WORKING (green/pulse): state=working AND seen within 30 minutes
IDLE (yellow): state=idle
ONLINE (green): Seen within 5 minutes
BLOCKED (red): state=blocked
```

---

## 2. Schedule Page: Connection Status and Empty States

### Current State
`getCronJobs()` returns `[]` when no `API_BASE_URL` is set. The CronPage just shows an empty list.

### Changes

**Update `src/lib/api.ts`**
- Add a new function `getApiStatus()` that returns connection info:
  ```typescript
  export function getApiStatus(): { connected: boolean; baseUrl: string | null; mode: 'supabase-only' | 'control-api' | 'mock' }
  ```

**Update `src/components/pages/CronPage.tsx`**
- Add a "Connection Status" panel at the top:
  - Show Control API URL (or "Not configured")
  - Show Supabase status
  - Last error (if any) + Retry button
- Add distinct empty states:
  - "No Control API configured - cron jobs require the Control API"
  - "Connected, but no cron jobs found"
  - "Failed to load - [error] - Retry"
- Add search/filter for enabled/disabled jobs
- Keep existing expand/run/edit functionality

---

## 3. Project Defaulting Safety

### Current State
`src/lib/project.ts` defaults to `'front-office'`. The sidebar already auto-selects first project if selected is missing.

### Changes

**Update `src/components/layout/AppSidebar.tsx`**
- Add explicit validation: if `selectedProjectId` doesn't exist in loaded projects AND `front-office` exists, select it
- If neither exists, select first available and show a warning toast
- Never render a blank dropdown (fallback to loading state)

**Update project selector**
- Create new project in a Dialog/Sheet instead of `prompt()` (prevents blank state)
- After creation, auto-switch to new project

---

## 4. Agent Detail Tooltips

### Current State
Tabs show labels (Soul, User, Memory, etc.) but no descriptions.

### Changes

**Create `src/components/ui/InfoTooltip.tsx`**
- Reusable component: icon + tooltip text
- Mobile-friendly (works on tap/long-press via Radix Tooltip)

**Update `src/components/AgentDetail.tsx`**
- Add tooltip descriptions to tab definitions:

| Tab | Tooltip |
|-----|---------|
| Soul | "Defines the agent's personality, behavior rules, and core truths." |
| User | "Who the user is: preferences, permissions, and profile." |
| Memory | "Long-term notes and daily logs for continuity. Keep curated." |
| Tools | "Environment-specific settings: devices, SSH, preferences." |
| Skills | "Installed capabilities that affect what the agent can do." |
| Sessions | "Active and previous sessions for status and messaging." |

**Update each editor component**
- Add InfoTooltip next to the file name in toolbar (e.g., "SOUL.md" info icon)

---

## 5. Documents Feature (Project Knowledge)

### Database Schema

**New table: `project_documents`**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| project_id | text | FK to projects |
| title | text | Document title |
| source_type | text | 'upload' or 'note' |
| storage_path | text (nullable) | Path in storage bucket |
| content_text | text (nullable) | For notes or extracted text |
| mime_type | text (nullable) | e.g., 'application/pdf' |
| size_bytes | integer (nullable) | File size |
| created_at | timestamptz | Default now() |
| updated_at | timestamptz | Default now() |

**RLS policies**: Same pattern as other tables (anon access allowed per existing convention).

**Storage bucket: `clawdos-documents`**
- Path structure: `<project_id>/<doc_id>/<filename>`
- Public bucket (matching existing app auth model)

### UI Components

**Update `src/components/layout/AppSidebar.tsx`**
- Add "Documents" nav item with FileStack icon

**Create `src/components/pages/DocumentsPage.tsx`**
- Header with "Documents" title + "Add Document" button
- Document list: title, type badge, updated_at, size
- Empty state: "No documents yet. Add knowledge for your agents."

**Create `src/components/documents/DocumentList.tsx`**
- Render list of documents as cards
- Click to view, delete button with confirmation

**Create `src/components/documents/AddDocumentDialog.tsx`**
- Tabs: "Upload File" / "Create Note"
- Upload: drag-drop zone, file picker (supports images, txt, pdf)
- Note: title + textarea

**Create `src/components/documents/DocumentViewer.tsx`**
- For text/notes: render content
- For images: display image
- For PDFs: download link + metadata

**Add API functions in `src/lib/api.ts`**
- `getDocuments()`
- `createDocument(input)`
- `uploadDocumentFile(file)`
- `deleteDocument(id)`

### Update App.tsx
- Add route: `/documents` pointing to `DocumentsPage`

---

## 6. Recent Changes (Shared Context)

### Implementation

**Add `RECENT_CHANGES.md` as virtual document**
- In DocumentsPage, show as pinned item at top
- Generate from `activities` table (recent build_update, task_moved, brain_doc_updated)

**Create `src/lib/recent-changes.ts`**
- Function to generate markdown summary from last N activities:
  ```typescript
  export async function generateRecentChangesSummary(projectId: string, limit?: number): Promise<string>
  ```

**Add to DocumentsPage**
- "Recent Changes" card pinned at top
- "Regenerate" button to refresh
- Content shown in a collapsible/expandable view

**Context pack helper**
- Export function for future agent use:
  ```typescript
  export async function getProjectContextPack(projectId: string): Promise<{ documents: string[]; recentChanges: string }>
  ```

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/components/ui/InfoTooltip.tsx` | Create |
| `src/components/ui/StatusTooltip.tsx` | Create |
| `src/components/pages/AgentsPage.tsx` | Update (add tooltips) |
| `src/components/AgentDetail.tsx` | Update (add tooltips) |
| `src/components/pages/CronPage.tsx` | Update (connection status, empty states) |
| `src/components/layout/AppSidebar.tsx` | Update (project validation, Documents nav) |
| `src/components/pages/DocumentsPage.tsx` | Create |
| `src/components/documents/DocumentList.tsx` | Create |
| `src/components/documents/AddDocumentDialog.tsx` | Create |
| `src/components/documents/DocumentViewer.tsx` | Create |
| `src/lib/api.ts` | Update (documents API, getApiStatus) |
| `src/lib/recent-changes.ts` | Create |
| `src/App.tsx` | Update (add /documents route) |

### Database Migration
- Create `project_documents` table with RLS
- Create `clawdos-documents` storage bucket

---

## Technical Details

### Status Tooltip Implementation

```tsx
// StatusTooltip.tsx
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';

interface StatusTooltipProps {
  status: 'online' | 'idle' | 'running' | 'offline';
  statusState?: 'idle' | 'working' | 'blocked' | 'sleeping';
  lastActivityAt?: string | null;
  lastHeartbeatAt?: string | null;
  children: React.ReactNode;
}

export function StatusTooltip({ status, statusState, lastActivityAt, lastHeartbeatAt, children }: StatusTooltipProps) {
  const formatTime = (iso: string | null | undefined) => {
    if (!iso) return 'Unknown';
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: true });
    } catch {
      return iso;
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1 text-xs">
          <div><strong>Status:</strong> {status.toUpperCase()}</div>
          {statusState && <div><strong>State:</strong> {statusState}</div>}
          <div><strong>Last heartbeat:</strong> {formatTime(lastHeartbeatAt)}</div>
          <div><strong>Last activity:</strong> {formatTime(lastActivityAt)}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
```

### InfoTooltip Implementation

```tsx
// InfoTooltip.tsx
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function InfoTooltip({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className={cn('w-3.5 h-3.5 text-muted-foreground hover:text-foreground cursor-help', className)} />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}
```

### CronPage Connection Status

```tsx
// In CronPage.tsx header
const apiStatus = getApiStatus();

<div className="rounded-lg border bg-muted/30 p-3 mb-4">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <span className={cn('w-2 h-2 rounded-full', apiStatus.connected ? 'bg-green-500' : 'bg-red-500')} />
      <span className="text-sm font-medium">
        {apiStatus.connected ? 'Control API Connected' : 'Control API Not Connected'}
      </span>
    </div>
    {!apiStatus.connected && (
      <span className="text-xs text-muted-foreground">
        Cron jobs require VITE_API_BASE_URL
      </span>
    )}
  </div>
  {lastError && (
    <div className="mt-2 text-xs text-destructive">
      Error: {lastError} <Button variant="ghost" size="sm" onClick={loadJobs}>Retry</Button>
    </div>
  )}
</div>
```

---

## QA Checklist

- [x] Project dropdown never shows blank
- [x] Switching projects updates all views (Agents, Tasks, Activity, Documents, Schedule)
- [x] Agent status tooltips render on desktop hover and mobile tap
- [x] Schedule page shows clear connection status
- [x] Schedule page shows appropriate empty states
- [x] InfoTooltips appear on agent detail tabs
- [x] Documents page: upload works
- [x] Documents page: create note works
- [x] Documents page: list renders correctly
- [x] Documents page: delete with confirmation works
- [x] Recent Changes generates from activities
- [ ] No console errors (needs verification)
- [x] All existing routes continue to work
