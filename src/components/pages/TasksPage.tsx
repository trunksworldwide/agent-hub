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

// Zack preference: keep the workflow dead simple.
// 3 columns only: Approve (Inbox) → In Progress → Completed.
const COLUMNS: { id: 'inbox' | 'in_progress' | 'done'; label: string; color: string }[] = [
  { id: 'inbox', label: 'Inbox', color: 'bg-muted' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-yellow-500/20' },
  { id: 'done', label: 'Completed', color: 'bg-green-500/20' },
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

  

  const tasksByBoardColumn = useMemo(() => {
    const map: Record<'inbox'|'in_progress'|'done', Task[]> = {
      inbox: [],
      in_progress: [],
      done: [],
    };

    for (const task of visibleTasks) {
      if (task.status === 'done') {
        map.done.push(task);
      } else if (task.status === 'inbox') {
        map.inbox.push(task);
      } else {
        // Everything else counts as in progress for board simplicity.
        map.in_progress.push(task);
      }
    }

    return map;
  }, [visibleTasks]);


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
        /* Kanban board - horizontal scroll on mobile */
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
                      {tasksByBoardColumn[col.id].length}
                    </span>
                  </div>
                </div>

                {/* Tasks */}
                <ScrollArea className="flex-1 p-2">
                  <div className="space-y-2">
                    {tasksByBoardColumn[col.id].length === 0 ? (
                      <div className="text-center py-4 text-xs text-muted-foreground">
                        No tasks
                      </div>
                    ) : (
                      tasksByBoardColumn[col.id].map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          agents={agents}
                          onStatusChange={handleMoveTask}
                          onAssigneeChange={handleReassignTask}
                          onClick={() => handleTaskClick(task)}
                        />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            ))}
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
