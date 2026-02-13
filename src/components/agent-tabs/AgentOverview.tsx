import { useEffect, useState } from 'react';
import { Play, CalendarClock, Save, Globe, User, FileText, Sparkles, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useClawdOffice } from '@/lib/store';
import {
  type Agent,
  updateAgentPurpose,
  getDocOverrideStatus,
  createDocOverride,
  createSingleDocOverride,
  generateAgentDocs,
  scheduleAgentDigest,
  reloadAgent,
  deleteAgent,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Props {
  agent: Agent | null;
  onRefresh?: () => void;
  onDeleted?: () => void;
}

export function AgentOverview({ agent, onRefresh, onDeleted }: Props) {
  const { selectedProjectId, setActiveAgentTab } = useClawdOffice();
  const { toast } = useToast();
  const [purpose, setPurpose] = useState('');
  const [originalPurpose, setOriginalPurpose] = useState('');
  const [saving, setSaving] = useState(false);
  const [docStatus, setDocStatus] = useState<Record<string, 'global' | 'agent'>>({});
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [runningOnce, setRunningOnce] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isPrimaryAgent = agent?.id === 'agent:main:main';

  const handleDelete = async () => {
    if (!agent?.id || isPrimaryAgent) return;
    setDeleting(true);
    try {
      const result = await deleteAgent(agent.id);
      if (!result.ok) throw new Error(result.error);
      toast({ title: 'Agent deleted', description: `${agent.name} has been removed.` });
      onDeleted?.();
    } catch (e: any) {
      toast({ title: 'Error', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (agent) {
      const p = agent.purposeText || agent.role || '';
      setPurpose(p);
      setOriginalPurpose(p);
    }
  }, [agent?.id, agent?.purposeText, agent?.role]);

  useEffect(() => {
    if (!agent?.id) return;
    setLoadingDocs(true);
    getDocOverrideStatus(agent.id)
      .then(setDocStatus)
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  }, [agent?.id]);

  const isPurposeDirty = purpose !== originalPurpose;

  const handleSavePurpose = async () => {
    if (!agent?.id || !isPurposeDirty) return;
    setSaving(true);
    try {
      const result = await updateAgentPurpose(agent.id, purpose);
      if (!result.ok) throw new Error(result.error);
      setOriginalPurpose(purpose);
      toast({ title: 'Saved', description: 'Purpose updated.' });
      onRefresh?.();
    } catch (e: any) {
      toast({ title: 'Error', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleRunOnce = async () => {
    if (!agent?.id) return;
    setRunningOnce(true);
    try {
      await reloadAgent(agent.id);
      toast({ title: 'Run triggered', description: `${agent.name} has been triggered to run.` });
    } catch (e: any) {
      toast({ title: 'Error', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setRunningOnce(false);
    }
  };

  const handleScheduleDigest = async () => {
    if (!agent?.id) return;
    setScheduling(true);
    try {
      const result = await scheduleAgentDigest(agent.id, agent.name);
      if (!result.ok) throw new Error(result.error);
      toast({
        title: 'Scheduled',
        description: `Daily digest cron created for ${agent.name}. Check the Schedule page.`,
      });
    } catch (e: any) {
      toast({ title: 'Error', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setScheduling(false);
    }
  };

  const handleCreateOverride = async (docType: string) => {
    if (!agent?.id) return;
    try {
      const result = await createSingleDocOverride(agent.id, docType as any);
      if (!result.ok) throw new Error(result.error);
      setDocStatus((prev) => ({ ...prev, [docType]: 'agent' }));
      toast({ title: 'Override created', description: `${docType} now has agent-specific docs.` });
    } catch (e: any) {
      toast({ title: 'Error', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  if (!agent) return null;

  const docEntries = [
    { key: 'soul', label: 'Soul', icon: '✨', tab: 'soul' as const },
    { key: 'user', label: 'User', icon: '👤', tab: 'user' as const },
    { key: 'memory_long', label: 'Memory', icon: '🧠', tab: 'memory' as const },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 overflow-auto h-full scrollbar-thin">
      {/* Agent identity */}
      <div className="flex items-start gap-4">
        <span className="text-5xl">{agent.avatar || '🤖'}</span>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold">{agent.name}</h2>
          <p className="text-sm text-muted-foreground">{agent.role || 'Agent'}</p>
          {agent.statusState && (
            <span className="inline-block mt-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-foreground/80">
              {agent.statusState}
            </span>
          )}
        </div>
      </div>

      {/* Purpose editor */}
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          Purpose / Mission
        </label>
        <Textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="Describe what this agent does, its goals, and responsibilities..."
          className="min-h-[100px] resize-y"
          disabled={saving}
        />
        {isPurposeDirty && (
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSavePurpose} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Purpose'}
            </Button>
          </div>
        )}
      </div>

      {/* Doc status */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Brain Docs</label>
        {loadingDocs ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="grid gap-2">
            {docEntries.map(({ key, label, icon, tab }) => {
              const status = docStatus[key] || 'global';
              return (
                <div
                  key={key}
                  className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-card"
                >
                  <div className="flex items-center gap-2">
                    <span>{icon}</span>
                    <span className="text-sm font-medium">{label}</span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium',
                        status === 'agent'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {status === 'agent' ? (
                        <><User className="w-3 h-3" /> Override</>
                      ) : (
                        <><Globe className="w-3 h-3" /> Inherited</>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {status === 'global' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => handleCreateOverride(key)}
                      >
                        Create override
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setActiveAgentTab(tab)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Actions</label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunOnce}
            disabled={runningOnce}
            className="gap-2"
          >
            <Play className="w-4 h-4" />
            {runningOnce ? 'Running...' : 'Run Once'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleScheduleDigest}
            disabled={scheduling}
            className="gap-2"
          >
            <CalendarClock className="w-4 h-4" />
            {scheduling ? 'Creating...' : 'Schedule Digest'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!agent?.id) return;
              setRegenerating(true);
              try {
                // createDocOverride generates ALL docs (soul, user, memory_long + description)
                // regardless of which docType is passed
                const result = await createDocOverride(agent.id, 'soul');
                if (!result.ok) throw new Error(result.error);
                // Refresh all doc statuses
                const newStatus = await getDocOverrideStatus(agent.id);
                setDocStatus(newStatus);
                toast({
                  title: 'Docs regenerated',
                  description: `AI-generated SOUL, USER, and MEMORY docs created for ${agent.name}.`,
                });
                onRefresh?.();
              } catch (e: any) {
                toast({ title: 'Error', description: String(e?.message || e), variant: 'destructive' });
              } finally {
                setRegenerating(false);
              }
            }}
            disabled={regenerating || !agent?.purposeText}
            className="gap-2"
          >
            {regenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {regenerating ? 'Generating...' : 'Regenerate with AI'}
          </Button>
        </div>
        {!agent?.purposeText && (
          <p className="text-xs text-muted-foreground">
            Set a purpose above to enable AI doc generation.
          </p>
        )}
      </div>

      {/* Delete agent (not for primary) */}
      {!isPrimaryAgent && (
        <div className="pt-4 border-t border-border">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-destructive"
                disabled={deleting}
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Deleting...' : 'Delete Agent'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {agent?.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete the agent runtime and workspace, disable its scheduled jobs, and remove operational data. Historical messages, task events, and outputs will remain. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
