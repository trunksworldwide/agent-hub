

# Add Connectivity / Health Panel to Config Page

## What This Does

Adds a "Connectivity" section to the Config page where you can:
- Enter/change the Control API URL (Cloudflare tunnel or local) at runtime without redeploying
- Test the connection with a single button click
- See executor binary name, version, and check results (sessions, cron) with pass/fail indicators
- See error details when something fails

## Why Runtime-Configurable URL Matters

The current `VITE_API_BASE_URL` is baked in at build time. Since your Cloudflare Quick Tunnel URL changes on restart, you need to be able to update it from the UI. The new URL will be stored in `localStorage` so it persists across sessions without a rebuild.

---

## Technical Details

### 1. New utility: `src/lib/control-api.ts`

A small module that manages the Control API base URL at runtime:

- `getControlApiUrl()` -- returns localStorage value, falls back to `VITE_API_BASE_URL`, or empty string
- `setControlApiUrl(url)` -- saves to localStorage
- `testControlApi(baseUrl)` -- calls `${baseUrl}/api/executor-check` and returns the parsed result
- Exports an `ExecutorCheckResult` type matching the server response shape

### 2. Update `src/lib/api.ts`

Change `API_BASE_URL` from a compile-time constant to a function call:
- Replace `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''` with a getter that reads from `getControlApiUrl()`
- This makes `requestJson()`, `getApiStatus()`, and all other API calls use the runtime URL automatically

### 3. New component: `src/components/settings/HealthPanel.tsx`

A card rendered inside ConfigPage with:

- **URL input field** (pre-filled with current value, placeholder shows the tunnel URL format)
- **"Test Connection" button** that calls `testControlApi()`
- **Results display**:
  - Binary name (e.g., "openclaw") with a green/red indicator
  - Version string
  - Sessions check: pass/fail
  - Cron check: pass/fail
  - Error message (trimmed) if any check fails
- **"Save" button** to persist the URL to localStorage
- **"Clear" button** to remove saved URL and revert to env var default

### 4. Update `src/components/pages/ConfigPage.tsx`

Add the HealthPanel between the status cards and the actions section.

### 5. Update `src/lib/store.ts`

Add `controlApiUrl` and `setControlApiUrl` to the Zustand store so changes propagate reactively across components (CronPage connection status footer, TopBar, etc.).

---

## File Changes

| File | Action |
|------|--------|
| `src/lib/control-api.ts` | Create -- runtime URL management + health check caller |
| `src/components/settings/HealthPanel.tsx` | Create -- connectivity UI panel |
| `src/lib/api.ts` | Edit -- use runtime URL getter instead of compile-time constant |
| `src/lib/store.ts` | Edit -- add controlApiUrl state |
| `src/components/pages/ConfigPage.tsx` | Edit -- render HealthPanel |
| `changes.md` | Edit -- log the change |

## What This Does NOT Change

- Server-side code (already migrated)
- Supabase tables or API shapes
- Existing queue-based execution flows
- The fallback behavior (Supabase remains source of truth)

