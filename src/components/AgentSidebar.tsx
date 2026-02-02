import { useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { useClawdOffice } from '@/lib/store';
import { createAgent, getAgents, type Agent } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function AgentSidebar({ className, onSelect }: { className?: string; onSelect?: () => void }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const { selectedAgentId, setSelectedAgentId } = useClawdOffice();

  useEffect(() => {
    const t = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setIsRefreshing(true);
      try {
        const next = await getAgents();
        if (!alive) return;
        setAgents(next);
        setLastRefreshedAt(new Date());
      } catch (e) {
        // Sidebar should fail soft.
        console.warn('Failed to load agents:', e);
      } finally {
        if (alive) setIsRefreshing(false);
      }
    };

    load();
    const t = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const getStatusBadge = (status: Agent['status']) => {
    const styles = {
      online: 'badge-online',
      idle: 'badge-idle',
      running: 'badge-running',
      offline: 'badge-offline',
    };
    return styles[status];
  };

  function formatSeenLabel(agent: Agent): string {
    const lastSeenIso = agent.lastHeartbeatAt || agent.lastActivityAt;
    if (!lastSeenIso) return agent.lastActive || '—';

    const last = new Date(lastSeenIso);
    if (Number.isNaN(last.getTime())) return agent.lastActive || '—';

    const deltaMs = Math.max(0, currentTime.getTime() - last.getTime());
    const s = Math.floor(deltaMs / 1000);
    if (s < 60) return `Seen ${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `Seen ${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `Seen ${h}h ago`;
    const d = Math.floor(h / 24);
    return `Seen ${d}d ago`;
  }

  async function refreshAgents() {
    setIsRefreshing(true);
    try {
      const next = await getAgents();
      setAgents(next);
      setLastRefreshedAt(new Date());
    } catch (e) {
      console.warn('Failed to load agents:', e);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <aside className={cn("w-64 border-r border-border bg-sidebar h-full overflow-y-auto scrollbar-thin", className)}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Agents
          </h2>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {lastRefreshedAt
                ? `Updated ${Math.max(0, Math.floor((currentTime.getTime() - lastRefreshedAt.getTime()) / 1000))}s ago`
                : 'Not yet updated'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={refreshAgents}
              disabled={isRefreshing}
              title="Refresh"
            >
              <RefreshCw className={cn('w-4 h-4', isRefreshing ? 'animate-spin' : '')} />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={async () => {
                const agentKey = window.prompt('New agent key (unique id):');
                if (!agentKey) return;

                const name = window.prompt('Agent display name:', agentKey) || agentKey;
                const emoji = window.prompt('Emoji/avatar (optional):', '🤖') || undefined;
                const role = window.prompt('Role/description (optional):', '') || undefined;

                const res = await createAgent({ agentKey, name, emoji, role });
                if (!res.ok) {
                  window.alert(`Failed to create agent: ${res.error || 'unknown_error'}`);
                  return;
                }

                await refreshAgents();
              }}
              disabled={isRefreshing}
              title="New Agent"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          {[...agents]
            .sort((a, b) => {
              const pri: Record<Agent['status'], number> = {
                running: 0,
                online: 1,
                idle: 2,
                offline: 3,
              };
              const pa = pri[a.status] ?? 99;
              const pb = pri[b.status] ?? 99;
              if (pa !== pb) return pa - pb;
              return a.name.localeCompare(b.name);
            })
            .map((agent) => (
            <button
              key={agent.id}
              onClick={() => {
                setSelectedAgentId(agent.id);
                onSelect?.();
              }}
              className={cn(
                "agent-card w-full text-left",
                agent.status === 'running' && "agent-card-running",
                selectedAgentId === agent.id && "agent-card-active"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  {agent.color ? (
                    <span
                      className="absolute -left-1 -top-1 h-3 w-3 rounded-full ring-2 ring-background"
                      style={{ backgroundColor: agent.color }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="text-2xl">{agent.avatar}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{agent.name}</span>
                    <span className={cn("badge-status", getStatusBadge(agent.status))}>
                      {agent.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{agent.role}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {agent.skillCount} skills • {formatSeenLabel(agent)}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
