import { useState } from 'react';
import { X, AlertTriangle, Clock, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/datetime';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { createActivity } from '@/lib/api';
import type { ActivityItem, Agent, CronJob, Task } from '@/lib/api';
import { useClawdOffice } from '@/lib/store';

interface AgentProfilePanelProps {
  agent: Agent;
  onClose: () => void;
  variant?: 'sidebar' | 'sheet';

  // Optional wiring from the Dashboard so the panel can show real data.
  activity?: ActivityItem[];
  tasks?: Task[];
  cronJobs?: CronJob[];
}

export function AgentProfilePanel({
  agent,
  onClose,
  variant = 'sidebar',
  activity = [],
  tasks = [],
  cronJobs = [],
}: AgentProfilePanelProps) {
  const { setViewMode, setActiveMainTab, setFocusCronJobId } = useClawdOffice();

  const [messageDraft, setMessageDraft] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [expandedScheduleIds, setExpandedScheduleIds] = useState<Record<string, boolean>>({});

  const sendMessage = async () => {
    const msg = messageDraft.trim();
    if (!msg || sendingMessage) return;
    setSendingMessage(true);
    try {
      await createActivity({
        type: 'session',
        // v1 routing: encode the recipient agent key in the message so we can render a per-agent inbox
        // before we have a dedicated messages table.
        message: `To ${agent.id}: ${msg}`,
        actorAgentKey: 'dashboard',
      });
      setMessageDraft('');
    } finally {
      setSendingMessage(false);
    }
  };

  const statusReason =
    (agent.statusNote && agent.statusNote.trim().length > 0 ? agent.statusNote : null) ||
    'No status note yet.';

  const formatSince = (iso: string | null | undefined) => {
    if (!iso) return null;
    const ms = Date.now() - Date.parse(iso);
    if (Number.isNaN(ms) || ms < 0) return null;
    if (ms < 60_000) return 'Since just now';
    if (ms < 60 * 60_000) return `Since about ${Math.round(ms / 60_000)} min ago`;
    if (ms < 24 * 60 * 60_000) return `Since about ${Math.round(ms / (60 * 60_000))} hour(s) ago`;
    return `Since about ${Math.round(ms / (24 * 60 * 60_000))} day(s) ago`;
  };

  const newestIso = (a: string | null | undefined, b: string | null | undefined) => {
    const at = a ? Date.parse(a) : Number.NaN;
    const bt = b ? Date.parse(b) : Number.NaN;
    if (Number.isNaN(at) && Number.isNaN(bt)) return null;
    if (Number.isNaN(bt)) return a || null;
    if (Number.isNaN(at)) return b || null;
    return at >= bt ? (a || null) : (b || null);
  };

  const lastSeenAt = newestIso(agent.lastActivityAt, agent.lastHeartbeatAt);

  const formatAt = (iso: string) => formatDateTime(iso);

  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'online':
      case 'running':
        return 'bg-green-500';
      case 'idle':
        return 'bg-amber-500';
      case 'offline':
        return 'bg-muted-foreground';
    }
  };

  const getStatusLabel = (status: Agent['status']) => {
    switch (status) {
      case 'running':
        return 'WORKING';
      case 'online':
        return 'ONLINE';
      case 'idle':
        return 'IDLE';
      case 'offline':
        return 'OFFLINE';
    }
  };

  const currentTask = agent.currentTaskId
    ? tasks.find((t) => t.id === agent.currentTaskId) || null
    : null;

  const currentTaskLabel = agent.currentTaskId
    ? currentTask
      ? `${currentTask.title} (${agent.currentTaskId})`
      : agent.currentTaskId
    : null;

  const presenceRows: Array<{ label: string; value: string | null | undefined }> = [
    { label: 'State', value: agent.statusState || null },
    { label: 'Current task', value: currentTaskLabel },
    { label: 'Last heartbeat', value: agent.lastHeartbeatAt ? formatAt(agent.lastHeartbeatAt) : null },
    { label: 'Last activity', value: agent.lastActivityAt ? formatAt(agent.lastActivityAt) : null },
  ];

  const attentionTasks = tasks
    .filter((t) => t.assigneeAgentKey && t.assigneeAgentKey === agent.id)
    .filter((t) => t.status !== 'done')
    .slice(0, 8);

  const normalizeAgentKey = (raw: string) => {
    const parts = raw.split(':');
    if (parts[0] === 'agent' && parts.length >= 3) {
      // agent_key convention in this app is `agent:<name>:<kind>`.
      // Some emitters may append an extra segment (e.g. session kind):
      //   agent:main:main:cron  -> agent:main:main
      return parts.slice(0, 3).join(':');
    }
    return raw;
  };

  const matchesAgent = (a: ActivityItem, agentId: string) => {
    if (!a) return false;

    const raw = normalizeAgentKey((a.author || '').trim());
    const label = (a.authorLabel || '').trim();

    if (raw && raw === agentId) return true;

    // Support older/looser author formats by matching on the agent "name" segment.
    // Examples:
    // - agentId: agent:main:main
    // - raw:     main
    // - label:   main
    const parts = agentId.split(':');
    const agentName = parts[0] === 'agent' && parts.length >= 2 ? parts[1] : null;
    if (agentName) {
      if (label === agentName) return true;
      if (raw === agentName) return true;
    }

    // Last resort: if something upstream is still emitting full keys into authorLabel.
    const normalizedLabel = normalizeAgentKey(label);
    if (normalizedLabel && normalizedLabel === agentId) return true;

    return false;
  };

  const timeline = activity.filter((a) => matchesAgent(a, agent.id)).slice(0, 12);

  const messages = activity
    .filter((a) => a.type === 'session')
    .filter((a) => {
      const m = (a.message || '').trim();
      // Support both legacy (name-based) and new (agent key-based) formats.
      return (
        m.startsWith(`To ${agent.id}:`) ||
        m.startsWith(`To ${agent.name}:`) ||
        m.includes(`To ${agent.id}:`) ||
        m.includes(`To ${agent.name}:`)
      );
    })
    .slice(0, 10);

  const agentMatchNeedle = (s: string) => s.toLowerCase();

  const cronMatchesAgent = (j: CronJob) => {
    const name = agentMatchNeedle(j.name || '');
    const instr = agentMatchNeedle(j.instructions || '');
    const schedule = agentMatchNeedle(j.schedule || '');

    const idNeedle = agentMatchNeedle(agent.id);
    const nameNeedle = agentMatchNeedle(agent.name);

    // Heuristic v1: match on agent key OR agent display name appearing in the job metadata.
    // (We don't yet have a structured "agentKey" field on cron jobs.)
    return (
      (idNeedle && (name.includes(idNeedle) || instr.includes(idNeedle) || schedule.includes(idNeedle))) ||
      (nameNeedle && (name.includes(nameNeedle) || instr.includes(nameNeedle)))
    );
  };

  const scheduledJobs = cronJobs.filter(cronMatchesAgent);

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

  const iconForActivityType = (type: string | undefined) => {
    switch (type) {
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
      case 'cron':
        return '⏰';
      case 'cron_run_requested':
        return '▶️';
      case 'session':
        return '💬';
      default:
        return '✅';
    }
  };

  return (
    <div
      className={cn(
        'bg-card flex flex-col h-full',
        variant === 'sidebar' ? 'w-80 lg:w-96 border-l border-border' : 'w-full'
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary" />
          AGENT PROFILE
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Agent Identity */}
          <div className="flex items-start gap-4">
            <div
              className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center text-3xl shrink-0 relative overflow-hidden"
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
              {agent.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold truncate">{agent.name}</h3>
                {agent.color ? (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: agent.color }}
                    title={agent.color}
                    aria-label="Agent theme color"
                  />
                ) : null}
              </div>
              <Badge variant="outline" className="mt-1 text-xs font-medium">
                {agent.role}
              </Badge>
            </div>
          </div>

          {/* Status Badge */}
          <div>
            <Badge
              variant="outline"
              className={cn(
                'gap-2 px-3 py-1.5 text-sm font-medium border-0',
                agent.status === 'running' || agent.status === 'online'
                  ? 'bg-green-500/10 text-green-500'
                  : agent.status === 'idle'
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full', getStatusColor(agent.status))} />
              {getStatusLabel(agent.status)}
            </Badge>
          </div>

          {/* Status Reason */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">STATUS REASON:</h4>
            <p className="text-sm text-foreground leading-relaxed">{statusReason}</p>
            {formatSince(lastSeenAt) ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatSince(lastSeenAt)}
              </p>
            ) : null}
          </div>

          {/* Presence */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">PRESENCE</h4>
            <div className="space-y-2">
              {presenceRows.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <span className="text-xs font-mono text-foreground text-right break-all">
                    {row.value || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Skills (light wiring) */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SKILLS</h4>
            <p className="text-sm text-muted-foreground">
              Skill count: <span className="font-mono">{agent.skillCount ?? 0}</span>
            </p>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="attention" className="w-full">
            <TabsList className="w-full bg-muted/50">
              <TabsTrigger value="attention" className="flex-1 gap-1.5 text-xs">
                <AlertTriangle className="w-3 h-3" />
                Attention
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {attentionTasks.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex-1 gap-1.5 text-xs">
                <Clock className="w-3 h-3" />
                Timeline
              </TabsTrigger>
              <TabsTrigger value="schedule" className="flex-1 gap-1.5 text-xs">
                <Clock className="w-3 h-3" />
                Schedule
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {scheduledJobs.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="messages" className="flex-1 gap-1.5 text-xs">
                <MessageSquare className="w-3 h-3" />
                Messages
              </TabsTrigger>
            </TabsList>

            <TabsContent value="attention" className="mt-4">
              {attentionTasks.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">No assigned tasks needing attention.</div>
              ) : (
                <div className="space-y-2">
                  {attentionTasks.map((t) => (
                    <div key={t.id} className="p-3 rounded-lg border border-border bg-card">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium truncate">{t.title}</div>
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {t.status}
                        </Badge>
                      </div>
                      {t.description ? (
                        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              {timeline.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">No recent activity for this agent.</div>
              ) : (
                <div className="space-y-2">
                  {timeline.map((a) => (
                    <div key={a.hash} className="p-3 rounded-lg border border-border bg-card">
                      <div className="flex items-start gap-2">
                        <div className="text-lg leading-none">{iconForActivityType(a.type)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{a.message}</div>
                          <div className="text-xs text-muted-foreground mt-1">{formatAt(a.date)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="schedule" className="mt-4">
              {scheduledJobs.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">
                  No scheduled jobs matched this agent yet.
                  <div className="text-xs mt-2">
                    (v1 heuristic: we match cron jobs by looking for <span className="font-mono">{agent.id}</span> or
                    <span className="font-mono"> {agent.name}</span> in the job name/instructions.)
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {scheduledJobs.map((j) => {
                    const expanded = Boolean(expandedScheduleIds[j.id]);
                    const nextRunLabel =
                      typeof j.nextRunAtMs === 'number' && Number.isFinite(j.nextRunAtMs)
                        ? formatDateTime(new Date(j.nextRunAtMs))
                        : j.nextRun || '—';

                    return (
                      <div key={j.id} className="p-3 rounded-lg border border-border bg-card">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{j.name}</div>
                            <div className="text-[11px] text-muted-foreground mt-1 font-mono break-all">
                              {j.schedule}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-1">Next: {nextRunLabel}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge variant={j.enabled ? 'secondary' : 'outline'} className="text-[10px]">
                              {j.enabled ? 'enabled' : 'disabled'}
                            </Badge>

                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() =>
                                  setExpandedScheduleIds((s) => ({
                                    ...s,
                                    [j.id]: !Boolean(s[j.id]),
                                  }))
                                }
                              >
                                {expanded ? 'Hide' : 'Show'}
                              </Button>

                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => {
                                  setFocusCronJobId(j.id);
                                  setViewMode('manage');
                                  setActiveMainTab('cron');
                                  onClose();
                                }}
                              >
                                Open
                              </Button>
                            </div>
                          </div>
                        </div>

                        {expanded ? (
                          <div className="mt-3 text-xs">
                            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                              Instructions
                            </div>
                            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px] bg-muted/40 border border-border rounded-md p-2">
                              {j.instructions || '—'}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="messages" className="mt-4">
              {messages.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">
                  No messages yet.
                  <div className="text-xs mt-2">
                    (v1: sending a message logs a <span className="font-mono">session</span> activity row.)
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {messages.map((a) => (
                    <div key={a.hash} className="p-3 rounded-lg border border-border bg-card">
                      <div className="text-sm whitespace-pre-wrap break-words">{a.message}</div>
                      <div className="text-xs text-muted-foreground mt-1">{formatAt(a.date)}</div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>

      {/* Send Message */}
      <div className="p-4 border-t border-border shrink-0 space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          SEND MESSAGE TO {agent.name.toUpperCase()}
        </h4>

        <div className="flex items-center gap-2">
          <Input
            value={messageDraft}
            onChange={(e) => setMessageDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void sendMessage();
              }
            }}
            placeholder={`Message ${agent.name}... (@ to mention)`}
            className="bg-muted/50"
            disabled={sendingMessage}
          />
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            onClick={() => void sendMessage()}
            disabled={sendingMessage || messageDraft.trim().length === 0}
          >
            Send
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          (v1: logs a “session” activity entry — real messaging wiring coming next.)
        </p>
      </div>
    </div>
  );
}
