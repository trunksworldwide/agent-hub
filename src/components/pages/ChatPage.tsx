import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Send, RefreshCw, Bot, User, AlertCircle, CheckSquare, Clock, RotateCcw, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useClawdOffice } from '@/lib/store';
import { getAgents, type Agent } from '@/lib/api';
import {
  getChatMessages,
  sendChatMessage,
  getOrCreateDefaultThread,
  getChatDeliveryStatus,
  retryChatDelivery,
  isControlApiHealthy,
  type ChatMessage,
  type ChatDeliveryEntry,
} from '@/lib/api';
import { hasSupabase, subscribeToProjectRealtime } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { NewTaskDialog } from '@/components/dialogs/NewTaskDialog';

// ─── Sub-components ───

function DeliveryStatusBadge({
  entry,
  onRetry,
}: {
  entry: ChatDeliveryEntry | undefined;
  onRetry?: (id: string) => void;
}) {
  if (!entry) return null;

  const { status } = entry;

  if (status === 'processed') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Check className="w-3 h-3 text-[hsl(var(--success))] inline-block ml-1" />
        </TooltipTrigger>
        <TooltipContent>Delivered &amp; processed</TooltipContent>
      </Tooltip>
    );
  }

  if (status === 'delivered') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Check className="w-3 h-3 text-muted-foreground inline-block ml-1" />
        </TooltipTrigger>
        <TooltipContent>Delivered, awaiting response</TooltipContent>
      </Tooltip>
    );
  }

  if (status === 'queued') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Clock className="w-3 h-3 text-[hsl(var(--warning))] inline-block ml-1" />
        </TooltipTrigger>
        <TooltipContent>Queued — agent will process when online</TooltipContent>
      </Tooltip>
    );
  }

  // failed
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-0.5 ml-1">
          <AlertCircle className="w-3 h-3 text-destructive" />
          {onRetry && (
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onRetry(entry.id);
              }}
            >
              <RotateCcw className="w-2.5 h-2.5" />
            </Button>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>Delivery failed. Click to retry.</TooltipContent>
    </Tooltip>
  );
}

function ModeIndicator() {
  const healthy = isControlApiHealthy();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              healthy ? 'bg-[hsl(var(--success))]' : 'bg-[hsl(var(--warning))]'
            )}
          />
          <span className="text-[10px] text-muted-foreground">
            {healthy ? 'Live' : 'Backup'}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {healthy
          ? 'Messages delivered directly to agent'
          : 'Messages queued — delivered when agent comes online'}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Main component ───

export function ChatPage() {
  const { selectedProjectId } = useClawdOffice();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [deliveryMap, setDeliveryMap] = useState<Record<string, ChatDeliveryEntry>>({});
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Composer state
  const [targetAgent, setTargetAgent] = useState<string>('');
  const [messageText, setMessageText] = useState('');

  // Task dialog state
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [taskFromMessage, setTaskFromMessage] = useState<ChatMessage | null>(null);

  // Load agents and messages
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [agentsData, thread] = await Promise.all([
        getAgents(),
        getOrCreateDefaultThread(),
      ]);
      setAgents(agentsData);
      setThreadId(thread.id);

      const messagesData = await getChatMessages(thread.id, 100);
      setMessages(messagesData);

      // Load delivery status for outgoing agent-targeted messages
      const outgoingIds = messagesData
        .filter((m) => m.author === 'ui' && m.targetAgentKey)
        .map((m) => m.id);
      if (outgoingIds.length > 0) {
        const statuses = await getChatDeliveryStatus(outgoingIds);
        setDeliveryMap(statuses);
      }
    } catch (e: any) {
      console.error('Failed to load chat:', e);
      setError(String(e?.message || e));
    } finally {
      setIsLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime subscription
  useEffect(() => {
    if (!hasSupabase()) return;

    const unsubscribe = subscribeToProjectRealtime(selectedProjectId, (change) => {
      if (change?.table === 'project_chat_messages' && threadId) {
        getChatMessages(threadId, 100).then(setMessages).catch(console.error);
      }
      if (change?.table === 'chat_delivery_queue') {
        // Refresh delivery statuses
        setMessages((prev) => {
          const outgoingIds = prev
            .filter((m) => m.author === 'ui' && m.targetAgentKey)
            .map((m) => m.id);
          if (outgoingIds.length > 0) {
            getChatDeliveryStatus(outgoingIds).then(setDeliveryMap).catch(console.error);
          }
          return prev;
        });
      }
    });

    return unsubscribe;
  }, [selectedProjectId, threadId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!messageText.trim() || !threadId) return;

    setIsSending(true);
    try {
      const result = await sendChatMessage({
        threadId,
        message: messageText.trim(),
        targetAgentKey: targetAgent || undefined,
      });

      if (!result.ok) {
        throw new Error(result.error || 'Failed to send message');
      }

      setMessageText('');

      // Optimistic add
      if (result.message) {
        setMessages((prev) => [...prev, result.message!]);
      }

      // Show delivery mode feedback for agent-targeted messages
      if (targetAgent && result.deliveryMode) {
        if (result.deliveryMode === 'queued') {
          toast({
            title: 'Message queued',
            description: 'Agent will process when online.',
          });
        }
      }
    } catch (e: any) {
      toast({
        title: 'Failed to send message',
        description: String(e?.message || e),
        variant: 'destructive',
      });
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

  const handleRetryDelivery = async (deliveryId: string) => {
    const res = await retryChatDelivery(deliveryId);
    if (res.ok) {
      toast({ title: 'Retrying delivery...' });
    } else {
      toast({ title: 'Retry failed', description: res.error, variant: 'destructive' });
    }
  };

  const handleCreateTask = (msg: ChatMessage) => {
    setTaskFromMessage(msg);
    setTaskDialogOpen(true);
  };

  const getTaskTitleFromMessage = (msg: ChatMessage) => {
    const firstLine = msg.message.split('\n')[0].trim();
    return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: ChatMessage[] }[] = [];
    let currentDate = '';

    for (const msg of messages) {
      const msgDate = new Date(msg.createdAt).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });

      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msgDate, messages: [] });
      }

      groups[groups.length - 1].messages.push(msg);
    }

    return groups;
  }, [messages]);

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getAuthorDisplay = (author: string) => {
    if (author.startsWith('agent:')) {
      const agent = agents.find((a) => a.id === author);
      if (agent) return { name: agent.name, avatar: agent.avatar || '🤖', isAgent: true };
      const parts = author.split(':');
      return { name: parts[1] || author, avatar: '🤖', isAgent: true };
    }
    if (author === 'ui' || author === 'dashboard') {
      return { name: 'You', avatar: null, isAgent: false };
    }
    return { name: author, avatar: null, isAgent: false };
  };

  const getTargetAgentDisplay = (targetKey: string | null) => {
    if (!targetKey) return null;
    const agent = agents.find((a) => a.id === targetKey);
    if (agent) return { name: agent.name, avatar: agent.avatar || '🤖' };
    const parts = targetKey.split(':');
    return { name: parts[1] || targetKey, avatar: '🤖' };
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">War Room</h1>
          <p className="text-sm text-muted-foreground">Project conversations</p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadData} disabled={isLoading}>
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Messages area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {isLoading && messages.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            Loading messages...
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Bot className="w-8 h-8 mb-2 opacity-50" />
            <p>No messages yet. Start a conversation!</p>
          </div>
        )}

        {groupedMessages.map((group) => (
          <div key={group.date} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground font-medium">{group.date}</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-3">
              {group.messages.map((msg) => {
                const author = getAuthorDisplay(msg.author);
                const target = getTargetAgentDisplay(msg.targetAgentKey);
                const isOutgoing = !author.isAgent;
                const delivery = deliveryMap[msg.id];

                return (
                  <div
                    key={msg.id}
                    className={cn('flex gap-3', isOutgoing && 'flex-row-reverse')}
                  >
                    {/* Avatar */}
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0',
                        author.isAgent ? 'bg-primary/10' : 'bg-muted'
                      )}
                    >
                      {author.avatar ||
                        (author.isAgent ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />)}
                    </div>

                    {/* Message bubble */}
                    <div
                      className={cn(
                        'max-w-[75%] rounded-lg p-3',
                        isOutgoing ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      )}
                    >
                      {/* Header */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium opacity-80">
                          {author.name}
                          {target && (
                            <span className="opacity-60">
                              {' '}
                              → {target.avatar} {target.name}
                            </span>
                          )}
                        </span>
                      </div>

                      {/* Message content */}
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>

                      {/* Footer */}
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <span className="text-[10px] opacity-60 flex items-center gap-0.5">
                          {formatTime(msg.createdAt)}
                          {isOutgoing && msg.targetAgentKey && (
                            <DeliveryStatusBadge
                              entry={delivery}
                              onRetry={handleRetryDelivery}
                            />
                          )}
                        </span>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 opacity-60 hover:opacity-100"
                              onClick={() => handleCreateTask(msg)}
                            >
                              <CheckSquare className="w-3 h-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Suggest Task</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </ScrollArea>

      {/* Composer */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2 mb-2">
          <ModeIndicator />
          {targetAgent && (
            <span className="text-[10px] text-muted-foreground">
              {isControlApiHealthy()
                ? 'Will deliver directly'
                : 'Will queue for later delivery'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Target agent selector */}
          <Select
            value={targetAgent || '__general__'}
            onValueChange={(v) => setTargetAgent(v === '__general__' ? '' : v)}
          >
            <SelectTrigger className="w-40 shrink-0">
              <SelectValue placeholder="To..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__general__">
                <div className="flex items-center gap-2">
                  <span>📢</span>
                  <span>General</span>
                </div>
              </SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <div className="flex items-center gap-2">
                    <span>{a.avatar || '🤖'}</span>
                    <span>{a.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Message input */}
          <Input
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isSending}
            className="flex-1"
          />

          {/* Send button */}
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!messageText.trim() || isSending}
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* New Task Dialog */}
      <NewTaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        agents={agents}
        defaultAssignee={
          taskFromMessage
            ? agents.find(a => a.id === taskFromMessage.author)
              ? taskFromMessage.author
              : (agents.find(a => a.role?.toLowerCase().includes('pm'))?.id || agents[0]?.id || undefined)
            : undefined
        }
        defaultTitle={taskFromMessage ? getTaskTitleFromMessage(taskFromMessage) : undefined}
        defaultDescription={taskFromMessage?.message || undefined}
        isProposed={!!taskFromMessage}
        sourceMetadata={taskFromMessage ? { chat_message_id: taskFromMessage.id } : undefined}
        onCreated={() => {
          setTaskFromMessage(null);
          toast({ title: 'Suggested task created', description: 'Check the Inbox on the Tasks board.' });
        }}
      />
    </div>
  );
}
