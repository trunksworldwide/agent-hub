import { RefreshCw, RotateCcw, Server, Database, Cpu, HardDrive, ExternalLink, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClawdOffice } from '@/lib/store';
import { restartSystem, getStatus } from '@/lib/api';
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
  } = useClawdOffice();
  const { toast } = useToast();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const newStatus = await getStatus();
      setStatus(newStatus);
      setLastRefresh(new Date());
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

  const configItems = [
    { label: 'Environment', value: status?.environment || 'local', icon: Server },
    { label: 'Port', value: status?.port?.toString() || '18789', icon: Database },
    { label: 'Active Sessions', value: status?.activeSessions?.toString() || '0', icon: Cpu },
    { label: 'Status', value: status?.online ? 'Online' : 'Offline', icon: HardDrive },
  ];

  return (
    <div className="flex-1 p-6 overflow-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto">
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
              <p className="text-lg font-semibold">{item.value}</p>
            </div>
          ))}
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
                // TODO: Implement Open Claw functionality
                toast({
                  title: 'Coming soon',
                  description: 'Open Claw functionality will be available soon.',
                });
              }}
              className="gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Open Claw
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                // TODO: Implement Update Claw functionality
                toast({
                  title: 'Coming soon',
                  description: 'Update Claw functionality will be available soon.',
                });
              }}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              Update Claw
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
                  <AlertDialogTitle>Restart ClawdOffice?</AlertDialogTitle>
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
          <p className="text-sm text-muted-foreground mb-4">
            System configuration is managed via files on the Mac mini. Edit these files 
            directly or through the agent tabs.
          </p>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">~/clawdbot/</span>
              <span>SOUL.md</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">~/clawdbot/</span>
              <span>USER.md</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">~/clawdbot/</span>
              <span>MEMORY.md</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">~/clawdbot/memory/</span>
              <span>YYYY-MM-DD.md</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
