import { useEffect, useState } from 'react';
import { getAgents, getSessions, type Agent, type Session } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ArrowRight, MessageSquare, Clock } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

// Task types for the Kanban board
interface Task {
  id: string;
  title: string;
  description: string;
  assignee?: Agent;
  tags: string[];
  createdAt: string;
  priority?: 'high' | 'medium' | 'low';
}

interface Column {
  id: string;
  title: string;
  tasks: Task[];
}

// Mock tasks data
const mockTasks: Task[] = [
  { id: 't1', title: 'Explore ClawdOffice Dashboard & Document All Features', description: 'Thoroughly explore the entire ClawdOffice dashboard...', tags: ['research', 'documentation'], createdAt: '1 day ago', priority: 'high' },
  { id: 't2', title: 'Product Demo Video Script', description: 'Create full script for ClawdOffice product demo video with...', tags: ['video', 'content', 'demo'], createdAt: '1 day ago' },
  { id: 't3', title: 'Conduct Pricing Audit Using Market Framework', description: 'Review ClawdOffice pricing against market principles: If no one...', tags: ['pricing', 'analysis'], createdAt: 'about 3 hours ago' },
  { id: 't4', title: 'Tweet Content - Real Stories Only', description: 'Create authentic tweets based on real ClawdOffice customer data', tags: ['social', 'twitter', 'content'], createdAt: 'about 8 hours ago' },
  { id: 't5', title: 'Customer Research - Tweet Material', description: 'Pull real customer data and stories from feedback for tweet...', tags: ['research', 'data', 'social'], createdAt: 'about 8 hours ago' },
  { id: 't6', title: 'Design Expansion Revenue Mechanics', description: 'Implement market-driven expansion revenue strategies...', tags: ['revenue', 'growth'], createdAt: '2 hours ago' },
  { id: 't7', title: 'AI Comparison vs Zendesk', description: 'Create detailed brief for Zendesk AI comparison page', tags: ['competitor', 'seo', 'comparison'], createdAt: '1 day ago' },
  { id: 't8', title: 'Intercom Fin Comparison', description: 'Create detailed brief for Intercom Fin comparison page', tags: ['competitor', 'seo', 'comparison'], createdAt: '2 days ago' },
  { id: 't9', title: 'Blog Landing Page', description: 'Write copy for integration landing page - how ClawdOffice helps...', tags: ['copy', 'landing-page'], createdAt: '1 day ago' },
  { id: 't10', title: 'Best AI Chatbot - Full Blog Post', description: 'Write full SEO blog post: Best AI Chatbot in 2026...', tags: ['blog', 'seo'], createdAt: '1 day ago' },
  { id: 't11', title: 'Email Marketing Strategy - Lifecycle Campaigns', description: 'Design lifecycle email campaigns for user onboarding...', tags: ['email', 'marketing'], createdAt: '3 hours ago' },
  { id: 't12', title: 'Mission Control UI', description: 'Build real-time agent command center with React + monitoring', tags: ['ui', 'frontend'], createdAt: '4 hours ago' },
];

// Feed item types
interface FeedItem {
  id: string;
  type: 'comment' | 'task' | 'decision' | 'status';
  agentName: string;
  agentAvatar: string;
  content: string;
  target?: string;
  createdAt: string;
}

const mockFeed: FeedItem[] = [
  { id: 'f1', type: 'comment', agentName: 'Quill', agentAvatar: '✍️', content: 'commented on', target: 'Write Customer Case Studies (Brent + Will)', createdAt: 'about 2 hours ago' },
  { id: 'f2', type: 'comment', agentName: 'Quill', agentAvatar: '✍️', content: 'commented on', target: 'Twitter Content Blitz - 10 Tweets This Week', createdAt: 'about 2 hours ago' },
  { id: 'f3', type: 'status', agentName: 'Trunks', agentAvatar: '🤖', content: 'completed task', target: 'Daily system health check', createdAt: 'about 3 hours ago' },
  { id: 'f4', type: 'task', agentName: 'Research', agentAvatar: '🔬', content: 'started working on', target: 'AI Comparison vs Zendesk', createdAt: 'about 4 hours ago' },
  { id: 'f5', type: 'decision', agentName: 'Coder', agentAvatar: '💻', content: 'made a decision on', target: 'Architecture for new dashboard', createdAt: 'about 5 hours ago' },
];

export function DashboardPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    getAgents().then(setAgents);
    getSessions().then(setSessions);
    
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Build columns from tasks
  const columns: Column[] = [
    { id: 'inbox', title: 'INBOX', tasks: mockTasks.slice(0, 3) },
    { id: 'assigned', title: 'ASSIGNED', tasks: mockTasks.slice(3, 5) },
    { id: 'in_progress', title: 'IN PROGRESS', tasks: mockTasks.slice(5, 8) },
    { id: 'review', title: 'REVIEW', tasks: mockTasks.slice(8, 10) },
    { id: 'done', title: 'DONE', tasks: mockTasks.slice(10) },
  ];

  const getStatusBadge = (status: Agent['status']) => {
    const styles = {
      online: 'badge-online',
      idle: 'badge-idle',
      running: 'badge-running',
      offline: 'badge-offline',
    };
    return styles[status];
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    }).toUpperCase();
  };

  const activeAgentsCount = agents.filter(a => a.status === 'online' || a.status === 'running').length;
  const totalTasks = mockTasks.length;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Agents Sidebar */}
      <aside className="w-56 border-r border-border bg-sidebar flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary" />
              AGENTS
            </h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {agents.length}
            </span>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <span className="text-xl">{agent.avatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{agent.name}</span>
                    {agent.status === 'running' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                        LEAD
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{agent.role}</p>
                </div>
                <span className={cn("badge-status text-[10px]", getStatusBadge(agent.status))}>
                  {agent.status === 'running' ? 'WORKING' : agent.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Main Content - Stacked Layout */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Dashboard Header */}
        <div className="h-14 border-b border-border bg-card/30 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-8">
            <h1 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              MISSION QUEUE
            </h1>
          </div>
          
          {/* Stats */}
          <div className="flex items-center gap-8">
            <div className="text-center">
              <div className="text-3xl font-bold">{activeAgentsCount}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Agents Active</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold">{totalTasks}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tasks in Queue</div>
            </div>
          </div>
          
          {/* Time */}
          <div className="text-right">
            <div className="text-2xl font-mono font-bold">{formatTime(currentTime)}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{formatDate(currentTime)}</div>
          </div>
        </div>

        {/* Kanban Columns - Fixed height, no vertical scroll */}
        <div className="h-[55%] min-h-[300px] overflow-x-auto p-4 shrink-0">
          <div className="flex gap-4 h-full">
            {columns.map((column) => (
              <div key={column.id} className="w-64 flex flex-col bg-muted/20 rounded-lg overflow-hidden flex-shrink-0">
                {/* Column Header */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      column.id === 'inbox' ? 'bg-muted-foreground' :
                      column.id === 'assigned' ? 'bg-amber-500' :
                      column.id === 'in_progress' ? 'bg-blue-500' :
                      column.id === 'review' ? 'bg-purple-500' :
                      'bg-green-500'
                    )} />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {column.title}
                    </h3>
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {column.tasks.length}
                  </span>
                </div>

                {/* Column Tasks */}
                <ScrollArea className="flex-1 p-2">
                  <div className="space-y-2">
                    {column.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="p-3 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors cursor-pointer group"
                      >
                        {task.priority === 'high' && (
                          <div className="text-amber-500 text-xs mb-1">↑</div>
                        )}
                        <h4 className="font-medium text-sm leading-tight mb-2 group-hover:text-primary transition-colors">
                          {task.title}
                        </h4>
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                          {task.description}
                        </p>
                        {task.assignee && (
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm">{task.assignee.avatar}</span>
                            <span className="text-xs text-muted-foreground">{task.assignee.name}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap gap-1">
                            {task.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {task.createdAt}
                          </span>
                        </div>
                        <div className="flex justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ))}
          </div>
        </div>

        {/* Live Feed - Bottom Section */}
        <div className="flex-1 border-t border-border bg-sidebar/50 flex flex-col overflow-hidden">
          <div className="px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              LIVE FEED
            </h2>
            
            {/* Feed Filters */}
            <div className="flex gap-1">
              {['All', 'Tasks', 'Comments', 'Decisions', 'Status'].map((filter, i) => (
                <button
                  key={filter}
                  className={cn(
                    "text-xs px-2 py-1 rounded transition-colors",
                    i === 0 
                      ? "bg-primary text-primary-foreground" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Agent Quick Stats */}
            <div className="flex items-center gap-2">
              {agents.map((agent) => (
                <span
                  key={agent.id}
                  className="text-xs px-2 py-1 rounded bg-muted/50 text-muted-foreground flex items-center gap-1"
                >
                  <span>{agent.avatar}</span>
                  <span className="opacity-60">{agent.skillCount}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Feed Items - Horizontal scrolling */}
          <ScrollArea className="flex-1">
            <div className="p-4 flex gap-4 overflow-x-auto">
              {mockFeed.map((item) => (
                <div 
                  key={item.id} 
                  className="flex-shrink-0 w-80 p-4 rounded-lg border border-border bg-card hover:bg-card/80 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{item.agentAvatar}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{item.agentName}</span>
                        {' '}
                        <span className="text-muted-foreground">{item.content}</span>
                      </p>
                      <p className="text-primary text-sm mt-1 hover:underline cursor-pointer truncate">
                        "{item.target}"
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {item.createdAt}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
