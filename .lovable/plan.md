

# Fix Cron "Unassigned" Persistence + UI Polish

## Problem Diagnosis

### Current State

1. **All existing jobs have `target_agent_key = NULL`** in `cron_mirror` table
2. The dashboard stores agent assignment in DB columns (`cron_mirror.target_agent_key`, `cron_create_requests.target_agent_key`)
3. But the executor needs this info in the **job payload** to know which agent to run
4. When jobs sync back to mirror, the agent info is lost because it's not in the source payload

### Why "Unassigned" Appears

- Legacy jobs were created before the assignment feature existed
- The `decodeTargetAgent()` fallback checks for `@target:` prefix in instructions, but it's not there
- Even new jobs created via UI don't encode target into instructions (intentionally removed in recent update)

### The Missing Link

There's a **durability gap**: the executor should persist `agentId` in the OpenClaw cron job config, and the mirror sync should extract it back to `target_agent_key`.

---

## Solution

### A) Dual-Path Persistence (Belt + Suspenders)

Store target agent in **both** places:
1. **Explicit DB column** (`target_agent_key`) for quick UI access
2. **Header in instructions** for executor durability and legacy compatibility

When creating/patching jobs, include a machine-readable header:
```text
@agent:agent:main:main
@intent:daily_brief
---
[actual instructions]
```

This ensures:
- Mirror table gets populated from DB on create
- Executor can read agent info from job payload
- Mirror sync can extract and repopulate if needed

### B) Parse Headers on Display

Update `getEffectiveTargetAgent()` to also check for `@agent:` header (not just `@target:`):

```typescript
function getEffectiveTargetAgent(job: CronMirrorJob): string | null {
  // 1. Prefer explicit field
  if (job.targetAgentKey) return job.targetAgentKey;
  
  // 2. Fallback: parse @agent: or @target: from instructions
  if (job.instructions) {
    // Check new format: @agent:xxx
    const agentMatch = job.instructions.match(/^@agent:([^\n@]+)/);
    if (agentMatch) return agentMatch[1].trim();
    
    // Check legacy format: @target:xxx
    const { targetAgent } = decodeTargetAgent(job.instructions);
    if (targetAgent) return targetAgent;
  }
  
  return null;
}
```

### C) Encode Headers When Creating/Patching Jobs

When creating a new job with agent assignment:

```typescript
function encodeJobHeaders(
  targetAgentKey: string | null, 
  jobIntent: string | null,
  instructions: string
): string {
  const headers: string[] = [];
  if (targetAgentKey) headers.push(`@agent:${targetAgentKey}`);
  if (jobIntent) headers.push(`@intent:${jobIntent}`);
  
  if (headers.length === 0) return instructions;
  return headers.join('\n') + '\n---\n' + instructions;
}
```

### D) Patch Existing Jobs (One-Time Migration)

For the "Front Office: 9am Morning Brief" and other legacy jobs, provide a way to assign them to Trunks:

1. User clicks agent dropdown, selects "Trunks"
2. UI queues patch request with `targetAgentKey` AND updates instructions to include header
3. Executor applies patch, job now has durable assignment

### E) UI: Replace "Unassigned" with Context-Aware Label

Instead of always showing "Unassigned":
- **Unassigned jobs**: Show warning badge "Needs assignment" (amber)
- **System jobs**: Show "System" badge (gray) - future enhancement
- **Assigned jobs**: Show agent emoji + name

### F) UI: Fix Awkward Layout (from screenshot)

Current layout has the assignment dropdown awkwardly centered below the job name. Proposed fix:

```text
┌─────────────────────────────────────────────────────────────────┐
│ [Toggle] ClawdOS Morning Standup           ✓ OK • Feb 3 [▶][🗑][v]
│          ⚡ Trunks · Daily Brief                                 
│          Daily at 8:00 AM ET                                    
└─────────────────────────────────────────────────────────────────┘
```

Changes:
- Agent badge inline on same line as intent badge (not stacked)
- Remove dropdown chevrons from display - make the whole agent area clickable
- Better vertical alignment - use consistent left padding
- Smaller, more subtle badges

---

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/schedule-utils.ts` | Edit | Add `encodeJobHeaders()`, update `decodeTargetAgent()` to handle `@agent:` format |
| `src/components/pages/CronPage.tsx` | Edit | Use header encoding when creating jobs, fix `getEffectiveTargetAgent`, improve layout |
| `src/components/schedule/AgentAssignmentDropdown.tsx` | Edit | Improve compact mode styling - cleaner look |
| `src/lib/api.ts` | Edit | Update `queueCronCreateRequest` to encode headers into instructions, update `updateCronJobAgent` to patch instructions too |

---

## Implementation Details

### 1. Update schedule-utils.ts

Add new header encoding/decoding functions:

```typescript
const HEADER_SEPARATOR = '\n---\n';

export function encodeJobHeaders(
  targetAgentKey: string | null,
  jobIntent: string | null,
  instructions: string
): string {
  const headers: string[] = [];
  if (targetAgentKey) headers.push(`@agent:${targetAgentKey}`);
  if (jobIntent && jobIntent !== 'custom') headers.push(`@intent:${jobIntent}`);
  
  if (headers.length === 0) return instructions;
  return headers.join('\n') + HEADER_SEPARATOR + (instructions || '');
}

export function decodeJobHeaders(instructions: string | null | undefined): {
  targetAgent: string | null;
  intent: string | null;
  body: string;
} {
  if (!instructions) return { targetAgent: null, intent: null, body: '' };
  
  // Check for header section
  const sepIndex = instructions.indexOf(HEADER_SEPARATOR);
  if (sepIndex >= 0) {
    const headerSection = instructions.slice(0, sepIndex);
    const body = instructions.slice(sepIndex + HEADER_SEPARATOR.length);
    
    const agentMatch = headerSection.match(/@agent:([^\n]+)/);
    const intentMatch = headerSection.match(/@intent:([^\n]+)/);
    
    return {
      targetAgent: agentMatch ? agentMatch[1].trim() : null,
      intent: intentMatch ? intentMatch[1].trim() : null,
      body,
    };
  }
  
  // Fallback: check legacy @target: format at start
  const targetMatch = instructions.match(/^@target:([^\n]+)\n([\s\S]*)$/);
  if (targetMatch) {
    return { targetAgent: targetMatch[1], intent: null, body: targetMatch[2] };
  }
  
  return { targetAgent: null, intent: null, body: instructions };
}
```

### 2. Update CronPage.tsx - Job Creation

When creating a job, encode headers into instructions:

```typescript
const handleCreate = async () => {
  // ... existing schedule config code ...
  
  // Encode agent + intent into instructions for durability
  const encodedInstructions = encodeJobHeaders(
    createTargetAgent || null,
    createJobIntent || null,
    createInstructions || ''
  );
  
  const result = await queueCronCreateRequest({
    name: createName,
    scheduleKind: scheduleResult.kind,
    scheduleExpr: scheduleResult.expr,
    tz: createTz || undefined,
    instructions: encodedInstructions,  // Includes headers
    targetAgentKey: createTargetAgent || undefined,
    jobIntent: createJobIntent || undefined,
    contextPolicy: createContextPolicy || undefined,
  });
  // ...
};
```

### 3. Update CronPage.tsx - Agent Change Handler

When reassigning agent, also update instructions:

```typescript
const handleAgentChange = async (job: CronMirrorJob, agentKey: string | null) => {
  // Parse existing instructions to get body without old headers
  const { intent, body } = decodeJobHeaders(job.instructions);
  
  // Re-encode with new agent
  const newInstructions = encodeJobHeaders(agentKey, intent || job.jobIntent, body);
  
  const result = await queueCronPatchRequest(job.jobId, {
    targetAgentKey: agentKey,
    instructions: newInstructions,  // Update instructions too
  });
  // ...
};
```

### 4. Update CronJobRow - Better Display Logic

```typescript
function CronJobRow({ job, agents, ... }: CronJobRowProps) {
  const getEffectiveTargetAgent = (): string | null => {
    // Prefer explicit DB field
    if (job.targetAgentKey) return job.targetAgentKey;
    
    // Fallback: parse from instructions
    const { targetAgent } = decodeJobHeaders(job.instructions);
    return targetAgent;
  };
  
  const getEffectiveIntent = (): string | null => {
    if (job.jobIntent) return job.jobIntent;
    const { intent } = decodeJobHeaders(job.instructions);
    return intent;
  };
  // ...
}
```

### 5. Improve AgentAssignmentDropdown Compact Styling

Make the compact mode cleaner:

```tsx
// In compact mode, use a simpler badge-like appearance
<Button
  variant="ghost"
  size="sm"
  className={cn(
    'h-auto py-0.5 px-1.5 text-xs gap-1.5 font-normal',
    selectedAgent 
      ? 'text-foreground' 
      : 'text-muted-foreground',
    className
  )}
>
  {selectedAgent ? (
    <>
      <span className="text-sm">{selectedAgent.avatar || '🤖'}</span>
      <span>{selectedAgent.name}</span>
    </>
  ) : (
    <>
      <User className="w-3 h-3" />
      <span className="text-amber-600 dark:text-amber-400">Needs assignment</span>
    </>
  )}
  <ChevronsUpDown className="w-2.5 h-2.5 opacity-40" />
</Button>
```

### 6. Improve CronJobRow Layout

Restructure for better alignment:

```tsx
<div className="min-w-0 flex-1">
  {/* Line 1: Job name */}
  <h3 className="font-medium truncate">{job.name}</h3>
  
  {/* Line 2: Agent + Intent badges inline */}
  <div className="flex items-center gap-1.5 mt-1">
    <AgentAssignmentDropdown
      agents={agents}
      value={targetAgentKey}
      onChange={onAgentChange}
      compact
    />
    {effectiveIntent && <JobIntentBadge intent={effectiveIntent} />}
  </div>
  
  {/* Line 3: Schedule */}
  <div className="mt-1">
    <InlineScheduleEditor ... />
  </div>
</div>
```

---

## Migration for Existing Jobs

### Option 1: Manual (Recommended for V1)

Users click the agent dropdown for each legacy job and assign it. This:
1. Queues a patch with `targetAgentKey` + updated `instructions`
2. Executor applies
3. Mirror updates with correct data

### Option 2: Bulk Migration Script (Future)

A script that:
1. Reads all `cron_mirror` rows where `target_agent_key IS NULL`
2. For each, infers agent from job name or prompts user
3. Queues patches

---

## Success Criteria

1. "Front Office: 9am Morning Brief" shows "⚡ Trunks" after user assigns it
2. New jobs created via UI have agent info in **both** DB column AND instructions
3. Reassigning agent updates instructions (durable)
4. No more confusing "Unassigned" for actively-used jobs
5. Layout is cleaner and more professional

---

## Out of Scope

- Executor-side implementation (documented contract)
- System job detection (all jobs are agent jobs for now)
- Bulk migration tool (manual assignment for V1)

