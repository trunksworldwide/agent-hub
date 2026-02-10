import { useEffect, useState, useRef } from 'react';
import { Save, RotateCcw, RefreshCw, ArrowUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useClawdOffice } from '@/lib/store';
import { getAgentFile, saveAgentFile, reloadAgent } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

const MEMORY_TEMPLATE = `# Long-term Memory

## Key Facts
- 

## Important Dates
- 

## Recurring Themes
- 

## Preferences & Patterns
- 
`;

export function MemoryEditor() {
  const { selectedAgentId, files, setFileContent, setFileOriginal, setFileSaving, markFileSaved } = useClawdOffice();
  const { toast } = useToast();
  const [activeMemoryTab, setActiveMemoryTab] = useState<'long' | 'today'>('long');
  const [loadError, setLoadError] = useState<string | null>(null);
  const todayTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  const longKey = `${selectedAgentId}-memory_long`;
  const todayKey = `${selectedAgentId}-memory_today`;
  
  const longState = files[longKey];
  const todayState = files[todayKey];

  const load = async () => {
    if (!selectedAgentId) return;
    setLoadError(null);
    try {
      const [longData, todayData] = await Promise.all([
        getAgentFile(selectedAgentId, 'memory_long'),
        getAgentFile(selectedAgentId, 'memory_today'),
      ]);
      setFileOriginal(longKey, longData.content);
      setFileOriginal(todayKey, todayData.content);
    } catch (e: any) {
      console.error('Failed to load memory docs', e);
      setLoadError(String(e?.message || e));
    }
  };

  useEffect(() => {
    if (selectedAgentId && (!longState || !todayState)) {
      load();
    }
  }, [selectedAgentId]);

  const currentKey = activeMemoryTab === 'long' ? longKey : todayKey;
  const currentState = activeMemoryTab === 'long' ? longState : todayState;
  const fileType = activeMemoryTab === 'long' ? 'memory_long' : 'memory_today';

  const handleSave = async () => {
    if (!selectedAgentId || !currentState) return;
    setFileSaving(currentKey, true);
    try {
      const result = await saveAgentFile(selectedAgentId, fileType, currentState.content);
      markFileSaved(currentKey);

      const commit = typeof result.commit === 'string' ? result.commit.slice(0, 8) : null;
      const label = activeMemoryTab === 'long' ? 'MEMORY.md' : "Today's memory";

      toast({
        title: 'Saved',
        description: commit ? `${label} saved. Commit: ${commit}` : `${label} saved.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save file.',
        variant: 'destructive',
      });
    } finally {
      setFileSaving(currentKey, false);
    }
  };

  const handleReload = async () => {
    if (!selectedAgentId) return;

    const anyDirty = Boolean(longState?.isDirty || todayState?.isDirty);
    if (anyDirty) {
      const ok = window.confirm('Discard unsaved changes in Memory docs and reload from server?');
      if (!ok) return;
    }

    setFileSaving(currentKey, true);
    try {
      const [longData, todayData] = await Promise.all([
        getAgentFile(selectedAgentId, 'memory_long'),
        getAgentFile(selectedAgentId, 'memory_today'),
      ]);

      setFileOriginal(longKey, longData.content);
      setFileOriginal(todayKey, todayData.content);

      toast({
        title: 'Reloaded',
        description: 'Memory docs reloaded from server.',
      });
    } catch (e: any) {
      toast({
        title: 'Error',
        description: String(e?.message || e || 'Failed to reload files.'),
        variant: 'destructive',
      });
    } finally {
      setFileSaving(currentKey, false);
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

  const handleSeedTemplate = () => {
    setFileContent(longKey, MEMORY_TEMPLATE);
    toast({
      title: 'Template loaded',
      description: 'A starter template has been loaded. Save to persist.',
    });
  };

  const handlePromoteToLongTerm = () => {
    if (!todayState?.content?.trim()) {
      toast({
        title: 'Nothing to promote',
        description: "Today's memory is empty.",
        variant: 'destructive',
      });
      return;
    }

    // Get selected text or full content
    const textarea = todayTextareaRef.current;
    let textToPromote = todayState.content;
    if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
      textToPromote = todayState.content.slice(textarea.selectionStart, textarea.selectionEnd);
    }

    const today = new Date().toISOString().slice(0, 10);
    const header = `\n\n## Promoted from ${today}\n\n`;
    const currentLong = longState?.content || '';
    const newLong = currentLong.trimEnd() + header + textToPromote.trim() + '\n';

    setFileContent(longKey, newLong);
    
    toast({
      title: 'Promoted',
      description: 'Content appended to long-term memory. Save both tabs to persist.',
    });

    // Switch to long-term tab so user can review
    setActiveMemoryTab('long');
  };

  if (!currentState) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 px-6 text-center">
        {loadError ? (
          <>
            <div className="text-destructive">Failed to load memory docs</div>
            <div className="text-xs text-muted-foreground break-all">{loadError}</div>
            <Button variant="outline" size="sm" onClick={load}>
              Retry
            </Button>
          </>
        ) : (
          <div>Loading…</div>
        )}
      </div>
    );
  }

  const isLongTermEmpty = !longState?.content?.trim();

  return (
    <div className="flex flex-col h-full">
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
              onClick={() => void handleReload()}
              disabled={Boolean(currentState?.isSaving)}
              className="gap-2"
              title="Reload from server"
            >
              <RefreshCw className="w-4 h-4" />
              Reload
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handlePromoteToLongTerm}
              disabled={activeMemoryTab === 'long'}
              title="Append today's memory (or selection) to long-term"
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
          {isLongTermEmpty ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
              <div className="text-4xl">📭</div>
              <div>
                <h3 className="text-lg font-semibold mb-1">Long-term memory is empty</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  This is <code className="text-xs bg-muted px-1 py-0.5 rounded">MEMORY.md</code> on your Mac mini. 
                  It's currently blank. Seed it with a starter template or start writing.
                </p>
              </div>
              <Button variant="outline" onClick={handleSeedTemplate} className="gap-2">
                <Sparkles className="w-4 h-4" />
                Seed template
              </Button>
            </div>
          ) : (
            <div className="flex-1 overflow-auto scrollbar-thin h-full">
              <div className="editor-container m-4 min-h-full">
                <div className="flex font-mono text-sm">
                  <div className="editor-gutter py-4 px-2 select-none border-r border-border min-w-[3rem]">
                    {(longState?.content || '').split('\n').map((_, i) => (
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
          )}
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
                  ref={todayTextareaRef}
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
