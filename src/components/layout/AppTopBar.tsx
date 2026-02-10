import { useEffect, useMemo, useState } from 'react';
import { Menu, Plus, Bell, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useClawdOffice } from '@/lib/store';
import { 
  createProject, 
  getGlobalActivity, 
  getProjects, 
  getAgents,
  getTasks,
  type GlobalActivityItem, 
  type Project 
} from '@/lib/api';
import { setSelectedProjectId as persistSelectedProjectId } from '@/lib/project';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { ConnectionStatus } from '@/components/ConnectionStatus';

interface AppTopBarProps {
  onMenuClick?: () => void;
}

export function AppTopBar({ onMenuClick }: AppTopBarProps) {
  const navigate = useNavigate();
  const { 
    selectedProjectId,
    setSelectedProjectId,
    setFocusCronJobId,
  } = useClawdOffice();

  const [projects, setProjects] = useState<Project[]>([]);
  const [agentCount, setAgentCount] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [globalActivity, setGlobalActivity] = useState<GlobalActivityItem[]>([]);
  const [globalActivityOpen, setGlobalActivityOpen] = useState(false);


  useEffect(() => {
    getProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    persistSelectedProjectId(selectedProjectId);
  }, [selectedProjectId]);

  // Load stats
  useEffect(() => {
    const loadStats = async () => {
      try {
        const [agents, tasks] = await Promise.all([getAgents(), getTasks()]);
        setAgentCount(agents.length);
        setTaskCount(tasks.filter(t => t.status !== 'done').length);
      } catch {
        // fail soft
      }
    };
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [selectedProjectId]);

  // Load global activity
  useEffect(() => {
    const loadActivity = async () => {
      try {
        const items = await getGlobalActivity(10);
        setGlobalActivity(items);
      } catch {
        setGlobalActivity([]);
      }
    };
    loadActivity();
    const interval = setInterval(loadActivity, 30000);
    return () => clearInterval(interval);
  }, []);

  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId) || projects[0];
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (!projects.length) return;
    if (!selectedProjectId || !projects.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId, setSelectedProjectId]);

  const isFrontOffice = selectedProject?.tag === 'system' || selectedProjectId === 'front-office';

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

  const handleActivityClick = (a: GlobalActivityItem) => {
    setProjects((prev) => {
      if (prev.some((p) => p.id === a.projectId)) return prev;
      return [...prev, { id: a.projectId, name: a.projectName || a.projectId, workspace: '' }];
    });
    setSelectedProjectId(a.projectId);

    if (a.type === 'cron' || a.type === 'cron_run_requested') {
      const match = a.message?.match(/Requested cron run:\s*(.+)$/i);
      if (match?.[1]) setFocusCronJobId(match[1].trim());
      navigate('/schedule');
      setGlobalActivityOpen(false);
      return;
    }

    navigate('/activity');
    setGlobalActivityOpen(false);
  };

  return (
    <header className={cn(
      "h-14 border-b border-border bg-background flex items-center justify-between px-4",
      isFrontOffice && "bg-amber-50 border-b-amber-200"
    )}>
      {/* Left section */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
        >
          <Menu className="w-5 h-5" />
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-xl">🦞</span>
          <span className="font-semibold hidden sm:inline">ClawdOS</span>
          <ConnectionStatus />
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* Compact stats */}
        <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
          <span>{agentCount} agents</span>
          <span>·</span>
          <span>{taskCount} open</span>
        </div>

        {/* Activity bell */}
        <Popover open={globalActivityOpen} onOpenChange={setGlobalActivityOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 relative">
              <Bell className="w-4 h-4" />
              {globalActivity.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="px-4 py-3 border-b border-border">
              <div className="text-sm font-medium">Recent activity</div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {globalActivity.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No recent activity.</div>
              ) : (
                <div className="divide-y divide-border">
                  {globalActivity.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="w-full text-left p-3 hover:bg-muted/40 transition-colors"
                      onClick={() => handleActivityClick(a)}
                    >
                      <div className="text-xs text-muted-foreground truncate">{a.projectName}</div>
                      <div className="text-sm font-medium truncate">{a.message}</div>
                      <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatWhen(a.createdAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Project selector */}
        {selectedProject?.tag === 'system' && (
          <Badge variant="secondary" className="hidden sm:inline-flex border border-border/60">
            Front Office
          </Badge>
        )}
        <select
          className="h-9 rounded-md bg-secondary border border-border px-3 text-sm min-w-[140px]"
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
          size="icon"
          className="h-9 w-9"
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
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
