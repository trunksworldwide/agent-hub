import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfigPage } from './ConfigPage';
import { SkillsPage } from './SkillsPage';
import { ChannelsPage } from './ChannelsPage';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('system');

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">System configuration, skills, and channels</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b border-border px-4">
          <TabsList className="h-10">
            <TabsTrigger value="system">System</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="system" className="flex-1 m-0">
          <ConfigPage />
        </TabsContent>

        <TabsContent value="skills" className="flex-1 m-0">
          <SkillsPage />
        </TabsContent>

        <TabsContent value="channels" className="flex-1 m-0">
          <ChannelsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
