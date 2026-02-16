import { useState, useEffect } from 'react';
import { Eye, Loader2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getSelectedProjectId } from '@/lib/project';
import { buildContextPack, renderContextPackAsMarkdown, type ContextPack } from '@/lib/context-pack';
import { getTasks, type Agent, type Task } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ContextPackPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
}

interface SectionInfo {
  name: string;
  chars: number;
  cap: number | null; // null = no hard cap
}

function computeSections(pack: ContextPack): SectionInfo[] {
  const sections: SectionInfo[] = [];

  sections.push({ name: 'Mission', chars: (pack.mission || '').length, cap: null });
  sections.push({ name: 'Project Overview', chars: (pack.projectOverview || '').length, cap: null });

  const globalChars = pack.globalDocs.reduce((sum, d) => sum + d.notes.join('').length + d.rules.join('').length, 0);
  sections.push({ name: 'Pinned Knowledge (Global)', chars: globalChars, cap: 8000 });

  const agentChars = pack.agentDocs.reduce((sum, d) => sum + d.notes.join('').length + d.rules.join('').length, 0);
  sections.push({ name: 'Your Knowledge (Agent)', chars: agentChars, cap: 8000 });

  sections.push({ name: 'Task Context', chars: (pack.taskContext || '').length, cap: null });

  const knowledgeChars = (pack.relevantKnowledge || []).reduce((sum, k) => sum + k.chunkText.length, 0);
  sections.push({ name: 'Relevant Knowledge', chars: knowledgeChars, cap: 6000 });

  sections.push({ name: 'Recent Changes', chars: (pack.recentChanges || '').length, cap: null });

  return sections;
}

function getBarColor(chars: number, cap: number | null): string {
  if (!cap) return 'bg-primary';
  const ratio = chars / cap;
  if (ratio >= 0.9) return 'bg-destructive';
  if (ratio >= 0.6) return 'bg-yellow-500';
  return 'bg-primary';
}

export function ContextPackPreviewDialog({ open, onOpenChange, agents }: ContextPackPreviewDialogProps) {
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedTask, setSelectedTask] = useState('__none__');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pack, setPack] = useState<ContextPack | null>(null);
  const [markdownOpen, setMarkdownOpen] = useState(false);

  // Load tasks when dialog opens
  useEffect(() => {
    if (!open) return;
    setLoadingTasks(true);
    getTasks()
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoadingTasks(false));
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPack(null);
      setMarkdownOpen(false);
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!selectedAgent) return;
    setGenerating(true);
    setPack(null);
    try {
      const projectId = getSelectedProjectId();
      const taskId = selectedTask === '__none__' ? undefined : selectedTask;
      const result = await buildContextPack(projectId, selectedAgent, taskId);
      setPack(result);
    } catch (err) {
      console.error('Preview generation failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  const sections = pack ? computeSections(pack) : [];
  const totalChars = sections.reduce((s, sec) => s + sec.chars, 0);
  const markdown = pack ? renderContextPackAsMarkdown(pack) : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Preview Context Pack
          </DialogTitle>
          <DialogDescription>
            See exactly what an agent will receive at runtime.
          </DialogDescription>
        </DialogHeader>

        {/* Selectors */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs text-muted-foreground mb-1 block">Agent</label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger>
                <SelectValue placeholder="Select agent..." />
              </SelectTrigger>
              <SelectContent>
                {agents.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.avatar} {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[160px]">
            <label className="text-xs text-muted-foreground mb-1 block">Task (optional)</label>
            <Select value={selectedTask} onValueChange={setSelectedTask}>
              <SelectTrigger>
                <SelectValue placeholder="No task" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No task</SelectItem>
                {loadingTasks ? (
                  <SelectItem value="__loading__" disabled>Loading...</SelectItem>
                ) : (
                  tasks.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button onClick={handleGenerate} disabled={!selectedAgent || generating}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Generate
            </Button>
          </div>
        </div>

        {/* Results */}
        {pack && (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-4 pr-2">
              {/* Size breakdown */}
              <div>
                <h3 className="text-sm font-medium mb-2">
                  Section Sizes
                  <span className="text-muted-foreground font-normal ml-2">
                    Total: {totalChars.toLocaleString()} chars
                  </span>
                </h3>
                <div className="space-y-2">
                  {sections.map(sec => (
                    <div key={sec.name}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span>{sec.name}</span>
                        <span className="text-muted-foreground">
                          {sec.chars.toLocaleString()}
                          {sec.cap ? ` / ${sec.cap.toLocaleString()}` : ''}
                          {' chars'}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', getBarColor(sec.chars, sec.cap))}
                          style={{
                            width: sec.cap
                              ? `${Math.min(100, (sec.chars / sec.cap) * 100)}%`
                              : sec.chars > 0 ? '100%' : '0%',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Included pinned docs */}
              {pack.globalDocs.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-1">Included Pinned Docs (Global)</h3>
                  <div className="flex flex-wrap gap-1">
                    {pack.globalDocs.map(d => (
                      <Badge key={d.id} variant="secondary" className="text-xs">
                        {d.title}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {pack.agentDocs.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-1">Included Docs (Agent)</h3>
                  <div className="flex flex-wrap gap-1">
                    {pack.agentDocs.map(d => (
                      <Badge key={d.id} variant="secondary" className="text-xs">
                        {d.title}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Excluded docs */}
              {pack.excludedDocs && pack.excludedDocs.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <h3 className="text-sm font-medium flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                    Excluded (over budget)
                  </h3>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {pack.excludedDocs.map((d, i) => (
                      <li key={i}>• {d.title} — {d.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Retrieved knowledge */}
              {pack.relevantKnowledge && pack.relevantKnowledge.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-1">Retrieved Knowledge ({pack.relevantKnowledge.length} chunks)</h3>
                  <div className="space-y-1">
                    {pack.relevantKnowledge.map((k, i) => (
                      <div key={i} className="text-xs p-2 rounded bg-muted/50">
                        <span className="font-medium">{k.title}</span>
                        {k.sourceUrl && <span className="text-muted-foreground ml-1">({k.sourceUrl})</span>}
                        <p className="text-muted-foreground mt-0.5 line-clamp-2">{k.chunkText}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full markdown */}
              <Collapsible open={markdownOpen} onOpenChange={setMarkdownOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between">
                    Full Markdown Preview
                    {markdownOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="text-xs font-mono bg-muted/50 p-3 rounded-lg whitespace-pre-wrap max-h-80 overflow-auto mt-1">
                    {markdown}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
