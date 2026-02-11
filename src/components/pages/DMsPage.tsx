import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  Send, Bot, User, AlertCircle, Check, Clock, RotateCcw, Loader2, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useClawdOffice } from '@/lib/store';
import {
  getAgents,
  getChatMessages,
  sendChatMessage,
  getOrCreateDMThread,
  getChatDeliveryStatus,
  retryChatDelivery,
  isControlApiHealthy,
  type Agent,
  type ChatMessage,
  type ChatDeliveryEntry,
  type ChatThread,
} from '@/lib/api';
import { hasSupabase, subscribeToProjectRealtime } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

// ─── Delivery badge (shared pattern from ChatPage) ───

function DeliveryBadge({ entry, onRetry }: { entry?: ChatDeliveryEntry; onRetry?: (id: string) => void }) {
  if (!entry) return null;
  if (entry.status === 'processed')
    return <Check className="w-3 h-3 text-[hsl(var(--success))] inline-block ml-1" />;
  if (entry.status === 'delivered')
    return <Check className="w-3 h-3 text-muted-foreground inline-block ml-1" />;
  if (entry.status === 'queued')
    return <Clock className="w-3 h-3 text-[hsl(var(--warning))] inline-block ml-1" />;
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      <AlertCircle className="w-3 h-3 text-destructive" />
      {onRetry && (
        <Button variant="ghost" size="icon" className="h-4 w-4 p-0" onClick={() => onRetry(entry.id)}>
          <RotateCcw className="w-2.5 h-2.5" />
        </Button>
      )}
    </span>
  );
}

// ─── Agent List Sidebar ───

function AgentList({
  agents,
  selected,
  onSelect,
}: {
  agents: Agent[];
  selected: string[];
  onSelect: (agentId: string) => void;
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-border">
        <h2 className="text-sm font-semibold">Agents</h2>
        <p className="text-[10px] text-muted-foreground">Select to open DM</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {agents.map((a) => {
            const isOpen = selected.includes(a.id);
            return (
              <button
                key={a.id}
                onClick={() => onSelect(a.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left',
                  isOpen ? 'bg-accent text-accent-foreground' : 'hover:bg-muted text-muted-foreground'
                )}
              >
                <span className="text-base">{a.avatar || '🤖'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{a.name}</div>
                  <div className="text-[10px] opacity-70 truncate">{a.role}</div>
                </div>
                {isOpen && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">open</Badge>}
              </button>
            );
          })}
          {agents.length === 0 && (
            <div className="text-sm text-muted-foreground p-4 text-center">No agents found</div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Single DM Panel ───

function DMPanel({
  agent,
  agents,
}: {
  agent: Agent;
  agents: Agent[];
}) {
  const { selectedProjectId } = useClawdOffice();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [deliveryMap, setDeliveryMap] = useState<Record<string, ChatDeliveryEntry>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');

  const loadMessages = useCallback(async () => {
    try {
      const t = await getOrCreateDMThread(agent.id);
      setThread(t);
      const msgs = await getChatMessages(t.id, 100);
      setMessages(msgs);

      const outIds = msgs.filter((m) => m.author === 'ui' && m.targetAgentKey).map((m) => m.id);
      if (outIds.length > 0) {
        const statuses = await getChatDeliveryStatus(outIds);
        setDeliveryMap(statuses);
      }
    } catch (e) {
      console.error('DM load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [agent.id]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setThread(null);
    loadMessages();
  }, [loadMessages]);

  // Realtime
  useEffect(() => {
    if (!hasSupabase()) return;
    const unsub = subscribeToProjectRealtime(selectedProjectId, (change) => {
      if (change?.table === 'project_chat_messages' && thread) {
        getChatMessages(thread.id, 100).then(setMessages).catch(console.error);
      }
      if (change?.table === 'chat_delivery_queue') {
        const outIds = messages.filter((m) => m.author === 'ui' && m.targetAgentKey).map((m) => m.id);
        if (outIds.length) getChatDeliveryStatus(outIds).then(setDeliveryMap).catch(console.error);
      }
    });
    return unsub;
  }, [selectedProjectId, thread, messages]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    if (!text.trim() || !thread) return;
    setSending(true);
    try {
      const res = await sendChatMessage({
        threadId: thread.id,
        message: text.trim(),
        targetAgentKey: agent.id,
      });
      if (!res.ok) throw new Error(res.error || 'Send failed');
      setText('');
      if (res.message) setMessages((prev) => [...prev, res.message!]);
      if (res.deliveryMode === 'queued') {
        toast({ title: 'Message queued', description: 'Agent will process when online.' });
      }
    } catch (e: any) {
      toast({ title: 'Send failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleRetry = async (id: string) => {
    const res = await retryChatDelivery(id);
    if (!res.ok) toast({ title: 'Retry failed', description: res.error, variant: 'destructive' });
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const healthy = isControlApiHealthy();

  return (
    <div className="h-full flex flex-col border-l border-border first:border-l-0">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center gap-2">
        <span className="text-lg">{agent.avatar || '🤖'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{agent.name}</div>
          <div className="text-[10px] text-muted-foreground truncate">{agent.role}</div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn('w-1.5 h-1.5 rounded-full', healthy ? 'bg-[hsl(var(--success))]' : 'bg-[hsl(var(--warning))]')} />
          </TooltipTrigger>
          <TooltipContent>{healthy ? 'Direct delivery' : 'Queued delivery'}</TooltipContent>
        </Tooltip>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-3" ref={scrollRef}>
        {loading && (
          <div className="flex items-center justify-center h-24 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-24 text-muted-foreground">
            <MessageSquare className="w-6 h-6 mb-1 opacity-50" />
            <p className="text-xs">Start a conversation with {agent.name}</p>
          </div>
        )}
        <div className="space-y-2">
          {messages.map((msg) => {
            const isMe = msg.author === 'ui' || msg.author === 'dashboard';
            const delivery = deliveryMap[msg.id];
            return (
              <div key={msg.id} className={cn('flex gap-2', isMe && 'flex-row-reverse')}>
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0',
                  isMe ? 'bg-muted' : 'bg-primary/10'
                )}>
                  {isMe ? <User className="w-3 h-3" /> : (agent.avatar || <Bot className="w-3 h-3" />)}
                </div>
                <div className={cn(
                  'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                  isMe ? 'bg-primary text-primary-foreground' : 'bg-muted'
                )}>
                  <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                  <span className="text-[9px] opacity-60 flex items-center gap-0.5 mt-1">
                    {formatTime(msg.createdAt)}
                    {isMe && msg.targetAgentKey && <DeliveryBadge entry={delivery} onRetry={handleRetry} />}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Composer */}
      <div className="p-2 border-t border-border flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={`Message ${agent.name}...`}
          disabled={sending}
          className="flex-1 h-8 text-sm"
        />
        <Button size="icon" className="h-8 w-8" onClick={handleSend} disabled={!text.trim() || sending}>
          {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  );
}

// ─── Main DMsPage ───

export function DMsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [openAgents, setOpenAgents] = useState<string[]>([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    getAgents().then(setAgents).catch(() => setAgents([]));
  }, []);

  const handleSelect = (agentId: string) => {
    setOpenAgents((prev) => {
      if (prev.includes(agentId)) return prev.filter((id) => id !== agentId);
      // On mobile, only 1 panel; on desktop, max 2
      const max = isMobile ? 1 : 2;
      const next = [...prev, agentId];
      return next.length > max ? next.slice(-max) : next;
    });
  };

  const openAgentObjects = useMemo(
    () => openAgents.map((id) => agents.find((a) => a.id === id)).filter(Boolean) as Agent[],
    [openAgents, agents]
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-semibold">Direct Messages</h1>
        <p className="text-sm text-muted-foreground">Private conversations with agents</p>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Agent list */}
        <div className={cn('border-r border-border shrink-0', isMobile ? 'w-16' : 'w-48')}>
          {isMobile ? (
            // Compact mobile list
            <ScrollArea className="h-full">
              <div className="p-1 space-y-1">
                {agents.map((a) => (
                  <Tooltip key={a.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleSelect(a.id)}
                        className={cn(
                          'w-full flex items-center justify-center p-2 rounded-md transition-colors',
                          openAgents.includes(a.id) ? 'bg-accent' : 'hover:bg-muted'
                        )}
                      >
                        <span className="text-lg">{a.avatar || '🤖'}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{a.name}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <AgentList agents={agents} selected={openAgents} onSelect={handleSelect} />
          )}
        </div>

        {/* DM panels */}
        <div className="flex-1 overflow-hidden">
          {openAgentObjects.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Select an agent to start chatting</p>
            </div>
          )}

          {openAgentObjects.length === 1 && (
            <DMPanel agent={openAgentObjects[0]} agents={agents} />
          )}

          {openAgentObjects.length === 2 && (
            <ResizablePanelGroup direction="horizontal">
              <ResizablePanel defaultSize={50} minSize={30}>
                <DMPanel agent={openAgentObjects[0]} agents={agents} />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={30}>
                <DMPanel agent={openAgentObjects[1]} agents={agents} />
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      </div>
    </div>
  );
}
