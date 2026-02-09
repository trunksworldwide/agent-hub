

# Safe Migration: Clawdbot to OpenClaw (Refined with Bot Feedback)

## What We're Doing

Updating the server and UI so the system works with the new `openclaw` CLI binary while keeping backward compatibility with `clawdbot`. No database changes. No API shape changes. No internal code renames.

---

## Phase 1: Create Executor Wrapper (`server/executor.mjs`)

A single utility that all CLI calls go through.

### Key design decisions (incorporating bot feedback):

- Use `command -v` (POSIX, launchd-safe) instead of `which`
- Support absolute path via `EXECUTOR_BIN` env var (best for launchd)
- Try `openclaw` first, then `clawdbot`
- Cache the resolved binary after first successful check
- Clear error messages when neither binary is found

```javascript
// server/executor.mjs
import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(_exec);
const ENV_BIN = process.env.EXECUTOR_BIN || null;
let _resolved = ENV_BIN;

export async function resolveExecutorBin() {
  if (_resolved) return _resolved;

  for (const bin of ['openclaw', 'clawdbot']) {
    try {
      await execAsync(`command -v ${bin}`);
      _resolved = bin;
      console.log(`[executor] Resolved binary: ${bin}`);
      return bin;
    } catch { /* not found */ }
  }

  throw new Error(
    'Neither "openclaw" nor "clawdbot" found in PATH. ' +
    'Set EXECUTOR_BIN=/absolute/path/to/openclaw in your environment.'
  );
}

export async function execExecutor(args, opts = {}) {
  const bin = await resolveExecutorBin();
  const cmd = `${bin} ${args}`;
  return execAsync(cmd, { timeout: opts.timeout || 30000, ...opts });
}
```

---

## Phase 2: Replace All CLI Calls in `server/index.mjs`

Replace every `exec('clawdbot ...')` with `execExecutor(...)`:

| Line | Current | New |
|------|---------|-----|
| 160 | `exec('clawdbot sessions --json --active 10080')` | `execExecutor('sessions --json --active 10080')` |
| 348 | `exec('clawdbot sessions --json --active 10080')` | `execExecutor('sessions --json --active 10080')` |
| 613 | `exec('clawdbot sessions --json --active 10080')` | `execExecutor('sessions --json --active 10080')` |
| 695 | `exec('clawdbot cron list --json --timeout 60000')` | `execExecutor('cron list --json --timeout 60000', { timeout: 65000 })` |
| 718 | `exec('clawdbot cron enable ...')` | `execExecutor('cron enable ...')` |
| 722 | `exec('clawdbot cron disable ...')` | `execExecutor('cron disable ...')` |
| 729 | `exec('clawdbot cron enable/disable ...')` | `execExecutor(...)` |
| 741-742 | `exec('clawdbot cron runs ...')` | `execExecutor('cron runs ...')` |
| 763 | `exec('clawdbot cron run ...')` | `execExecutor('cron run ...')` |
| 798 | `exec('clawdbot cron edit ...')` | `execExecutor('cron edit ...')` |
| 951 | `exec('clawdbot gateway restart')` | `execExecutor('gateway restart')` |

Total: 11 replacements, all mechanical.

---

## Phase 3: Make Skills Path Configurable

Two hardcoded paths at lines 447 and 582:
```
/opt/homebrew/lib/node_modules/clawdbot/skills
```

Replace with:
```javascript
const SKILLS_DIR = process.env.EXECUTOR_SKILLS_DIR || null;

// In the handler, if SKILLS_DIR is not set, skip or return empty
if (!SKILLS_DIR) {
  return sendJson(res, 200, []);  // or { skillCount: null }
}
```

This avoids guessing the install location entirely. Users set `EXECUTOR_SKILLS_DIR` if they want skills to work, or we return empty gracefully.

---

## Phase 4: Add Smoke Test Endpoint (`/api/executor-check`)

Non-destructive, read-only checks:

```javascript
// GET /api/executor-check
{
  "binary": "openclaw",           // which binary resolved
  "version": "0.4.2",             // from --version
  "checks": {
    "sessions": { "ok": true },
    "cron": { "ok": true },
    "version": { "ok": true, "output": "openclaw 0.4.2" }
  }
}
```

Runs only:
- `<bin> --version`
- `<bin> sessions --json --active 1` (minimal, read-only)
- `<bin> cron list --json --timeout 10000` (read-only)

No restart, no stop, no start. Purely diagnostic.

---

## Phase 5: Update UI Labels (Cosmetic)

| File | Change |
|------|--------|
| `ConfigPage.tsx` line 134 | "Restart ClawdOffice?" becomes "Restart OpenClaw?" |
| `ConfigPage.tsx` lines 160-172 | Remove hardcoded `~/clawdbot/` paths. Replace with a note: "Configuration files are managed in your OpenClaw workspace directory." |
| `ConfigPage.tsx` line 110 | "Update Claw" button text becomes "Update OpenClaw" |
| `server/index.mjs` line 965 | Console log: "ClawdOS Control API" stays (ClawdOS is our brand) |

**NOT renaming:**
- `useClawdOffice` (internal, 20+ files, zero user impact)
- `ClawdOS` brand name (our product, not OpenClaw's)
- Supabase tables, API routes, project IDs

---

## Phase 6: Update `.env.example` and Docs

`.env.example` additions:
```
# Executor binary (absolute path recommended for launchd)
# EXECUTOR_BIN=/opt/homebrew/bin/openclaw

# Skills directory (only needed if you want skills listing)
# EXECUTOR_SKILLS_DIR=/opt/homebrew/lib/node_modules/openclaw/skills
```

`README.md` and `docs/OVERVIEW.md`:
- Replace "Clawdbot" with "OpenClaw" in descriptions
- Update CLI command examples (`clawdbot` to `openclaw`)
- Keep `ClawdOS` references (our brand)

---

## File Summary

| File | Action |
|------|--------|
| `server/executor.mjs` | **Create** -- compatibility wrapper |
| `server/index.mjs` | **Edit** -- import wrapper, replace 11 CLI calls, make skills path configurable, add `/api/executor-check` |
| `src/components/pages/ConfigPage.tsx` | **Edit** -- update UI labels and file path display |
| `.env.example` | **Edit** -- add EXECUTOR_BIN and EXECUTOR_SKILLS_DIR |
| `README.md` | **Edit** -- update naming |
| `docs/OVERVIEW.md` | **Edit** -- update naming and CLI examples |
| `changes.md` | **Edit** -- log the migration |

---

## Safe Update Sequence (After Code Deploy)

This is the recommended order for updating OpenClaw on the Mac mini:

```text
1. Install OpenClaw alongside clawdbot:
   npm install -g openclaw@latest

2. Verify it installed:
   openclaw --version

3. Set env var (in your launchd plist or .env):
   EXECUTOR_BIN=/opt/homebrew/bin/openclaw

4. Restart the Control API server (server/index.mjs)

5. Hit /api/executor-check to verify everything passes

6. Only after all checks pass: optionally uninstall clawdbot
   npm uninstall -g clawdbot
```

Do NOT stop the running gateway until you've confirmed the new binary works. The wrapper will auto-detect `openclaw` if `EXECUTOR_BIN` is set, so no gateway restart is needed for the Control API to switch over.

