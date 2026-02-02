import { useEffect, useMemo, useState } from 'react';
import { createTask, getActivity, getAgents, getCronJobs, getTasks, updateTask, type ActivityItem, type Agent, type CronJob, type Task, type TaskStatus } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Clock, PanelLeftClose, PanelLeft, Plus } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface FeedItem {
  id: string;
  type: 'cron' | 'commit' | 'session' | 'task_created' | 'task_updated';
  title: string;
  subtitle?: string;
  createdAt: string;
}

export function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [agentPanelCollapsed, setAgentPanelCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const refresh = async () => {
    const [a, t, c, act] = await Promise.all([
      getAgents(),
      getTasks(),
      getCronJobs(),
      getActivity(),
    ]);
    setAgents(a);
    setTasks(t);
    setCronJobs(c);
    setActivity(act);
  };

  useEffect(() => {
    refresh();

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const poll = setInterval(refresh, 5000);

    return () => {
      clearInterval(timer);
      clearInterval(poll);
    };
  }, []);

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];

    for (const j of cronJobs.slice(0, 10)) {
      items.push({
        id: `cron-${j.id}`,
        type: 'cron',
        title: `cron: ${j.name}`,
        subtitle: j.schedule,
        createdAt: j.nextRun || new Date().toISOString(),
      });
    }

    for (const c of activity.slice(0, 20)) {
      items.push({
        id: `commit-${c.hash}`,
        type: 'commit',
        title: c.message,
        subtitle: c.author,
        createdAt: c.date,
      });
    }

    return items
      .filter(Boolean)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 25);
  }, [cronJobs, activity]);

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
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    }).toUpperCase();
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
                  className="flex items-center gap-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer p-3"
                >
                  <span className="text-xl">{agent.avatar}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">{agent.name}</span>
                      <span className={cn("badge-status text-[10px]", getStatusBadge(agent.status))}>
                        {agent.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
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
                className={cn(
                  "flex items-center gap-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer",
                  agentPanelCollapsed ? "p-2 justify-center" : "p-3"
                )}
                title={agentPanelCollapsed ? `${agent.name} - ${agent.status}` : undefined}
              >
                <span className={cn("text-xl", agentPanelCollapsed && "text-lg")}>{agent.avatar}</span>
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
      <div className="flex-1 flex flex-col overflow-y-auto">
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
            
            {/* Agent Quick Stats */}
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
          </div>

          {/* Feed Items - Vertical Stack */}
          <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto scrollbar-always">
            {feed.length === 0 ? (
              <div className="text-sm text-muted-foreground">No activity yet.</div>
            ) : (
              feed.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">
                      {item.type === 'session' ? '💬' : item.type === 'cron' ? '⏰' : '✅'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      {item.subtitle && (
                        <p className="text-xs text-muted-foreground truncate mt-1">{item.subtitle}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {item.createdAt}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
