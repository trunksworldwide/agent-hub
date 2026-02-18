import { useEffect, useState } from 'react';
import { PanelLeft, Plus } from 'lucide-react';
import { useClawdOffice, type AgentTab } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getAgents, type Agent } from '@/lib/api';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { StatusTooltip } from '@/components/ui/StatusTooltip';
import { AgentOverview } from './agent-tabs/AgentOverview';
import { SoulEditor } from './agent-tabs/SoulEditor';
import { UserEditor } from './agent-tabs/UserEditor';
import { MemoryEditor } from './agent-tabs/MemoryEditor';
import { ToolsView } from './agent-tabs/ToolsView';
import { SkillsView } from './agent-tabs/SkillsView';
import { SessionsView } from './agent-tabs/SessionsView';
import { AgentsDocEditor } from './agent-tabs/AgentsDocEditor';
import { NewTaskDialog } from './dialogs/NewTaskDialog';

const agentTabs: { id: AgentTab; label: string; icon: string; tooltip: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📋', tooltip: 'Agent profile, purpose, doc status, and quick actions.' },
  { id: 'soul', label: 'Soul', icon: '✨', tooltip: "Defines the agent's personality, behavior rules, and boundaries (SOUL.md)." },
  { id: 'user', label: 'User', icon: '👤', tooltip: 'Who the operator is: preferences, timezone, formatting rules (USER.md).' },
  { id: 'memory', label: 'Memory', icon: '🧠', tooltip: 'Durable long-term memory: decisions, lessons learned, runbooks (MEMORY.md).' },
  { id: 'tools', label: 'Tools', icon: '🔧', tooltip: 'Environment-specific notes: apps, APIs, device names (TOOLS.md).' },
  { id: 'skills', label: 'Skills', icon: '🎯', tooltip: 'Installed capabilities and how-to playbooks (SKILLS.md).' },
  { id: 'agents_doc', label: 'Handbook', icon: '📖', tooltip: 'Operating rules and universal instructions (AGENTS.md).' },
  { id: 'sessions', label: 'Sessions', icon: '💬', tooltip: 'Active and previous sessions for status and messaging.' },
];

export function AgentDetail({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const { selectedAgentId, setSelectedAgentId, activeAgentTab, setActiveAgentTab, files, selectedProjectId } = useClawdOffice();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [showNewTask, setShowNewTask] = useState(false);

  const isPrimaryAgent = selectedAgentId === 'agent:main:main';

  const loadAgents = async () => {
    if (!selectedAgentId) {
      setAgent(null);
      return;
    }
    try {
      const agentsData = await getAgents();
      setAgents(agentsData);
      setAgent(agentsData.find((a) => a.id === selectedAgentId) || null);
    } catch (e) {
      console.warn('Failed to load agent header info:', e);
      setAgent(null);
    }
  };

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!selectedAgentId) { setAgent(null); return; }
      try {
        const agentsData = await getAgents();
        if (!alive) return;
        setAgents(agentsData);
        const found = agentsData.find((a) => a.id === selectedAgentId) || null;
        setAgent(found);
        // Default sub-agents to overview tab, primary to soul
        if (found && selectedAgentId !== 'agent:main:main' && activeAgentTab === 'soul') {
          setActiveAgentTab('overview');
        }
      } catch (e) {
        console.warn('Failed to load agent header info:', e);
        if (!alive) return;
        setAgent(null);
      }
    };
    load();
    return () => { alive = false; };
  }, [selectedAgentId, selectedProjectId]);

  if (!selectedAgentId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select an agent to view details
      </div>
    );
  }

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

  const renderTabContent = () => {
    switch (activeAgentTab) {
      case 'overview':
        return <AgentOverview agent={agent} onRefresh={loadAgents} onDeleted={() => {
          setSelectedAgentId(null);
        }} />;
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
      case 'agents_doc':
        return <AgentsDocEditor />;
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

            <span className="text-3xl">{agent?.avatar || '🤖'}</span>

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
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowNewTask(true)}
            >
              <Plus className="w-4 h-4" />
              New Task
            </Button>

            {agent?.status ? (
              <StatusTooltip
                status={agent.status}
                statusState={agent.statusState}
                lastActivityAt={agent.lastActivityAt}
                lastHeartbeatAt={agent.lastHeartbeatAt}
              >
                <span
                  className={cn(
                    'w-3 h-3 rounded-full cursor-help',
                    agent.status === 'working'
                      ? 'status-dot-working'
                      : agent.status === 'idle'
                        ? 'status-dot-idle'
                        : 'status-dot-offline'
                  )}
                  aria-label={agent.status}
                />
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

      {/* New Task Dialog */}
      <NewTaskDialog
        open={showNewTask}
        onOpenChange={setShowNewTask}
        agents={agents}
        defaultAssignee={agent?.id}
      />
    </div>
  );
}
