import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Bot, LayoutGrid, Settings2, Bell, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useClawdOffice, type MainTab } from '@/lib/store';
import { createProject, getGlobalActivity, getProjects, getStatus, restartSystem, type GlobalActivityItem, type Project } from '@/lib/api';
import { setSelectedProjectId as persistSelectedProjectId } from '@/lib/project';
import { formatTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const navTabs: { id: MainTab; label: string; icon: string }[] = [
  { id: 'agents', label: 'Agents', icon: '🤖' },
  { id: 'skills', label: 'Skills', icon: '🛠️' },
  { id: 'channels', label: 'Channels', icon: '📡' },
  { id: 'cron', label: 'Cron', icon: '⏰' },
  { id: 'config', label: 'Config', icon: '⚙️' },
];

export function TopBar() {
  const { 
    selectedProjectId,
    setSelectedProjectId,
    activeMainTab, 
    setActiveMainTab, 
    status, 
    setStatus,
    isRefreshing,
    setIsRefreshing,
    isRestarting,
    setIsRestarting,
    setLastRefresh,
    viewMode,
    setViewMode,
    setFocusCronJobId,
  } = useClawdOffice();

  const [projects, setProjects] = useState<Project[]>([]);

  const [globalActivity, setGlobalActivity] = useState<GlobalActivityItem[]>([]);
  const [globalActivityUpdatedAt, setGlobalActivityUpdatedAt] = useState<Date | null>(null);
  const [globalActivityLimit, setGlobalActivityLimit] = useState<number>(10);
  const [globalActivityOpen, setGlobalActivityOpen] = useState(false);

  const globalActivityTypeKey = 'clawdos.globalActivity.type';
  const [globalActivityType, setGlobalActivityType] = useState<string>(() => {
    try {
      return localStorage.getItem(globalActivityTypeKey) || 'all';
    } catch {
      return 'all';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(globalActivityTypeKey, globalActivityType);
    } catch {
      // ignore
    }
  }, [globalActivityType]);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    persistSelectedProjectId(selectedProjectId);
  }, [selectedProjectId]);

  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId) || projects[0];
  }, [projects, selectedProjectId]);

  const isFrontOffice = selectedProject?.tag === 'system' || selectedProjectId === 'front-office';

  const parseCronJobIdFromActivity = (a: GlobalActivityItem): string | null => {
    if (!a?.message) return null;

    // Server currently logs:
    // - "Requested cron run: <jobId>"
    // (and other messages may include the raw jobId as a token).
    const m = a.message.match(/Requested cron run:\s*(.+)$/i);
    if (m?.[1]) return m[1].trim();

    // Fallback: if the message is just the job id, treat it as such.
    // (Useful if we later decide to log only the id.)
    if (/^[a-zA-Z0-9._:-]{6,}$/.test(a.message.trim())) return a.message.trim();

    return null;
  };

  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const newStatus = await getStatus();
      setStatus(newStatus);
      setLastRefresh(new Date());
    } catch (e) {
      // Fail soft: in Supabase-only builds we may not have a Control API.
      setStatus({
        online: false,
        activeSessions: null,
        lastUpdated: new Date().toISOString(),
        port: 0,
        environment: 'unknown',
      });
      setLastRefresh(new Date());
      console.warn('Failed to fetch status:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const canRestart = Boolean(import.meta.env.VITE_API_BASE_URL);

  const handleRestart = async () => {
    if (!canRestart) return;

    setIsRestarting(true);
    try {
      await restartSystem();
      await fetchStatus();
    } catch (e) {
      console.warn('Restart failed:', e);
    } finally {
      setIsRestarting(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const refreshGlobalActivity = async (limit = globalActivityLimit) => {
    try {
      const clamped = Math.max(1, Math.min(200, limit));
      const items = await getGlobalActivity(clamped);
      setGlobalActivity(items);
      setGlobalActivityUpdatedAt(new Date());
    } catch {
      // fail soft
      setGlobalActivity([]);
    }
  };

  useEffect(() => {
    refreshGlobalActivity();
    const interval = setInterval(() => refreshGlobalActivity(), 30_000);
    return () => clearInterval(interval);
  }, [globalActivityLimit]);

  const lastSeenKey = 'clawdos.globalActivity.lastSeenAt';
  const [lastSeenAtIso, setLastSeenAtIso] = useState<string>(() => {
    try {
      return localStorage.getItem(lastSeenKey) || '';
    } catch {
      return '';
    }
  });

  const unreadCount = (() => {
    const last = Date.parse(lastSeenAtIso);
    if (Number.isNaN(last)) return globalActivity.length;
    return globalActivity.filter((a) => {
      const t = Date.parse(a.createdAt);
      return !Number.isNaN(t) && t > last;
    }).length;
  })();

  const globalActivityTypes = useMemo(() => {
    const s = new Set<string>();
    for (const a of globalActivity) {
      if (a?.type) s.add(a.type);
    }
    return Array.from(s).sort();
  }, [globalActivity]);

  const visibleGlobalActivity = useMemo(() => {
    if (globalActivityType === 'all') return globalActivity;
    return globalActivity.filter((a) => a.type === globalActivityType);
  }, [globalActivity, globalActivityType]);

  const formatWhen = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-US', {
      hour12: true,
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="sticky top-0 z-50">
      {/* Main Header Bar - Logo, View Toggle, Project Selector */}
      <div
        className={cn(
          "h-14 border-b border-border bg-background flex items-center justify-between px-6",
          isFrontOffice && "bg-amber-50/40 dark:bg-amber-950/10 border-b-amber-300/40"
        )}
      >
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🦞</span>
            <span className="font-semibold text-lg">ClawdOS</span>
            <span className={cn(
              "status-dot ml-1",
              status?.online ? "status-dot-online" : "status-dot-offline"
            )} title={status?.online ? 'Connected' : 'Offline'} />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center p-1 rounded-lg bg-secondary/50">
            <button
              onClick={() => setViewMode('dashboard')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                viewMode === 'dashboard' 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
              Dashboard
            </button>
            <button
              onClick={() => setViewMode('manage')}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                viewMode === 'manage' 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Settings2 className="w-4 h-4" />
              Manage
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Popover
            open={globalActivityOpen}
            onOpenChange={(open) => {
              setGlobalActivityOpen(open);
              if (!open) return;
              try {
                const newest = globalActivity[0]?.createdAt || new Date().toISOString();
                localStorage.setItem(lastSeenKey, newest);
                setLastSeenAtIso(newest);
              } catch {
                // ignore
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 relative"
                title={globalActivityUpdatedAt ? `Notifications (updated ${formatTime(globalActivityUpdatedAt)})` : 'Notifications'}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-[18px] text-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                <div className="text-sm font-medium">Recent activity</div>
                <div className="flex items-center gap-2">
                  <select
                    className="h-7 rounded-md bg-secondary border border-border px-2 text-xs"
                    value={globalActivityType}
                    onChange={(e) => setGlobalActivityType(e.target.value)}
                    title="Filter by type"
                  >
                    <option value="all">All types</option>
                    {globalActivityTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => refreshGlobalActivity()}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                {visibleGlobalActivity.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No recent activity for this filter.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {visibleGlobalActivity.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="w-full text-left p-4 hover:bg-muted/40 transition-colors"
                        onClick={() => {
                          // Always switch to the activity's project first.
                          // If the projects list is stale (or load failed), ensure the clicked project exists
                          // so the selector doesn't end up with an unknown value.
                          setProjects((prev) => {
                            if (prev.some((p) => p.id === a.projectId)) return prev;
                            return [
                              ...prev,
                              {
                                id: a.projectId,
                                name: a.projectName || a.projectId,
                                workspace: '',
                              },
                            ];
                          });
                          setSelectedProjectId(a.projectId);

                          // Deep-link: cron activities should take you straight to Manage → Cron.
                          if (a.type === 'cron' || a.type === 'cron_run_requested') {
                            const jobId = parseCronJobIdFromActivity(a);
                            if (jobId) setFocusCronJobId(jobId);
                            setViewMode('manage');
                            setActiveMainTab('cron');
                            setGlobalActivityOpen(false);
                            return;
                          }

                          // Default: bounce back to Dashboard for everything else.
                          setViewMode('dashboard');
                          setGlobalActivityOpen(false);
                        }}
                        title={`Switch to ${a.projectName}`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-lg">
                            {a.type === 'brain_doc_updated'
                              ? '🧠'
                              : a.type === 'cron_run_requested'
                              ? '▶️'
                              : a.type === 'task_created'
                              ? '🆕'
                              : a.type === 'task_moved' || a.type === 'task_updated'
                              ? '🗂️'
                              : a.type === 'build_update'
                              ? '🔧'
                              : a.type === 'agent_created'
                              ? '🤖'
                              : a.type === 'project_created'
                              ? '📁'
                              : '✅'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-muted-foreground truncate">{a.projectName}</div>
                            <div className="text-sm font-medium truncate">{a.message}</div>
                            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>{formatWhen(a.createdAt)}</span>
                              {a.actor ? <span className="truncate">· {a.actor}</span> : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {globalActivity.length >= globalActivityLimit && (
                <div className="px-3 py-2 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full justify-center"
                    onClick={async () => {
                      const next = Math.max(1, Math.min(200, globalActivityLimit + 10));
                      setGlobalActivityLimit(next);
                      await refreshGlobalActivity(next);
                    }}
                    title={`Load more (currently showing ${globalActivityLimit})`}
                  >
                    Load more
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <span className="text-sm text-muted-foreground">Project</span>
          {selectedProject?.tag === 'system' && (
            <Badge variant="secondary" className="border border-border/60">
              Front Office
            </Badge>
          )}
          <select
            className="h-9 rounded-md bg-secondary border border-border px-3 text-sm min-w-[180px]"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            title={selectedProject?.workspace}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.tag === 'system' ? `★ ${p.name}` : p.name}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={async () => {
              const id = (prompt('New project id (slug)') || '').trim();
              if (!id) return;
              const name = (prompt('New project name') || id).trim();
              const res = await createProject({ id, name });
              if (!res?.ok) {
                alert(`Failed to create project: ${res?.error || 'unknown_error'}`);
                return;
              }
              window.location.reload();
            }}
            title="New project"
          >
            +
          </Button>
        </div>
      </div>

      {/* Main Navigation Bar - Only show in Manage mode */}
      {viewMode === 'manage' && (
        <header className="h-12 border-b border-border bg-card/30 flex items-center justify-between px-6">
          <nav className="flex items-center gap-1">
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveMainTab(tab.id)}
                className={cn(
                  "nav-tab flex items-center gap-2",
                  activeMainTab === tab.id && "nav-tab-active"
                )}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {status && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Bot className="w-4 h-4" />
                {status.activeSessions ?? '—'} active
              </span>
            </div>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchStatus}
            disabled={isRefreshing}
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={isRestarting || !canRestart}
                title={!canRestart ? 'Restart requires VITE_API_BASE_URL (Control API) configured.' : 'Restart runtime'}
              >
                <RotateCcw className={cn("w-4 h-4", isRestarting && "animate-spin")} />
                Restart
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restart ClawdOffice?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will restart the agent runtime. All active sessions will be interrupted. 
                  The system should be back online within a few seconds.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleRestart}
                  disabled={!canRestart}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Restart
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
            </AlertDialog>
          </div>
        </header>
      )}

      {/* Dashboard mode: minimal status bar */}
      {viewMode === 'dashboard' && (
        <header className="h-10 border-b border-border bg-card/30 flex items-center justify-end px-6">
          <div className="flex items-center gap-3">
            {status && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <Bot className="w-4 h-4" />
                {status.activeSessions ?? '—'} active
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchStatus}
              disabled={isRefreshing}
              title="Refresh"
              className="h-8 w-8"
            >
              <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </header>
      )}
    </div>
  );
}
