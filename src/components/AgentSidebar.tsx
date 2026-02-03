import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, ArrowUpDown } from 'lucide-react';
import { useClawdOffice } from '@/lib/store';
import { createAgent, getAgents, type Agent } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

function getAgentOrderStorageKey(projectId: string) {
  return `clawdos.agentOrder.${projectId}`;
}

function getAgentSortModeStorageKey(projectId: string) {
  return `clawdos.agentSortMode.${projectId}`;
}

type AgentSortMode = 'status' | 'custom';

function withAlpha(color: string | null | undefined, alphaHex: string) {
  const c = (color || '').trim();
  if (/^#([0-9a-fA-F]{6})$/.test(c)) return `${c}${alphaHex}`;
  if (/^#([0-9a-fA-F]{3})$/.test(c)) {
    const r = c[1];
    const g = c[2];
    const b = c[3];
    return `#${r}${r}${g}${g}${b}${b}${alphaHex}`;
  }
  return c;
}

export function AgentSidebar({ className, onSelect }: { className?: string; onSelect?: () => void }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [dragAgentId, setDragAgentId] = useState<string | null>(null);
  const [overAgentId, setOverAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { selectedAgentId, setSelectedAgentId, selectedProjectId } = useClawdOffice();

  const [sortMode, setSortMode] = useState<AgentSortMode>(() => {
    try {
      const raw = localStorage.getItem(getAgentSortModeStorageKey(selectedProjectId));
      return raw === 'custom' ? 'custom' : 'status';
    } catch {
      return 'status';
    }
  });

  const [customOrder, setCustomOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(getAgentOrderStorageKey(selectedProjectId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
    } catch {
      return [];
    }
  });

  // Keep time ticking so "Seen … ago" labels update.
  // Mobile polish: avoid re-rendering the whole sidebar every second.
  useEffect(() => {
    const t = window.setInterval(() => setCurrentTime(new Date()), 10_000);
    return () => window.clearInterval(t);
  }, []);

  // When project changes, re-load sort preferences.
  useEffect(() => {
    try {
      const rawMode = localStorage.getItem(getAgentSortModeStorageKey(selectedProjectId));
      setSortMode(rawMode === 'custom' ? 'custom' : 'status');
    } catch {
      setSortMode('status');
    }

    try {
      const raw = localStorage.getItem(getAgentOrderStorageKey(selectedProjectId));
      if (!raw) {
        setCustomOrder([]);
        return;
      }
      const parsed = JSON.parse(raw);
      setCustomOrder(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
    } catch {
      setCustomOrder([]);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setIsRefreshing(true);
      try {
        const next = await getAgents();
        if (!alive) return;
        setAgents(next);
        setError(null);
        setLastRefreshedAt(new Date());

        // Project scoping: if the previously-selected agent doesn't exist in the
        // newly-selected project, pick the first agent (or clear selection).
        if (selectedAgentId && !next.some((a) => a.id === selectedAgentId)) {
          setSelectedAgentId(next[0]?.id || null);
        }

        // Best-effort keep custom order in sync as agents appear/disappear.
        setCustomOrder((prev) => {
          const ids = next.map((a) => a.id);
          const seen = new Set<string>();
          const pruned = prev.filter((id) => {
            if (!ids.includes(id)) return false;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
          const missing = ids.filter((id) => !seen.has(id));
          const merged = [...pruned, ...missing];
          try {
            localStorage.setItem(getAgentOrderStorageKey(selectedProjectId), JSON.stringify(merged));
          } catch {
            // ignore
          }
          return merged;
        });
      } catch (e: any) {
        // Sidebar should fail soft.
        console.warn('Failed to load agents:', e);
        if (alive) setError(String(e?.message || e));
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
  }, [selectedProjectId, selectedAgentId, setSelectedAgentId]);

  const getStatusBadge = (status: Agent['status']) => {
    const styles = {
      online: 'badge-online',
      idle: 'badge-idle',
      running: 'badge-running',
      offline: 'badge-offline',
    };
    return styles[status];
  };

  function newestIso(a: string | null | undefined, b: string | null | undefined) {
    const at = a ? Date.parse(a) : Number.NaN;
    const bt = b ? Date.parse(b) : Number.NaN;
    if (Number.isNaN(at) && Number.isNaN(bt)) return null;
    if (Number.isNaN(bt)) return a || null;
    if (Number.isNaN(at)) return b || null;
    return at >= bt ? (a || null) : (b || null);
  }

  function formatSeenLabel(agent: Agent): string {
    // Presence: prefer the most recent of heartbeat/activity, not a fixed priority.
    const lastSeenIso = newestIso(agent.lastActivityAt, agent.lastHeartbeatAt);
    if (!lastSeenIso) return agent.lastActive || '—';

    const last = new Date(lastSeenIso);
    if (Number.isNaN(last.getTime())) return agent.lastActive || '—';

    const deltaMs = Math.max(0, currentTime.getTime() - last.getTime());
    const s = Math.floor(deltaMs / 1000);
    if (s < 45) return 'Seen just now';
    if (s < 60) return 'Seen <1m ago';
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
      setError(null);
      setLastRefreshedAt(new Date());
    } catch (e: any) {
      console.warn('Failed to load agents:', e);
      setError(String(e?.message || e));
    } finally {
      setIsRefreshing(false);
    }
  }

  const displayedAgents = useMemo(() => {
    const byId = new Map(agents.map((a) => [a.id, a] as const));

    if (sortMode === 'custom') {
      const ordered: Agent[] = [];
      for (const id of customOrder) {
        const a = byId.get(id);
        if (a) ordered.push(a);
      }
      // Any agents not in the stored order get appended.
      for (const a of agents) {
        if (!customOrder.includes(a.id)) ordered.push(a);
      }
      return ordered;
    }

    // Default: keep the existing behavior (status priority + name).
    return [...agents].sort((a, b) => {
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
    });
  }, [agents, customOrder, sortMode]);

  function persistCustomOrder(next: string[]) {
    setCustomOrder(next);
    try {
      localStorage.setItem(getAgentOrderStorageKey(selectedProjectId), JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function persistSortMode(next: AgentSortMode) {
    setSortMode(next);
    try {
      localStorage.setItem(getAgentSortModeStorageKey(selectedProjectId), next);
    } catch {
      // ignore
    }
  }

  function reorderCustomOrder(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;

    const ids = displayedAgents.map((a) => a.id);
    const sourceIdx = ids.indexOf(sourceId);
    const targetIdx = ids.indexOf(targetId);
    if (sourceIdx < 0 || targetIdx < 0) return;

    const next = [...ids];
    next.splice(sourceIdx, 1);
    next.splice(targetIdx, 0, sourceId);
    persistCustomOrder(next);
  }

  return (
    <aside className={cn('w-64 border-r border-border bg-sidebar h-full overflow-y-auto scrollbar-thin', className)}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agents</h2>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {lastRefreshedAt
                ? `Updated ${Math.max(0, Math.floor((currentTime.getTime() - lastRefreshedAt.getTime()) / 1000))}s ago`
                : 'Not yet updated'}
            </span>

            <Button
              variant={sortMode === 'custom' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2"
              onClick={() => {
                const next = sortMode === 'custom' ? 'status' : 'custom';
                persistSortMode(next);
              }}
              title={sortMode === 'custom' ? 'Switch to status sorting' : 'Switch to custom ordering (drag to reorder)'}
            >
              <ArrowUpDown className="w-4 h-4" />
            </Button>

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

                const palette = [
                  '#3b82f6', // blue
                  '#22c55e', // green
                  '#f97316', // orange
                  '#a855f7', // purple
                  '#06b6d4', // cyan
                  '#ef4444', // red
                  '#eab308', // yellow
                  '#ec4899', // pink
                ];
                const hash = Array.from(agentKey).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
                const suggestedColor = palette[hash % palette.length];
                const colorRaw = window.prompt('Theme color (hex, optional):', suggestedColor) || '';
                const color = colorRaw.trim() || undefined;

                const res = await createAgent({ agentKey, name, emoji, role, color });
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

        {error && (
          <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive break-words">
            Agents failed to load. {error}
          </div>
        )}
        <div className="space-y-1">
          {displayedAgents.map((agent) => (
            <button
              key={agent.id}
              draggable={sortMode === 'custom'}
              onDragStart={(e) => {
                if (sortMode !== 'custom') return;
                setDragAgentId(agent.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', agent.id);
              }}
              onDragOver={(e) => {
                if (sortMode !== 'custom') return;
                e.preventDefault();
                setOverAgentId(agent.id);
              }}
              onDragLeave={() => {
                if (sortMode !== 'custom') return;
                setOverAgentId((prev) => (prev === agent.id ? null : prev));
              }}
              onDrop={(e) => {
                if (sortMode !== 'custom') return;
                e.preventDefault();
                const sourceId = e.dataTransfer.getData('text/plain') || dragAgentId;
                if (sourceId) reorderCustomOrder(sourceId, agent.id);
                setDragAgentId(null);
                setOverAgentId(null);
              }}
              onDragEnd={() => {
                if (sortMode !== 'custom') return;
                setDragAgentId(null);
                setOverAgentId(null);
              }}
              onClick={() => {
                setSelectedAgentId(agent.id);
                onSelect?.();
              }}
              className={cn(
                'agent-card w-full text-left',
                agent.status === 'running' && 'agent-card-running',
                selectedAgentId === agent.id && 'agent-card-active',
                sortMode === 'custom' && overAgentId === agent.id && dragAgentId !== agent.id && 'ring-2 ring-primary/40'
              )}
              title={sortMode === 'custom' ? 'Drag to reorder' : undefined}
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  {agent.statusState === 'working' ? (
                    <span
                      className="absolute -inset-2 rounded-full blur-md opacity-50 animate-pulse"
                      style={{ backgroundColor: withAlpha(agent.color || '#22c55e', '55') }}
                      aria-hidden
                    />
                  ) : null}
                  {agent.color ? (
                    <span
                      className="absolute -left-1 -top-1 h-3 w-3 rounded-full ring-2 ring-background"
                      style={{ backgroundColor: agent.color }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="relative z-10 text-2xl">{agent.avatar}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{agent.name}</span>
                    <span className={cn('badge-status', getStatusBadge(agent.status))}>{agent.status}</span>
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
