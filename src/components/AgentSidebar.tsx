import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useClawdOffice } from '@/lib/store';
import { getAgents, type Agent } from '@/lib/api';
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
              onClick={() => {
                // Trigger a one-off refresh without waiting for the 30s interval.
                setIsRefreshing(true);
                getAgents()
                  .then((next) => {
                    setAgents(next);
                    setLastRefreshedAt(new Date());
                  })
                  .catch((e) => {
                    console.warn('Failed to load agents:', e);
                  })
                  .finally(() => setIsRefreshing(false));
              }}
              disabled={isRefreshing}
              title="Refresh"
            >
              <RefreshCw className={cn('w-4 h-4', isRefreshing ? 'animate-spin' : '')} />
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
                    {agent.skillCount} skills • {agent.lastActive || '—'}
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
