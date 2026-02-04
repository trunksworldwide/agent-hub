import { useState } from 'react';
import { X, AlertTriangle, Clock, MessageSquare, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime, formatRelativeTime } from '@/lib/datetime';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createActivity, runCronJob, updateAgentRoster, updateAgentStatus } from '@/lib/api';
import type { ActivityItem, Agent, CronJob, Task } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useClawdOffice } from '@/lib/store';
import type { AgentTab } from '@/lib/store';

interface AgentProfilePanelProps {
  agent: Agent;
  onClose: () => void;
  variant?: 'sidebar' | 'sheet';

  // Optional wiring from the Dashboard so the panel can show real data.
  activity?: ActivityItem[];
  tasks?: Task[];
  cronJobs?: CronJob[];

  // Optional: if the parent holds the roster in state, let it patch the agent
  // immediately after saving appearance (emoji/color) so the UI updates without a full refresh.
  onAgentPatched?: (
    agentKey: string,
    patch: Partial<Pick<Agent, 'avatar' | 'color' | 'status' | 'statusState' | 'statusNote' | 'currentTaskId'>>
  ) => void;
}

export function AgentProfilePanel({
  agent,
  onClose,
  variant = 'sidebar',
  activity = [],
  tasks = [],
  cronJobs = [],
  onAgentPatched,
}: AgentProfilePanelProps) {
  const { setViewMode, setActiveMainTab, setFocusCronJobId, setSelectedAgentId, setActiveAgentTab } = useClawdOffice();
  const { toast } = useToast();

  const [messageDraft, setMessageDraft] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [expandedScheduleIds, setExpandedScheduleIds] = useState<Record<string, boolean>>({});
  const [runningScheduleIds, setRunningScheduleIds] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState(false);

  // Activity/message rendering: default to a small window, with an optional “show more”.
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [messagesExpanded, setMessagesExpanded] = useState(false);

  // Appearance editing (Supabase roster)
  const [emojiDraft, setEmojiDraft] = useState<string>((agent.avatar || '').trim());
  const [colorDraft, setColorDraft] = useState<string>((agent.color || '').trim());
  const [savingAppearance, setSavingAppearance] = useState(false);

  // Presence editing (Supabase agent_status)
  const [statusStateDraft, setStatusStateDraft] = useState<Agent['statusState'] | ''>((agent.statusState || '').trim());
  const [statusNoteDraft, setStatusNoteDraft] = useState<string>((agent.statusNote || '').trim());
  const [savingStatus, setSavingStatus] = useState(false);

  const openAgentEditor = (tab: AgentTab) => {
    setSelectedAgentId(agent.id);
    setViewMode('manage');
    setActiveMainTab('agents');
    setActiveAgentTab(tab);
    onClose();
  };

  const copyAgentKey = async () => {
    try {
      await navigator.clipboard.writeText(agent.id);
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 1500);
    } catch {
      // Ignore; clipboard may be unavailable.
    }
  };

  const runJobNow = async (job: CronJob) => {
    if (!job?.id) return;
    if (runningScheduleIds[job.id]) return;

    setRunningScheduleIds((m) => ({ ...m, [job.id]: true }));
    try {
      await runCronJob(job.id);
      toast({
        title: 'Job started',
        description: `${job.name || job.id} is now running.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Failed to run job',
        description: msg || 'unknown_error',
        variant: 'destructive',
      });
    } finally {
      setRunningScheduleIds((m) => ({ ...m, [job.id]: false }));
    }
  };

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
      });

      setMessageDraft('');
      toast({
        title: 'Message logged',
        description: `Sent to ${agent.name}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        title: 'Failed to send message',
        description: msg || 'unknown_error',
        variant: 'destructive',
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const saveAppearance = async () => {
    if (savingAppearance) return;

    const nextEmoji = (emojiDraft || '').trim() || null;
    const nextColor = (colorDraft || '').trim() || null;

    const unchanged = (agent.avatar || '').trim() === (nextEmoji || '') && (agent.color || '').trim() === (nextColor || '');
    if (unchanged) return;

    setSavingAppearance(true);
    try {
      const res = await updateAgentRoster({
        agentKey: agent.id,
        emoji: nextEmoji,
        color: nextColor,
      });

      if (!res.ok) {
        toast({
          title: 'Failed to update agent',
          description: res.error || 'unknown_error',
          variant: 'destructive',
        });
        return;
      }

      onAgentPatched?.(agent.id, { avatar: nextEmoji || '', color: nextColor || '' });

      toast({
        title: 'Updated',
        description: 'Saved agent appearance (emoji + color).',
      });
    } finally {
      setSavingAppearance(false);
    }
  };

  const saveStatus = async () => {
    if (savingStatus) return;

    const nextState = (statusStateDraft || '').trim() || null;
    const nextNote = (statusNoteDraft || '').trim() || null;

    const unchanged = (agent.statusState || '').trim() === (nextState || '') && (agent.statusNote || '').trim() === (nextNote || '');
    if (unchanged) return;

    setSavingStatus(true);
    try {
      const res = await updateAgentStatus({
        agentKey: agent.id,
        state: (nextState as any) || null,
        note: nextNote,
      });

      if (!res.ok) {
        toast({
          title: 'Failed to update status',
          description: res.error || 'unknown_error',
          variant: 'destructive',
        });
        return;
      }

      const derivedStatus: Agent['status'] =
        nextState === 'working'
          ? 'running'
          : nextState === 'blocked' || nextState === 'sleeping'
            ? 'idle'
            : 'online';

      onAgentPatched?.(agent.id, {
        status: derivedStatus,
        statusState: (nextState as any) || undefined,
        statusNote: nextNote,
      });

      toast({
        title: 'Status updated',
        description: 'Saved presence state + note.',
      });
    } finally {
      setSavingStatus(false);
    }
  };

  const statusReason =
    ((statusNoteDraft || '').trim().length > 0 ? statusNoteDraft : null) ||
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
    {
      label: 'Last seen',
      value: lastSeenAt
        ? `${formatRelativeTime(lastSeenAt, new Date())} (${formatAt(lastSeenAt)})`
        : null,
    },
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

  const timelineAll = activity.filter((a) => matchesAgent(a, agent.id));
  const timeline = timelineAll.slice(0, timelineExpanded ? 50 : 12);

  const extractDirectedMessage = (rawMessage: string) => {
    const m = (rawMessage || '').trim();
    if (!m) return null;

    const needles = [`To ${agent.id}:`, `To ${agent.name}:`];
    for (const needle of needles) {
      const idx = m.indexOf(needle);
      if (idx >= 0) {
        const body = m.slice(idx + needle.length).trim();
        return {
          needle,
          body: body.length > 0 ? body : '—',
        };
      }
    }

    return null;
  };

  const messagesAll = activity
    .filter((a) => a.type === 'session')
    .map((a) => {
      const directed = extractDirectedMessage(a.message || '');
      return directed ? { activity: a, directed } : null;
    })
    .filter((x): x is { activity: ActivityItem; directed: { needle: string; body: string } } => Boolean(x));

  const messages = messagesAll.slice(0, messagesExpanded ? 50 : 10);

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

  const displayEmoji = (emojiDraft || '').trim() || agent.avatar;
  const displayColor = (colorDraft || '').trim() || null;

  const now = new Date();

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
                displayColor
                  ? {
                      backgroundColor: withAlpha(displayColor, '22'),
                      border: `1px solid ${withAlpha(displayColor, '55')}`,
                    }
                  : undefined
              }
            >
              {displayColor ? (
                <span
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ backgroundColor: displayColor }}
                  aria-hidden
                />
              ) : null}
              {displayEmoji}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold truncate">{agent.name}</h3>
                {displayColor ? (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: displayColor }}
                    title={displayColor}
                    aria-label="Agent theme color"
                  />
                ) : null}
              </div>
              <Badge variant="outline" className="mt-1 text-xs font-medium">
                {agent.role}
              </Badge>

              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] font-mono text-muted-foreground break-all">{agent.id}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => void copyAgentKey()}
                  title="Copy agent key"
                  aria-label="Copy agent key"
                >
                  <Copy className="w-3 h-3 mr-1" />
                  {copiedKey ? 'Copied' : 'Copy'}
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-[1fr,1fr,auto] gap-2 items-center">
                <Input
                  value={emojiDraft}
                  onChange={(e) => setEmojiDraft(e.target.value)}
                  placeholder="Emoji"
                  className="h-8 text-xs"
                  aria-label="Agent emoji"
                />
                <Input
                  value={colorDraft}
                  onChange={(e) => setColorDraft(e.target.value)}
                  placeholder="#7c3aed"
                  className="h-8 text-xs font-mono"
                  aria-label="Agent color"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  variant="secondary"
                  disabled={savingAppearance}
                  onClick={() => void saveAppearance()}
                >
                  {savingAppearance ? 'Saving…' : 'Save'}
                </Button>
              </div>
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

            {/* Presence editor (agent_status) */}
            <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Edit presence</div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2 text-[11px]"
                  disabled={savingStatus}
                  onClick={() => void saveStatus()}
                >
                  {savingStatus ? 'Saving…' : 'Save'}
                </Button>
              </div>

              <div className="grid grid-cols-[110px,1fr] items-center gap-2">
                <div className="text-xs text-muted-foreground">State</div>
                <select
                  className="h-8 rounded-md bg-background border border-input px-2 text-xs"
                  value={statusStateDraft}
                  onChange={(e) => setStatusStateDraft(e.target.value as any)}
                  aria-label="Presence state"
                >
                  <option value="">(auto)</option>
                  <option value="idle">idle</option>
                  <option value="working">working</option>
                  <option value="blocked">blocked</option>
                  <option value="sleeping">sleeping</option>
                </select>
              </div>

              <div className="grid grid-cols-[110px,1fr] items-start gap-2">
                <div className="text-xs text-muted-foreground pt-2">Note</div>
                <Textarea
                  value={statusNoteDraft}
                  onChange={(e) => setStatusNoteDraft(e.target.value)}
                  placeholder="Short status note…"
                  className="min-h-[72px] text-xs"
                  aria-label="Presence note"
                />
              </div>

              <div className="text-[11px] text-muted-foreground">
                Saved to <span className="font-mono">agent_status</span> (Supabase). Leave state as “(auto)” to let activity/heartbeat drive the badge.
              </div>
            </div>
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

          {/* Brain docs (jump to Manage → Agents editor) */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">BRAIN DOCS</h4>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => openAgentEditor('soul')}>
                Edit SOUL
              </Button>
              <Button variant="outline" size="sm" onClick={() => openAgentEditor('user')}>
                Edit USER
              </Button>
              <Button variant="outline" size="sm" onClick={() => openAgentEditor('memory')}>
                Edit MEMORY
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Opens the full editor in <span className="font-medium">Manage → Agents</span>.
            </p>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="attention" className="w-full">
            <TabsList className="w-full bg-muted/50 overflow-x-auto flex-nowrap justify-start sm:justify-between">
              <TabsTrigger value="attention" className="flex-none sm:flex-1 gap-1.5 text-xs whitespace-nowrap">
                <AlertTriangle className="w-3 h-3" />
                Attention
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {attentionTasks.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="timeline" className="flex-none sm:flex-1 gap-1.5 text-xs whitespace-nowrap">
                <Clock className="w-3 h-3" />
                Timeline
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {timelineAll.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="schedule" className="flex-none sm:flex-1 gap-1.5 text-xs whitespace-nowrap">
                <Clock className="w-3 h-3" />
                Schedule
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {scheduledJobs.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="messages" className="flex-none sm:flex-1 gap-1.5 text-xs whitespace-nowrap">
                <MessageSquare className="w-3 h-3" />
                Messages
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                  {messagesAll.length}
                </Badge>
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
                          <div className="text-xs text-muted-foreground mt-1" title={formatAt(a.date)}>
                            {formatRelativeTime(a.date, now)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {timelineAll.length > 12 ? (
                    <div className="pt-1 flex justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setTimelineExpanded((s) => !s)}
                      >
                        {timelineExpanded ? 'Show less' : `Show more (${timelineAll.length})`}
                      </Button>
                    </div>
                  ) : null}
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
                                disabled={Boolean(runningScheduleIds[j.id])}
                                onClick={() => void runJobNow(j)}
                              >
                                {runningScheduleIds[j.id] ? 'Running…' : 'Run'}
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
                  {messages.map(({ activity: a, directed }) => (
                    <div key={a.hash} className="p-3 rounded-lg border border-border bg-card">
                      <div className="text-[11px] text-muted-foreground">
                        From{' '}
                        <span className="font-mono">
                          {(a.authorLabel || a.author || 'unknown').toString().trim()}
                        </span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words mt-1">{directed.body}</div>
                      <div className="text-xs text-muted-foreground mt-2" title={formatAt(a.date)}>
                        {formatRelativeTime(a.date, now)}
                      </div>
                    </div>
                  ))}

                  {messagesAll.length > 10 ? (
                    <div className="pt-1 flex justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setMessagesExpanded((s) => !s)}
                      >
                        {messagesExpanded ? 'Show less' : `Show more (${messagesAll.length})`}
                      </Button>
                    </div>
                  ) : null}
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
              // Avoid sending while the user is composing text with an IME.
              // Also allow Shift+Enter for accessibility (even though Input is single-line).
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const isComposing = Boolean((e.nativeEvent as any)?.isComposing);
              if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
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
