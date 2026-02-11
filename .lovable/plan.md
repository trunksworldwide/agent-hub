

# Fix: Add Chat (Team Room) and DMs to Sidebar

## What's Missing

1. **Chat / Team Room** has no sidebar entry at all -- the route `/chat` works but there's no way to navigate to it from the sidebar
2. **DMs** sidebar entry exists but is hidden because the `multi_dm` Labs flag is off by default

## Changes

### 1. Add Team Room sidebar link (gated by `team_room` Labs flag)

In `AppSidebar.tsx`, add a conditional sidebar entry for Chat/Team Room between Knowledge and Schedule:

```
{teamRoomEnabled && (
  <NavLink to="/chat" ...>
    <MessageSquare /> Team Room
  </NavLink>
)}
```

Add `const teamRoomEnabled = useLabsFeature('team_room');` alongside the existing `dmEnabled` hook.

### 2. Ensure correct sidebar order

Per the plan's final sidebar spec:
- Tasks
- Activity
- Agents
- Knowledge
- Team Room (Labs: `team_room`)
- DMs (Labs: `multi_dm`)
- Schedule
- ---
- Settings

### 3. No other file changes needed

Routes already exist in `App.tsx`. The `team_room` key already exists in the Labs flags system. Users just need to enable the flags in Settings > Labs.

## Technical Details

- File modified: `src/components/layout/AppSidebar.tsx`
- Add one `useLabsFeature('team_room')` call
- Add one conditional `NavLink` block
- Reorder the DMs entry to appear after Team Room

