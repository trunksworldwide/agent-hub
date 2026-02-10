import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, HelpCircle, Plus } from 'lucide-react';
import { useClawdOffice } from '@/lib/store';
import { getAgents, createAgent, queueProvisionRequest, type Agent } from '@/lib/api';
import { hasSupabase, subscribeToProjectRealtime } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusTooltip } from '@/components/ui/StatusTooltip';
import { AgentDetail } from '@/components/AgentDetail';
import { useToast } from '@/hooks/use-toast';

// Curated emoji options for agents
const EMOJI_OPTIONS = [
  '🤖', '🧠', '💻', '📊', '🔬', '✍️', '🎨', '📈',
  '🔒', '⚙️', '🧪', '🤝', '📝', '🎯', '🚀', '💡',
  '🔍', '📚', '🛠️', '🎭', '🌐', '⚡', '🔥', '🌟',
];

// Auto-suggest emoji based on name/purpose
function suggestEmoji(name: string, purpose?: string): string {
  const text = (purpose || name).toLowerCase();
  if (text.includes('research')) return '🔬';
  if (text.includes('code') || text.includes('dev') || text.includes('engineer')) return '💻';
  if (text.includes('write') || text.includes('content') || text.includes('copy')) return '✍️';
  if (text.includes('data') || text.includes('analys')) return '📊';
  if (text.includes('design')) return '🎨';
  if (text.includes('support') || text.includes('help')) return '🤝';
  if (text.includes('sales') || text.includes('marketing')) return '📈';
  if (text.includes('test') || text.includes('qa')) return '🧪';
  if (text.includes('ops') || text.includes('devops')) return '⚙️';
  if (text.includes('security')) return '🔒';
  return '🤖';
}

// Generate agent key from name
function generateAgentKey(name: string, existingKeys: string[]): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'agent';
  
  let base = `agent:${slug}:main`;
  let candidate = base;
  let suffix = 2;
  
  while (existingKeys.includes(candidate)) {
    candidate = `agent:${slug}-${suffix}:main`;
    suffix++;
  }
  
  return candidate;
}

export function AgentsPage() {
  const { toast } = useToast();
  const { selectedAgentId, setSelectedAgentId, selectedProjectId } = useClawdOffice();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [detailOpen, setDetailOpen] = useState(false);
  const refreshDebounceRef = useRef<number | null>(null);

  // Create agent dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentPurpose, setNewAgentPurpose] = useState('');
  const [newAgentEmoji, setNewAgentEmoji] = useState('🤖');
  const [newAgentColor, setNewAgentColor] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Keep time ticking for "last seen" labels
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const data = await getAgents();
      setAgents(data);
    } catch (e) {
      console.error('Failed to load agents:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [selectedProjectId]);

  // Supabase realtime: keep roster/presence live without waiting for the poll.
  useEffect(() => {
    if (!hasSupabase()) return;
    if (!selectedProjectId) return;

    const scheduleRefresh = () => {
      if (refreshDebounceRef.current) window.clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = window.setTimeout(() => {
        refreshDebounceRef.current = null;
        void refresh();
      }, 500);
    };

    const unsubscribe = subscribeToProjectRealtime(selectedProjectId, (change) => {
      const table = change?.table;
      if (table === 'agents' || table === 'agent_status' || table === 'agent_provision_requests') scheduleRefresh();
    });

    return () => {
      if (refreshDebounceRef.current) window.clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = null;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  const newestIso = (a: string | null | undefined, b: string | null | undefined) => {
    const at = a ? Date.parse(a) : NaN;
    const bt = b ? Date.parse(b) : NaN;
    if (Number.isNaN(at) && Number.isNaN(bt)) return null;
    if (Number.isNaN(bt)) return a || null;
    if (Number.isNaN(at)) return b || null;
    return at >= bt ? (a || null) : (b || null);
  };

  const formatSeenLabel = (agent: Agent): string => {
    const lastSeenIso = newestIso(agent.lastActivityAt, agent.lastHeartbeatAt);
    if (!lastSeenIso) return agent.lastActive || '—';

    const last = new Date(lastSeenIso);
    if (Number.isNaN(last.getTime())) return agent.lastActive || '—';

    const deltaMs = Math.max(0, currentTime.getTime() - last.getTime());
    const s = Math.floor(deltaMs / 1000);
    if (s < 45) return 'just now';
    if (s < 60) return '<1m ago';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  };

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgentId(agent.id);
    setDetailOpen(true);
  };

  // Auto-update emoji when name or purpose changes
  useEffect(() => {
    if (newAgentName || newAgentPurpose) {
      setNewAgentEmoji(suggestEmoji(newAgentName, newAgentPurpose));
    }
  }, [newAgentName, newAgentPurpose]);

  const handleCreateAgent = async () => {
    if (!newAgentName.trim() || !newAgentPurpose.trim()) return;

    setIsCreating(true);
    try {
      const existingKeys = agents.map(a => a.id);
      const agentKey = generateAgentKey(newAgentName, existingKeys);

      const result = await createAgent({
        agentKey,
        name: newAgentName.trim(),
        role: newAgentPurpose.trim(),
        emoji: newAgentEmoji,
        color: newAgentColor || undefined,
      });

      if (!result.ok) {
        throw new Error(result.error || 'Failed to create agent');
      }

      toast({
        title: 'Agent created',
        description: `${newAgentEmoji} ${newAgentName} is ready to go!`,
      });

      // Reset form and close dialog
      setNewAgentName('');
      setNewAgentPurpose('');
      setNewAgentEmoji('🤖');
      setNewAgentColor('');
      setCreateDialogOpen(false);

      // Refresh and select the new agent
      await refresh();
      setSelectedAgentId(agentKey);
      setDetailOpen(true);
    } catch (e: any) {
      toast({
        title: 'Failed to create agent',
        description: String(e?.message || e),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-lg font-semibold">Agents</h1>
            <p className="text-sm text-muted-foreground">
              {agents.length} agent{agents.length !== 1 ? 's' : ''} in this project
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="p-1 rounded hover:bg-muted cursor-help"
                aria-label="Status info"
              >
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              <div className="space-y-1">
                <p><strong>Status indicators:</strong></p>
                <p>🟢 <strong>WORKING</strong>: Currently executing a task</p>
                <p>🟡 <strong>IDLE</strong>: Seen within last 60 minutes</p>
                <p>⚫ <strong>OFFLINE</strong>: No activity for 60+ minutes</p>
                <p className="text-muted-foreground mt-2">
                  Hover over any status dot for details.
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            New Agent
          </Button>
        </div>
      </div>

      {/* Agent grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => handleAgentClick(agent)}
              className={cn(
                'agent-card w-full text-left',
                selectedAgentId === agent.id && 'agent-card-active',
                agent.status === 'working' && 'agent-card-working'
              )}
            >
              <div className="flex items-start gap-4">
                <span className="text-4xl mt-0.5">{agent.avatar || '🤖'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-semibold">{agent.name}</span>
                    <StatusTooltip
                      status={agent.status}
                      statusState={agent.statusState}
                      lastActivityAt={agent.lastActivityAt}
                      lastHeartbeatAt={agent.lastHeartbeatAt}
                    >
                      <span
                        className={cn(
                          'w-3 h-3 rounded-full cursor-help shrink-0',
                          agent.status === 'working'
                            ? 'status-dot-working'
                            : agent.status === 'idle'
                              ? 'status-dot-idle'
                              : 'status-dot-offline'
                        )}
                        aria-label={agent.status}
                      />
                    </StatusTooltip>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {agent.role || 'Agent'}
                  </p>
                  {agent.purposeText && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2 italic">
                      {agent.purposeText}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    {agent.provisioned === false && agent.id !== 'agent:main:main' && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 text-[11px] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Provisioning…
                        <button
                          type="button"
                          className="ml-1 underline hover:text-amber-700"
                          onClick={(e) => {
                            e.stopPropagation();
                            const idShort = agent.id.split(':')[1] || agent.id;
                            queueProvisionRequest(
                              selectedProjectId || 'front-office',
                              agent.id,
                              idShort,
                              agent.name,
                              agent.avatar || null,
                              agent.role || null,
                            );
                            toast({ title: 'Provisioning re-queued', description: `${agent.name} will be provisioned when the executor picks it up.` });
                          }}
                        >
                          Retry
                        </button>
                      </span>
                    )}
                    <span>{agent.skillCount} skills</span>
                    <span>·</span>
                    <span>Seen {formatSeenLabel(agent)}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {agents.length === 0 && !isRefreshing && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <p>No agents found in this project.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-2"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="w-4 h-4" />
              Create your first agent
            </Button>
          </div>
        )}
      </div>

      {/* Detail slide-out panel */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0">
          <AgentDetail onOpenSidebar={() => setDetailOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Create Agent Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                placeholder="e.g., Research, Coder, Writer"
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Purpose *</label>
              <Input
                value={newAgentPurpose}
                onChange={(e) => setNewAgentPurpose(e.target.value)}
                placeholder="e.g., Deep research and analysis"
                disabled={isCreating}
              />
              <p className="text-xs text-muted-foreground">
                What this agent specializes in
              </p>
            </div>
            <div className="flex gap-4">
              <div className="space-y-2 flex-1">
                <label className="text-sm font-medium">Emoji</label>
                <Select value={newAgentEmoji} onValueChange={setNewAgentEmoji} disabled={isCreating}>
                  <SelectTrigger className="text-2xl h-12">
                    <SelectValue placeholder="🤖" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <div className="grid grid-cols-6 gap-1 p-2">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <SelectItem
                          key={emoji}
                          value={emoji}
                          className="text-2xl p-2 cursor-pointer hover:bg-muted rounded justify-center"
                        >
                          {emoji}
                        </SelectItem>
                      ))}
                    </div>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex-1">
                <label className="text-sm font-medium">Color (optional)</label>
                <Input
                  type="color"
                  value={newAgentColor || '#6366f1'}
                  onChange={(e) => setNewAgentColor(e.target.value)}
                  className="h-12 p-1"
                  disabled={isCreating}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateAgent}
              disabled={!newAgentName.trim() || !newAgentPurpose.trim() || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
