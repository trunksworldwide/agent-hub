import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getActivity, type ActivityItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/datetime';
import { useClawdOffice } from '@/lib/store';
import { hasSupabase, subscribeToProjectRealtime } from '@/lib/supabase';
import { generateActivitySummary, getActivityCategory } from '@/lib/activity-summary';

export function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [limit, setLimit] = useState(200);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  const { selectedProjectId, setSelectedAgentId } = useClawdOffice();
  const refreshDebounceRef = useRef<number | null>(null);

  const refresh = async () => {
    setIsRefreshing(true);
    setLoadError(null);
    try {
      const act = await getActivity(limit);
      setItems(act);
    } catch (e: any) {
      console.error('Activity refresh failed', e);
      setLoadError(String(e?.message || e));
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  // Supabase realtime: refresh quickly on new activity without hammering.
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
      if (change?.table === 'activities') scheduleRefresh();
    });

    return () => {
      if (refreshDebounceRef.current) window.clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = null;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, limit]);

  const knownTypes = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      if (i.type) set.add(i.type);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((i) => {
      if (typeFilter !== 'all' && i.type !== typeFilter) return false;
      if (!needle) return true;
      const hay = `${i.message || ''}\n${i.author || ''}\n${i.authorLabel || ''}\n${i.hash || ''}\n${i.type || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [items, typeFilter, search]);

  const navigate = useNavigate();

  const openAgent = (agentKey: string) => {
    if (!agentKey || !String(agentKey).startsWith('agent:')) return;
    setSelectedAgentId(agentKey);
    navigate('/agents');
  };

  const toggleExpanded = (hash: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) {
        next.delete(hash);
      } else {
        next.add(hash);
      }
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">Activity</div>
          <div className="text-xs text-muted-foreground">Project-scoped activity feed</div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {knownTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 w-[220px] text-xs"
          />

          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={refresh}
            disabled={isRefreshing}
            title="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing ? 'animate-spin' : '')} />
          </Button>
        </div>
      </div>

      {loadError ? <div className="p-4 text-sm text-destructive">{loadError}</div> : null}

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">No activity yet.</div>
          ) : (
            filtered.map((i) => {
              const d = new Date(i.date);
              const timeLabel = Number.isNaN(d.getTime())
                ? i.date
                : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${formatTime(d)}`;

              const canOpen = Boolean(i.author && String(i.author).startsWith('agent:'));
              const isExpanded = expandedItems.has(i.hash);
              
              // Use summary from DB if available, otherwise generate client-side
              const displaySummary = i.summary || generateActivitySummary(i.type || '', i.message || '');
              const hasRawDetails = displaySummary !== i.message;
              const category = getActivityCategory(i.type || '');

              return (
                <div key={i.hash} className="p-3 rounded-lg border border-border bg-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Human-friendly summary */}
                      <div className="text-sm font-medium break-words">{displaySummary}</div>
                      
                      {/* Category badge and metadata */}
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-1 items-center">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {category}
                        </Badge>
                        <span className="font-mono text-[10px]">{i.type}</span>
                        {i.authorLabel ? (
                          <>
                            <span>·</span>
                            {canOpen ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 px-1 text-xs font-mono underline underline-offset-2"
                                onClick={() => openAgent(i.author)}
                                title={`Open ${i.author} in Manage → Agents`}
                              >
                                {i.authorLabel}
                              </Button>
                            ) : (
                              <span className="font-mono">{i.authorLabel}</span>
                            )}
                          </>
                        ) : null}
                      </div>

                      {/* Expandable raw details */}
                      {hasRawDetails && (
                        <div className="mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-muted-foreground"
                            onClick={() => toggleExpanded(i.hash)}
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="w-3 h-3 mr-1" />
                                Hide details
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3 h-3 mr-1" />
                                Show details
                              </>
                            )}
                          </Button>
                          {isExpanded && (
                            <div className="mt-2 p-2 rounded bg-muted/50 font-mono text-xs text-muted-foreground break-all">
                              {i.message}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0 flex items-center gap-1" title={timeLabel}>
                      <Clock className="w-3 h-3" />
                      <span className="cursor-help">{timeLabel}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {items.length === limit ? (
            <div className="pt-2">
              <Button variant="secondary" size="sm" className="w-full" onClick={() => setLimit((l) => l + 200)}>
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}
