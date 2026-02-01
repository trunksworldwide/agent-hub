import { useClawdOS, type AgentTab } from '@/lib/store';
import { cn } from '@/lib/utils';
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

export function AgentDetail() {
  const { selectedAgentId, activeAgentTab, setActiveAgentTab, files } = useClawdOS();

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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Agent Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🤖</span>
          <div>
            <h1 className="text-xl font-semibold capitalize">{selectedAgentId}</h1>
            <p className="text-sm text-muted-foreground">Primary Agent</p>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-muted/30">
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
