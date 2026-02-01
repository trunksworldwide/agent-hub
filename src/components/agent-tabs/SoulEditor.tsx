import { useEffect } from 'react';
import { Save, RotateCcw, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClawdOS } from '@/lib/store';
import { getAgentFile, saveAgentFile, reloadAgent } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export function SoulEditor() {
  const { selectedAgentId, files, setFileContent, setFileOriginal, setFileSaving, markFileSaved } = useClawdOS();
  const { toast } = useToast();
  
  const fileKey = `${selectedAgentId}-soul`;
  const fileState = files[fileKey];

  useEffect(() => {
    if (selectedAgentId && !fileState) {
      getAgentFile(selectedAgentId, 'soul').then((data) => {
        setFileOriginal(fileKey, data.content);
      });
    }
  }, [selectedAgentId, fileKey, fileState]);

  const handleSave = async () => {
    if (!selectedAgentId || !fileState) return;
    setFileSaving(fileKey, true);
    try {
      await saveAgentFile(selectedAgentId, 'soul', fileState.content);
      markFileSaved(fileKey);
      toast({
        title: 'Saved',
        description: 'SOUL.md saved and committed to git.',
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
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
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
          <span>SOUL.md</span>
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
              className="flex-1 bg-transparent p-4 resize-none outline-none leading-6 min-h-[500px]"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
