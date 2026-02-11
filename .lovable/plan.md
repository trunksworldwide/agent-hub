

# Rename "Team Room" to "War Room"

## Summary

Rename every visible instance of "Team Room" to "War Room" across the UI. No logic changes, no database changes -- purely a label rename.

## Changes

### 1. `src/components/layout/AppSidebar.tsx`

Change the sidebar nav label from `"Team Room"` to `"War Room"` (around line 192).

### 2. `src/components/pages/ChatPage.tsx`

Update any page header or title text from "Team Room" to "War Room".

### 3. `changes.md`

Log: "Renamed 'Team Room' to 'War Room' across sidebar and chat page."

## Scope

- Label-only change, no route changes (`/chat` stays the same)
- No database or feature flag changes (`team_room` flag name stays the same internally)
- No other files affected

