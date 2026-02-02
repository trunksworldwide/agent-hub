import { useEffect, useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { useClawdOffice, type AgentTab } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getAgents, type Agent } from '@/lib/api';
import { SoulEditor } from './agent-tabs/SoulEditor';
import { UserEditor } from './agent-tabs/UserEditor';
import { MemoryEditor } from './agent-tabs/MemoryEditor';
import { ToolsView } from './agent-tabs/ToolsView';
import { SkillsView } from './agent-tabs/SkillsView';
import { SessionsView } from './agent-tabs/SessionsView';

const agentTabs: { id: AgentTab; label: string; icon: string }[] = [
  { id: 'soul', label: 'Soul', icon: '✨' },
  { id: 'user', label: 'User', icon: '👤' },
  { id: 'memory', label: 'Memory', icon: '🧠' },
  { id: 'tools', label: 'Tools', icon: '🔧' },
  { id: 'skills', label: 'Skills', icon: '🎯' },
  { id: 'sessions', label: 'Sessions', icon: '💬' },
];

export function AgentDetail({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const { selectedAgentId, activeAgentTab, setActiveAgentTab, files } = useClawdOffice();
  const [agent, setAgent] = useState<Agent | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!selectedAgentId) {
        setAgent(null);
        return;
      }

      try {
        const agents = await getAgents();
        if (!alive) return;
        setAgent(agents.find((a) => a.id === selectedAgentId) || null);
      } catch (e) {
        // Fail soft – editing agent files should still work even if roster fetch fails.
        console.warn('Failed to load agent header info:', e);
        if (!alive) return;
        setAgent(null);
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [selectedAgentId]);

  if (!selectedAgentId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select an agent to view details
      </div>
    );
  }

  const fileKey = `${selectedAgentId}-${activeAgentTab}`;
  const fileState = files[fileKey];
  const isDirty = fileState?.isDirty || false;

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

  const getStatusBadge = (status: Agent['status'] | undefined) => {
    const styles = {
      online: 'badge-online',
      idle: 'badge-idle',
      running: 'badge-running',
      offline: 'badge-offline',
    };
    if (!status) return 'badge-idle';
    return styles[status] || 'badge-idle';
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Agent Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => onOpenSidebar?.()}
              title="Agents"
            >
              <PanelLeft className="w-4 h-4" />
            </Button>

            <div className="relative">
              {agent?.color ? (
                <span
                  className="absolute -left-1 -top-1 h-3 w-3 rounded-full ring-2 ring-background"
                  style={{ backgroundColor: agent.color }}
                  aria-hidden
                />
              ) : null}
              <span className="text-3xl">{agent?.avatar || '🤖'}</span>
            </div>

            <div className="min-w-0">
              <h1 className="text-xl font-semibold truncate">
                {agent?.name || selectedAgentId}
              </h1>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <span className="truncate">{agent?.role || 'Agent'}</span>

                {agent?.statusState ? (
                  <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground/80">
                    {agent.statusState}
                  </span>
                ) : null}

                {agent?.lastActive ? (
                  <span
                    className="text-xs"
                    title={
                      agent.lastHeartbeatAt || agent.lastActivityAt
                        ? `last seen: ${agent.lastHeartbeatAt || agent.lastActivityAt}`
                        : undefined
                    }
                  >
                    Seen {agent.lastActive}
                  </span>
                ) : null}

                {agent?.statusNote ? (
                  <span className="truncate text-xs">· {agent.statusNote}</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {agent?.status ? (
              <span className={cn('badge-status', getStatusBadge(agent.status))}>
                {agent.status}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-muted/30 overflow-x-auto whitespace-nowrap">
        {agentTabs.map((tab) => {
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
