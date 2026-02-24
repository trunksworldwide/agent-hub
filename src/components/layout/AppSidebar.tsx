import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckSquare, Bot, FileText, Clock, Settings, Plus, Bell, Brain, MessageSquare, MessagesSquare } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useClawdOffice } from '@/lib/store';
import { 
  createProject, 
  getGlobalActivity, 
  getProjects, 
  type GlobalActivityItem, 
  type Project 
} from '@/lib/api';
import { setSelectedProjectId as persistSelectedProjectId, DEFAULT_PROJECT_ID } from '@/lib/project';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
const navItemsBefore = [
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/documents', label: 'Knowledge', icon: Brain },
];

const navItemsAfter = [
  { to: '/schedule', label: 'Schedule', icon: Clock },
];

const settingsItem = { to: '/settings', label: 'Settings', icon: Settings };

interface AppSidebarProps {
  className?: string;
  onNavigate?: () => void;
}

export function AppSidebar({ className, onNavigate }: AppSidebarProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { 
    selectedProjectId,
    setSelectedProjectId,
    setFocusCronJobId,
  } = useClawdOffice();

  const [projects, setProjects] = useState<Project[]>([]);
  const [globalActivity, setGlobalActivity] = useState<GlobalActivityItem[]>([]);
  const [globalActivityOpen, setGlobalActivityOpen] = useState(false);
  
  // Create project dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newProjectId, setNewProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

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

  // Improved project defaulting logic
  useEffect(() => {
    if (!projects.length) return;
    
    // Check if current selection is valid
    const currentValid = projects.some((p) => p.id === selectedProjectId);
    if (currentValid) return;
    
    // Try to select front-office first
    const frontOffice = projects.find((p) => p.id === DEFAULT_PROJECT_ID);
    if (frontOffice) {
      setSelectedProjectId(frontOffice.id);
      return;
    }
    
    // Fall back to first available project with a warning
    const first = projects[0];
    setSelectedProjectId(first.id);
    toast({
      title: 'Project selection updated',
      description: `Selected "${first.name}" - the default project was not found.`,
    });
  }, [projects, selectedProjectId, setSelectedProjectId, toast]);

  const handleCreateProject = async () => {
    const id = newProjectId.trim();
    const name = (newProjectName.trim() || id);
    if (!id) return;
    
    setCreatingProject(true);
    try {
      const res = await createProject({ id, name });
      if (!res?.ok) {
        toast({
          title: 'Failed to create project',
          description: res?.error || 'Unknown error',
          variant: 'destructive',
        });
        return;
      }
      
      // Add new project to list and select it
      const newProject: Project = { id, name, workspace: '' };
      setProjects((prev) => [...prev, newProject]);
      setSelectedProjectId(id);
      setCreateDialogOpen(false);
      setNewProjectId('');
      setNewProjectName('');
      
      toast({ title: 'Project created', description: name });
    } finally {
      setCreatingProject(false);
    }
  };

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
          {projects.length === 0 ? (
            <div className="flex-1 h-9 rounded-md bg-secondary border border-border px-3 flex items-center">
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          ) : (
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
          )}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => setCreateDialogOpen(true)}
            title="New project"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItemsBefore.map((item) => (
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

        <NavLink
          to="/chat"
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          activeClassName="bg-accent text-accent-foreground"
        >
          <MessageSquare className="w-4 h-4" />
          <span>War Room</span>
        </NavLink>

        <NavLink
          to="/dms"
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          activeClassName="bg-accent text-accent-foreground"
        >
          <MessagesSquare className="w-4 h-4" />
          <span>DMs</span>
        </NavLink>

        {navItemsAfter.map((item) => (
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
        
        {/* Divider before Settings */}
        <div className="my-2 border-t border-border" />
        
        <NavLink
          to={settingsItem.to}
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          activeClassName="bg-accent text-accent-foreground"
        >
          <settingsItem.icon className="w-4 h-4" />
          <span>{settingsItem.label}</span>
        </NavLink>
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

      {/* Create Project Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project ID (slug)</label>
              <Input
                value={newProjectId}
                onChange={(e) => setNewProjectId(e.target.value)}
                placeholder="my-project"
                disabled={creatingProject}
              />
              <p className="text-xs text-muted-foreground">
                Used as an identifier. Lowercase letters, numbers, and hyphens only.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Name</label>
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="My Project"
                disabled={creatingProject}
              />
              <p className="text-xs text-muted-foreground">
                Display name. Defaults to ID if empty.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creatingProject}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={creatingProject || !newProjectId.trim()}
            >
              {creatingProject ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
