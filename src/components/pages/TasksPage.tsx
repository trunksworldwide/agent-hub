import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAgents, getTasks, updateTask, type Agent, type Task, type TaskStatus } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useClawdOffice } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { NewTaskDialog } from '@/components/dialogs/NewTaskDialog';

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'inbox', label: 'Inbox', color: 'bg-muted' },
  { id: 'assigned', label: 'Assigned', color: 'bg-blue-500/20' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-yellow-500/20' },
  { id: 'review', label: 'Review', color: 'bg-purple-500/20' },
  { id: 'done', label: 'Done', color: 'bg-green-500/20' },
  { id: 'blocked', label: 'Blocked', color: 'bg-red-500/20' },
];

export function TasksPage() {
  const { selectedProjectId } = useClawdOffice();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      const [t, a] = await Promise.all([getTasks(), getAgents()]);
      setTasks(t);
      setAgents(a);
    } catch (e) {
      console.error('Failed to load tasks:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [selectedProjectId]);

  const tasksByColumn = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      inbox: [],
      assigned: [],
      in_progress: [],
      review: [],
      done: [],
      blocked: [],
    };
    for (const task of tasks) {
      const col = map[task.status];
      if (col) col.push(task);
    }
    return map;
  }, [tasks]);

  const agentByKey = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents) m.set(a.id, a);
    return m;
  }, [agents]);

  const handleMoveTask = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await updateTask(taskId, { status: newStatus });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );
    } catch (e) {
      console.error('Failed to move task:', e);
      toast({
        title: 'Failed to move task',
        description: String(e),
        variant: 'destructive',
      });
    }
  };

  const handleReassignTask = async (taskId: string, assigneeAgentKey: string | undefined) => {
    try {
      await updateTask(taskId, { assigneeAgentKey: assigneeAgentKey || undefined });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, assigneeAgentKey } : t))
      );
      toast({
        title: assigneeAgentKey ? 'Task assigned' : 'Task unassigned',
        description: assigneeAgentKey 
          ? `Assigned to ${agentByKey.get(assigneeAgentKey)?.name || assigneeAgentKey}`
          : 'Task is now unassigned',
      });
    } catch (e) {
      console.error('Failed to reassign task:', e);
      toast({
        title: 'Failed to reassign task',
        description: String(e),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground">Kanban board for task management</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </Button>
          <Button size="sm" onClick={() => setShowNewTask(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            New Task
          </Button>
        </div>
      </div>

      {/* Kanban board - horizontal scroll on mobile */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 p-4 min-w-max md:min-w-0">
          {COLUMNS.map((col) => (
            <div
              key={col.id}
              className="w-72 md:flex-1 flex flex-col bg-muted/30 rounded-lg"
            >
              {/* Column header */}
              <div className={cn('px-3 py-2 rounded-t-lg', col.color)}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{col.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {tasksByColumn[col.id].length}
                  </span>
                </div>
              </div>

              {/* Tasks */}
              <ScrollArea className="flex-1 p-2">
                <div className="space-y-2">
                  {tasksByColumn[col.id].map((task) => {
                    const agent = task.assigneeAgentKey
                      ? agentByKey.get(task.assigneeAgentKey)
                      : null;

                    return (
                      <div
                        key={task.id}
                        className="p-3 bg-card rounded-lg border border-border shadow-sm"
                      >
                        <div className="text-sm font-medium mb-1">{task.title}</div>
                        {task.description && (
                          <div className="text-xs text-muted-foreground line-clamp-2 mb-2">
                            {task.description}
                          </div>
                        )}
                        
                        {/* Assignee display and quick reassign */}
                        <div className="mb-2">
                          <Select
                            value={task.assigneeAgentKey || '__unassigned__'}
                            onValueChange={(v) => handleReassignTask(task.id, v === '__unassigned__' ? undefined : v)}
                          >
                            <SelectTrigger className="h-7 w-full text-xs">
                              <div className="flex items-center gap-1.5">
                                {agent ? (
                                  <>
                                    <span>{agent.avatar}</span>
                                    <span>{agent.name}</span>
                                  </>
                                ) : (
                                  <>
                                    <User className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-muted-foreground">Unassigned</span>
                                  </>
                                )}
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__unassigned__">
                                <div className="flex items-center gap-1.5">
                                  <User className="w-3 h-3" />
                                  <span>Unassigned</span>
                                </div>
                              </SelectItem>
                              {agents.map((a) => (
                                <SelectItem key={a.id} value={a.id}>
                                  <div className="flex items-center gap-1.5">
                                    <span>{a.avatar}</span>
                                    <span>{a.name}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Status selector */}
                        <div className="flex items-center justify-end">
                          <Select
                            value={task.status}
                            onValueChange={(v) => handleMoveTask(task.id, v as TaskStatus)}
                          >
                            <SelectTrigger className="h-6 w-auto text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {COLUMNS.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      </div>

      {/* New Task Dialog - using shared component */}
      <NewTaskDialog
        open={showNewTask}
        onOpenChange={setShowNewTask}
        agents={agents}
        onCreated={refresh}
      />
    </div>
  );
}
