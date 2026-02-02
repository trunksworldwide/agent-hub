// ClawdOS API Layer - Mock implementation, easily swappable for real backend

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const IS_DEV = import.meta.env.MODE === 'development';
const ALLOW_MOCKS_ENV = import.meta.env.VITE_ALLOW_MOCKS === 'true';

import { supabase, hasSupabase } from './supabase';

// Types
export interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'idle' | 'running' | 'offline';
  lastActive: string;
  skillCount: number;
  avatar?: string;

  // Optional theme fields (from Supabase `agents` table)
  color?: string | null;

  // Presence/status fields (optional; populated when Supabase agent_status is configured)
  statusState?: 'idle' | 'working' | 'blocked' | 'sleeping';
  statusNote?: string | null;
  lastActivityAt?: string | null;
  lastHeartbeatAt?: string | null;
  currentTaskId?: string | null;
}

export interface AgentFile {
  type: 'soul' | 'agents' | 'user' | 'memory_long' | 'memory_today';
  content: string;
  lastModified: string;
}

export interface Session {
  id: string;
  // v1 from clawdbot sessions store
  key?: string;
  kind?: string;
  label?: string;
  status: 'active' | 'completed' | 'error';
  lastMessage?: string;
  startedAt: string;
  updatedAt?: string;
  agentId?: string;
  model?: string;
  totalTokens?: number;
}

export interface Skill {
  id: string;
  name: string;
  slug: string;
  description: string;
  version: string;
  installed: boolean;
  lastUpdated: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  configured: boolean;
  icon: string;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;

  /** Human-friendly next run label (best effort; source-dependent). */
  nextRun: string;

  /** Epoch millis for next run, when available (preferred for sorting/rendering). */
  nextRunAtMs?: number | null;

  lastRunStatus: 'success' | 'failed' | 'pending' | null;
  instructions: string;
}

export interface CronRunEntry {
  ts: number;
  jobId: string;
  action: string;
  status?: string;
  summary?: string;
  runAtMs?: number;
  durationMs?: number;
  nextRunAtMs?: number;
}

export interface Channel {
  id: string;
  name: string;
  type: string;
  status: 'connected' | 'disconnected';
  lastActivity: string;
}

export interface SystemStatus {
  online: boolean;
  activeSessions: number | null;
  lastUpdated: string;
  port: number;
  environment: string;
}

export interface ActivityItem {
  hash: string;

  /** Raw actor key (e.g. "agent:main:main"). Useful for exact matching. */
  author: string;

  /** Display-friendly author label (e.g. "main"), derived from `author`. */
  authorLabel?: string;

  date: string;
  message: string;

  // Optional richer typing when backed by Supabase `activities`
  type?: string;
  taskId?: string | null;
}

export interface GlobalActivityItem {
  id: string;
  projectId: string;
  projectName: string;
  type: string;
  message: string;
  actor: string;
  taskId?: string | null;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  workspace: string;
  tag?: string;
}

export type TaskStatus = 'inbox' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assigneeAgentKey?: string;
  createdAt: string;
  updatedAt: string;
}

// Mock Data
const mockAgents: Agent[] = [
  { id: 'trunks', name: 'Trunks', role: 'Primary Agent', status: 'online', lastActive: '2 min ago', skillCount: 12, avatar: '🤖' },
  { id: 'research', name: 'Research', role: 'Deep Research', status: 'idle', lastActive: '15 min ago', skillCount: 8, avatar: '🔬' },
  { id: 'coder', name: 'Coder', role: 'Code Generation', status: 'running', lastActive: 'now', skillCount: 15, avatar: '💻' },
  { id: 'writer', name: 'Writer', role: 'Content Creation', status: 'offline', lastActive: '2 hours ago', skillCount: 6, avatar: '✍️' },
];

const mockSoulContent = `# SOUL.md

> Who I am. For what I do, see \`AGENTS.md\`.

## Core Truths
- **Be helpful, not performative** — skip "Great question!", just help
- **Have opinions** — disagree, prefer things, find stuff amusing/boring
- **Be resourceful** — figure it out first, ask later
- **Earn trust** — careful with external (emails, tweets), bold with internal
- **You're a guest** — respect the intimacy of access

## Vibe

### Language
- Speak **English** to user even on other topics
- Exception: actual content (emails/forms) can match user's language

### Internal (with User)
- ❌ NEVER use 👍 — they hate it
- ✅ Sarcasm ENCOURAGED
- ✅ Swearing when emphatic (not gratuitous)
- ✅ Roast affectionately
- ✅ Dark humor (not edgelord cringe)
- ✅ Match energy: unhinged → go unhinged
- ✅ Have takes, disagree
- ❌ No corporate-speak, no sycophancy
- ❌ No "I think" / "perhaps" hedging
- ✅ Call stupid things stupid (lovingly)

### External (customers, public)
- Professional but genuine
- No corporate BS, no swearing
- Still have personality`;

const mockUserContent = `# USER.md

## Profile
- **Name:** Alex
- **Timezone:** America/Los_Angeles (PST/PDT)
- **Preferred Language:** English

## Preferences
- Morning person — schedule important tasks before noon
- Prefers bullet points over paragraphs
- Direct communication style
- Likes dark mode everything

## Permissions
- Can send emails on behalf of user (draft first for external)
- Can manage calendar freely
- Can execute shell commands in approved directories
- Cannot make purchases without explicit approval
- Cannot post to social media without review`;

const mockMemoryLong = `# MEMORY.md (Long-term)

## Key Facts
- User works on AI agents and developer tools
- Main project is ClawdBot — personal AI assistant
- Uses Mac mini as home server
- Prefers TypeScript over JavaScript

## Important Dates
- Birthday: March 15
- Company anniversary: September 1

## Recurring Themes
- User often forgets to eat lunch when focused
- Prefers async communication over meetings
- Values documentation highly`;

const mockMemoryToday = `# Memory: 2026-02-01

## Morning
- [09:15] Started working on ClawdOS dashboard design
- [10:30] Had call with potential investor — went well
- [11:45] Debugged authentication issue in main agent

## Afternoon
- [14:00] Deployed v0.3.2 of control API
- [15:30] Reviewed pull request for memory compression
- [16:45] Scheduled cron job for daily summary emails`;

const mockSessions: Session[] = [
  { id: 's1', label: 'Research: AI Agent Frameworks', status: 'active', lastMessage: 'Compiling findings on LangChain vs AutoGPT...', startedAt: '10 min ago', agentId: 'trunks' },
  { id: 's2', label: 'Code Review: Auth Module', status: 'completed', lastMessage: 'Review complete. 3 suggestions made.', startedAt: '1 hour ago', agentId: 'trunks' },
  { id: 's3', label: 'Email Draft: Weekly Update', status: 'completed', lastMessage: 'Draft ready for review.', startedAt: '2 hours ago', agentId: 'trunks' },
];

const mockSkills: Skill[] = [
  { id: 'web-browse', name: 'Web Browser', slug: 'web-browse', description: 'Browse and extract content from websites', version: '2.1.0', installed: true, lastUpdated: '3 days ago' },
  { id: 'code-exec', name: 'Code Executor', slug: 'code-exec', description: 'Execute code in sandboxed environments', version: '1.8.2', installed: true, lastUpdated: '1 week ago' },
  { id: 'file-mgmt', name: 'File Manager', slug: 'file-mgmt', description: 'Read, write, and organize files', version: '1.5.0', installed: true, lastUpdated: '2 weeks ago' },
  { id: 'calendar', name: 'Calendar', slug: 'calendar', description: 'Manage calendar events and reminders', version: '1.2.1', installed: true, lastUpdated: '1 month ago' },
  { id: 'email', name: 'Email', slug: 'email', description: 'Send, receive, and manage emails', version: '2.0.0', installed: true, lastUpdated: '5 days ago' },
  { id: 'github', name: 'GitHub', slug: 'github', description: 'Interact with GitHub repos, issues, PRs', version: '1.4.0', installed: false, lastUpdated: '2 weeks ago' },
  { id: 'slack', name: 'Slack', slug: 'slack', description: 'Send messages and manage Slack workspace', version: '1.1.0', installed: false, lastUpdated: '1 month ago' },
];

const mockTools: Tool[] = [
  { id: 'browser', name: 'Browser', description: 'Navigate and extract web content', configured: true, icon: '🌐' },
  { id: 'exec', name: 'Shell Executor', description: 'Run shell commands in sandbox', configured: true, icon: '⚡' },
  { id: 'notes', name: 'Notes', description: 'Create and manage notes', configured: true, icon: '📝' },
  { id: 'reminders', name: 'Reminders', description: 'Set and manage reminders', configured: true, icon: '⏰' },
  { id: 'whisper', name: 'Whisper', description: 'Speech-to-text transcription', configured: false, icon: '🎤' },
  { id: 'vision', name: 'Vision', description: 'Analyze images and screenshots', configured: true, icon: '👁️' },
];

const mockCronJobs: CronJob[] = [
  { id: 'daily-summary', name: 'Daily Summary', schedule: '0 18 * * *', enabled: true, nextRun: 'Today 6:00 PM', lastRunStatus: 'success', instructions: 'Compile a summary of all activities today and send via email.' },
  { id: 'inbox-check', name: 'Inbox Check', schedule: '*/30 * * * *', enabled: true, nextRun: 'In 15 min', lastRunStatus: 'success', instructions: 'Check for important emails and flag urgent ones.' },
  { id: 'backup-memory', name: 'Backup Memory', schedule: '0 0 * * *', enabled: true, nextRun: 'Tomorrow 12:00 AM', lastRunStatus: 'success', instructions: 'Backup all memory files to external storage.' },
  { id: 'weekly-report', name: 'Weekly Report', schedule: '0 9 * * 1', enabled: false, nextRun: 'Monday 9:00 AM', lastRunStatus: null, instructions: 'Generate and send weekly productivity report.' },
];

const mockChannels: Channel[] = [
  { id: 'imessage', name: 'iMessage', type: 'messaging', status: 'connected', lastActivity: '5 min ago' },
  { id: 'email', name: 'Email', type: 'email', status: 'connected', lastActivity: '1 hour ago' },
  { id: 'slack', name: 'Slack', type: 'messaging', status: 'disconnected', lastActivity: '2 days ago' },
];

// Simulated delay for realistic feel (used only in mock mode)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// In dev, allow mock mode only when explicitly enabled.
// Default is: NO MOCKS (to avoid confusing ghost agents in Lovable/remote builds).
const USE_REMOTE = Boolean(API_BASE_URL);
const ALLOW_MOCKS = IS_DEV && !USE_REMOTE && ALLOW_MOCKS_ENV;

function getProjectId(): string {
  try {
    return localStorage.getItem('clawdos.project') || 'front-office';
  } catch {
    return 'front-office';
  }
}

async function requestJson<T>(p: string, init?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error(
      'Missing VITE_API_BASE_URL. This build is configured for real data only (no mocks).'
    );
  }
  const url = `${API_BASE_URL}${p}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-clawdos-project': getProjectId(),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// API Functions
export async function getStatus(): Promise<SystemStatus> {
  if (USE_REMOTE) return requestJson<SystemStatus>('/api/status');
  if (!ALLOW_MOCKS) return requestJson<SystemStatus>('/api/status');

  await delay(100);
  return {
    online: true,
    activeSessions: 2,
    lastUpdated: new Date().toISOString(),
    port: 18789,
    environment: 'local',
  };
}

export async function createAgent(input: {
  agentKey: string;
  name: string;
  role?: string;
  emoji?: string;
  color?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!(hasSupabase() && supabase)) {
    return { ok: false, error: 'supabase_not_configured' };
  }

  const projectId = getProjectId();
  const agentKey = input.agentKey.trim();
  if (!agentKey) return { ok: false, error: 'missing_agent_key' };

  const name = input.name?.trim() || agentKey;
  const role = input.role?.trim() || null;
  const emoji = input.emoji?.trim() || null;
  const color = input.color?.trim() || null;

  try {
    // Create/merge agent roster row.
    const { error: agentErr } = await supabase.from('agents').upsert(
      {
        project_id: projectId,
        agent_key: agentKey,
        name,
        role,
        emoji,
        color,
      },
      { onConflict: 'project_id,agent_key' }
    );

    if (agentErr) throw agentErr;

    // Ensure an agent_status row exists.
    const nowIso = new Date().toISOString();
    await supabase.from('agent_status').upsert(
      {
        project_id: projectId,
        agent_key: agentKey,
        state: 'idle',
        note: null,
        last_activity_at: nowIso,
      },
      { onConflict: 'project_id,agent_key' }
    );

    // Best-effort: activity feed entry.
    await supabase.from('activities').insert({
      project_id: projectId,
      type: 'agent_created',
      message: `Created agent ${name}`,
      actor_agent_key: 'ui',
      task_id: null,
    });

    return { ok: true };
  } catch (e: any) {
    console.error('createAgent failed:', e);
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function getAgents(): Promise<Agent[]> {
  // Prefer Supabase roster if configured.
  if (hasSupabase() && supabase) {
    const projectId = getProjectId();

    const [{ data: agents, error: agentsError }, { data: statuses, error: statusError }] =
      await Promise.all([
        supabase
          .from('agents')
          .select('agent_key,name,role,emoji,color,created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true }),
        supabase
          .from('agent_status')
          .select('agent_key,state,current_task_id,last_heartbeat_at,last_activity_at,note')
          .eq('project_id', projectId),
      ]);

    if (agentsError) throw agentsError;
    if (statusError) throw statusError;

    const statusByKey = new Map((statuses || []).map((s: any) => [s.agent_key, s]));

    // Best-effort: ensure each agent has an agent_status row so presence renders.
    // The DB seeds agents, but not agent_status by default.
    const missingStatus = (agents || []).filter((a: any) => !statusByKey.has(a.agent_key));
    if (missingStatus.length > 0) {
      try {
        const nowIso = new Date().toISOString();
        await supabase.from('agent_status').upsert(
          missingStatus.map((a: any) => ({
            project_id: projectId,
            agent_key: a.agent_key,
            state: 'idle',
            note: null,
            last_activity_at: nowIso,
          })),
          { onConflict: 'project_id,agent_key' }
        );

        // Mirror defaults locally so the UI doesn't need a second round-trip.
        for (const a of missingStatus) {
          statusByKey.set(a.agent_key, {
            agent_key: a.agent_key,
            state: 'idle',
            current_task_id: null,
            last_heartbeat_at: null,
            last_activity_at: nowIso,
            note: null,
          });
        }
      } catch (e) {
        console.warn('Failed to upsert missing agent_status rows:', e);
      }
    }

    const now = Date.now();
    const msSince = (iso: string | null | undefined) => {
      if (!iso) return null;
      const t = Date.parse(iso);
      if (Number.isNaN(t)) return null;
      return now - t;
    };

    const newestIso = (a: string | null | undefined, b: string | null | undefined) => {
      const at = a ? Date.parse(a) : Number.NaN;
      const bt = b ? Date.parse(b) : Number.NaN;
      if (Number.isNaN(at) && Number.isNaN(bt)) return null;
      if (Number.isNaN(bt)) return a || null;
      if (Number.isNaN(at)) return b || null;
      return at >= bt ? (a || null) : (b || null);
    };

    const formatLastActive = (ms: number | null) => {
      if (ms === null) return '';
      if (ms < 30_000) return 'just now';
      if (ms < 60 * 60_000) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
      if (ms < 24 * 60 * 60_000) return `${Math.round(ms / (60 * 60_000))}h ago`;
      return `${Math.round(ms / (24 * 60 * 60_000))}d ago`;
    };

    const resolveDashboardStatus = (
      state: Agent['statusState'] | undefined,
      lastSeenAt: string | null | undefined
    ): Agent['status'] => {
      if (state === 'sleeping') return 'offline';
      if (state === 'working') return 'running';

      const age = msSince(lastSeenAt);
      if (age === null) return 'idle';
      if (age <= 5 * 60_000) return 'online';
      if (age >= 60 * 60_000) return 'offline';
      return 'idle';
    };

    return (agents || []).map((a: any) => {
      const st = statusByKey.get(a.agent_key);
      const lastActivityAt: string | null | undefined = st?.last_activity_at;
      const lastHeartbeatAt: string | null | undefined = st?.last_heartbeat_at;
      const lastSeenAt = newestIso(lastActivityAt, lastHeartbeatAt);
      const state: Agent['statusState'] | undefined = st?.state;

      return {
        id: a.agent_key,
        name: a.name || a.agent_key,
        role: a.role || '',
        status: resolveDashboardStatus(state, lastSeenAt),
        lastActive: formatLastActive(msSince(lastSeenAt)),
        skillCount: 0,
        avatar: a.emoji || '🤖',
        color: a.color ?? null,
        statusState: state,
        statusNote: st?.note ?? null,
        lastActivityAt: st?.last_activity_at ?? null,
        lastHeartbeatAt: st?.last_heartbeat_at ?? null,
        currentTaskId: st?.current_task_id ?? null,
      };
    });
  }

  if (USE_REMOTE) return requestJson<Agent[]>('/api/agents');
  if (!ALLOW_MOCKS) return requestJson<Agent[]>('/api/agents');

  await delay(150);
  return mockAgents;
}

export async function getAgentFile(agentId: string, type: AgentFile['type']): Promise<AgentFile> {
  // Prefer Supabase brain_docs if configured.
  if (hasSupabase() && supabase) {
    const projectId = getProjectId();
    const { data, error } = await supabase
      .from('brain_docs')
      .select('content,updated_at')
      .eq('project_id', projectId)
      .eq('doc_type', type)
      .maybeSingle();

    if (error) throw error;

    return {
      type,
      content: data?.content || '',
      lastModified: data?.updated_at || new Date().toISOString(),
    };
  }

  if (USE_REMOTE) return requestJson<AgentFile>(`/api/agents/${agentId}/files/${type}`);
  if (!ALLOW_MOCKS) return requestJson<AgentFile>(`/api/agents/${agentId}/files/${type}`);

  await delay(200);

  const contentMap: Record<AgentFile['type'], string> = {
    soul: mockSoulContent,
    agents: '',
    user: mockUserContent,
    memory_long: mockMemoryLong,
    memory_today: mockMemoryToday,
  };

  return {
    type,
    content: contentMap[type] || '',
    lastModified: new Date().toISOString(),
  };
}

export async function saveAgentFile(agentId: string, type: AgentFile['type'], content: string): Promise<{ ok: boolean; commit?: string | null | { error: string } }> {
  // Prefer Supabase brain_docs if configured.
  if (hasSupabase() && supabase) {
    const projectId = getProjectId();
    const { error } = await supabase
      .from('brain_docs')
      .upsert(
        {
          project_id: projectId,
          doc_type: type,
          content,
          updated_by: 'dashboard',
        },
        { onConflict: 'project_id,doc_type' }
      );
    if (error) throw error;

    // Best-effort: write a matching activity row so the Live Feed reflects doc edits
    // even when the dashboard is talking directly to Supabase.
    try {
      const labelByType: Record<AgentFile['type'], string> = {
        soul: 'SOUL.md',
        agents: 'AGENTS.md',
        user: 'USER.md',
        memory_long: 'MEMORY.md',
        memory_today: 'memory (today)',
      };
      await supabase.from('activities').insert({
        project_id: projectId,
        type: 'brain_doc_updated',
        message: `Updated ${labelByType[type] || type}`,
        actor_agent_key: 'agent:main:main',
      });
    } catch {
      // ignore
    }

    return { ok: true };
  }

  if (USE_REMOTE) {
    return requestJson<{ ok: boolean; commit?: string | null | { error: string } }>(`/api/agents/${agentId}/files/${type}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }
  if (!ALLOW_MOCKS) {
    return requestJson<{ ok: boolean; commit?: string | null | { error: string } }>(`/api/agents/${agentId}/files/${type}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  await delay(300);
  console.log(`[API] Saving ${type} for agent ${agentId}`);
  return { ok: true };
}

export async function reloadAgent(agentId?: string): Promise<{ ok: boolean }> {
  // v1 maps reload -> restart (gateway restart)
  if (USE_REMOTE) return requestJson<{ ok: boolean }>('/api/restart', { method: 'POST' });
  if (!ALLOW_MOCKS) return requestJson<{ ok: boolean }>('/api/restart', { method: 'POST' });

  await delay(500);
  console.log(`[API] Reloading agent${agentId ? `: ${agentId}` : 's'}`);
  return { ok: true };
}

export async function restartSystem(): Promise<{ ok: boolean }> {
  if (USE_REMOTE) return requestJson<{ ok: boolean }>('/api/restart', { method: 'POST' });
  if (!ALLOW_MOCKS) return requestJson<{ ok: boolean }>('/api/restart', { method: 'POST' });

  await delay(1000);
  console.log('[API] Restarting system');
  return { ok: true };
}

export async function getSessions(agentId?: string): Promise<Session[]> {
  if (USE_REMOTE) return requestJson<Session[]>('/api/sessions');
  if (!ALLOW_MOCKS) return requestJson<Session[]>('/api/sessions');

  await delay(150);
  return agentId 
    ? mockSessions.filter(s => s.agentId === agentId)
    : mockSessions;
}

export async function getSkills(): Promise<Skill[]> {
  if (USE_REMOTE) return requestJson<Skill[]>('/api/skills');
  if (!ALLOW_MOCKS) return requestJson<Skill[]>('/api/skills');

  await delay(150);
  return mockSkills;
}

export async function getTools(): Promise<Tool[]> {
  await delay(100);
  return mockTools;
}

export async function getCronJobs(): Promise<CronJob[]> {
  if (USE_REMOTE) return requestJson<CronJob[]>('/api/cron');
  if (!ALLOW_MOCKS) return requestJson<CronJob[]>('/api/cron');

  await delay(150);
  return mockCronJobs;
}

export async function toggleCronJob(jobId: string, enabled: boolean): Promise<{ ok: boolean; enabled?: boolean }> {
  if (USE_REMOTE) {
    return requestJson<{ ok: boolean; enabled?: boolean }>(`/api/cron/${jobId}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  }
  if (!ALLOW_MOCKS) {
    return requestJson<{ ok: boolean; enabled?: boolean }>(`/api/cron/${jobId}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  }

  await delay(200);
  console.log(`[API] Setting cron job ${jobId} enabled: ${enabled}`);
  return { ok: true, enabled };
}

export async function editCronJob(jobId: string, patch: { name?: string; schedule?: string; instructions?: string; enabled?: boolean }): Promise<{ ok: boolean }> {
  if (USE_REMOTE) {
    return requestJson<{ ok: boolean }>(`/api/cron/${jobId}/edit`, {
      method: 'POST',
      body: JSON.stringify(patch),
    });
  }
  if (!ALLOW_MOCKS) {
    return requestJson<{ ok: boolean }>(`/api/cron/${jobId}/edit`, {
      method: 'POST',
      body: JSON.stringify(patch),
    });
  }

  await delay(200);
  console.log(`[API] Editing cron job ${jobId}`, patch);
  return { ok: true };
}

export async function runCronJob(jobId: string): Promise<{ ok: boolean }> {
  if (USE_REMOTE) return requestJson<{ ok: boolean }>(`/api/cron/${jobId}/run`, { method: 'POST' });
  if (!ALLOW_MOCKS) return requestJson<{ ok: boolean }>(`/api/cron/${jobId}/run`, { method: 'POST' });

  await delay(500);
  console.log(`[API] Running cron job ${jobId}`);
  return { ok: true };
}

export async function getCronRuns(jobId: string, limit = 25): Promise<{ entries: CronRunEntry[] }> {
  if (USE_REMOTE) return requestJson<{ entries: CronRunEntry[] }>(`/api/cron/${jobId}/runs?limit=${encodeURIComponent(String(limit))}`);
  if (!ALLOW_MOCKS) return requestJson<{ entries: CronRunEntry[] }>(`/api/cron/${jobId}/runs?limit=${encodeURIComponent(String(limit))}`);

  await delay(150);
  return { entries: [] };
}

export async function getProjects(): Promise<Project[]> {
  // Prefer Supabase projects if configured.
  if (hasSupabase() && supabase) {
    const { data, error } = await supabase
      .from('projects')
      .select('id,name,workspace_path,created_at')
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      workspace: p.workspace_path || '',
    }));
  }

  if (USE_REMOTE) return requestJson<Project[]>('/api/projects');
  if (!ALLOW_MOCKS) return requestJson<Project[]>('/api/projects');

  await delay(50);
  return [
    { id: 'front-office', name: 'Front Office', workspace: '/Users/trunks/clawd', tag: 'system' },
  ];
}

export async function createProject(input: { id: string; name: string; tag?: string }): Promise<{ ok: boolean; project?: Project }> {
  if (USE_REMOTE) {
    return requestJson<{ ok: boolean; project?: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
  }
  if (!ALLOW_MOCKS) {
    return requestJson<{ ok: boolean; project?: Project }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
  }

  await delay(50);
  return { ok: true };
}

export async function getTasks(): Promise<Task[]> {
  // Prefer Supabase tasks if configured.
  if (hasSupabase() && supabase) {
    const projectId = getProjectId();
    const { data, error } = await supabase
      .from('tasks')
      .select('id,title,description,status,assignee_agent_key,created_at,updated_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description || '',
      status: t.status,
      assigneeAgentKey: t.assignee_agent_key || undefined,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));
  }

  if (USE_REMOTE) return requestJson<Task[]>('/api/tasks');
  if (!ALLOW_MOCKS) return requestJson<Task[]>('/api/tasks');

  await delay(80);
  return [];
}

export async function updateTask(taskId: string, patch: Partial<Pick<Task, 'status' | 'assigneeAgentKey' | 'title' | 'description'>>): Promise<{ ok: boolean }> {
  if (hasSupabase() && supabase) {
    const projectId = getProjectId();
    const update: any = {};
    if (patch.status) update.status = patch.status;
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.assigneeAgentKey !== undefined) update.assignee_agent_key = patch.assigneeAgentKey;

    const { error } = await supabase
      .from('tasks')
      .update(update)
      .eq('id', taskId)
      .eq('project_id', projectId);

    if (error) throw error;

    // Write an activity row (best effort)
    // Make the feed human-readable by including the task title.
    if (patch.status) {
      let title: string | null = null;
      try {
        const { data } = await supabase
          .from('tasks')
          .select('title')
          .eq('project_id', projectId)
          .eq('id', taskId)
          .maybeSingle();
        title = (data as any)?.title ?? null;
      } catch {
        // ignore
      }

      const label = title ? `“${title}”` : taskId;
      await supabase.from('activities').insert({
        project_id: projectId,
        type: 'task_moved',
        message: `Moved ${label} → ${patch.status}`,
        actor_agent_key: 'agent:main:main',
        task_id: taskId,
      });
    }

    return { ok: true };
  }

  if (USE_REMOTE) {
    return requestJson<{ ok: boolean }>(`/api/tasks/${taskId}`, {
      method: 'POST',
      body: JSON.stringify({ patch }),
    });
  }
  if (!ALLOW_MOCKS) {
    return requestJson<{ ok: boolean }>(`/api/tasks/${taskId}`, {
      method: 'POST',
      body: JSON.stringify({ patch }),
    });
  }

  await delay(80);
  return { ok: true };
}

export async function createTask(input: Pick<Task, 'title'> & Partial<Pick<Task, 'description' | 'assigneeAgentKey' | 'status'>>): Promise<{ ok: boolean; task?: Task }> {
  if (hasSupabase() && supabase) {
    const projectId = getProjectId();
    const now = new Date().toISOString();
    const row: any = {
      project_id: projectId,
      title: input.title,
      description: input.description || '',
      status: input.status || 'inbox',
      assignee_agent_key: input.assigneeAgentKey || null,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase
      .from('tasks')
      .insert(row)
      .select('id,title,description,status,assignee_agent_key,created_at,updated_at')
      .single();

    if (error) throw error;

    // Write an activity row (best effort)
    await supabase.from('activities').insert({
      project_id: projectId,
      type: 'task_created',
      message: data.title,
      actor_agent_key: 'agent:main:main',
      task_id: data.id,
    });

    return {
      ok: true,
      task: {
        id: data.id,
        title: data.title,
        description: data.description || '',
        status: data.status,
        assigneeAgentKey: data.assignee_agent_key || undefined,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    };
  }

  if (USE_REMOTE) {
    return requestJson<{ ok: boolean; task?: Task }>(`/api/tasks`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
  }
  if (!ALLOW_MOCKS) {
    return requestJson<{ ok: boolean; task?: Task }>(`/api/tasks`, {
      method: 'POST',
      body: JSON.stringify({ input }),
    });
  }

  await delay(80);
  return { ok: true };
}

export async function getActivity(): Promise<ActivityItem[]> {
  // Prefer Supabase activities if configured.
  if (hasSupabase() && supabase) {
    const projectId = getProjectId();
    const { data, error } = await supabase
      .from('activities')
      .select('id,type,message,actor_agent_key,task_id,created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const toAuthorLabel = (raw: string | null | undefined) => {
      if (!raw) return '';
      // Common format: agent:<agentKey>:<sessionKind>
      const parts = String(raw).split(':');
      if (parts.length >= 2 && parts[0] === 'agent') return parts[1];
      return String(raw);
    };

    return (data || []).map((a: any) => ({
      hash: a.id,
      author: a.actor_agent_key || '',
      authorLabel: toAuthorLabel(a.actor_agent_key),
      date: a.created_at,
      message: a.message,
      type: a.type,
      taskId: a.task_id,
    }));
  }

  if (USE_REMOTE) return requestJson<ActivityItem[]>('/api/activity');
  if (!ALLOW_MOCKS) return requestJson<ActivityItem[]>('/api/activity');

  await delay(100);
  return [];
}

export async function getGlobalActivity(limit = 10): Promise<GlobalActivityItem[]> {
  // Global activity requires server-side Supabase keys, so always go through the Control API.
  // (If VITE_API_BASE_URL is missing, this will throw and the UI will fail soft.)
  const qs = `?limit=${encodeURIComponent(String(limit))}`;
  if (USE_REMOTE) return requestJson<GlobalActivityItem[]>(`/api/activity/global${qs}`);
  if (!ALLOW_MOCKS) return requestJson<GlobalActivityItem[]>(`/api/activity/global${qs}`);

  await delay(60);
  return [];
}

export async function getChannels(): Promise<Channel[]> {
  await delay(100);
  return mockChannels;
}
