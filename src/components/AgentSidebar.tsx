import { useEffect, useState } from 'react';
import { useClawdOffice } from '@/lib/store';
import { getAgents, type Agent } from '@/lib/api';
import { cn } from '@/lib/utils';

export function AgentSidebar() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const { selectedAgentId, setSelectedAgentId } = useClawdOffice();

  useEffect(() => {
    getAgents().then(setAgents);
  }, []);

  const getStatusBadge = (status: Agent['status']) => {
    const styles = {
      online: 'badge-online',
      idle: 'badge-idle',
      running: 'badge-running',
      offline: 'badge-offline',
    };
    return styles[status];
  };

  return (
    <aside className="w-64 border-r border-border bg-sidebar h-full overflow-y-auto scrollbar-thin">
      <div className="p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Agents
        </h2>
        <div className="space-y-1">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setSelectedAgentId(agent.id)}
              className={cn(
                "agent-card w-full text-left",
                selectedAgentId === agent.id && "agent-card-active"
              )}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{agent.avatar}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{agent.name}</span>
                    <span className={cn("badge-status", getStatusBadge(agent.status))}>
                      {agent.status}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{agent.role}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {agent.skillCount} skills • {agent.lastActive}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
