import { useEffect, useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { useClawdOffice, type AgentTab } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getAgents, type Agent } from '@/lib/api';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { StatusTooltip } from '@/components/ui/StatusTooltip';
import { SoulEditor } from './agent-tabs/SoulEditor';
import { UserEditor } from './agent-tabs/UserEditor';
import { MemoryEditor } from './agent-tabs/MemoryEditor';
import { ToolsView } from './agent-tabs/ToolsView';
import { SkillsView } from './agent-tabs/SkillsView';
import { SessionsView } from './agent-tabs/SessionsView';

const agentTabs: { id: AgentTab; label: string; icon: string; tooltip: string }[] = [
  { id: 'soul', label: 'Soul', icon: '✨', tooltip: "Defines the agent's personality, behavior rules, and core truths." },
  { id: 'user', label: 'User', icon: '👤', tooltip: 'Who the user is: preferences, permissions, and profile.' },
  { id: 'memory', label: 'Memory', icon: '🧠', tooltip: 'Long-term notes and daily logs for continuity. Keep curated.' },
  { id: 'tools', label: 'Tools', icon: '🔧', tooltip: 'Environment-specific settings: devices, SSH, preferences.' },
  { id: 'skills', label: 'Skills', icon: '🎯', tooltip: 'Installed capabilities that affect what the agent can do.' },
  { id: 'sessions', label: 'Sessions', icon: '💬', tooltip: 'Active and previous sessions for status and messaging.' },
];

export function AgentDetail({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const { selectedAgentId, activeAgentTab, setActiveAgentTab, files, selectedProjectId } = useClawdOffice();
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
  }, [selectedAgentId, selectedProjectId]);

  if (!selectedAgentId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select an agent to view details
      </div>
    );
  }

  // Project scoping: if an agent key is selected but doesn't exist in this project,
  // show a soft error instead of rendering a broken header.
  if (!agent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-md text-center">
          <div className="text-sm font-medium">Agent not found in this project.</div>
          <div className="mt-2 text-xs text-muted-foreground break-all">
            Selected: <span className="font-mono">{selectedAgentId}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Pick another agent from the sidebar.
          </div>
        </div>
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
    const styles: Record<string, string> = {
      working: 'badge-working',
      idle: 'badge-idle',
      offline: 'badge-offline',
    };
    if (!status) return 'badge-offline';
    return styles[status] || 'badge-offline';
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
              <span
                className={cn(
                  'absolute -left-1 -top-1 ring-2 ring-background rounded-full status-dot h-3 w-3',
                  agent.status === 'working'
                    ? 'status-dot-working'
                    : agent.status === 'idle'
                      ? 'status-dot-idle'
                      : 'status-dot-offline'
                )}
                aria-hidden
              />
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
              <StatusTooltip
                status={agent.status}
                statusState={agent.statusState}
                lastActivityAt={agent.lastActivityAt}
                lastHeartbeatAt={agent.lastHeartbeatAt}
              >
                <span className={cn('badge-status cursor-help', getStatusBadge(agent.status))}>
                  {agent.status}
                </span>
              </StatusTooltip>
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
              <InfoTooltip text={tab.tooltip} className="ml-0.5" />
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
