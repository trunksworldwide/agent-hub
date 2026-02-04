

# Layout Redesign: Mission Control Dashboard (Updated)

## Overview

Redesign ClawdOS UI to match the reference screenshot's clean, minimal light-theme layout with a unified sidebar navigation. This replaces the current "Dashboard vs Manage" toggle with a single cohesive shell, using real routes for deep-linking stability.

---

## Key Changes from Original Plan (Your Feedback)

| Feedback | Resolution |
|----------|------------|
| Keep `viewMode` as compatibility shim | Will keep in store but ignore in new UI; remove later |
| Use real routes, not just `activeMainTab` | Routes: `/activity`, `/tasks`, `/agents`, `/schedule`, etc. |
| Agent "description" source | Use `role` field as the description line (no DB change) |
| Keep Cron/Activity first-class | Schedule and Activity are top-level sidebar items |
| Keep mission stats visible | Add compact stats bar in top bar (agents active, open tasks, connection state) |
| Mobile: horizontal kanban scroll | Kanban columns snap/scroll horizontally; sidebar uses Sheet overlay |
| Rename "Standup" to "Brief" | Brief page with auto-generated daily summary from existing data |
| Add connection indicator | Top bar shows Supabase/API connection status badge |
| Prioritize mobile equally | Mobile-first responsive design throughout |

---

## Proposed Sidebar Navigation

| Section | Route | Maps To | Notes |
|---------|-------|---------|-------|
| Activity | `/activity` | `ActivityPage` | First-class operational view |
| Tasks | `/tasks` | Dashboard task kanban | Move to standalone page |
| Agents | `/agents` | `AgentsPage` grid + detail | Grid view, click opens detail |
| Brief | `/brief` | New `BriefPage` | Daily ops summary (auto-generated) |
| Schedule | `/schedule` | `CronPage` | First-class operational view |
| Settings | `/settings` | Config + Skills + Channels | Grouped under tabs |

---

## Architecture

### Route-Based Navigation

```text
/                    -> Redirect to /activity (or /agents)
/activity            -> Activity feed page
/tasks               -> Task kanban board
/agents              -> Agent grid view
/agents/:agentId     -> Agent detail (optional, or use sheet/panel)
/brief               -> Daily brief page
/schedule            -> Cron/scheduled jobs
/settings            -> Config, Skills, Channels (tabs)
```

### Store Changes

Keep `viewMode` in store but don't use it in UI:

```typescript
// Deprecated but kept for compatibility
viewMode: ViewMode; // Will be removed in future iteration

// New: track current route section (derived from URL or synced)
activeSection: 'activity' | 'tasks' | 'agents' | 'brief' | 'schedule' | 'settings';
```

Navigation helpers for legacy code:

```typescript
// For existing code that calls setViewMode('manage') + setActiveMainTab('cron')
function navigateTo(section: string, options?: { selectedAgentId?: string; focusCronJobId?: string }) {
  // Use react-router navigate()
}
```

---

## New Layout Components

### AppShell (`src/components/layout/AppShell.tsx`)

Main layout wrapper:

```text
+-----------------------------------------------------------+
| Logo  [Project ▼] [+]      Stats: 3 agents | 12 tasks  🔔  |
+--------+--------------------------------------------------+
|        |                                                  |
| ⚡ Activity |                                              |
| ☑ Tasks    |                                              |
| 🤖 Agents  |         [ Main Content Area ]               |
| 📋 Brief   |                                              |
| ⏰ Schedule|                                              |
| ⚙️ Settings|                                              |
|        |                                                  |
+--------+--------------------------------------------------+
```

Mobile (sidebar collapsed to Sheet):

```text
+-----------------------------------------------------------+
| ☰  Logo  [Project ▼]        3/12  🟢  🔔                   |
+-----------------------------------------------------------+
|                                                           |
|              [ Main Content Area ]                        |
|                                                           |
+-----------------------------------------------------------+
```

### AppSidebar (`src/components/layout/AppSidebar.tsx`)

Left sidebar with:
- Navigation links (icon + label)
- Active route highlighting
- Collapse to icons-only on tablet (optional)
- Sheet overlay on mobile (hamburger trigger)

### TopBar (`src/components/layout/TopBar.tsx`)

Simplified top bar:
- Logo
- Project dropdown + Create button
- Compact stats: "3 agents | 12 tasks"
- Connection indicator (green dot = connected, yellow = partial, red = offline)
- Activity bell

---

## Page Changes

### Agents Page (Grid View)

Redesign to match reference screenshot:

```text
+------------------+  +------------------+
| 🤖 Trunks        |  | 🔎 Research Lead |
| Chief of Staff   |  | Intel & Analysis |
| ● ONLINE         |  | ○ IDLE           |
| Last seen 2m ago |  | Last seen 1h ago |
+------------------+  +------------------+
```

- 2-column grid on desktop, 1-column on mobile
- Cards show: emoji, name, role (as description), status badge, last seen
- Click opens detail panel (slide-out sheet or right panel)
- Detail panel contains existing agent tabs (Soul, User, Memory, Tools, Skills, Sessions)

### Tasks Page

Extract kanban from DashboardPage:

- Columns: Inbox, Assigned, In Progress, Review, Done, Blocked
- Horizontal scroll on mobile (snap scrolling)
- New Task button in header
- Drag-and-drop preserved

### Brief Page (formerly Standup)

Auto-generated daily ops summary from existing data:

**Sections:**
1. **What shipped since yesterday?** - Query `activities` where type = `build_update`, last 24h
2. **What's blocked?** - Query `agent_status` where state = `blocked` OR tasks in Blocked column
3. **What needs attention?** - Tasks in Inbox/Assigned, optionally due soon
4. **Who's working now?** - Query `agent_status` where state = `working`

No schema changes needed - all data exists.

### Settings Page

Group existing pages:

```text
[System] [Skills] [Channels]

System tab: ConfigPage content
Skills tab: SkillsPage content  
Channels tab: ChannelsPage content
```

---

## Theme: Light Mode

Update `src/index.css` with light theme variables:

```css
:root {
  /* Light theme - clean, professional */
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  
  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;
  
  --popover: 0 0% 100%;
  --popover-foreground: 222 47% 11%;
  
  --primary: 217 91% 55%;
  --primary-foreground: 0 0% 100%;
  
  --secondary: 220 14% 96%;
  --secondary-foreground: 222 47% 11%;
  
  --muted: 220 14% 96%;
  --muted-foreground: 220 9% 46%;
  
  --accent: 220 14% 96%;
  --accent-foreground: 222 47% 11%;
  
  --border: 220 13% 91%;
  --input: 220 13% 91%;
  
  /* Sidebar */
  --sidebar-background: 0 0% 98%;
  --sidebar-foreground: 222 47% 11%;
  --sidebar-border: 220 13% 91%;
  --sidebar-accent: 220 14% 96%;
}
```

Visual characteristics:
- White/light gray backgrounds
- Subtle shadows instead of heavy borders
- More whitespace
- Minimal border-radius (rounded-md instead of rounded-lg)
- Status badges: green ONLINE, yellow IDLE, gray OFFLINE

---

## Connection Indicator

Add to top bar:

```typescript
const connectionStatus = useMemo(() => {
  const hasSupabaseConnection = hasSupabase();
  const hasApiConnection = Boolean(API_BASE_URL);
  
  if (hasSupabaseConnection && hasApiConnection) return 'connected';
  if (hasSupabaseConnection || hasApiConnection) return 'partial';
  return 'offline';
}, []);
```

Display as colored dot with tooltip explaining what's connected.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/layout/AppShell.tsx` | Main layout wrapper |
| `src/components/layout/AppSidebar.tsx` | Sidebar navigation |
| `src/components/layout/AppTopBar.tsx` | Simplified top bar |
| `src/components/pages/TasksPage.tsx` | Standalone kanban |
| `src/components/pages/BriefPage.tsx` | Daily ops summary |
| `src/components/pages/SettingsPage.tsx` | Grouped settings |

## Files to Modify

| File | Changes |
|------|---------|
| `src/index.css` | Light theme variables |
| `src/lib/store.ts` | Add `activeSection`, keep `viewMode` |
| `src/App.tsx` | Add routes for all sections |
| `src/pages/Index.tsx` | Redirect to default section |
| `src/components/pages/AgentsPage.tsx` | Redesign to grid + detail panel |
| `src/components/pages/CronPage.tsx` | Rename to SchedulePage (or wrap) |
| `src/components/pages/ActivityPage.tsx` | Minor styling updates |

## Files to Keep (Reuse As-Is)

| File | Reason |
|------|--------|
| `src/lib/api.ts` | All API logic unchanged |
| `src/lib/supabase*.ts` | No Supabase changes |
| `src/components/agent-tabs/*` | Reuse in agent detail panel |
| `src/components/dashboard/AgentProfilePanel.tsx` | Reuse for quick agent editing |

---

## Mobile-First Considerations

1. **Sidebar**: Sheet overlay triggered by hamburger in top bar
2. **Task Kanban**: Horizontal snap-scroll between columns; sticky column headers
3. **Agent Grid**: Single column stack; cards full-width
4. **Top Bar**: Compact - hide text labels, show icons + dots
5. **Brief Page**: Collapsible sections for easy scanning
6. **Touch Targets**: Minimum 44px hit areas for all interactive elements

---

## Deep-Link Compatibility

Preserve existing navigation patterns:

```typescript
// Legacy: setViewMode('manage') + setActiveMainTab('cron')
// New: navigate('/schedule')

// Legacy: setSelectedAgentId('agent:main:main') + setActiveMainTab('agents')
// New: navigate('/agents') with selectedAgentId in store (or /agents/agent:main:main)

// Legacy: setFocusCronJobId('daily-summary')
// New: navigate('/schedule') + setFocusCronJobId('daily-summary')
```

ActivityPage already has `openAgent()` that calls `setSelectedAgentId` + `setActiveMainTab('agents')`. Update to use `navigate('/agents')` instead.

---

## Implementation Order

1. **Phase 1: Routes + AppShell skeleton**
   - Add routes in `App.tsx`
   - Create `AppShell` with placeholder sidebar
   - Keep existing pages rendering inside shell
   - Verify nothing breaks

2. **Phase 2: Light theme**
   - Update CSS variables
   - Test all existing components look correct

3. **Phase 3: New sidebar**
   - Create `AppSidebar` with navigation
   - Add connection indicator to top bar
   - Mobile Sheet overlay

4. **Phase 4: Tasks page extraction**
   - Extract kanban from `DashboardPage`
   - Create `TasksPage`
   - Mobile horizontal scroll

5. **Phase 5: Agents grid redesign**
   - Update `AgentsPage` to grid layout
   - Agent detail as slide-out panel
   - Preserve all editing functionality

6. **Phase 6: Brief page**
   - Create `BriefPage` with auto-generated sections
   - Query existing Supabase tables

7. **Phase 7: Settings consolidation**
   - Create `SettingsPage` with tabs
   - Move Config/Skills/Channels content

8. **Phase 8: Cleanup**
   - Remove old `TopBar` view toggle code
   - Update legacy navigation calls
   - (Future) Remove `viewMode` from store

---

## Non-Breaking Guarantees

- All Supabase queries unchanged
- All error/retry UI preserved
- Agent editing (SOUL/USER/MEMORY) works exactly as before
- Cron deep-linking (`focusCronJobId`) preserved
- Agent selection (`selectedAgentId`) preserved
- Project scoping continues to work
- No database schema changes

