// ClawdOS API Layer - Mock implementation, easily swappable for real backend

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Types
export interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'online' | 'idle' | 'running' | 'offline';
  lastActive: string;
  skillCount: number;
  avatar?: string;
}

export interface AgentFile {
  type: 'soul' | 'user' | 'memory_long' | 'memory_today';
  content: string;
  lastModified: string;
}

export interface Session {
  id: string;
  label: string;
  status: 'active' | 'completed' | 'error';
  lastMessage: string;
  startedAt: string;
  agentId: string;
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
  nextRun: string;
  lastRunStatus: 'success' | 'failed' | 'pending' | null;
  instructions: string;
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
  activeSessions: number;
  lastUpdated: string;
  port: number;
  environment: string;
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

const USE_REMOTE = Boolean(API_BASE_URL);

async function requestJson<T>(p: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${p}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
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

  await delay(100);
  return {
    online: true,
    activeSessions: 2,
    lastUpdated: new Date().toISOString(),
    port: 18789,
    environment: 'local',
  };
}

export async function getAgents(): Promise<Agent[]> {
  if (USE_REMOTE) return requestJson<Agent[]>('/api/agents');

  await delay(150);
  return mockAgents;
}

export async function getAgentFile(agentId: string, type: AgentFile['type']): Promise<AgentFile> {
  if (USE_REMOTE) return requestJson<AgentFile>(`/api/agents/${agentId}/files/${type}`);

  await delay(200);

  const contentMap: Record<AgentFile['type'], string> = {
    soul: mockSoulContent,
    user: mockUserContent,
    memory_long: mockMemoryLong,
    memory_today: mockMemoryToday,
  };

  return {
    type,
    content: contentMap[type],
    lastModified: new Date().toISOString(),
  };
}

export async function saveAgentFile(agentId: string, type: AgentFile['type'], content: string): Promise<{ ok: boolean; commit?: string | null | { error: string } }> {
  if (USE_REMOTE) {
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

  await delay(500);
  console.log(`[API] Reloading agent${agentId ? `: ${agentId}` : 's'}`);
  return { ok: true };
}

export async function restartSystem(): Promise<{ ok: boolean }> {
  if (USE_REMOTE) return requestJson<{ ok: boolean }>('/api/restart', { method: 'POST' });

  await delay(1000);
  console.log('[API] Restarting system');
  return { ok: true };
}

export async function getSessions(agentId?: string): Promise<Session[]> {
  await delay(150);
  return agentId 
    ? mockSessions.filter(s => s.agentId === agentId)
    : mockSessions;
}

export async function getSkills(): Promise<Skill[]> {
  await delay(150);
  return mockSkills;
}

export async function getTools(): Promise<Tool[]> {
  await delay(100);
  return mockTools;
}

export async function getCronJobs(): Promise<CronJob[]> {
  await delay(150);
  return mockCronJobs;
}

export async function toggleCronJob(jobId: string, enabled: boolean): Promise<{ ok: boolean }> {
  await delay(200);
  console.log(`[API] Setting cron job ${jobId} enabled: ${enabled}`);
  return { ok: true };
}

export async function runCronJob(jobId: string): Promise<{ ok: boolean }> {
  await delay(500);
  console.log(`[API] Running cron job ${jobId}`);
  return { ok: true };
}

export async function getChannels(): Promise<Channel[]> {
  await delay(100);
  return mockChannels;
}
