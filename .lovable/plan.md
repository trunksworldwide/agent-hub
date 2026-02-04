

# Implementation Plan: Resume Layout Refactor from Start

## Current Status

The Phase 1 changes were reverted - we're back to the original codebase with:
- Dark theme
- Dashboard/Manage toggle via `viewMode`
- No route-based navigation
- No `src/components/layout/` directory

## Implementation Steps

### Step 1: Create Layout Directory & Core Components

Create `src/components/layout/` with:

**AppShell.tsx**
- Main layout wrapper using `SidebarProvider` from shadcn
- Contains `AppSidebar` + `AppTopBar` + `<Outlet />` for routed content
- Mobile-responsive with Sheet overlay for sidebar

**AppSidebar.tsx**
- Left navigation with: Activity, Tasks, Agents, Brief, Schedule, Settings
- Uses `NavLink` from react-router-dom for active state
- Icons + labels, active route highlighting
- Collapsible on mobile (hamburger trigger)

**AppTopBar.tsx**
- Logo/brand
- Project dropdown (reuse existing logic from `TopBar.tsx`)
- Create project button
- Connection indicator (Supabase/API status)
- Compact stats (agents count, tasks count)
- Activity bell

### Step 2: Create New Page Components

**TasksPage.tsx**
- Extract Kanban board logic from `DashboardPage.tsx`
- Horizontal scroll on mobile with snap scrolling
- New Task button in header

**BriefPage.tsx**
- Auto-generated daily summary
- Sections: Shipped, Blocked, Needs Attention, Team Status
- Query existing Supabase tables (activities, agent_status, tasks)

**SettingsPage.tsx**
- Tabbed interface with: System, Skills, Channels
- Reuse existing ConfigPage, SkillsPage, ChannelsPage content

**SchedulePage.tsx**
- Wrapper around existing CronPage
- Preserve `focusCronJobId` deep-link behavior

### Step 3: Update Routing in App.tsx

```typescript
<Routes>
  <Route path="/" element={<Navigate to="/activity" replace />} />
  <Route element={<AppShell />}>
    <Route path="/activity" element={<ActivityPage />} />
    <Route path="/tasks" element={<TasksPage />} />
    <Route path="/agents" element={<AgentsPage />} />
    <Route path="/brief" element={<BriefPage />} />
    <Route path="/schedule" element={<SchedulePage />} />
    <Route path="/settings" element={<SettingsPage />} />
  </Route>
  <Route path="*" element={<NotFound />} />
</Routes>
```

### Step 4: Update Theme (Light Mode)

Update `src/index.css` with light theme CSS variables:
- White/light gray backgrounds
- Dark text on light
- Subtle borders and shadows
- Updated sidebar colors

### Step 5: Redesign AgentsPage

- Convert from sidebar+detail to 2-column grid
- Agent cards show: emoji, name, role, status badge, last seen
- Clicking a card opens detail in a slide-out Sheet
- Preserve all agent editing functionality (SOUL/USER/MEMORY tabs)

### Step 6: Update ActivityPage

- Replace `setViewMode`/`setActiveMainTab` calls with `useNavigate()`
- Minor styling updates for light theme

### Step 7: Keep Deprecated But Functional

- Keep `viewMode` in store (not used in UI, for compatibility)
- Keep old `TopBar.tsx`, `DashboardPage.tsx`, `AgentSidebar.tsx` temporarily (can clean up later)

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/layout/AppShell.tsx` | Main layout wrapper |
| `src/components/layout/AppSidebar.tsx` | Sidebar navigation |
| `src/components/layout/AppTopBar.tsx` | Simplified top bar |
| `src/components/pages/TasksPage.tsx` | Standalone kanban |
| `src/components/pages/BriefPage.tsx` | Daily ops summary |
| `src/components/pages/SettingsPage.tsx` | Grouped settings |
| `src/components/pages/SchedulePage.tsx` | Cron wrapper |

## Files to Modify

| File | Changes |
|------|---------|
| `src/index.css` | Light theme variables |
| `src/App.tsx` | Add routes for all sections |
| `src/components/pages/AgentsPage.tsx` | Redesign to grid + detail panel |
| `src/components/pages/ActivityPage.tsx` | Use route navigation |

## Non-Breaking Guarantees

- All Supabase queries unchanged
- All error/retry UI preserved
- Agent editing works exactly as before
- Cron deep-linking preserved
- Agent selection preserved
- Project scoping continues to work
- No database schema changes

