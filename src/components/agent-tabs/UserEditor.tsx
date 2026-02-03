import { useEffect, useState } from 'react';
import { Save, RotateCcw, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClawdOffice } from '@/lib/store';
import { getAgentFile, saveAgentFile, reloadAgent } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export function UserEditor() {
  const { selectedAgentId, files, setFileContent, setFileOriginal, setFileSaving, markFileSaved } = useClawdOffice();
  const { toast } = useToast();
  const [loadError, setLoadError] = useState<string | null>(null);
  
  const fileKey = `${selectedAgentId}-user`;
  const fileState = files[fileKey];

  const load = async () => {
    if (!selectedAgentId) return;
    setLoadError(null);
    try {
      const data = await getAgentFile(selectedAgentId, 'user');
      setFileOriginal(fileKey, data.content);
    } catch (e: any) {
      console.error('Failed to load USER.md', e);
      setLoadError(String(e?.message || e));
    }
  };

  useEffect(() => {
    if (selectedAgentId && !fileState) {
      load();
    }
  }, [selectedAgentId, fileKey, fileState]);

  const handleSave = async () => {
    if (!selectedAgentId || !fileState) return;
    setFileSaving(fileKey, true);
    try {
      const result = await saveAgentFile(selectedAgentId, 'user', fileState.content);
      markFileSaved(fileKey);

      const commit = typeof result.commit === 'string' ? result.commit.slice(0, 8) : null;

      toast({
        title: 'Saved',
        description: commit ? `USER.md saved. Commit: ${commit}` : 'USER.md saved and committed to git.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save file.',
        variant: 'destructive',
      });
    } finally {
      setFileSaving(fileKey, false);
    }
  };

  const handleApply = async () => {
    if (!selectedAgentId) return;
    try {
      await reloadAgent(selectedAgentId);
      toast({
        title: 'Applied',
        description: 'Agent reloaded with new configuration.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reload agent.',
        variant: 'destructive',
      });
    }
  };

  if (!fileState) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 px-6 text-center">
        {loadError ? (
          <>
            <div className="text-destructive">Failed to load USER.md</div>
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

  const lines = fileState.content.split('\n');

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="w-4 h-4" />
          <span>USER.md</span>
          {fileState.isDirty && (
            <span className="text-warning text-xs">(unsaved changes)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={!fileState.isDirty || fileState.isSaving}
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

      {/* Editor */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        <div className="editor-container m-4 min-h-full">
          <div className="flex font-mono text-sm">
            {/* Line numbers */}
            <div className="editor-gutter py-4 px-2 select-none border-r border-border min-w-[3rem]">
              {lines.map((_, i) => (
                <div key={i} className="editor-line leading-6 text-right">
                  {i + 1}
                </div>
              ))}
            </div>
            {/* Content */}
            <textarea
              value={fileState.content}
              onChange={(e) => setFileContent(fileKey, e.target.value)}
              className="flex-1 bg-transparent p-4 resize-none outline-none leading-6 min-h-[400px]"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
