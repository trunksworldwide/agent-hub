import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfigPage } from './ConfigPage';
import { SkillsPage } from './SkillsPage';
import { ChannelsPage } from './ChannelsPage';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useClawdOffice } from '@/lib/store';
import { getLabsFlags, setLabsFlags, type LabsFeatureKey } from '@/hooks/useLabsFeature';
import { toast } from 'sonner';
import { FlaskConical } from 'lucide-react';

const LABS_FEATURES: { key: LabsFeatureKey; label: string; description: string }[] = [
  { key: 'task_threads', label: 'Task Threads', description: 'Unified timeline for task events, comments, and approvals.' },
  { key: 'heartbeat_ui', label: 'Heartbeat UI', description: 'Visual separation of heartbeats from scheduled jobs.' },
  { key: 'mission_banner', label: 'Mission Banner', description: 'Pinned mission statement on the Activity page.' },
];

function LabsPanel() {
  const { selectedProjectId } = useClawdOffice();
  const [flags, setFlags] = useState<Record<LabsFeatureKey, boolean> | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedProjectId) return;
    getLabsFlags(selectedProjectId).then(setFlags);
  }, [selectedProjectId]);

  const handleToggle = async (key: LabsFeatureKey, value: boolean) => {
    if (!selectedProjectId || !flags) return;
    setSaving(key);
    try {
      await setLabsFlags(selectedProjectId, { [key]: value });
      setFlags({ ...flags, [key]: value });
      toast.success(`${value ? 'Enabled' : 'Disabled'} ${LABS_FEATURES.find(f => f.key === key)?.label}`);
    } catch {
      toast.error('Failed to update Labs flag');
    } finally {
      setSaving(null);
    }
  };

  if (!flags) {
    return <div className="p-6 text-sm text-muted-foreground">Loading Labs flags…</div>;
  }

  return (
    <div className="p-6">
      <div className="max-w-xl">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4" />
              Labs Features
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {LABS_FEATURES.map((feature) => (
              <div key={feature.key} className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <Label htmlFor={`labs-${feature.key}`} className="text-sm font-medium">
                    {feature.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
                <Switch
                  id={`labs-${feature.key}`}
                  checked={flags[feature.key] ?? false}
                  onCheckedChange={(v) => handleToggle(feature.key, v)}
                  disabled={saving === feature.key}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('system');

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">System configuration, skills, channels, and Labs</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <div className="border-b border-border px-4">
          <TabsList className="h-10">
            <TabsTrigger value="system">System</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
            <TabsTrigger value="labs">Labs</TabsTrigger>
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

        <TabsContent value="labs" className="flex-1 m-0">
          <LabsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
