import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Bot, LayoutGrid, Settings2, Bell, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useClawdOffice, type MainTab } from '@/lib/store';
import { createProject, getGlobalActivity, getProjects, getStatus, restartSystem, type GlobalActivityItem, type Project } from '@/lib/api';
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
  } = useClawdOffice();

  const [projects, setProjects] = useState<Project[]>([]);

  const [globalActivity, setGlobalActivity] = useState<GlobalActivityItem[]>([]);
  const [globalActivityUpdatedAt, setGlobalActivityUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('clawdos.project', selectedProjectId);
    } catch {
      // ignore
    }
  }, [selectedProjectId]);

  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId) || projects[0];
  }, [projects, selectedProjectId]);

  const fetchStatus = async () => {
    setIsRefreshing(true);
    try {
      const newStatus = await getStatus();
      setStatus(newStatus);
      setLastRefresh(new Date());
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      await restartSystem();
      await fetchStatus();
    } finally {
      setIsRestarting(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const refreshGlobalActivity = async () => {
    try {
      const items = await getGlobalActivity(10);
      setGlobalActivity(items);
      setGlobalActivityUpdatedAt(new Date());
    } catch {
      // fail soft
      setGlobalActivity([]);
    }
  };

  useEffect(() => {
    refreshGlobalActivity();
    const interval = setInterval(refreshGlobalActivity, 30_000);
    return () => clearInterval(interval);
  }, []);

  const lastSeenKey = 'clawdos.globalActivity.lastSeenAt';
  const lastSeenAtIso = (() => {
    try {
      return localStorage.getItem(lastSeenKey) || '';
    } catch {
      return '';
    }
  })();

  const unreadCount = (() => {
    const last = Date.parse(lastSeenAtIso);
    if (Number.isNaN(last)) return globalActivity.length;
    return globalActivity.filter((a) => {
      const t = Date.parse(a.createdAt);
      return !Number.isNaN(t) && t > last;
    }).length;
  })();

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
      <div className="h-14 border-b border-border bg-background flex items-center justify-between px-6">
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
            onOpenChange={(open) => {
              if (!open) return;
              try {
                const newest = globalActivity[0]?.createdAt || new Date().toISOString();
                localStorage.setItem(lastSeenKey, newest);
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
                title={globalActivityUpdatedAt ? `Notifications (updated ${globalActivityUpdatedAt.toLocaleTimeString()})` : 'Notifications'}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] leading-[18px] text-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-96 p-0">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="text-sm font-medium">Recent activity</div>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={refreshGlobalActivity}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                {globalActivity.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No recent activity.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {globalActivity.map((a) => (
                      <div key={a.id} className="p-4 hover:bg-muted/40">
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
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
              await createProject({ id, name });
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
                {status.activeSessions} active
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
                disabled={isRestarting}
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
                <AlertDialogAction onClick={handleRestart} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
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
                {status.activeSessions} active
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
