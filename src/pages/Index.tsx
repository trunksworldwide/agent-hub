import { TopBar } from '@/components/TopBar';
import { AgentsPage } from '@/components/pages/AgentsPage';
import { ActivityPage } from '@/components/pages/ActivityPage';
import { SkillsPage } from '@/components/pages/SkillsPage';
import { ChannelsPage } from '@/components/pages/ChannelsPage';
import { CronPage } from '@/components/pages/CronPage';
import { ConfigPage } from '@/components/pages/ConfigPage';
import { DashboardPage } from '@/components/pages/DashboardPage';
import { useClawdOffice } from '@/lib/store';
import { cn } from '@/lib/utils';

const Index = () => {
  const { activeMainTab, viewMode } = useClawdOffice();

  const renderManagePage = () => {
    switch (activeMainTab) {
      case 'agents':
        return <AgentsPage />;
      case 'activity':
        return <ActivityPage />;
      case 'skills':
        return <SkillsPage />;
      case 'channels':
        return <ChannelsPage />;
      case 'cron':
        return <CronPage />;
      case 'config':
        return <ConfigPage />;
      default:
        return <AgentsPage />;
    }
  };

  return (
    <div className={cn('flex flex-col h-screen bg-background', viewMode === 'dashboard' && 'dashboard-texture')}>
      <TopBar />
      <main className="flex-1 overflow-hidden">
        {viewMode === 'dashboard' ? <DashboardPage /> : renderManagePage()}
      </main>
    </div>
  );
};

export default Index;
