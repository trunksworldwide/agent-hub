import { useEffect, useRef, useState, useMemo } from 'react';
import { Send, RefreshCw, Bot, User, AlertCircle, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useClawdOffice } from '@/lib/store';
import { getAgents, type Agent } from '@/lib/api';
import { getChatMessages, sendChatMessage, getOrCreateDefaultThread, type ChatMessage } from '@/lib/api';
import { hasSupabase, subscribeToProjectRealtime } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { NewTaskDialog } from '@/components/dialogs/NewTaskDialog';

export function ChatPage() {
  const { selectedProjectId } = useClawdOffice();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
  const loadData = async () => {
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
    } catch (e: any) {
      console.error('Failed to load chat:', e);
      setError(String(e?.message || e));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedProjectId]);

  // Realtime subscription
  useEffect(() => {
    if (!hasSupabase()) return;

    const unsubscribe = subscribeToProjectRealtime(selectedProjectId, (change) => {
      if (change?.table === 'project_chat_messages') {
        // Reload messages on any change
        if (threadId) {
          getChatMessages(threadId, 100).then(setMessages).catch(console.error);
        }
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
      // Message will appear via realtime, but also add optimistically
      if (result.message) {
        setMessages(prev => [...prev, result.message!]);
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

  const handleCreateTask = (msg: ChatMessage) => {
    setTaskFromMessage(msg);
    setTaskDialogOpen(true);
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
    // Check if it's an agent
    if (author.startsWith('agent:')) {
      const agent = agents.find(a => a.id === author);
      if (agent) {
        return { name: agent.name, avatar: agent.avatar || '🤖', isAgent: true };
      }
      // Extract name from key
      const parts = author.split(':');
      return { name: parts[1] || author, avatar: '🤖', isAgent: true };
    }

    // UI/dashboard author
    if (author === 'ui' || author === 'dashboard') {
      return { name: 'You', avatar: null, isAgent: false };
    }

    // Human author
    return { name: author, avatar: null, isAgent: false };
  };

  const getTargetAgentDisplay = (targetKey: string | null) => {
    if (!targetKey) return null;
    const agent = agents.find(a => a.id === targetKey);
    if (agent) {
      return { name: agent.name, avatar: agent.avatar || '🤖' };
    }
    const parts = targetKey.split(':');
    return { name: parts[1] || targetKey, avatar: '🤖' };
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Chat</h1>
          <p className="text-sm text-muted-foreground">Project conversations</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadData}
          disabled={isLoading}
        >
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

      {/* Delivery notice */}
      <div className="px-4 pt-2">
        <Alert className="bg-muted/50 border-muted">
          <AlertDescription className="text-xs text-muted-foreground">
            💬 Messages are stored. Agent delivery coming soon.
          </AlertDescription>
        </Alert>
      </div>

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

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-3",
                      isOutgoing && "flex-row-reverse"
                    )}
                  >
                    {/* Avatar */}
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0",
                      author.isAgent ? "bg-primary/10" : "bg-muted"
                    )}>
                      {author.avatar || (author.isAgent ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />)}
                    </div>

                    {/* Message bubble */}
                    <div className={cn(
                      "max-w-[75%] rounded-lg p-3",
                      isOutgoing 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted"
                    )}>
                      {/* Header */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium opacity-80">
                          {author.name}
                          {target && (
                            <span className="opacity-60"> → {target.avatar} {target.name}</span>
                          )}
                        </span>
                      </div>

                      {/* Message content */}
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>

                      {/* Footer */}
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <span className="text-[10px] opacity-60">{formatTime(msg.createdAt)}</span>
                        
                        {!isOutgoing && (
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
                            <TooltipContent>Create task from message</TooltipContent>
                          </Tooltip>
                        )}
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
        <div className="flex items-center gap-2">
          {/* Target agent selector */}
          <Select value={targetAgent || '__general__'} onValueChange={(v) => setTargetAgent(v === '__general__' ? '' : v)}>
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
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* New Task Dialog */}
      <NewTaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        agents={agents}
        defaultAssignee={taskFromMessage?.targetAgentKey || undefined}
        onCreated={() => {
          setTaskFromMessage(null);
          toast({ title: 'Task created from message' });
        }}
      />
    </div>
  );
}
