import { useState } from 'react';
import { X, AlertTriangle, Clock, MessageSquare } from 'lucide-react';
import { useClawdOffice, type AgentTab } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SoulEditor } from './agent-tabs/SoulEditor';
import { UserEditor } from './agent-tabs/UserEditor';
import { MemoryEditor } from './agent-tabs/MemoryEditor';
import { ToolsView } from './agent-tabs/ToolsView';
import { SkillsView } from './agent-tabs/SkillsView';
import { SessionsView } from './agent-tabs/SessionsView';

// Profile tabs matching the reference design
type ProfileTab = 'attention' | 'timeline' | 'messages';

const profileTabs: { id: ProfileTab; label: string; icon: React.ReactNode; count?: number }[] = [
  { id: 'attention', label: 'Attention', icon: <AlertTriangle className="w-4 h-4" />, count: 2 },
  { id: 'timeline', label: 'Timeline', icon: <Clock className="w-4 h-4" /> },
  { id: 'messages', label: 'Messages', icon: <MessageSquare className="w-4 h-4" /> },
];

// Mock skills for display
const agentSkills = ['retention', 'churn-prevention', 'customer-health', 'proactive-outreach', 'win-back', 'onboarding'];

// Legacy tabs for the editor view
const editorTabs: { id: AgentTab; label: string; icon: string }[] = [
  { id: 'soul', label: 'Soul', icon: '✨' },
  { id: 'user', label: 'User', icon: '👤' },
  { id: 'memory', label: 'Memory', icon: '🧠' },
  { id: 'tools', label: 'Tools', icon: '🔧' },
  { id: 'skills', label: 'Skills', icon: '🎯' },
  { id: 'sessions', label: 'Sessions', icon: '💬' },
];

type AgentStatus = 'working' | 'idle' | 'offline';

// Status badge component
function StatusBadge({ status }: { status: AgentStatus }) {
  const statusStyles = {
    working: {
      badge: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.3)]",
      dot: "bg-[hsl(var(--success))]",
      label: "WORKING",
    },
    idle: {
      badge: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.3)]",
      dot: "bg-[hsl(var(--warning))]",
      label: "IDLE",
    },
    offline: {
      badge: "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)/0.3)]",
      dot: "bg-[hsl(var(--destructive))]",
      label: "OFFLINE",
    },
  };

  const style = statusStyles[status];

  return (
    <Badge className={cn("gap-2 px-4 py-2 text-sm font-medium", style.badge)} variant="outline">
      <span className={cn("w-2 h-2 rounded-full", style.dot)} />
      {style.label}
    </Badge>
  );
}

interface AgentDetailProps {
  onClose?: () => void;
  onOpenSidebar?: () => void;
  showEditorView?: boolean;
}

export function AgentDetail({ onClose, onOpenSidebar, showEditorView = false }: AgentDetailProps) {
  const { selectedAgentId, activeAgentTab, setActiveAgentTab, files } = useClawdOffice();
  const [activeProfileTab, setActiveProfileTab] = useState<ProfileTab>('attention');
  const [message, setMessage] = useState('');

  if (!selectedAgentId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select an agent to view details
      </div>
    );
  }

  // For legacy editor view
  if (showEditorView) {
    return <EditorView onClose={onClose} />;
  }

  // Agent profile data (would come from API in production)
  const agentName = selectedAgentId.charAt(0).toUpperCase() + selectedAgentId.slice(1);
  const agentRole = 'Primary Agent';
  const agentStatus: AgentStatus = 'working';
  const statusReason = 'Processing incoming requests. Monitoring task queue for new assignments.';
  const agentAbout = `I am ${agentName}. Your primary AI assistant. I help with tasks, research, and coordination. My tools: web browsing, code execution, file management. My mission: Make your work easier and more efficient.`;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-card">
      {/* Profile Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[hsl(var(--success))]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Agent Profile
          </h2>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {/* Agent Identity */}
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 rounded-2xl bg-secondary/50 flex items-center justify-center text-4xl border border-border">
              🤖
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold">{agentName}</h1>
              <p className="text-muted-foreground">{agentRole}</p>
              <Badge 
                variant="outline" 
                className="mt-2 border-[hsl(var(--warning)/0.5)] text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)]"
              >
                Primary
              </Badge>
            </div>
          </div>

          {/* Status Badge */}
          <div>
            <StatusBadge status={agentStatus} />

            {/* Status Reason Block */}
            <div className="mt-3 p-4 bg-secondary/30 rounded-lg border border-border/50">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                Status Reason:
              </p>
              <p className="text-sm text-foreground/80">{statusReason}</p>
            </div>
            <p className="mt-2 text-xs text-muted-foreground italic">Since about 5 minutes ago</p>
          </div>

          {/* About Section */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              About
            </h3>
            <p className="text-sm text-foreground/80 leading-relaxed">{agentAbout}</p>
          </div>

          {/* Skills Section */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Skills
            </h3>
            <div className="flex flex-wrap gap-2">
              {agentSkills.map((skill) => (
                <Badge 
                  key={skill} 
                  variant="secondary"
                  className="bg-secondary/50 text-muted-foreground border border-border/50 hover:bg-secondary/70"
                >
                  {skill}
                </Badge>
              ))}
            </div>
          </div>

          {/* Profile Tabs */}
          <div>
            <div className="flex items-center gap-1 border-b border-border">
              {profileTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveProfileTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                    activeProfileTab === tab.id 
                      ? "text-[hsl(var(--warning))] border-[hsl(var(--warning))]" 
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  )}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className={cn(
                      "px-1.5 py-0.5 text-xs rounded-full",
                      activeProfileTab === tab.id 
                        ? "bg-[hsl(var(--warning)/0.2)] text-[hsl(var(--warning))]" 
                        : "bg-muted text-muted-foreground"
                    )}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="py-4">
              {activeProfileTab === 'attention' && (
                <p className="text-sm text-muted-foreground">
                  Tasks & mentions needing {agentName}'s attention
                </p>
              )}
              {activeProfileTab === 'timeline' && (
                <p className="text-sm text-muted-foreground">
                  Recent activity timeline for {agentName}
                </p>
              )}
              {activeProfileTab === 'messages' && (
                <p className="text-sm text-muted-foreground">
                  Message history with {agentName}
                </p>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Message Input */}
      <div className="p-4 border-t border-border bg-card">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Send Message to {agentName}
        </h4>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={`Message ${agentName}... (@ to mention)`}
          className="min-h-[80px] bg-secondary/30 border-border/50 resize-none"
        />
      </div>
    </div>
  );
}

// Legacy editor view component
function EditorView({ onClose }: { onClose?: () => void }) {
  const { selectedAgentId, activeAgentTab, setActiveAgentTab, files } = useClawdOffice();

  const renderTabContent = () => {
    switch (activeAgentTab) {
      case 'soul':
        return <SoulEditor />;
      case 'user':
        return <UserEditor />;
      case 'memory':
        return <MemoryEditor />;
      case 'tools':
        return <ToolsView />;
      case 'skills':
        return <SkillsView />;
      case 'sessions':
        return <SessionsView />;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Agent Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🤖</span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold capitalize truncate">{selectedAgentId}</h1>
            <p className="text-sm text-muted-foreground">Primary Agent</p>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-muted/30 overflow-x-auto whitespace-nowrap">
        {editorTabs.map((tab) => {
          const tabFileKey = `${selectedAgentId}-${tab.id}`;
          const tabIsDirty = files[tabFileKey]?.isDirty || false;
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveAgentTab(tab.id)}
              className={cn(
                "nav-tab flex items-center gap-2 relative",
                activeAgentTab === tab.id && "nav-tab-active"
              )}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tabIsDirty && (
                <span className="w-2 h-2 rounded-full bg-warning absolute -top-0.5 -right-0.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {renderTabContent()}
      </div>
    </div>
  );
}
