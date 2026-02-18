import { useEffect, useState } from 'react';
import { Save, RotateCcw, RefreshCw, FileText, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClawdOffice } from '@/lib/store';
import { getAgentFile, saveAgentFile, reloadAgent } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useBrainDocSubscription } from '@/hooks/useBrainDocSubscription';
import { DocSourceBanner } from './DocSourceBanner';
import { supabase } from '@/integrations/supabase/client';

export function AgentsDocEditor() {
  const { selectedAgentId, selectedProjectId, files, setFileContent, setFileOriginal, setFileSaving, markFileSaved } = useClawdOffice();
  const { toast } = useToast();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fileKey = `${selectedAgentId}-agents`;
  const fileState = files[fileKey];

  useBrainDocSubscription({
    projectId: selectedProjectId,
    docType: 'agents',
    agentKey: fileState?.source === 'agent' ? selectedAgentId : null,
    fileKey,
    isDirty: fileState?.isDirty ?? false,
    onUpdate: (newContent) => setFileOriginal(fileKey, newContent),
  });

  const load = async () => {
    if (!selectedAgentId) return;
    setLoadError(null);
    try {
      const data = await getAgentFile(selectedAgentId, 'agents');
      setFileOriginal(fileKey, data.content, { source: data._globalRow ? 'global' : 'agent' });
    } catch (e: any) {
      console.error('Failed to load AGENTS.md', e);
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
      const result = await saveAgentFile(selectedAgentId, 'agents', fileState.content);
      markFileSaved(fileKey);
      const commit = typeof result.commit === 'string' ? result.commit.slice(0, 8) : null;
      toast({
        title: 'Saved',
        description: commit ? `AGENTS.md saved. Commit: ${commit}` : 'AGENTS.md saved.',
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to save file.', variant: 'destructive' });
    } finally {
      setFileSaving(fileKey, false);
    }
  };

  const handleReload = async () => {
    if (!selectedAgentId) return;
    if (fileState?.isDirty) {
      const ok = window.confirm('Discard unsaved changes and reload from server?');
      if (!ok) return;
    }
    setFileSaving(fileKey, true);
    try {
      const data = await getAgentFile(selectedAgentId, 'agents');
      setFileOriginal(fileKey, data.content, { source: data._globalRow ? 'global' : 'agent' });
      toast({ title: 'Reloaded', description: 'AGENTS.md reloaded from server.' });
    } catch (e: any) {
      toast({ title: 'Error', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setFileSaving(fileKey, false);
    }
  };

  const handleApply = async () => {
    if (!selectedAgentId) return;
    try {
      await reloadAgent(selectedAgentId);
      toast({ title: 'Applied', description: 'Agent reloaded with new configuration.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to reload agent.', variant: 'destructive' });
    }
  };

  const handleGenerate = async () => {
    if (!selectedAgentId) return;
    setGenerating(true);
    try {
      // Gather context
      const projectId = selectedProjectId;
      const [agentRow, overviewRow, missionRow, globalSoulRow] = await Promise.all([
        supabase.from('agents').select('name, role, purpose_text').eq('project_id', projectId).eq('agent_key', selectedAgentId).maybeSingle(),
        supabase.from('brain_docs').select('content').eq('project_id', projectId).eq('doc_type', 'project_overview').eq('agent_key', 'project').maybeSingle(),
        supabase.from('brain_docs').select('content').eq('project_id', projectId).eq('doc_type', 'mission').eq('agent_key', 'project').maybeSingle(),
        supabase.from('brain_docs').select('content').eq('project_id', projectId).eq('doc_type', 'soul').eq('agent_key', 'project').maybeSingle(),
      ]);

      const { data } = await supabase.functions.invoke('generate-agent-docs', {
        body: {
          agentName: agentRow.data?.name || selectedAgentId,
          purposeText: agentRow.data?.purpose_text || agentRow.data?.role || 'General assistant',
          roleShort: agentRow.data?.role || '',
          globalSoul: globalSoulRow.data?.content || '',
          globalUser: '',
          projectOverview: overviewRow.data?.content || '',
          projectMission: missionRow.data?.content || '',
          docTypes: ['agents'],
        },
      });

      if (data?.agents) {
        setFileOriginal(fileKey, data.agents, { source: 'agent' });
        // Mark as dirty so user can review before saving
        setFileContent(fileKey, data.agents);
        toast({ title: 'Draft generated', description: 'Review the content and save when ready.' });
      } else if (data?.soul) {
        // Fallback: edge function didn't support docTypes yet, show info
        toast({ title: 'Generation not supported yet', description: 'The edge function needs to be updated to support AGENTS.md generation.', variant: 'destructive' });
      } else {
        toast({ title: 'Generation failed', description: data?.reason || 'Unknown error', variant: 'destructive' });
      }
    } catch (e: any) {
      toast({ title: 'Generation failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  if (!fileState) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 px-6 text-center">
        {loadError ? (
          <>
            <div className="text-destructive">Failed to load AGENTS.md</div>
            <div className="text-xs text-muted-foreground break-all">{loadError}</div>
            <Button variant="outline" size="sm" onClick={load}>Retry</Button>
          </>
        ) : (
          <div>Loading…</div>
        )}
      </div>
    );
  }

  const isEmpty = !fileState.content.trim();
  const lines = fileState.content.split('\n');

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="w-4 h-4" />
          <span>AGENTS.md</span>
          <span className="text-xs">— Operating Rules</span>
          {fileState.isDirty && (
            <span className="text-warning text-xs">(unsaved changes)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEmpty && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
              className="gap-2"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate with AI
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleReload} disabled={fileState.isSaving} className="gap-2" title="Reload from server">
            <RefreshCw className="w-4 h-4" />
            Reload
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave} disabled={!fileState.isDirty || fileState.isSaving} className="gap-2">
            <Save className="w-4 h-4" />
            Save
          </Button>
          <Button size="sm" onClick={handleApply} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Apply
          </Button>
        </div>
      </div>

      {/* Doc source indicator */}
      <DocSourceBanner source={fileState.source} docType="agents" onOverrideCreated={() => void load()} />

      {/* Editor */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        {isEmpty && !fileState.isDirty ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
            <p className="text-muted-foreground text-sm">
              No AGENTS.md yet. This file contains universal operating instructions for this agent.
            </p>
            <Button variant="outline" onClick={handleGenerate} disabled={generating} className="gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate with AI
            </Button>
          </div>
        ) : (
          <div className="editor-container m-4 min-h-full">
            <div className="flex font-mono text-sm">
              <div className="editor-gutter py-4 px-2 select-none border-r border-border min-w-[3rem]">
                {lines.map((_, i) => (
                  <div key={i} className="editor-line leading-6 text-right">{i + 1}</div>
                ))}
              </div>
              <textarea
                value={fileState.content}
                onChange={(e) => setFileContent(fileKey, e.target.value)}
                className="flex-1 bg-transparent p-4 resize-none outline-none leading-6 min-h-[500px]"
                spellCheck={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
