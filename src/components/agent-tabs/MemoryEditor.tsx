import { useEffect, useState } from 'react';
import { Save, RotateCcw, FileText, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClawdOS } from '@/lib/store';
import { getAgentFile, saveAgentFile, reloadAgent } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export function MemoryEditor() {
  const { selectedAgentId, files, setFileContent, setFileOriginal, setFileSaving, markFileSaved } = useClawdOS();
  const { toast } = useToast();
  const [activeMemoryTab, setActiveMemoryTab] = useState<'long' | 'today'>('long');
  
  const longKey = `${selectedAgentId}-memory_long`;
  const todayKey = `${selectedAgentId}-memory_today`;
  
  const longState = files[longKey];
  const todayState = files[todayKey];

  useEffect(() => {
    if (selectedAgentId) {
      if (!longState) {
        getAgentFile(selectedAgentId, 'memory_long').then((data) => {
          setFileOriginal(longKey, data.content);
        });
      }
      if (!todayState) {
        getAgentFile(selectedAgentId, 'memory_today').then((data) => {
          setFileOriginal(todayKey, data.content);
        });
      }
    }
  }, [selectedAgentId]);

  const currentKey = activeMemoryTab === 'long' ? longKey : todayKey;
  const currentState = activeMemoryTab === 'long' ? longState : todayState;
  const fileType = activeMemoryTab === 'long' ? 'memory_long' : 'memory_today';

  const handleSave = async () => {
    if (!selectedAgentId || !currentState) return;
    setFileSaving(currentKey, true);
    try {
      await saveAgentFile(selectedAgentId, fileType, currentState.content);
      markFileSaved(currentKey);
      toast({
        title: 'Saved',
        description: `${activeMemoryTab === 'long' ? 'MEMORY.md' : 'Today\'s memory'} saved.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save file.',
        variant: 'destructive',
      });
    }
  };

  const handleApply = async () => {
    if (!selectedAgentId) return;
    try {
      await reloadAgent(selectedAgentId);
      toast({
        title: 'Applied',
        description: 'Agent reloaded with new memory.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reload agent.',
        variant: 'destructive',
      });
    }
  };

  if (!currentState) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    );
  }

  const lines = currentState.content.split('\n');

  return (
    <div className="flex flex-col h-full">
      {/* Memory Type Tabs */}
      <Tabs value={activeMemoryTab} onValueChange={(v) => setActiveMemoryTab(v as 'long' | 'today')} className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
          <div className="flex items-center gap-4">
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="long" className="gap-2">
                <span>📚</span> Long-term
                {longState?.isDirty && <span className="w-2 h-2 rounded-full bg-warning" />}
              </TabsTrigger>
              <TabsTrigger value="today" className="gap-2">
                <span>📅</span> Today
                {todayState?.isDirty && <span className="w-2 h-2 rounded-full bg-warning" />}
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <ArrowUp className="w-4 h-4" />
              Promote to Long-term
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={!currentState.isDirty || currentState.isSaving}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              Save
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Apply
            </Button>
          </div>
        </div>

        <TabsContent value="long" className="flex-1 m-0 overflow-hidden">
          <div className="flex-1 overflow-auto scrollbar-thin h-full">
            <div className="editor-container m-4 min-h-full">
              <div className="flex font-mono text-sm">
                <div className="editor-gutter py-4 px-2 select-none border-r border-border min-w-[3rem]">
                  {lines.map((_, i) => (
                    <div key={i} className="editor-line leading-6 text-right">
                      {i + 1}
                    </div>
                  ))}
                </div>
                <textarea
                  value={longState?.content || ''}
                  onChange={(e) => setFileContent(longKey, e.target.value)}
                  className="flex-1 bg-transparent p-4 resize-none outline-none leading-6 min-h-[400px]"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="today" className="flex-1 m-0 overflow-hidden">
          <div className="flex-1 overflow-auto scrollbar-thin h-full">
            <div className="editor-container m-4 min-h-full">
              <div className="flex font-mono text-sm">
                <div className="editor-gutter py-4 px-2 select-none border-r border-border min-w-[3rem]">
                  {(todayState?.content || '').split('\n').map((_, i) => (
                    <div key={i} className="editor-line leading-6 text-right">
                      {i + 1}
                    </div>
                  ))}
                </div>
                <textarea
                  value={todayState?.content || ''}
                  onChange={(e) => setFileContent(todayKey, e.target.value)}
                  className="flex-1 bg-transparent p-4 resize-none outline-none leading-6 min-h-[400px]"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
