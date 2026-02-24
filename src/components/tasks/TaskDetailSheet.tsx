import { useEffect, useState } from 'react';
import { Check, Play, XCircle, User, AlertTriangle, Loader2, Square, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  type Task, 
  type TaskStatus, 
  type Agent, 
  type TaskOutput,
  updateTask, 
  createActivity,
  getTaskOutputs,
  createTaskEvent,
  stopTask,
  softDeleteTask,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { RejectConfirmDialog } from './RejectConfirmDialog';
import { BlockedReasonModal } from './BlockedReasonModal';
import { TaskOutputSection } from './TaskOutputSection';
import { AddOutputDialog } from './AddOutputDialog';
import { TaskTimeline } from './TaskTimeline';
import { StopTaskDialog } from './StopTaskDialog';
import { DeleteTaskConfirmDialog } from './DeleteTaskConfirmDialog';

// Zack workflow: Suggested → In Progress → Completed
const STATUS_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'inbox', label: 'Suggested (Approve/Reject)' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Completed' },
];

interface TaskDetailSheetProps {
  task: Task | null;
  agents: Agent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdated: () => void;
}

export function TaskDetailSheet({ task, agents, open, onOpenChange, onTaskUpdated }: TaskDetailSheetProps) {
  const { toast } = useToast();
  const [outputs, setOutputs] = useState<TaskOutput[]>([]);
  const [isLoadingOutputs, setIsLoadingOutputs] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showAddOutput, setShowAddOutput] = useState(false);
  // blocked/stopped flows are hidden in the 3-column workflow
  const [pendingBlockedStatus, setPendingBlockedStatus] = useState<TaskStatus | null>(null);
  const [showStopDialog, setShowStopDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Load outputs when task changes
  useEffect(() => {
    if (task?.id && open) {
      loadOutputs();
    } else {
      setOutputs([]);
    }
  }, [task?.id, open]);

  const loadOutputs = async () => {
    if (!task?.id) return;
    setIsLoadingOutputs(true);
    try {
      const data = await getTaskOutputs(task.id);
      setOutputs(data);
    } catch (e) {
      console.error('Failed to load outputs:', e);
    } finally {
      setIsLoadingOutputs(false);
    }
  };



  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (!task) return;
    
    // If moving to blocked, require reason
    if (newStatus === 'blocked' && task.status !== 'blocked') {
      setPendingBlockedStatus(newStatus);
      setShowBlockedModal(true);
      return;
    }

    await performStatusChange(newStatus);
  };

  const performStatusChange = async (newStatus: TaskStatus, blockedReason?: string) => {
    if (!task) return;
    setIsUpdating(true);
    try {
      const patch: Partial<Task> = { status: newStatus };
      
      // If blocking, set blocked fields
      if (newStatus === 'blocked' && blockedReason) {
        patch.blockedReason = blockedReason;
        patch.blockedAt = new Date().toISOString();
      }
      
      // If unblocking, clear blocked fields
      if (task.status === 'blocked' && newStatus !== 'blocked') {
        patch.blockedReason = null;
        patch.blockedAt = null;
      }

      await updateTask(task.id, patch);

      // Write status_change event to the unified timeline
      createTaskEvent({
        taskId: task.id,
        eventType: 'status_change',
        content: null,
        metadata: { old_status: task.status, new_status: newStatus },
      }).catch(() => {}); // best-effort

      onTaskUpdated();
    } catch (e) {
      console.error('Failed to update status:', e);
      toast({
        title: 'Failed to update status',
        description: String(e),
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBlockedConfirm = async (reason: string, postToThread: boolean) => {
    if (!task || !pendingBlockedStatus) return;
    
    // Perform status change
    await performStatusChange(pendingBlockedStatus, reason);
    
    // Optionally post to thread via task_events
    if (postToThread) {
      await createTaskEvent({
        taskId: task.id,
        eventType: 'comment',
        content: `🚧 Blocked: ${reason}`,
      });
    }

    // Log activity
    await createActivity({
      type: 'task_blocked',
      message: `Blocked "${task.title}" — ${reason}`,
      taskId: task.id,
    });

    setShowBlockedModal(false);
    setPendingBlockedStatus(null);
  };

  const handleAssigneeChange = async (agentKey: string) => {
    if (!task) return;
    setIsUpdating(true);
    try {
      await updateTask(task.id, {
        assigneeAgentKey: agentKey === '__unassigned__' ? undefined : agentKey,
      });
      onTaskUpdated();
    } catch (e) {
      console.error('Failed to update assignee:', e);
      toast({
        title: 'Failed to update assignee',
        description: String(e),
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAccept = async () => {
    // Zack workflow: approving a suggestion moves it straight into In Progress.
    if (!task) return;
    setIsUpdating(true);
    try {
      await updateTask(task.id, {
        isProposed: false,
        status: 'in_progress',
      });
      await createActivity({
        type: 'task_accepted',
        message: `Approved task: "${task.title}"`,
        taskId: task.id,
      });
      toast({ title: 'Task approved', description: 'Moved to In Progress' });
      onTaskUpdated();
    } catch (e) {
      console.error('Failed to accept task:', e);
      toast({ title: 'Failed to approve task', description: String(e), variant: 'destructive' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAcceptAndStart = async () => {
    // Kept for backwards-compat in the UI, but it’s identical to Approve.
    return handleAccept();
  };

  const handleReject = async (reason: string) => {
    if (!task) return;
    setIsUpdating(true);
    try {
      await updateTask(task.id, {
        isProposed: false,
        status: 'done',
        rejectedAt: new Date().toISOString(),
        rejectedReason: reason || null,
      });
      await createActivity({
        type: 'task_rejected',
        message: `Rejected proposed task: "${task.title}"${reason ? ` — ${reason}` : ''}`,
        taskId: task.id,
      });
      toast({ title: 'Task rejected' });
      onTaskUpdated();
      onOpenChange(false);
    } catch (e) {
      console.error('Failed to reject task:', e);
      toast({ title: 'Failed to reject task', description: String(e), variant: 'destructive' });
    } finally {
      setIsUpdating(false);
      setShowRejectDialog(false);
    }
  };

  const handleResolveBlocked = async (newStatus: TaskStatus) => {
    if (!task) return;
    setIsUpdating(true);
    try {
      await updateTask(task.id, {
        status: newStatus,
        blockedReason: null,
        blockedAt: null,
      });
      await createActivity({
        type: 'task_unblocked',
        message: `Unblocked: "${task.title}"`,
        taskId: task.id,
      });
      toast({ title: 'Task unblocked', description: `Moved to ${newStatus.replace('_', ' ')}` });
      onTaskUpdated();
    } catch (e) {
      console.error('Failed to unblock task:', e);
      toast({ title: 'Failed to unblock task', description: String(e), variant: 'destructive' });
    } finally {
      setIsUpdating(false);
    }
  };


  const handleStop = async (reason: string) => {
    if (!task) return;
    setIsUpdating(true);
    try {
      await stopTask(task.id, reason);
      toast({ title: 'Task stopped' });
      onTaskUpdated();
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Failed to stop task', description: String(e), variant: 'destructive' });
    } finally {
      setIsUpdating(false);
      setShowStopDialog(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    setIsUpdating(true);
    try {
      await softDeleteTask(task.id);
      toast({ title: 'Task deleted' });
      onTaskUpdated();
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Failed to delete task', description: String(e), variant: 'destructive' });
    } finally {
      setIsUpdating(false);
      setShowDeleteDialog(false);
    }
  };

  if (!task) return null;

  const assigneeAgent = task.assigneeAgentKey ? agents.find((a) => a.id === task.assigneeAgentKey) : null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-lg font-semibold break-words">
                  {task.title}
                </SheetTitle>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {task.isProposed && (
                    <Badge variant="outline" className="border-amber-500/50 text-amber-600 bg-amber-500/10">
                      Needs review
                    </Badge>
                  )}
                  {task.rejectedAt && (
                    <Badge variant="outline" className="border-red-500/50 text-red-600 bg-red-500/10">
                      Rejected
                    </Badge>
                  )}
                  <Select
                    value={task.status}
                    onValueChange={(v) => handleStatusChange(v as TaskStatus)}
                    disabled={isUpdating}
                  >
                    <SelectTrigger className="h-7 w-auto text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_COLUMNS.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {/* Stop hidden in 3-column workflow */}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setShowDeleteDialog(true)} disabled={isUpdating} title="Delete task">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* Assignee */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Assignee
                </label>
                <Select
                  value={task.assigneeAgentKey || '__unassigned__'}
                  onValueChange={handleAssigneeChange}
                  disabled={isUpdating}
                >
                  <SelectTrigger className="w-full">
                    <div className="flex items-center gap-2">
                      {assigneeAgent ? (
                        <>
                          <span>{assigneeAgent.avatar}</span>
                          <span>{assigneeAgent.name}</span>
                        </>
                      ) : (
                        <>
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Unassigned</span>
                        </>
                      )}
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unassigned__">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span>Unassigned</span>
                      </div>
                    </SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <span>{a.avatar}</span>
                          <span>{a.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              {task.description && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Description
                  </label>
                  <p className="text-sm whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              {/* Review Actions (for proposed tasks) */}
              {task.isProposed && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Review Required
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={handleAccept}
                      disabled={isUpdating}
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleAcceptAndStart}
                      disabled={isUpdating}
                    >
                      <Play className="w-4 h-4 mr-1" />
                      Accept & Start
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setShowRejectDialog(true)}
                      disabled={isUpdating}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </div>
              )}

              {/* Blocked Info (hidden in 3-column workflow) */}
              {false && task.status === 'blocked' && task.blockedReason && null}

              {/* Outputs */}
              <TaskOutputSection
                outputs={outputs}
                onAddOutput={() => setShowAddOutput(true)}
                onOutputDeleted={loadOutputs}
                isLoading={isLoadingOutputs}
              />

              <Separator />

              {/* Unified Timeline */}
              {task.id && (
                <TaskTimeline taskId={task.id} agents={agents} />
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <RejectConfirmDialog
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        onConfirm={handleReject}
        taskTitle={task.title}
      />

      <BlockedReasonModal
        open={showBlockedModal}
        onOpenChange={(open) => {
          setShowBlockedModal(open);
          if (!open) setPendingBlockedStatus(null);
        }}
        onConfirm={handleBlockedConfirm}
        taskTitle={task.title}
      />

      <AddOutputDialog
        open={showAddOutput}
        onOpenChange={setShowAddOutput}
        taskId={task.id}
        taskTitle={task.title}
        onOutputAdded={loadOutputs}
      />

      {/* Stop dialog hidden in 3-column workflow */}

      <DeleteTaskConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onConfirm={handleDelete}
        taskTitle={task.title}
      />
    </>
  );
}
