import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Clock, RefreshCw, Sparkles, Target } from 'lucide-react';
import { getActivity, getAgents, getProjectMission, type ActivityItem, type Agent } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/datetime';
import { useClawdOffice } from '@/lib/store';
import { hasSupabase, subscribeToProjectRealtime } from '@/lib/supabase';
import { supabase } from '@/integrations/supabase/client';
import { generateActivitySummary } from '@/lib/activity-summary';
import { toast } from 'sonner';
import { TaskOutputPreview } from '@/components/activity/TaskOutputPreview';

// Build agent lookup map
type AgentLookup = Map<string, { name: string; emoji: string }>;

function buildAgentLookup(agents: Agent[]): AgentLookup {
  const map = new Map<string, { name: string; emoji: string }>();
  for (const agent of agents) {
    // The actor_agent_key in activities is usually just the agent_key
    map.set(agent.id, { name: agent.name, emoji: agent.avatar || '🤖' });
  }
  return map;
}

function resolveAgent(authorKey: string | undefined, lookup: AgentLookup): { name: string; emoji: string } {
  if (!authorKey) return { name: 'System', emoji: '⚙️' };
  
  // Handle "agent:project:key" format
  if (authorKey.startsWith('agent:')) {
    const parts = authorKey.split(':');
    const key = parts[parts.length - 1];
    const found = lookup.get(key) || lookup.get(authorKey);
    if (found) return found;
    // Capitalize the key as fallback
    return { name: key.charAt(0).toUpperCase() + key.slice(1), emoji: '🤖' };
  }
  
  // Special cases
  if (authorKey === 'ui' || authorKey === 'dashboard') {
    return { name: 'You', emoji: '👤' };
  }
  
  // Direct lookup
  const found = lookup.get(authorKey);
  if (found) return found;
  
  return { name: authorKey, emoji: '🤖' };
}

export function ActivityPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [limit, setLimit] = useState(75);
  const [missionText, setMissionText] = useState<string>('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [now, setNow] = useState(() => new Date());

  // Task preview state
  const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const { selectedProjectId } = useClawdOffice();
  const refreshDebounceRef = useRef<number | null>(null);
  const summarizingIdsRef = useRef<Set<string>>(new Set());

  // Update "now" every minute for relative times
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const agentLookup = useMemo(() => buildAgentLookup(agents), [agents]);

  const refresh = async (showSpinner = true) => {
    if (showSpinner) setIsRefreshing(true);
    setLoadError(null);
    try {
      const [act, agentList, missionDoc] = await Promise.all([getActivity(limit), getAgents(), getProjectMission()]);
      setItems(act);
      setAgents(agentList);
      setMissionText(missionDoc?.content || '');
      setItems(act);
      setAgents(agentList);

      // Never block the UI on AI summarization—render immediately with fallbacks,
      // then fill summaries in the background.
      setIsLoading(false);

      const needsSummary = act.filter((i) => !i.summary && !summarizingIdsRef.current.has(i.hash));
      if (needsSummary.length > 0) {
        void generateSummaries(needsSummary);
      }
    } catch (e: any) {
      console.error('Activity refresh failed', e);
      setLoadError(String(e?.message || e));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const generateSummaries = async (activitiesToSummarize: ActivityItem[]) => {
    if (activitiesToSummarize.length === 0) return;

    setIsSummarizing(true);
    try {
      // Batch in groups of 20
      const batches: ActivityItem[][] = [];
      for (let i = 0; i < activitiesToSummarize.length; i += 20) {
        batches.push(activitiesToSummarize.slice(i, i + 20));
      }

      for (const batch of batches) {
        const batchIds = batch.map((a) => a.hash);
        batchIds.forEach((id) => summarizingIdsRef.current.add(id));

        const payload = batch.map((a) => ({
          // ActivityItem.hash is the canonical id for the feed (Supabase activities.id when present)
          id: a.hash,
          type: a.type || 'activity',
          message: a.message || '',
          actor: a.author,
        }));

        const { data, error } = await supabase.functions.invoke('summarize-activity', {
          body: { activities: payload, persist: true },
        });

        if (error) {
          console.error('Summarize error:', error);
          // Allow retry on next refresh.
          batchIds.forEach((id) => summarizingIdsRef.current.delete(id));
          continue;
        }

        if (data?.summaries) {
          // Update local state with new summaries
          setItems((prev) =>
            prev.map((item) => {
              if (data.summaries[item.hash]) {
                return { ...item, summary: data.summaries[item.hash] };
              }
              return item;
            })
          );
        }
      }
    } catch (e: any) {
      console.error('Summary generation failed:', e);
      // Allow retry on next refresh.
      activitiesToSummarize.forEach((a) => summarizingIdsRef.current.delete(a.hash));
      if (e?.message?.includes('429')) {
        toast.error('Rate limit reached. Using fallback summaries.');
      }
    } finally {
      setIsSummarizing(false);
    }
  };

  useEffect(() => {
    void refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  // Supabase realtime subscription
  useEffect(() => {
    if (!hasSupabase()) return;
    if (!selectedProjectId) return;

    const scheduleRefresh = () => {
      if (refreshDebounceRef.current) window.clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = window.setTimeout(() => {
        refreshDebounceRef.current = null;
        void refresh(false);
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

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) => {
      const summary = i.summary || generateActivitySummary(i.type || '', i.message || '');
      const agent = resolveAgent(i.author, agentLookup);
      const hay = `${summary}\n${agent.name}\n${i.message || ''}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [items, search, agentLookup]);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="text-sm font-semibold">Activity</div>
          <div className="text-xs text-muted-foreground">What's been happening</div>
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-3 rounded-lg border border-border bg-card">
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2">
            Activity
            {isSummarizing && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3 animate-pulse" />
                Summarizing...
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">What's been happening</div>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 w-[200px] text-xs"
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => refresh()}
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
          {/* Mission Banner */}
          {missionText && (
            <div className="mb-3 p-3 rounded-lg border border-accent/20 bg-accent/5 flex items-center gap-2">
              <Target className="w-4 h-4 text-accent-foreground shrink-0" />
              <span className="text-sm font-medium">{missionText}</span>
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              No activity yet.
            </div>
          ) : (
            filtered.map((i) => {
              // Use stored summary or generate client-side fallback
              const summary = i.summary || generateActivitySummary(i.type || '', i.message || '');
              const agent = resolveAgent(i.author, agentLookup);
              const relativeTime = formatRelativeTime(i.date, now);
              const hasTask = Boolean(i.taskId);

              return (
                <div
                  key={i.hash}
                  onClick={() => {
                    if (hasTask && i.taskId) {
                      setPreviewTaskId(i.taskId);
                      setShowPreview(true);
                    }
                  }}
                  className={cn(
                    'p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors',
                    hasTask && 'cursor-pointer'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-medium flex-1">{summary}</div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-xs text-muted-foreground flex items-center gap-1" title={new Date(i.date).toLocaleString()}>
                        <Clock className="w-3 h-3" />
                        <span>{relativeTime}</span>
                      </div>
                      {hasTask && (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <span>{agent.emoji}</span>
                    <span>{agent.name}</span>
                  </div>
                </div>
              );
            })
          )}

          {items.length === limit ? (
            <div className="pt-2">
              <Button variant="secondary" size="sm" className="w-full" onClick={() => setLimit((l) => l + 100)}>
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      {/* Task Output Preview Sheet */}
      {previewTaskId && (
        <TaskOutputPreview
          taskId={previewTaskId}
          open={showPreview}
          onOpenChange={setShowPreview}
          onViewFullTask={() => {
            setShowPreview(false);
            navigate('/tasks');
          }}
        />
      )}
    </div>
  );
}
