import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, HelpCircle } from 'lucide-react';
import { useClawdOffice } from '@/lib/store';
import { getAgents, type Agent } from '@/lib/api';
import { hasSupabase, subscribeToProjectRealtime } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusTooltip } from '@/components/ui/StatusTooltip';
import { AgentDetail } from '@/components/AgentDetail';

export function AgentsPage() {
  const { selectedAgentId, setSelectedAgentId, selectedProjectId } = useClawdOffice();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [detailOpen, setDetailOpen] = useState(false);
  const refreshDebounceRef = useRef<number | null>(null);

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
      if (table === 'agents' || table === 'agent_status') scheduleRefresh();
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

  const getStatusBadge = (status: Agent['status']) => {
    const styles: Record<string, string> = {
      working: 'badge-working',
      idle: 'badge-idle',
      offline: 'badge-offline',
    };
    return styles[status] || 'badge-offline';
  };

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgentId(agent.id);
    setDetailOpen(true);
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
                <p>🟢 <strong>ONLINE</strong>: Seen within 5 minutes</p>
                <p>🟢 <strong>WORKING</strong>: Currently executing a task</p>
                <p>🟡 <strong>IDLE</strong>: Available but not active</p>
                <p>🔴 <strong>OFFLINE</strong>: No activity for 60+ minutes</p>
                <p className="text-muted-foreground mt-2">
                  Hover over any status badge for details.
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
        </Button>
      </div>

      {/* Agent grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
              <div className="flex items-start gap-3">
                <div className="relative">
                  {agent.color && (
                    <span
                      className="absolute -left-1 -top-1 h-3 w-3 rounded-full ring-2 ring-background"
                      style={{ backgroundColor: agent.color }}
                    />
                  )}
                  <span className="text-3xl">{agent.avatar || '🤖'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{agent.name}</span>
                    <StatusTooltip
                      status={agent.status}
                      statusState={agent.statusState}
                      lastActivityAt={agent.lastActivityAt}
                      lastHeartbeatAt={agent.lastHeartbeatAt}
                    >
                      <span className={cn('badge-status cursor-help', getStatusBadge(agent.status))}>
                        {agent.status}
                      </span>
                    </StatusTooltip>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">
                    {agent.role || 'Agent'}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
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
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            No agents found in this project.
          </div>
        )}
      </div>

      {/* Detail slide-out panel */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0">
          <AgentDetail onOpenSidebar={() => setDetailOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
