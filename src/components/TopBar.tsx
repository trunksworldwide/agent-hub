import { useEffect } from 'react';
import { RefreshCw, RotateCcw, Bot, LayoutGrid, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClawdOffice, type MainTab, type ViewMode } from '@/lib/store';
import { getStatus, restartSystem } from '@/lib/api';
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
    <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 sticky top-0 z-50">
      {/* Left: Logo, View Toggle, and Nav */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Bot className="w-6 h-6 text-primary" />
          <span className="font-semibold text-lg">ClawdOffice</span>
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
        
        {/* Status Badge */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/50 text-sm">
          <span className={cn(
            "status-dot",
            status?.online ? "status-dot-online" : "status-dot-offline"
          )} />
          <span className="text-muted-foreground">
            {status?.online ? 'Connected' : 'Offline'}
          </span>
          {status?.port && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <span className="text-muted-foreground">Port {status.port}</span>
            </>
          )}
          {status?.environment && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-muted text-muted-foreground">
              {status.environment}
            </span>
          )}
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
          size="sm"
          onClick={fetchStatus}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
          Refresh
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
  );
}
