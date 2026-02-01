import { AgentSidebar } from '@/components/AgentSidebar';
import { AgentDetail } from '@/components/AgentDetail';

export function AgentsPage() {
  return (
    <div className="flex h-full">
      <AgentSidebar />
      <AgentDetail />
    </div>
  );
}
