import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, LayoutGrid, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { getAgents, getTasks, updateTask, createActivity, type Agent, type Task, type TaskStatus } from '@/lib/api';
import { cn } from '@/lib/utils'; // kept for refresh icon animation
import { useClawdOffice } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { NewTaskDialog } from '@/components/dialogs/NewTaskDialog';
import { TaskDetailSheet } from '@/components/tasks/TaskDetailSheet';
import { TaskCard } from '@/components/tasks/TaskCard';
import { TaskListView } from '@/components/tasks/TaskListView';
import { BlockedReasonModal } from '@/components/tasks/BlockedReasonModal';

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
  { id: 'blocked', label: 'Blocked' },
];

type ViewMode = 'board' | 'list';

function getViewPreference(projectId: string): ViewMode {
  try {
    const stored = localStorage.getItem(`clawdos.tasksView.${projectId}`);
    return stored === 'list' ? 'list' : 'board';
  } catch {
    return 'board';
  }
}

function setViewPreference(projectId: string, mode: ViewMode) {
  try {
    localStorage.setItem(`clawdos.tasksView.${projectId}`, mode);
  } catch {
    // ignore
  }
}

export function TasksPage() {
  const { selectedProjectId, selectedTaskId, setSelectedTaskId } = useClawdOffice();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => getViewPreference(selectedProjectId));
  
  // Blocked reason modal state
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [pendingBlockedTask, setPendingBlockedTask] = useState<{ taskId: string; title: string } | null>(null);

  // Effect to persist view preference
  useEffect(() => {
    setViewPreference(selectedProjectId, viewMode);
  }, [viewMode, selectedProjectId]);

  // Reset view preference when project changes
  useEffect(() => {
    setViewMode(getViewPreference(selectedProjectId));
  }, [selectedProjectId]);

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

  // Filter out rejected tasks from board view
  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => !t.rejectedAt);
  }, [tasks]);

  const tasksByColumn = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      inbox: [],
      assigned: [],
      in_progress: [],
      review: [],
      done: [],
      blocked: [],
      stopped: [],
    };
    for (const task of visibleTasks) {
      const col = map[task.status];
      if (col) col.push(task);
    }
    return map;
  }, [visibleTasks]);

  // Separate proposed and regular tasks in inbox
  const inboxProposed = useMemo(() => {
    return tasksByColumn.inbox.filter((t) => t.isProposed);
  }, [tasksByColumn.inbox]);

  const inboxRegular = useMemo(() => {
    return tasksByColumn.inbox.filter((t) => !t.isProposed);
  }, [tasksByColumn.inbox]);

  const agentByKey = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agents) m.set(a.id, a);
    return m;
  }, [agents]);

  const selectedTask = useMemo(() => {
    return tasks.find((t) => t.id === selectedTaskId) || null;
  }, [tasks, selectedTaskId]);

  const handleMoveTask = async (taskId: string, newStatus: TaskStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // If moving to blocked, require reason
    if (newStatus === 'blocked' && task.status !== 'blocked') {
      setPendingBlockedTask({ taskId, title: task.title });
      setShowBlockedModal(true);
      return;
    }

    try {
      const patch: Partial<Task> = { status: newStatus };
      
      // If unblocking, clear blocked fields
      if (task.status === 'blocked' && newStatus !== 'blocked') {
        patch.blockedReason = null;
        patch.blockedAt = null;
      }

      await updateTask(taskId, patch);
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t))
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

  const handleBlockedConfirm = async (reason: string, postToThread: boolean) => {
    if (!pendingBlockedTask) return;

    try {
      await updateTask(pendingBlockedTask.taskId, {
        status: 'blocked',
        blockedReason: reason,
        blockedAt: new Date().toISOString(),
      });

      // Log activity
      await createActivity({
        type: 'task_blocked',
        message: `Blocked "${pendingBlockedTask.title}" — ${reason}`,
        taskId: pendingBlockedTask.taskId,
      });

      setTasks((prev) =>
        prev.map((t) =>
          t.id === pendingBlockedTask.taskId
            ? { ...t, status: 'blocked' as TaskStatus, blockedReason: reason, blockedAt: new Date().toISOString() }
            : t
        )
      );

      toast({ title: 'Task blocked' });
    } catch (e) {
      console.error('Failed to block task:', e);
      toast({ title: 'Failed to block task', description: String(e), variant: 'destructive' });
    } finally {
      setShowBlockedModal(false);
      setPendingBlockedTask(null);
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

  const handleTaskClick = (task: Task) => {
    setSelectedTaskId(task.id);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Tasks</h1>
          <p className="text-sm text-muted-foreground">
            {viewMode === 'board' ? 'Kanban board for task management' : 'Task list view'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as ViewMode)}>
            <ToggleGroupItem value="board" aria-label="Board view" size="sm">
              <LayoutGrid className="w-4 h-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" size="sm">
              <List className="w-4 h-4" />
            </ToggleGroupItem>
          </ToggleGroup>
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

      {/* Content */}
      {viewMode === 'list' ? (
        <TaskListView
          tasks={tasks}
          agents={agents}
          onTaskClick={handleTaskClick}
          onStatusChange={handleMoveTask}
        />
      ) : (
        /* Kanban board */
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-3 p-4 h-full min-w-max lg:min-w-0">
            {COLUMNS.map((col) => {
              const colTasks = col.id === 'inbox'
                ? [...inboxProposed, ...inboxRegular]
                : tasksByColumn[col.id];
              return (
                <div
                  key={col.id}
                  className="w-80 lg:flex-1 flex flex-col rounded-xl bg-muted/20 min-w-0"
                >
                  {/* Column header */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-sm font-semibold tracking-tight">{col.label}</span>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums bg-muted/60 rounded-full px-2 py-0.5">
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Tasks */}
                  <ScrollArea className="flex-1">
                    <div className="px-2 pb-3 space-y-2">
                      {colTasks.length > 0 ? (
                        colTasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            agents={agents}
                            onStatusChange={handleMoveTask}
                            onAssigneeChange={handleReassignTask}
                            onClick={() => handleTaskClick(task)}
                          />
                        ))
                      ) : (
                        <div className="text-center py-8 text-xs text-muted-foreground/60">
                          No tasks
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New Task Dialog */}
      <NewTaskDialog
        open={showNewTask}
        onOpenChange={setShowNewTask}
        agents={agents}
        onCreated={refresh}
      />

      {/* Task Detail Sheet */}
      <TaskDetailSheet
        task={selectedTask}
        agents={agents}
        open={!!selectedTaskId}
        onOpenChange={(open) => !open && setSelectedTaskId(null)}
        onTaskUpdated={refresh}
      />

      {/* Blocked Reason Modal */}
      <BlockedReasonModal
        open={showBlockedModal}
        onOpenChange={(open) => {
          setShowBlockedModal(open);
          if (!open) setPendingBlockedTask(null);
        }}
        onConfirm={handleBlockedConfirm}
        taskTitle={pendingBlockedTask?.title || ''}
      />
    </div>
  );
}
