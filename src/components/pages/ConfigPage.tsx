import { useEffect } from 'react';
import { RefreshCw, RotateCcw, Server, Cpu, HardDrive, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HealthPanel } from '@/components/settings/HealthPanel';
import { useClawdOffice } from '@/lib/store';
import { getStatus } from '@/lib/api';
import { testControlApi } from '@/lib/control-api';
import { useToast } from '@/hooks/use-toast';
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

export function ConfigPage() {
  const { 
    status, 
    setStatus, 
    isRestarting, 
    setIsRestarting,
    isRefreshing,
    setIsRefreshing,
    setLastRefresh,
    controlApiUrl,
    executorCheck,
    setExecutorCheck,
  } = useClawdOffice();
  const { toast } = useToast();

  // Auto-fetch status + executor check on mount
  useEffect(() => {
    getStatus()
      .then((s) => {
        setStatus(s);
        setLastRefresh(new Date());
      })
      .catch(() => {});

    if (controlApiUrl) {
      testControlApi(controlApiUrl)
        .then(setExecutorCheck)
        .catch(() => setExecutorCheck(null));
    }
  }, [controlApiUrl]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const newStatus = await getStatus();
      setStatus(newStatus);
      setLastRefresh(new Date());
      if (controlApiUrl) {
        try {
          const check = await testControlApi(controlApiUrl);
          setExecutorCheck(check);
        } catch {
          setExecutorCheck(null);
        }
      }
      toast({
        title: 'Refreshed',
        description: 'Status updated.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      const { restartSystem } = await import('@/lib/api');
      await restartSystem();
      toast({
        title: 'Restarted',
        description: 'System is restarting...',
      });
      await handleRefresh();
    } finally {
      setIsRestarting(false);
    }
  };

  const isOnline = executorCheck
    ? Object.values(executorCheck.checks).every((c) => c.ok)
    : status?.online ?? false;

  const configItems = [
    { label: 'Environment', value: status?.environment || 'supabase', icon: Server },
    { label: 'OpenClaw', value: executorCheck ? `v${executorCheck.version}` : 'Unknown', icon: Package },
    { label: 'Active Sessions', value: status?.activeSessions?.toString() || '—', icon: Cpu },
    {
      label: 'Status',
      value: isOnline ? 'Online' : 'Offline',
      icon: HardDrive,
      color: isOnline ? 'text-primary' : 'text-destructive',
    },
  ];

  return (
    <div className="flex-1 p-6 overflow-auto scrollbar-thin">
      <div className="max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Configuration</h1>
          <p className="text-muted-foreground">
            System configuration and status overview.
          </p>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {configItems.map((item) => (
            <div
              key={item.label}
              className="p-4 rounded-lg border border-border bg-card"
            >
              <div className="flex items-center gap-3 mb-2">
                <item.icon className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{item.label}</span>
              </div>
              <p className={`text-lg font-semibold ${'color' in item && item.color ? item.color : ''}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* Connectivity / Health */}
        <div className="mb-8">
          <HealthPanel />
        </div>

        {/* Actions */}
        <div className="p-4 rounded-lg border border-border bg-card">
          <h2 className="text-lg font-semibold mb-4">Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh Status
            </Button>
            
            <Button
              variant="outline"
              onClick={() => {
                toast({
                  title: 'Coming soon',
                  description: 'Update OpenClaw functionality will be available soon.',
                });
              }}
              className="gap-2"
            >
              <span>🦀</span>
              Update OpenClaw
            </Button>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={isRestarting}
                  className="gap-2"
                >
                  <RotateCcw className={`w-4 h-4 ${isRestarting ? 'animate-spin' : ''}`} />
                  Restart System
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Restart OpenClaw?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will restart the entire agent runtime. All active sessions will be 
                    interrupted and pending jobs may fail.
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
        </div>

        {/* Config Info */}
        <div className="mt-8 p-4 rounded-lg border border-dashed border-border bg-muted/20">
          <h3 className="font-medium mb-2">Configuration Files</h3>
          <p className="text-sm text-muted-foreground">
            Configuration files are managed in your OpenClaw workspace directory. 
            Edit them directly or through the agent tabs above.
          </p>
        </div>
      </div>
    </div>
  );
}
