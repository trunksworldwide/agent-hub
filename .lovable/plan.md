

# Fix Schedule Interval Parsing and Add Hourly Interval Preset

## Problem

Two issues cause schedule mismatches:

1. The schedule parser (`parseScheduleToConfig`) only recognizes 5, 15, and 30-minute intervals. Any other interval (like 1 hour) silently defaults to "Every 15 minutes." This is dangerous because opening the editor and clicking Apply would overwrite the real schedule.

2. There is no "Every 1 hour" interval-based preset. The existing "Hourly" preset uses cron (`0 * * * *`), but the executor creates jobs with `every: 3600000` (milliseconds), which is a different kind.

## Changes

### 1. Add interval presets for 1h, 2h, 4h, 8h, 12h

**File:** `src/lib/schedule-utils.ts`

- Add `'every-60' | 'every-120' | 'every-240' | 'every-480' | 'every-720'` to the `FrequencyType` union
- Add corresponding entries to `SCHEDULE_PRESETS`:
  - Every 1 hour = 3600000ms
  - Every 2 hours = 7200000ms
  - Every 4 hours = 14400000ms
  - Every 8 hours = 28800000ms  
  - Every 12 hours = 43200000ms
- Rename the existing cron-based "Hourly" preset label to "Hourly (on the hour)" to distinguish it from "Every 1 hour"

### 2. Fix the fallback for unknown intervals

**File:** `src/lib/schedule-utils.ts` (in `parseScheduleToConfig`)

- Instead of defaulting unknown `every` values to `every-15`, fall back to `custom` with the raw expression
- This prevents accidental overwrites

### 3. Improve `formatScheduleDisplay` robustness

Already handles arbitrary ms values correctly (it does math). No change needed here.

### 4. Update `changes.md`

Log the fix.

## Technical Detail

Current broken code (line 97-104):
```
if (kind === 'every' || (!kind && /^\d+$/.test(expr))) {
    const ms = parseInt(expr, 10);
    if (ms === 300000) return { frequency: 'every-5', ... };
    if (ms === 900000) return { frequency: 'every-15', ... };
    if (ms === 1800000) return { frequency: 'every-30', ... };
    // Default to every-15 for unknown intervals  <-- BUG
    return { frequency: 'every-15', ... };
}
```

Fixed:
```
if (kind === 'every' || (!kind && /^\d+$/.test(expr))) {
    const ms = parseInt(expr, 10);
    if (ms === 300000) return { frequency: 'every-5', ... };
    if (ms === 900000) return { frequency: 'every-15', ... };
    if (ms === 1800000) return { frequency: 'every-30', ... };
    if (ms === 3600000) return { frequency: 'every-60', ... };
    if (ms === 7200000) return { frequency: 'every-120', ... };
    if (ms === 14400000) return { frequency: 'every-240', ... };
    if (ms === 28800000) return { frequency: 'every-480', ... };
    if (ms === 43200000) return { frequency: 'every-720', ... };
    // Unknown interval: treat as custom so we don't silently change it
    return { frequency: 'custom', cronExpr: expr, tz: tz || undefined };
}
```

### Files to modify

| File | Change |
|------|--------|
| `src/lib/schedule-utils.ts` | Add interval presets, fix fallback |
| `changes.md` | Log the fix |

