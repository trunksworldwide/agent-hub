import { useEffect, useState, useRef } from 'react';
import { X, Send, Check, Play, XCircle, User, AlertTriangle, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  type Task, 
  type TaskStatus, 
  type Agent, 
  type TaskComment,
  type TaskOutput,
  updateTask, 
  getTaskComments, 
  createTaskComment,
  createActivity,
  getTaskOutputs,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { RejectConfirmDialog } from './RejectConfirmDialog';
import { BlockedReasonModal } from './BlockedReasonModal';
import { TaskOutputSection } from './TaskOutputSection';
import { AddOutputDialog } from './AddOutputDialog';

const STATUS_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
  { id: 'blocked', label: 'Blocked' },
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
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [outputs, setOutputs] = useState<TaskOutput[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isLoadingOutputs, setIsLoadingOutputs] = useState(false);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showAddOutput, setShowAddOutput] = useState(false);
  const [pendingBlockedStatus, setPendingBlockedStatus] = useState<TaskStatus | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load comments and outputs when task changes
  useEffect(() => {
    if (task?.id && open) {
      loadComments();
      loadOutputs();
    } else {
      setComments([]);
      setOutputs([]);
    }
  }, [task?.id, open]);

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments.length]);

  const loadComments = async () => {
    if (!task?.id) return;
    setIsLoadingComments(true);
    try {
      const data = await getTaskComments(task.id);
      setComments(data);
    } catch (e) {
      console.error('Failed to load comments:', e);
    } finally {
      setIsLoadingComments(false);
    }
  };

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

  const handleSendComment = async () => {
    if (!task?.id || !newComment.trim()) return;
    setIsSendingComment(true);
    try {
      const result = await createTaskComment({
        taskId: task.id,
        content: newComment.trim(),
      });
      if (result.ok && result.comment) {
        setComments((prev) => [...prev, result.comment!]);
        setNewComment('');
      } else {
        throw new Error(result.error || 'Failed to send comment');
      }
    } catch (e) {
      console.error('Failed to send comment:', e);
      toast({
        title: 'Failed to send comment',
        description: String(e),
        variant: 'destructive',
      });
    } finally {
      setIsSendingComment(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendComment();
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
    
    // Optionally post to thread
    if (postToThread) {
      await createTaskComment({
        taskId: task.id,
        content: `🚧 Blocked: ${reason}`,
      });
      await loadComments();
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
    if (!task) return;
    setIsUpdating(true);
    try {
      await updateTask(task.id, {
        isProposed: false,
        status: 'assigned',
      });
      await createActivity({
        type: 'task_accepted',
        message: `Accepted proposed task: "${task.title}"`,
        taskId: task.id,
      });
      toast({ title: 'Task accepted', description: 'Moved to Assigned' });
      onTaskUpdated();
    } catch (e) {
      console.error('Failed to accept task:', e);
      toast({ title: 'Failed to accept task', description: String(e), variant: 'destructive' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAcceptAndStart = async () => {
    if (!task) return;
    setIsUpdating(true);
    try {
      await updateTask(task.id, {
        isProposed: false,
        status: 'in_progress',
      });
      await createActivity({
        type: 'task_accepted',
        message: `Accepted & started: "${task.title}"`,
        taskId: task.id,
      });
      toast({ title: 'Task accepted & started', description: 'Moved to In Progress' });
      onTaskUpdated();
    } catch (e) {
      console.error('Failed to accept task:', e);
      toast({ title: 'Failed to accept task', description: String(e), variant: 'destructive' });
    } finally {
      setIsUpdating(false);
    }
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

  const getAgentDisplay = (agentKey: string | null | undefined) => {
    if (!agentKey) return null;
    const agent = agents.find((a) => a.id === agentKey);
    if (agent) {
      return { emoji: agent.avatar || '🤖', name: agent.name };
    }
    if (agentKey === 'ui' || agentKey === 'dashboard') {
      return { emoji: '👤', name: 'You' };
    }
    return { emoji: '🤖', name: agentKey };
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

              {/* Blocked Info */}
              {task.status === 'blocked' && task.blockedReason && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-red-600">
                    <AlertTriangle className="w-4 h-4" />
                    Blocked
                  </h4>
                  <p className="text-sm mb-3">{task.blockedReason}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResolveBlocked('assigned')}
                      disabled={isUpdating}
                    >
                      Resolve → Assigned
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResolveBlocked('in_progress')}
                      disabled={isUpdating}
                    >
                      Resolve → In Progress
                    </Button>
                  </div>
                </div>
              )}

              {/* Outputs */}
              <TaskOutputSection
                outputs={outputs}
                onAddOutput={() => setShowAddOutput(true)}
                onOutputDeleted={loadOutputs}
                isLoading={isLoadingOutputs}
              />

              <Separator />

              {/* Thread */}
              <div>
                <h4 className="text-sm font-medium mb-3">Thread</h4>
                <div 
                  ref={scrollRef}
                  className="space-y-3 max-h-64 overflow-y-auto mb-4"
                >
                  {isLoadingComments ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No comments yet
                    </p>
                  ) : (
                    comments.map((comment) => {
                      const author = getAgentDisplay(comment.authorAgentKey);
                      return (
                        <div
                          key={comment.id}
                          className="bg-muted/50 rounded-lg p-3"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {author && (
                              <>
                                <span className="text-sm">{author.emoji}</span>
                                <span className="text-sm font-medium">{author.name}</span>
                              </>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Composer */}
                <div className="flex gap-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Add a comment... (Enter to send)"
                    className="min-h-[60px] resize-none"
                    disabled={isSendingComment}
                  />
                  <Button
                    size="icon"
                    onClick={handleSendComment}
                    disabled={!newComment.trim() || isSendingComment}
                  >
                    {isSendingComment ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
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
    </>
  );
}
