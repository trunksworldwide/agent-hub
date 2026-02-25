import { useEffect, useState, useRef, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Send, Loader2, ArrowRight, Check, X, MessageSquare, FileText, AlertTriangle, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  type TaskEvent,
  type TaskComment,
  type TaskOutput,
  type Agent,
  getTaskEvents,
  getTaskComments,
  getTaskOutputs,
  createTaskEvent,
  resolveApproval,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { getSelectedProjectId } from '@/lib/project';

// ---- NEEDS ATTENTION option parser ----
function parseNeedsAttentionOptions(content: string | null) {
  if (!content || !/needs attention/i.test(content)) return null;
  const lines = content.split('\n');
  const options: { label: string; text: string }[] = [];
  const preambleLines: string[] = [];
  let foundOptions = false;
  for (const line of lines) {
    const match = line.match(/^([A-Z])\)\s*(.+)/);
    if (match) {
      foundOptions = true;
      options.push({ label: match[1], text: match[2].trim() });
    } else if (!foundOptions) {
      preambleLines.push(line);
    }
  }
  if (options.length < 2) return null;
  return { preamble: preambleLines.join('\n').trim(), options };
}

// Unified timeline item that can be a task_event, legacy comment, or legacy output
interface TimelineItem {
  id: string;
  kind: 'event' | 'legacy_comment' | 'legacy_output';
  eventType: string;
  author: string;
  content: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

function mergeTimeline(
  events: TaskEvent[],
  legacyComments: TaskComment[],
  legacyOutputs: TaskOutput[],
): TimelineItem[] {
  // Convert events
  const eventItems: TimelineItem[] = events.map((e) => ({
    id: e.id,
    kind: 'event',
    eventType: e.eventType,
    author: e.author,
    content: e.content,
    metadata: e.metadata,
    createdAt: e.createdAt,
  }));

  // Convert legacy comments (only if not already in events)
  const eventCommentIds = new Set(
    events.filter((e) => e.metadata?.legacy_comment_id).map((e) => e.metadata!.legacy_comment_id)
  );
  const commentItems: TimelineItem[] = legacyComments
    .filter((c) => !eventCommentIds.has(c.id))
    .map((c) => ({
      id: `lc_${c.id}`,
      kind: 'legacy_comment' as const,
      eventType: 'comment',
      author: c.authorAgentKey || 'ui',
      content: c.content,
      metadata: null,
      createdAt: c.createdAt,
    }));

  // Convert legacy outputs (only if not already in events)
  const eventOutputIds = new Set(
    events.filter((e) => e.metadata?.legacy_output_id).map((e) => e.metadata!.legacy_output_id)
  );
  const outputItems: TimelineItem[] = legacyOutputs
    .filter((o) => !eventOutputIds.has(o.id))
    .map((o) => ({
      id: `lo_${o.id}`,
      kind: 'legacy_output' as const,
      eventType: 'output_added',
      author: o.createdBy || 'ui',
      content: o.title || o.outputType,
      metadata: {
        output_type: o.outputType,
        content_text: o.contentText,
        link_url: o.linkUrl,
        storage_path: o.storagePath,
      },
      createdAt: o.createdAt,
    }));

  const all = [...eventItems, ...commentItems, ...outputItems];
  all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return all;
}

interface TaskTimelineProps {
  taskId: string;
  agents: Agent[];
}

export function TaskTimeline({ taskId, agents }: TaskTimelineProps) {
  const { toast } = useToast();
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [legacyComments, setLegacyComments] = useState<TaskComment[]>([]);
  const [legacyOutputs, setLegacyOutputs] = useState<TaskOutput[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [evts, comments, outputs] = await Promise.all([
        getTaskEvents(taskId),
        getTaskComments(taskId),
        getTaskOutputs(taskId),
      ]);
      setEvents(evts);
      setLegacyComments(comments);
      setLegacyOutputs(outputs);
    } catch (e) {
      console.error('Failed to load timeline:', e);
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Realtime: listen for new task_events on this task
  useEffect(() => {
    const projectId = getSelectedProjectId();
    const channel = supabase
      .channel(`task-events:${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_events',
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row.project_id !== projectId) return;
          const newEvt: TaskEvent = {
            id: row.id,
            projectId: row.project_id,
            taskId: row.task_id,
            eventType: row.event_type,
            author: row.author,
            content: row.content,
            metadata: row.metadata,
            createdAt: row.created_at,
          };
          setEvents((prev) => {
            if (prev.some((e) => e.id === newEvt.id)) return prev;
            return [...prev, newEvt];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length, legacyComments.length]);

  const timeline = mergeTimeline(events, legacyComments, legacyOutputs);

  // Derive answered NEEDS ATTENTION items
  const answeredMap = new Map<string, string>(); // questionId -> answer content
  for (const item of timeline) {
    if (item.eventType === 'comment' && item.content?.startsWith('Answer:') && item.metadata?.reply_to) {
      answeredMap.set(item.metadata.reply_to as string, item.content);
    }
  }
  const [localAnsweredIds, setLocalAnsweredIds] = useState<Set<string>>(new Set());

  const handleQuickReply = async (questionItemId: string, answerText: string) => {
    try {
      const result = await createTaskEvent({
        taskId,
        eventType: 'comment',
        content: answerText,
        metadata: { reply_to: questionItemId },
      });
      if (!result.ok) throw new Error(result.error || 'Failed');
      setLocalAnsweredIds((prev) => new Set(prev).add(questionItemId));
      toast({ title: 'Reply sent' });
    } catch (e) {
      toast({ title: 'Failed to send reply', description: String(e), variant: 'destructive' });
      throw e; // re-throw so the button knows it failed
    }
  };

  const handleSend = async () => {
    if (!newComment.trim()) return;
    setIsSending(true);
    try {
      const result = await createTaskEvent({
        taskId,
        eventType: 'comment',
        content: newComment.trim(),
      });
      if (!result.ok) throw new Error(result.error || 'Failed');
      setNewComment('');
    } catch (e) {
      toast({ title: 'Failed to send', description: String(e), variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleResolve = async (item: TimelineItem, approved: boolean) => {
    setResolvingId(item.id);
    try {
      const result = await resolveApproval(taskId, item.id, approved);
      if (!result.ok) throw new Error(result.error || 'Failed');
      toast({ title: approved ? 'Approved' : 'Rejected' });
    } catch (e) {
      toast({ title: 'Failed', description: String(e), variant: 'destructive' });
    } finally {
      setResolvingId(null);
    }
  };

  const getAuthorDisplay = (authorKey: string) => {
    if (authorKey === 'ui' || authorKey === 'dashboard') {
      return { emoji: '👤', name: 'You' };
    }
    if (authorKey === 'ai') {
      return { emoji: '✨', name: 'AI' };
    }
    const agent = agents.find((a) => a.id === authorKey);
    if (agent) return { emoji: agent.avatar || '🤖', name: agent.name };
    return { emoji: '🤖', name: authorKey };
  };

  // Check if an approval_request has been resolved
  const isResolved = (item: TimelineItem) => {
    if (item.eventType !== 'approval_request') return false;
    return events.some(
      (e) => e.eventType === 'approval_resolved' && e.metadata?.original_event_id === item.id
    );
  };

  const getResolution = (item: TimelineItem) => {
    const resolution = events.find(
      (e) => e.eventType === 'approval_resolved' && e.metadata?.original_event_id === item.id
    );
    return resolution?.metadata?.status as 'approved' | 'rejected' | undefined;
  };

  return (
    <div className="flex flex-col">
      <h4 className="text-sm font-medium mb-3">Thread</h4>

      <div ref={scrollRef} className="space-y-3 max-h-80 overflow-y-auto mb-4">
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          </div>
        ) : timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No activity yet
          </p>
        ) : (
          timeline.map((item) => (
            <TimelineEntry
              key={item.id}
              item={item}
              getAuthorDisplay={getAuthorDisplay}
              isResolved={isResolved(item)}
              resolution={getResolution(item)}
              onResolve={handleResolve}
              resolvingId={resolvingId}
              isAnswered={answeredMap.has(item.id) || localAnsweredIds.has(item.id)}
              answeredContent={answeredMap.get(item.id) || null}
              onQuickReply={handleQuickReply}
            />
          ))
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
          disabled={isSending}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!newComment.trim() || isSending}
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

// ============= Individual timeline entry =============

function TimelineEntry({
  item,
  getAuthorDisplay,
  isResolved,
  resolution,
  onResolve,
  resolvingId,
  isAnswered,
  answeredContent,
  onQuickReply,
}: {
  item: TimelineItem;
  getAuthorDisplay: (key: string) => { emoji: string; name: string };
  isResolved: boolean;
  resolution?: 'approved' | 'rejected';
  onResolve: (item: TimelineItem, approved: boolean) => void;
  resolvingId: string | null;
  isAnswered: boolean;
  answeredContent: string | null;
  onQuickReply: (questionItemId: string, answerText: string) => Promise<void>;
}) {
  const author = getAuthorDisplay(item.author);

  // Status change event
  if (item.eventType === 'status_change') {
    const oldStatus = item.metadata?.old_status;
    const newStatus = item.metadata?.new_status;
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
        <ArrowRight className="w-3 h-3" />
        <span>{author.emoji} {author.name}</span>
        <span>moved to</span>
        <Badge variant="outline" className="text-xs h-5">
          {(newStatus || '').replace('_', ' ')}
        </Badge>
        <span className="ml-auto">
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </span>
      </div>
    );
  }

  // Approval resolved event (compact)
  if (item.eventType === 'approval_resolved') {
    const status = item.metadata?.status;
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
        {status === 'approved' ? (
          <Check className="w-3 h-3 text-emerald-500" />
        ) : (
          <X className="w-3 h-3 text-red-500" />
        )}
        <span>{author.emoji} {author.name}</span>
        <span>{status === 'approved' ? 'approved' : 'rejected'} the action</span>
        <span className="ml-auto">
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </span>
      </div>
    );
  }

  // Approval request card
  if (item.eventType === 'approval_request') {
    const riskLevel = item.metadata?.risk_level || 'med';
    const actionType = item.metadata?.action_type || 'action';
    return (
      <div className={cn(
        'border rounded-lg p-3',
        isResolved
          ? resolution === 'approved'
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-red-500/30 bg-red-500/5'
          : 'border-amber-500/30 bg-amber-500/10'
      )}>
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-medium">Action Proposal</span>
          <Badge variant="outline" className={cn(
            'text-xs h-5',
            riskLevel === 'high' && 'border-red-500/50 text-red-600',
            riskLevel === 'med' && 'border-amber-500/50 text-amber-600',
            riskLevel === 'low' && 'border-emerald-500/50 text-emerald-600',
          )}>
            {riskLevel} risk
          </Badge>
          <span className="text-xs text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
          </span>
        </div>

        <div className="text-sm mb-1">
          <span className="text-muted-foreground">{author.emoji} {author.name} wants to: </span>
          <span className="font-medium">{actionType.replace('_', ' ')}</span>
        </div>

        {item.content && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-3">
            {item.content}
          </p>
        )}

        {!isResolved && (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => onResolve(item, true)}
              disabled={resolvingId === item.id}
            >
              <Check className="w-3 h-3 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onResolve(item, false)}
              disabled={resolvingId === item.id}
            >
              <X className="w-3 h-3 mr-1" />
              Reject
            </Button>
          </div>
        )}

        {isResolved && (
          <Badge variant="outline" className={cn(
            'text-xs',
            resolution === 'approved' ? 'text-emerald-600 border-emerald-500/50' : 'text-red-600 border-red-500/50'
          )}>
            {resolution === 'approved' ? '✓ Approved' : '✗ Rejected'}
          </Badge>
        )}
      </div>
    );
  }

  // Output added event
  if (item.eventType === 'output_added') {
    const outputType = item.metadata?.output_type || 'output';
    return (
      <div className="bg-muted/30 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{item.content || outputType}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
          </span>
        </div>
        {item.metadata?.content_text && (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
            {item.metadata.content_text}
          </p>
        )}
        {item.metadata?.link_url && (
          <a
            href={item.metadata.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline mt-1 block truncate"
          >
            {item.metadata.link_url}
          </a>
        )}
      </div>
    );
  }

  // Agent update
  if (item.eventType === 'agent_update') {
    return (
      <div className="bg-muted/30 border-l-2 border-primary/30 rounded-r-lg p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm">{author.emoji}</span>
          <span className="text-sm font-medium">{author.name}</span>
          <Badge variant="outline" className="text-xs h-5">update</Badge>
          <span className="text-xs text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
          </span>
        </div>
        {item.content && (
          <p className="text-sm whitespace-pre-wrap">{item.content}</p>
        )}
      </div>
    );
  }

  // Default: comment — check for NEEDS ATTENTION options
  const parsed = parseNeedsAttentionOptions(item.content);

  if (parsed) {
    return (
      <NeedsAttentionCard
        item={item}
        author={author}
        parsed={parsed}
        isAnswered={isAnswered}
        answeredContent={answeredContent}
        onQuickReply={onQuickReply}
      />
    );
  }

  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{author.emoji}</span>
        <span className="text-sm font-medium">{author.name}</span>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{item.content}</p>
    </div>
  );
}

// ============= NEEDS ATTENTION card with option buttons =============

function NeedsAttentionCard({
  item,
  author,
  parsed,
  isAnswered,
  answeredContent,
  onQuickReply,
}: {
  item: TimelineItem;
  author: { emoji: string; name: string };
  parsed: { preamble: string; options: { label: string; text: string }[] };
  isAnswered: boolean;
  answeredContent: string | null;
  onQuickReply: (questionItemId: string, answerText: string) => Promise<void>;
}) {
  const [sendingLabel, setSendingLabel] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [customText, setCustomText] = useState('');

  const handleOptionClick = async (label: string, text: string) => {
    setSendingLabel(label);
    try {
      await onQuickReply(item.id, `Answer: ${label} — ${text}`);
    } catch {
      // error toast handled upstream
    } finally {
      setSendingLabel(null);
    }
  };

  const handleCustomSend = async () => {
    if (!customText.trim()) return;
    setSendingLabel('Custom');
    try {
      await onQuickReply(item.id, `Answer: Custom — ${customText.trim()}`);
      setCustomText('');
      setShowCustom(false);
    } catch {
      // error toast handled upstream
    } finally {
      setSendingLabel(null);
    }
  };

  const disabled = isAnswered || sendingLabel !== null;

  return (
    <div className={cn(
      'border rounded-lg p-3',
      isAnswered
        ? 'border-muted bg-muted/20'
        : 'border-amber-500/30 bg-amber-500/10'
    )}>
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-medium">Needs Attention</span>
        {isAnswered && (
          <Badge variant="outline" className="text-xs h-5 border-primary/50 text-primary">
            ✓ Answered
          </Badge>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm">{author.emoji}</span>
        <span className="text-sm font-medium">{author.name}</span>
      </div>

      {parsed.preamble && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-3">
          {parsed.preamble}
        </p>
      )}

      {isAnswered && answeredContent ? (
        <Badge variant="secondary" className="text-xs">
          {answeredContent.length > 80 ? answeredContent.slice(0, 80) + '…' : answeredContent}
        </Badge>
      ) : (
        <div className="flex flex-col gap-1.5">
          {parsed.options.map((opt) => (
            <Button
              key={opt.label}
              size="sm"
              variant="outline"
              className="justify-start text-left h-auto py-1.5 px-3"
              disabled={disabled}
              onClick={() => handleOptionClick(opt.label, opt.text)}
            >
              {sendingLabel === opt.label ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
              ) : (
                <span className="font-semibold mr-1.5">{opt.label})</span>
              )}
              <span className="truncate">
                {opt.text.length > 60 ? opt.text.slice(0, 60) + '…' : opt.text}
              </span>
            </Button>
          ))}

          {!showCustom ? (
            <Button
              size="sm"
              variant="ghost"
              className="justify-start text-muted-foreground text-xs"
              disabled={disabled}
              onClick={() => setShowCustom(true)}
            >
              Custom…
            </Button>
          ) : (
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomSend()}
                placeholder="Type your answer…"
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                disabled={disabled}
                autoFocus
              />
              <Button
                size="sm"
                onClick={handleCustomSend}
                disabled={disabled || !customText.trim()}
              >
                {sendingLabel === 'Custom' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Send className="w-3 h-3" />
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
