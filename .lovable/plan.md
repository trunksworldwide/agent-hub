

# Fix Settings Page to Reflect Real System State

## Problems Found

1. **Status always shows "Offline"**: The `status` object in the Zustand store starts as `null` and `getStatus()` is never called on page load -- it only runs when you manually click "Refresh Status". Since `status?.online` is `undefined`, the card always displays "Offline".

2. **No OpenClaw version displayed**: The status cards show Environment, Port, Active Sessions, and Status -- but there's no version card. The HealthPanel already fetches version info via `/api/executor-check`, but that data isn't shared with the status cards above it.

3. **Skills tab shows mock data**: `getSkills()` tries to call the Control API at `/api/skills`, but if the URL isn't set or the call fails, it returns hardcoded mock skills (Web Browser, Code Executor, etc.) that don't reflect what's actually installed.

4. **Channels tab is 100% hardcoded**: `getChannels()` always returns static mock data (iMessage, Email, Slack) regardless of configuration. It never reads from Supabase or the Control API.

---

## Plan

### 1. Auto-fetch status and executor info on mount

Update `ConfigPage` to automatically call `getStatus()` when it mounts, so the status cards show real data immediately instead of waiting for a manual refresh.

Additionally, if a Control API URL is configured, automatically run the executor health check (`testControlApi`) on mount and store the result. This gives us the OpenClaw version number without requiring the user to click "Test".

### 2. Add an "OpenClaw Version" status card

Add a 5th status card (or replace the "Port" card, which is less useful) that shows the OpenClaw version from the executor check result. When no executor check has been run yet, show "Unknown". This makes the version immediately visible at the top of the System tab.

### 3. Fix the "Status" card to reflect real connectivity

Instead of only relying on `status?.online` (which requires the Control API `/api/status` endpoint), incorporate the executor check result. If the executor check passed, show "Online" with a green indicator. If it failed or hasn't been tested, show the appropriate state.

### 4. Wire Skills tab to Supabase (real data)

The Skills tab currently falls through to mock data. Since we have Supabase, create a `skills_mirror` table (or read from an existing Supabase source if available) so the Skills tab shows what's actually installed. As a simpler first step: if the Control API is available, fetch from `/api/skills`; if not, show an empty state with a message ("Connect to the Control API to see installed skills") instead of fake data.

### 5. Wire Channels tab to Supabase (real data)

Same approach as Skills: read channels from Supabase if a `channels` or `channel_status` table exists, or from the Control API. Replace the hardcoded mock data with either real data or an honest empty state.

### 6. Share executor check state across components

Store the last executor check result in the Zustand store so both the HealthPanel and the status cards can use it. This avoids duplicate API calls and keeps everything in sync.

---

## Technical Details

### File: `src/lib/store.ts`
- Add `executorCheck: ExecutorCheckResult | null` and `setExecutorCheck()` to the store
- This lets ConfigPage status cards read the version and binary info

### File: `src/components/pages/ConfigPage.tsx`
- Add a `useEffect` that calls `getStatus()` on mount to populate the status cards
- Add a `useEffect` that calls `testControlApi(controlApiUrl)` on mount (if URL is set) and stores the result via `setExecutorCheck()`
- Update `configItems` array:
  - Replace "Port" with "OpenClaw Version" showing `executorCheck?.version || 'Unknown'`
  - Update "Status" to use executor check result as a signal alongside `status?.online`
  - Update "Active Sessions" to show real count from executor check or status

### File: `src/components/settings/HealthPanel.tsx`
- When a successful test completes, also call `setExecutorCheck()` to update the shared store
- Fix the console warning: wrap `Badge` in the result display properly (the ref forwarding issue)

### File: `src/components/pages/SkillsPage.tsx`
- Update `getSkills()` in `api.ts` to return an empty array (not mock data) when no Control API is available
- Show an empty state: "Connect to your Mac mini to view installed skills" with a link to the System tab
- When Control API is available, fetch real skills from `/api/skills`

### File: `src/components/pages/ChannelsPage.tsx`
- Update `getChannels()` in `api.ts` to check Supabase for a channels table, or return empty
- Show an empty state: "No channels configured" instead of fake data
- If channels data exists in Supabase, display it; otherwise show the empty state

### File: `src/lib/api.ts`
- `getSkills()`: Remove mock fallback, return `[]` when no data source is available
- `getChannels()`: Remove mock data entirely, try Supabase `channels` table or return `[]`
- Remove `mockSkills`, `mockChannels` arrays (they create a false sense of data)

---

## What This Does NOT Change
- HealthPanel connectivity test flow (stays the same, just shares results with store)
- Supabase tables or API shapes
- Server-side code
- The Zustand store name or internal identifiers
