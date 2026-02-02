import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, RotateCcw, Bot, LayoutGrid, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClawdOffice, type MainTab } from '@/lib/store';
import { getProjects, getStatus, restartSystem, type Project } from '@/lib/api';
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

  return (
    <div className="sticky top-0 z-50">
      {/* View Mode Toggle Bar */}
      <div className="h-12 border-b border-border bg-background flex items-center justify-center px-4">
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

      {/* Main Navigation Bar */}
      <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4">
        {/* Left: Logo and Nav */}
        <div className="flex items-center gap-3 md:gap-6 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🦞</span>
            <span className="font-semibold text-lg">ClawdOS</span>
            <span className={cn(
              "status-dot ml-1",
              status?.online ? "status-dot-online" : "status-dot-offline"
            )} title={status?.online ? 'Connected' : 'Offline'} />
          </div>

          {/* Project selector (global) */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Project</span>
            <select
              className="h-9 rounded-md bg-background border border-border px-2 text-sm max-w-[220px]"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              title={selectedProject?.workspace}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Main Navigation - Only show in Manage mode */}
          {viewMode === 'manage' && (
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
          )}
        </div>

        {/* Right: Status and Actions */}
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
    </div>
  );
}
