import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckSquare, Bot, FileText, Clock, Settings, Plus, Bell } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useClawdOffice } from '@/lib/store';
import { 
  createProject, 
  getGlobalActivity, 
  getProjects, 
  type GlobalActivityItem, 
  type Project 
} from '@/lib/api';
import { setSelectedProjectId as persistSelectedProjectId } from '@/lib/project';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/brief', label: 'Brief', icon: FileText },
  { to: '/schedule', label: 'Schedule', icon: Clock },
  { to: '/settings', label: 'Settings', icon: Settings },
];

interface AppSidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export function AppSidebar({ className, onNavigate }: AppSidebarProps) {
  const navigate = useNavigate();
  const { 
    selectedProjectId,
    setSelectedProjectId,
    setFocusCronJobId,
  } = useClawdOffice();

  const [projects, setProjects] = useState<Project[]>([]);
  const [globalActivity, setGlobalActivity] = useState<GlobalActivityItem[]>([]);
  const [globalActivityOpen, setGlobalActivityOpen] = useState(false);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    persistSelectedProjectId(selectedProjectId);
  }, [selectedProjectId]);

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
    <aside className={cn(
      'w-56 border-r border-border bg-background flex flex-col h-full',
      className
    )}>
      {/* Project selector at top */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <select
            className="flex-1 h-9 rounded-md bg-secondary border border-border px-3 text-sm font-medium truncate"
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
            className="h-9 w-9 shrink-0"
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
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            activeClassName="bg-accent text-accent-foreground"
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Activity bell at bottom */}
      <div className="p-3 border-t border-border">
        <Popover open={globalActivityOpen} onOpenChange={setGlobalActivityOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 h-10 relative">
              <Bell className="w-4 h-4" />
              <span className="text-sm">Notifications</span>
              {globalActivity.length > 0 && (
                <span className="absolute top-2 left-5 w-2 h-2 rounded-full bg-primary" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" side="top" className="w-80 p-0">
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
      </div>
    </aside>
  );
}
