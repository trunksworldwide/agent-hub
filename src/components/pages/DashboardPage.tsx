import { useEffect, useMemo, useState } from 'react';
import { createTask, getActivity, getAgents, getCronJobs, getStatus, getTasks, updateTask, type ActivityItem, type Agent, type CronJob, type Task, type TaskStatus } from '@/lib/api';
import { hasSupabase, subscribeToProjectRealtime, supabase } from '@/lib/supabase';
import { useClawdOffice } from '@/lib/store';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/datetime';
import { Clock, PanelLeftClose, PanelLeft, Plus, RefreshCw, Info } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AgentProfilePanel } from '@/components/dashboard/AgentProfilePanel';

interface FeedItem {
  id: string;

  kind: 'activity' | 'cron';

  cronJobId?: string;
  cronSchedule?: string;

  /** Parsed agent key when the feed item is attributable to an agent. */
  actorAgentKey?: string | null;

  /** Parsed agent key when the feed item targets a specific agent (e.g. a session message). */
  recipientAgentKey?: string | null;

  // Activity types come from Supabase `activities.type` (arbitrary strings).
  // Keep this as `string` so new server-side activity events render without
  // requiring a frontend deploy.
  type: string;

  title: string;
  subtitle?: string;
  createdAt: string;

  // Debug-friendly raw fields for a details view.
  rawAuthor?: string | null;
  rawAuthorLabel?: string | null;
  rawHash?: string | null;
  rawMessage?: string | null;
}

export function DashboardPage() {
  const { selectedProjectId, setViewMode, setActiveMainTab, setFocusCronJobId } = useClawdOffice();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLimit, setActivityLimit] = useState(50);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [agentPanelCollapsed, setAgentPanelCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedFeedDetails, setSelectedFeedDetails] = useState<FeedItem | null>(null);

  // Project scoping: avoid showing an agent panel from the previous project after switching.
  // (Agent keys can overlap, but the roster + tasks + activity context should always be project-scoped.)
  useEffect(() => {
    setSelectedAgent(null);
  }, [selectedProjectId]);

  const [feedTypeFilter, setFeedTypeFilter] = useState<string>('all');
  const [feedAgentFilter, setFeedAgentFilter] = useState<string>('all');
  const [feedSearch, setFeedSearch] = useState<string>('');

  // Persist feed filters per project so the dashboard feels "sticky".
  useEffect(() => {
    const projectId = selectedProjectId || 'front-office';
    try {
      const rawType = window.localStorage.getItem(`clawdos.feedType.${projectId}`);
      if (rawType && typeof rawType === 'string') setFeedTypeFilter(rawType);

      const rawAgent = window.localStorage.getItem(`clawdos.feedAgent.${projectId}`);
      if (rawAgent && typeof rawAgent === 'string') setFeedAgentFilter(rawAgent);

      const rawSearch = window.localStorage.getItem(`clawdos.feedSearch.${projectId}`);
      if (rawSearch && typeof rawSearch === 'string') setFeedSearch(rawSearch);
      if (rawSearch === '') setFeedSearch('');
    } catch {
      // localStorage may be unavailable; fail soft.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  useEffect(() => {
    const projectId = selectedProjectId || 'front-office';
    try {
      window.localStorage.setItem(`clawdos.feedType.${projectId}`, feedTypeFilter);
      window.localStorage.setItem(`clawdos.feedAgent.${projectId}`, feedAgentFilter);
      window.localStorage.setItem(`clawdos.feedSearch.${projectId}`, feedSearch);
    } catch {
      // Ignore.
    }
  }, [selectedProjectId, feedTypeFilter, feedAgentFilter, feedSearch]);

  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = async () => {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const [a, t, c, act] = await Promise.all([
        getAgents(),
        getTasks(),
        getCronJobs(),
        getActivity(activityLimit),
      ]);
      setAgents(a);
      setTasks(t);
      setCronJobs(c);
      setActivity(act);
      setLastRefreshedAt(new Date());
    } catch (e: any) {
      console.error('Dashboard refresh failed', e);
      setLoadError(String(e?.message || e));
    } finally {
      setIsRefreshing(false);
    }
  };

  const patchAgentInRoster = (agentKey: string, patch: Partial<Pick<Agent, 'avatar' | 'color'>>) => {
    setAgents((prev) => prev.map((a) => (a.id === agentKey ? { ...a, ...patch } : a)));
    setSelectedAgent((prev) => (prev && prev.id === agentKey ? { ...prev, ...patch } : prev));
  };

  useEffect(() => {
    refresh();

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    // Presence keepalive: `/api/status` best-effort upserts agent_status on the server.
    // This helps keep the dashboard agent "online" while the UI is open, even if no other
    // activity is being emitted.
    const presence = setInterval(() => {
      // If the Control API exists, this call upserts server-side presence.
      // In Supabase-only deployments, this may be a no-op; we optionally fall back
      // to a client-side Supabase upsert (opt-in via env var) so presence can still work.
      getStatus().catch(() => {});

      const heartbeatAgentKey = String(import.meta.env.VITE_DASHBOARD_PRESENCE_AGENT_KEY || '').trim();
      if (!heartbeatAgentKey) return;
      if (!(hasSupabase() && supabase)) return;

      const projectId = selectedProjectId || 'front-office';
      const nowIso = new Date().toISOString();

      // We *prefer* authenticated writes (if the app uses Supabase Auth), but don't require
      // an active session: many Supabase setups allow anon writes for presence rows.
      // Either way, this is best-effort and should fail soft.
      const createAgent =
        String(import.meta.env.VITE_DASHBOARD_PRESENCE_CREATE_AGENT || '').toLowerCase() === 'true';

      if (createAgent) {
        supabase
          .from('agents')
          .upsert(
            {
              project_id: projectId,
              agent_key: heartbeatAgentKey,
              name: 'Dashboard',
              role: 'UI',
              emoji: '🖥️',
            },
            { onConflict: 'project_id,agent_key' }
          )
          .then(() => {});
      }

      supabase
        .from('agent_status')
        .upsert(
          {
            project_id: projectId,
            agent_key: heartbeatAgentKey,
            state: 'idle',
            last_heartbeat_at: nowIso,
            last_activity_at: nowIso,
            note: 'Dashboard open (UI keepalive)',
          },
          { onConflict: 'project_id,agent_key' }
        )
        .then(() => {});
    }, 60_000);

    // Default to polling, but when Supabase is configured we prefer realtime updates
    // and fall back to a slower poll to self-heal if a subscription drops.
    const pollMs = hasSupabase() ? 30_000 : 5_000;
    const poll = setInterval(refresh, pollMs);

    let unsubscribe = () => {};
    let queued: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (queued) return;
      queued = setTimeout(() => {
        queued = null;
        refresh();
      }, 250);
    };

    if (hasSupabase()) {
      unsubscribe = subscribeToProjectRealtime(selectedProjectId || 'front-office', scheduleRefresh);
    }

    return () => {
      clearInterval(timer);
      clearInterval(presence);
      clearInterval(poll);
      if (queued) clearTimeout(queued);
      unsubscribe();
    };
  }, [selectedProjectId, activityLimit]);

  const parseActorAgentKey = (author: string | undefined | null): string | null => {
    if (!author) return null;

    // Known formats:
    // - agent:<name>:<kind>
    // - agent:<name>:<kind>:<sessionKind>
    // - agent:<agentKey> (legacy)
    const parts = String(author).split(':');
    if (parts[0] !== 'agent') return null;

    // Prefer the canonical 3-segment key: agent:<name>:<kind>
    if (parts.length >= 3) return parts.slice(0, 3).join(':');

    // Fall back to a 2-segment key if that's all we have.
    if (parts.length === 2) return parts.join(':');

    return null;
  };

  const parseRecipientAgentKey = (message: string | undefined | null): string | null => {
    const m = (message || '').trim();
    if (!m) return null;

    // v1 message routing convention: `To <agentKey>: <message>`
    // Example: `To agent:main:main: hello`
    const match = m.match(/^To\s+([^:]+(?::[^:]+){0,3})\s*:\s*/i);
    if (!match) return null;

    const target = (match[1] || '').trim();
    if (!target) return null;

    // If this is already an agent key, keep the canonical 3-segment key.
    const parts = target.split(':');
    if (parts[0] === 'agent' && parts.length >= 3) return parts.slice(0, 3).join(':');

    // Otherwise, try to resolve by agent name.
    const needle = target.toLowerCase();
    for (const a of agents) {
      if ((a.name || '').toLowerCase() == needle) return a.id;
    }

    return null;
  };

  const parseCronJobIdFromMessage = (message: string | undefined | null): string | null => {
    const m = (message || '').trim();
    if (!m) return null;

    // Server-side convention (Control API):
    // - "Requested cron run: <jobId>"
    const match = m.match(/Requested cron run:\s*(.+)$/i);
    if (match?.[1]) return match[1].trim();

    // Fallback: accept raw ids as messages.
    if (/^[a-zA-Z0-9._:-]{6,}$/.test(m)) return m;

    return null;
  };

  const agentByKey = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents) m.set(a.id, a);
    return m;
  }, [agents]);

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];

    const agentByKey = new Map<string, Agent>();
    for (const a of agents) agentByKey.set(a.id, a);

    // NOTE: Cron jobs represent *upcoming* work. Their `nextRunAt` timestamps are often in the future,
    // which can incorrectly float them above real recent activity when we sort the feed.
    // We still include a few as quick links, but anchor them to the epoch so they stay at the bottom.
    for (const j of cronJobs.slice(0, 10)) {
      const nextRunLabel =
        typeof j.nextRunAtMs === 'number' && Number.isFinite(j.nextRunAtMs)
          ? new Date(j.nextRunAtMs).toLocaleString('en-US', {
              hour12: true,
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })
          : j.nextRun || '—';

      items.push({
        id: `cron-${j.id}`,
        kind: 'cron',
        cronJobId: j.id,
        cronSchedule: j.schedule,
        type: 'cron',
        title: `cron: ${j.name}`,
        subtitle: `Next: ${nextRunLabel}`,
        createdAt: new Date(0).toISOString(),
      });
    }

    for (const c of activity) {
      const kind = (c.type || 'commit') as FeedItem['type'];
      const actorAgentKey = parseActorAgentKey(c.author);
      const recipientAgentKey = kind === 'session' ? parseRecipientAgentKey(c.message) : null;

      const actorAgent = actorAgentKey ? agentByKey.get(actorAgentKey) : undefined;
      const recipientAgent = recipientAgentKey ? agentByKey.get(recipientAgentKey) : undefined;

      const subtitle = (() => {
        if (kind === 'session' && recipientAgent) return `dashboard → ${recipientAgent.name}`;
        if (actorAgent) return actorAgent.name;
        return (c.authorLabel || c.author) || undefined;
      })();

      items.push({
        id: `${kind}-${c.hash}`,
        kind: 'activity',
        type: kind,
        title: c.message,
        subtitle,
        createdAt: c.date,
        cronJobId: kind === 'cron_run_requested' ? parseCronJobIdFromMessage(c.message) || undefined : undefined,
        actorAgentKey,
        recipientAgentKey: recipientAgentKey || undefined,
        rawAuthor: c.author || null,
        rawAuthorLabel: c.authorLabel || null,
        rawHash: c.hash || null,
        rawMessage: c.message || null,
      });
    }

    // Keep the underlying feed list reasonably sized, but do NOT slice to the
    // visible window here—filters/search should still work across the whole fetched
    // activity range (activityLimit).
    return items
      .filter(Boolean)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 200);
  }, [cronJobs, activity, agents]);

  const availableFeedTypes = useMemo(() => {
    const types = new Set<string>();
    for (const item of feed) types.add(item.type);

    const preferred = [
      'all',
      'build_update',
      'session',
      'task_created',
      'task_moved',
      'task_updated',
      'brain_doc_updated',
      'agent_updated',
      'agent_created',
      'project_created',
      'cron_run_requested',
      'cron',
    ];

    const present = Array.from(types.values());
    const ordered = preferred.filter((t) => t === 'all' || types.has(t));
    const extras = present.filter((t) => !preferred.includes(t)).sort();

    return [...ordered, ...extras];
  }, [feed]);

  const availableFeedAgents = useMemo(() => {
    const options = agents
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((a) => ({ key: a.id, label: a.name || a.id, avatar: a.avatar }));

    return [{ key: 'all', label: 'All agents', avatar: '👥' }, ...options];
  }, [agents]);

  const filteredFeed = useMemo(() => {
    const byType = feedTypeFilter === 'all' ? feed : feed.filter((item) => item.type === feedTypeFilter);

    const byAgent = (() => {
      if (feedAgentFilter === 'all') return byType;

      const agentKey = feedAgentFilter;
      const agent = agentByKey.get(agentKey);

      return byType.filter((item) => {
        if (item.kind === 'activity') {
          return item.actorAgentKey === agentKey || item.recipientAgentKey === agentKey;
        }

        if (item.kind === 'cron') {
          const job = cronJobs.find((j) => j.id === item.cronJobId);
          if (!job) return false;
          const hay = `${job.name || ''}\n${job.instructions || ''}`.toLowerCase();
          const keyNeedle = String(agentKey).toLowerCase();
          const nameNeedle = (agent?.name || '').toLowerCase();
          return hay.includes(keyNeedle) || (nameNeedle ? hay.includes(nameNeedle) : false);
        }

        return true;
      });
    })();

    const q = (feedSearch || '').trim().toLowerCase();
    const searched = !q
      ? byAgent
      : byAgent.filter((item) => {
          const hay = `${item.title || ''}\n${item.subtitle || ''}\n${item.rawMessage || ''}`.toLowerCase();
          return hay.includes(q);
        });

    // Visible window: keep the UI compact while allowing filters/search to work
    // against the full fetched feed list.
    return searched.slice(0, 25);
  }, [feed, feedTypeFilter, feedAgentFilter, feedSearch, cronJobs, agentByKey]);

  const iconForFeedType = (type: string) => {
    switch (type) {
      case 'session':
        return '💬';
      case 'cron':
        return '⏰';
      case 'cron_run_requested':
        return '▶️';
      case 'task_created':
        return '🆕';
      case 'task_moved':
      case 'task_updated':
        return '🗂️';
      case 'brain_doc_updated':
        return '🧠';
      case 'build_update':
        return '🔧';
      case 'agent_created':
        return '🤖';
      case 'project_created':
        return '📁';
      default:
        return '✅';
    }
  };

  const getStatusBadge = (status: Agent['status']) => {
    const styles = {
      online: 'badge-online',
      idle: 'badge-idle',
      running: 'badge-running',
      offline: 'badge-offline',
    };
    return styles[status];
  };

  const formatTime = (date: Date) => {
    // UX: prefer normal 12h time (matches typical dashboards and iOS-style UI).
    return date.toLocaleTimeString('en-US', {
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    }).toUpperCase();
  };


  const withAlpha = (color: string, alphaHex: string) => {
    const c = (color || '').trim();
    if (/^#([0-9a-fA-F]{6})$/.test(c)) return `${c}${alphaHex}`;
    if (/^#([0-9a-fA-F]{3})$/.test(c)) {
      const r = c[1];
      const g = c[2];
      const b = c[3];
      return `#${r}${r}${g}${g}${b}${b}${alphaHex}`;
    }
    // Fall back to the raw color; browsers will ignore invalid values.
    return c;
  };

  const activeAgentsCount = agents.filter(a => a.status === 'online' || a.status === 'running').length;
  const totalTasks = tasks.length;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Mobile sidebar (drawer) */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="p-0 w-80">
          <div className="border-b border-border p-2 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">Agents</h2>
            <Button variant="ghost" size="sm" onClick={() => setMobileSidebarOpen(false)}>Close</Button>
          </div>
          <ScrollArea className="h-[calc(100vh-3rem)]">
            <div className="p-2 space-y-1">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => {
                    setSelectedAgent(agent);
                    setMobileSidebarOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer p-3",
                    selectedAgent?.id === agent.id && "bg-muted"
                  )}
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center text-xl shrink-0 relative overflow-hidden',
                      agent.status === 'running'
                        ? 'ring-2 ring-primary/25 shadow-[0_0_0_6px_hsl(var(--primary)/0.10)] motion-safe:animate-pulse'
                        : agent.status === 'online'
                          ? 'ring-1 ring-primary/15'
                          : ''
                    )}
                    style={
                      agent.color
                        ? {
                            backgroundColor: withAlpha(agent.color, '22'),
                            border: `1px solid ${withAlpha(agent.color, '55')}`,
                          }
                        : undefined
                    }
                  >
                    {agent.color ? (
                      <span
                        className="absolute inset-x-0 top-0 h-1"
                        style={{ backgroundColor: agent.color }}
                        aria-hidden
                      />
                    ) : null}
                    <span>{agent.avatar}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{agent.name}</span>
                      <span className={cn("badge-status text-[10px]", getStatusBadge(agent.status))}>
                        {agent.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
                    {agent.lastActive ? (
                      <p className="text-[10px] text-muted-foreground/80 truncate mt-0.5">
                        Last active {agent.lastActive}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Desktop collapsible Agents Sidebar */}
      <aside className={cn(
        "border-r border-border bg-sidebar flex flex-col transition-all duration-300 hidden md:flex",
        agentPanelCollapsed ? "w-12" : "w-56"
      )}>
        <div className="p-2 border-b border-border flex items-center justify-between">
          {!agentPanelCollapsed && (
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 px-2">
              <span className="w-2 h-2 rounded-full bg-primary" />
              AGENTS
            </h2>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setAgentPanelCollapsed(!agentPanelCollapsed)}
            title={agentPanelCollapsed ? "Expand agents" : "Collapse agents"}
          >
            {agentPanelCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className={cn("space-y-1", agentPanelCollapsed ? "p-1" : "p-2")}>
            {agents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className={cn(
                  "flex items-center gap-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer",
                  agentPanelCollapsed ? "p-2 justify-center" : "p-3",
                  selectedAgent?.id === agent.id && "bg-muted"
                )}
                title={
                  agentPanelCollapsed
                    ? `${agent.name} - ${agent.status}${agent.lastActive ? ` (${agent.lastActive})` : ''}`
                    : undefined
                }
              >
                <div
                  className={cn(
                    'rounded-lg flex items-center justify-center shrink-0 relative overflow-hidden',
                    agentPanelCollapsed ? 'w-8 h-8 text-lg' : 'w-9 h-9 text-xl',
                    agent.status === 'running'
                      ? 'ring-2 ring-primary/25 shadow-[0_0_0_6px_hsl(var(--primary)/0.10)] motion-safe:animate-pulse'
                      : agent.status === 'online'
                        ? 'ring-1 ring-primary/15'
                        : ''
                  )}
                  style={
                    agent.color
                      ? {
                          backgroundColor: withAlpha(agent.color, '22'),
                          border: `1px solid ${withAlpha(agent.color, '55')}`,
                        }
                      : undefined
                  }
                >
                  {agent.color ? (
                    <span
                      className="absolute inset-x-0 top-0 h-1"
                      style={{ backgroundColor: agent.color }}
                      aria-hidden
                    />
                  ) : null}
                  <span>{agent.avatar}</span>
                </div>
                {!agentPanelCollapsed && (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{agent.name}</span>
                        {agent.status === 'running' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                            LEAD
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
                      {agent.lastActive ? (
                        <p className="text-[10px] text-muted-foreground/80 truncate mt-0.5">
                          {agent.lastActive}
                        </p>
                      ) : null}
                    </div>
                    <span className={cn("badge-status text-[10px]", getStatusBadge(agent.status))}>
                      {agent.status === 'running' ? 'WORKING' : agent.status.toUpperCase()}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Main Content - Scrollable */}
      <div className="flex-1 flex flex-col overflow-y-auto dashboard-texture">
        {loadError && (
          <div className="m-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Data load failed. This usually means Supabase env vars or RLS policies aren’t applied in this environment.
            <div className="mt-2 text-xs break-all opacity-90">{loadError}</div>
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Dashboard Header */}
        <div className="h-14 border-b border-border bg-card/30 flex items-center justify-between px-4 md:px-6 shrink-0 sticky top-0 z-10">
          <div className="flex items-center gap-3 md:gap-8 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileSidebarOpen(true)}
              title="Agents"
            >
              <PanelLeft className="w-4 h-4" />
            </Button>

            <h1 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              MISSION QUEUE
            </h1>
          </div>
          
          {/* Stats */}
          <div className="flex items-center gap-8">
            <div className="text-center">
              <div className="text-3xl font-bold">{activeAgentsCount}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Agents Active</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{totalTasks}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tasks</div>
            </div>
          </div>
          
          {/* Time */}
          <div className="text-right">
            <div className="text-2xl font-mono font-bold">{formatTime(currentTime)}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{formatDate(currentTime)}</div>
          </div>
        </div>

        {/* Task board (real) */}
        <div className="min-h-[calc(100vh-10rem)] p-4 overflow-x-auto scrollbar-always">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Task Queue</h2>
            <Button
              size="sm"
              className="gap-2"
              onClick={async () => {
                const title = prompt('New task title');
                if (!title) return;
                await createTask({ title });
                await refresh();
              }}
            >
              <Plus className="w-4 h-4" />
              New Task
            </Button>
          </div>

          {(() => {
            const columns: { id: TaskStatus; title: string }[] = [
              { id: 'inbox', title: 'INBOX' },
              { id: 'assigned', title: 'ASSIGNED' },
              { id: 'in_progress', title: 'IN PROGRESS' },
              { id: 'review', title: 'REVIEW' },
              { id: 'done', title: 'DONE' },
              { id: 'blocked', title: 'BLOCKED' },
            ];

            const byStatus = (status: TaskStatus) => tasks.filter((t) => t.status === status);

            return (
              <div className="flex gap-4">
                {columns.map((col) => (
                  <div key={col.id} className="w-72 flex flex-col bg-muted/20 rounded-lg overflow-hidden flex-shrink-0">
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{col.title}</h3>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {byStatus(col.id).length}
                      </span>
                    </div>

                    <div className="flex-1 p-2 overflow-y-auto max-h-[60vh]">
                      <div className="space-y-2">
                        {byStatus(col.id).map((t) => (
                          <div key={t.id} className="p-3 rounded-lg border border-border bg-card">
                            <div className="font-medium text-sm mb-2">{t.title}</div>
                            {t.description ? (
                              <div className="text-xs text-muted-foreground mb-2 line-clamp-2">{t.description}</div>
                            ) : null}

                            <div className="flex flex-wrap gap-1">
                              {(['inbox','assigned','in_progress','review','done','blocked'] as TaskStatus[])
                                .filter((s) => s !== t.status)
                                .slice(0, 3)
                                .map((s) => (
                                  <button
                                    key={s}
                                    className="text-[10px] px-2 py-1 rounded bg-muted text-muted-foreground hover:text-foreground"
                                    onClick={async () => {
                                      await updateTask(t.id, { status: s });
                                      await refresh();
                                    }}
                                  >
                                    Move to {s}
                                  </button>
                                ))}
                            </div>
                          </div>
                        ))}

                        {byStatus(col.id).length === 0 ? (
                          <div className="p-4 text-xs text-muted-foreground">Empty</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Live Feed - Bottom Section, Vertical Stack */}
        <div className="border-t border-border bg-sidebar/50 flex flex-col shrink-0">
          <div className="px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              LIVE FEED
            </h2>

            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2">
                {agents.map((agent) => (
                  <span
                    key={agent.id}
                    className="text-xs px-2 py-1 rounded bg-muted/50 text-muted-foreground flex items-center gap-1"
                  >
                    <span>{agent.avatar}</span>
                    <span className="opacity-60">{agent.skillCount ?? ''}</span>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Select value={feedTypeFilter} onValueChange={setFeedTypeFilter}>
                  <SelectTrigger className="h-7 w-[150px] text-xs" aria-label="Filter feed type">
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFeedTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t === 'all' ? 'All types' : t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={feedAgentFilter} onValueChange={setFeedAgentFilter}>
                  <SelectTrigger className="h-7 w-[170px] text-xs" aria-label="Filter feed agent">
                    <SelectValue placeholder="All agents" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFeedAgents.map((a) => (
                      <SelectItem key={a.key} value={a.key}>
                        {a.key === 'all' ? a.label : `${a.avatar || ''} ${a.label}`.trim()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={feedSearch}
                  onChange={(e) => setFeedSearch(e.target.value)}
                  placeholder="Search…"
                  className="h-7 w-[200px] text-xs"
                />

                <span className="text-[11px] text-muted-foreground">
                  {lastRefreshedAt
                    ? `Updated ${Math.max(0, Math.floor((currentTime.getTime() - lastRefreshedAt.getTime()) / 1000))}s ago`
                    : 'Not yet updated'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={refresh}
                  disabled={isRefreshing}
                  title="Refresh"
                >
                  <RefreshCw className={cn('w-4 h-4', isRefreshing ? 'animate-spin' : '')} />
                </Button>
              </div>
            </div>
          </div>

          {/* Feed Items - Vertical Stack */}
          <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto scrollbar-always">
            {filteredFeed.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {feed.length === 0 ? 'No activity yet.' : 'No matching activity.'}
              </div>
            ) : (
              filteredFeed.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    // If this is a cron entry, bounce to the Manage → Cron page.
                    if (item.type === 'cron' || item.type === 'cron_run_requested') {
                      if (item.cronJobId) setFocusCronJobId(item.cronJobId);
                      setViewMode('manage');
                      setActiveMainTab('cron');
                      return;
                    }

                    // Session events often target a recipient agent (e.g. "dashboard → agent").
                    // Prefer opening the recipient when available so the click feels intuitive.
                    const primaryKey =
                      item.type === 'session' && item.recipientAgentKey
                        ? item.recipientAgentKey
                        : item.actorAgentKey || item.recipientAgentKey;

                    if (!primaryKey) return;
                    const a = agentByKey.get(primaryKey);
                    if (!a) return;
                    setSelectedAgent(a);
                  }}
                  className={cn(
                    "relative p-4 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors",
                    (() => {
                      const primaryKey =
                        item.type === 'session' && item.recipientAgentKey
                          ? item.recipientAgentKey
                          : item.actorAgentKey || item.recipientAgentKey;
                      return primaryKey && agentByKey.has(primaryKey) ? 'cursor-pointer' : null;
                    })()
                  )}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7 opacity-70 hover:opacity-100"
                    title="Details"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFeedDetails(item);
                    }}
                  >
                    <Info className="w-4 h-4" />
                  </Button>
                  <div className="flex items-start gap-3">
                    {(() => {
                      const key =
                        item.type === 'session' && item.recipientAgentKey
                          ? item.recipientAgentKey
                          : item.actorAgentKey || item.recipientAgentKey;

                      const a = key ? agentByKey.get(key) : null;
                      const label = a?.avatar || null;
                      const color = a?.color || null;

                      return (
                        <span
                          className={cn(
                            'w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-xl border border-border',
                            label ? 'bg-muted/40' : 'bg-transparent'
                          )}
                          style={
                            label && color
                              ? {
                                  backgroundColor: `${color}22`,
                                  borderColor: `${color}55`,
                                }
                              : undefined
                          }
                          aria-hidden
                        >
                          {label ? label : iconForFeedType(item.type)}
                        </span>
                      );
                    })()}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          {item.subtitle}
                          <span className="mx-1">·</span>
                          <span className="font-mono">{item.type}</span>
                        </p>
                      )}
                      {!item.subtitle ? (
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          <span className="font-mono">{item.type}</span>
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {(() => {
                          const d = new Date(item.createdAt);
                          const absolute = Number.isNaN(d.getTime())
                            ? item.createdAt
                            : `${formatDate(d)} ${formatTime(d)}`;

                          return (
                            <span title={absolute} className="cursor-help">
                              {formatRelativeTime(item.createdAt, currentTime)}
                            </span>
                          );
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}

            {activity.length === activityLimit ? (
              <div className="pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={async () => {
                    const next = activityLimit + 50;
                    setActivityLimit(next);
                    try {
                      const more = await getActivity(next);
                      setActivity(more);
                    } catch {
                      // ignore; the main poll/realtime loop will retry
                    }
                  }}
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog
        open={Boolean(selectedFeedDetails)}
        onOpenChange={(open) => {
          if (!open) setSelectedFeedDetails(null);
        }}
      >
        <DialogContent className="max-w-[min(700px,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>Feed item details</DialogTitle>
          </DialogHeader>

          {selectedFeedDetails ? (
            <div className="space-y-3">
              <div className="text-sm">
                <div className="font-medium break-words">{selectedFeedDetails.title}</div>
                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-1">
                  <span className="font-mono">{selectedFeedDetails.type}</span>
                  <span>·</span>
                  <span
                    title={(() => {
                      const d = new Date(selectedFeedDetails.createdAt);
                      return Number.isNaN(d.getTime()) ? selectedFeedDetails.createdAt : d.toISOString();
                    })()}
                    className="cursor-help"
                  >
                    {formatRelativeTime(selectedFeedDetails.createdAt, currentTime)}
                  </span>
                </div>
              </div>

              {selectedFeedDetails.subtitle ? (
                <div className="text-sm text-muted-foreground break-words">
                  {selectedFeedDetails.subtitle}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {(() => {
                  if (selectedFeedDetails.type === 'cron' || selectedFeedDetails.type === 'cron_run_requested') {
                    return (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelectedFeedDetails(null);
                          if (selectedFeedDetails.cronJobId) setFocusCronJobId(selectedFeedDetails.cronJobId);
                          setViewMode('manage');
                          setActiveMainTab('cron');
                        }}
                      >
                        Open Cron manager
                      </Button>
                    );
                  }

                  const actorKey = selectedFeedDetails.actorAgentKey || null;
                  const recipientKey = selectedFeedDetails.recipientAgentKey || null;

                  const primaryKey =
                    selectedFeedDetails.type === 'session' && recipientKey
                      ? recipientKey
                      : actorKey || recipientKey;

                  const buttons: Array<{ key: string; label: string }> = [];

                  if (selectedFeedDetails.type === 'session') {
                    if (recipientKey) buttons.push({ key: recipientKey, label: 'Open recipient' });
                    if (actorKey && actorKey !== recipientKey) buttons.push({ key: actorKey, label: 'Open sender' });
                  } else {
                    if (primaryKey) buttons.push({ key: primaryKey, label: 'Open agent' });
                  }

                  const deduped = Array.from(
                    new Map(buttons.map((b) => [b.key, b] as const)).values()
                  );

                  if (deduped.length === 0) return null;

                  return (
                    <>
                      {deduped.map((b) => {
                        const a = agentByKey.get(b.key);
                        if (!a) return null;

                        return (
                          <Button
                            key={b.key}
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSelectedFeedDetails(null);
                              setSelectedAgent(a);
                            }}
                          >
                            {b.label}
                          </Button>
                        );
                      })}
                    </>
                  );
                })()}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const payload = {
                      ...selectedFeedDetails,
                      absoluteTime: (() => {
                        const d = new Date(selectedFeedDetails.createdAt);
                        return Number.isNaN(d.getTime()) ? selectedFeedDetails.createdAt : d.toISOString();
                      })(),
                    };

                    try {
                      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                    } catch {
                      // no-op
                    }
                  }}
                >
                  Copy JSON
                </Button>
              </div>

              <pre className="text-xs bg-muted/40 border border-border rounded-md p-3 overflow-x-auto max-h-[40vh]">
{JSON.stringify(
  {
    kind: selectedFeedDetails.kind,
    type: selectedFeedDetails.type,
    title: selectedFeedDetails.title,
    subtitle: selectedFeedDetails.subtitle,
    createdAt: selectedFeedDetails.createdAt,
    cronJobId: selectedFeedDetails.cronJobId,
    cronSchedule: selectedFeedDetails.cronSchedule,
    actorAgentKey: selectedFeedDetails.actorAgentKey,
    recipientAgentKey: selectedFeedDetails.recipientAgentKey,
    rawAuthor: selectedFeedDetails.rawAuthor,
    rawAuthorLabel: selectedFeedDetails.rawAuthorLabel,
    rawHash: selectedFeedDetails.rawHash,
    rawMessage: selectedFeedDetails.rawMessage,
  },
  null,
  2
)}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Agent Profile Panel (desktop sidebar) */}
      {selectedAgent && (
        <div className="hidden md:flex">
          <AgentProfilePanel
            agent={selectedAgent}
            tasks={tasks}
            activity={activity}
            cronJobs={cronJobs}
            onAgentPatched={patchAgentInRoster}
            onClose={() => setSelectedAgent(null)}
          />
        </div>
      )}

      {/* Agent Profile Panel (mobile sheet) */}
      {selectedAgent && (
        <div className="md:hidden">
          <Sheet
            open={Boolean(selectedAgent)}
            onOpenChange={(open) => {
              if (!open) setSelectedAgent(null);
            }}
          >
            <SheetContent side="right" className="p-0 w-full sm:w-[420px]">
              <AgentProfilePanel
                variant="sheet"
                agent={selectedAgent}
                tasks={tasks}
                activity={activity}
                cronJobs={cronJobs}
                onAgentPatched={patchAgentInRoster}
                onClose={() => setSelectedAgent(null)}
              />
            </SheetContent>
          </Sheet>
        </div>
      )}
    </div>
  );
}
