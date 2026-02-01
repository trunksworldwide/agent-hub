import { TopBar } from '@/components/TopBar';
import { AgentsPage } from '@/components/pages/AgentsPage';
import { SkillsPage } from '@/components/pages/SkillsPage';
import { ChannelsPage } from '@/components/pages/ChannelsPage';
import { CronPage } from '@/components/pages/CronPage';
import { ConfigPage } from '@/components/pages/ConfigPage';
import { useClawdOS } from '@/lib/store';

const Index = () => {
  const { activeMainTab } = useClawdOS();

  const renderPage = () => {
    switch (activeMainTab) {
      case 'agents':
        return <AgentsPage />;
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
    <div className="flex flex-col h-screen bg-background">
      <TopBar />
      <main className="flex-1 overflow-hidden">
        {renderPage()}
      </main>
    </div>
  );
};

export default Index;
