import { useEffect, useMemo, useState } from 'react';
import { Play, Clock, Check, X, ChevronDown, RefreshCw, Pencil, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getCronJobs, toggleCronJob, editCronJob, runCronJob, getCronRuns, getApiStatus, type CronJob, type CronRunEntry } from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useClawdOffice } from '@/lib/store';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';

export function CronPage() {
  const { focusCronJobId, setFocusCronJobId } = useClawdOffice();

  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [runsByJob, setRunsByJob] = useState<Record<string, CronRunEntry[]>>({});
  const [loadingRuns, setLoadingRuns] = useState<Record<string, boolean>>({});
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [editName, setEditName] = useState('');
  const [editSchedule, setEditSchedule] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const apiStatus = useMemo(() => getApiStatus(), []);

  const { toast } = useToast();

  const lastRefreshedLabel = useMemo(() => {
    if (!lastRefreshedAt) return '—';
    const ms = Date.now() - lastRefreshedAt;
    if (ms < 3_000) return 'just now';
    if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s ago`;
    if (ms < 60 * 60_000) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
    return formatDateTime(lastRefreshedAt);
  }, [lastRefreshedAt]);

  const loadJobs = async () => {
    if (loadingJobs) return;
    setLoadingJobs(true);
    setLastError(null);
    try {
      const next = await getCronJobs();
      setJobs(next);
      setLastRefreshedAt(Date.now());
    } catch (err: any) {
      const message = String(err?.message || err);
      setLastError(message);
      toast({
        title: 'Failed to load cron jobs',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRuns = async (jobId: string, opts?: { force?: boolean }) => {
    if (loadingRuns[jobId]) return;
    if (runsByJob[jobId] && !opts?.force) return;

    setLoadingRuns((m) => ({ ...m, [jobId]: true }));
    try {
      const data = await getCronRuns(jobId, 10);
      setRunsByJob((m) => ({ ...m, [jobId]: data.entries || [] }));
    } catch (err: any) {
      toast({
        title: 'Failed to load run history',
        description: String(err?.message || err),
        variant: 'destructive',
      });
    } finally {
      setLoadingRuns((m) => ({ ...m, [jobId]: false }));
    }
  };

  useEffect(() => {
    if (!focusCronJobId) return;
    if (!jobs.some((j) => j.id === focusCronJobId)) return;

    setExpandedJob(focusCronJobId);
    loadRuns(focusCronJobId);

    // Best-effort scroll to the job card.
    setTimeout(() => {
      const el = document.getElementById(`cron-job-${focusCronJobId}`);
      el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 0);

    // Clear after we act, so returning to Cron doesn't keep snapping open.
    setFocusCronJobId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCronJobId, jobs]);

  const handleToggle = async (job: CronJob) => {
    await toggleCronJob(job.id, !job.enabled);
    setJobs(jobs.map(j => 
      j.id === job.id ? { ...j, enabled: !j.enabled } : j
    ));
    toast({
      title: job.enabled ? 'Job disabled' : 'Job enabled',
      description: `${job.name} has been ${job.enabled ? 'disabled' : 'enabled'}.`,
    });
  };

  const handleRunNow = async (job: CronJob) => {
    setRunningJob(job.id);
    try {
      await runCronJob(job.id);
      toast({
        title: 'Job started',
        description: `${job.name} is now running.`,
      });
    } finally {
      setRunningJob(null);
    }
  };

  const openEdit = (job: CronJob) => {
    setEditingJob(job);
    setEditName(job.name || '');
    setEditSchedule(job.schedule || '');
    setEditInstructions(job.instructions || '');
  };

  const handleSaveEdit = async () => {
    if (!editingJob || savingEdit) return;
    setSavingEdit(true);
    try {
      await editCronJob(editingJob.id, {
        name: editName,
        schedule: editSchedule,
        instructions: editInstructions,
      });

      toast({
        title: 'Job updated',
        description: `${editingJob.name} saved.`,
      });

      setEditingJob(null);
      await loadJobs();
    } catch (err: any) {
      toast({
        title: 'Failed to update job',
        description: String(err?.message || err),
        variant: 'destructive',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const getStatusIcon = (status: CronJob['lastRunStatus']) => {
    switch (status) {
      case 'success':
        return <Check className="w-4 h-4 text-success" />;
      case 'failed':
        return <X className="w-4 h-4 text-destructive" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-warning animate-pulse" />;
      default:
        return <span className="w-4 h-4 text-muted-foreground">—</span>;
    }
  };

  return (
    <div className="flex-1 p-6 overflow-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Scheduled Jobs</h1>
            <p className="text-muted-foreground">
              Manage cron jobs and scheduled tasks.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Updated: {lastRefreshedLabel}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadJobs}
            disabled={loadingJobs}
            className="gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', loadingJobs && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* Connection Status Panel */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {apiStatus.mode === 'control-api' ? (
                  <Wifi className="w-5 h-5 text-success" />
                ) : (
                  <WifiOff className="w-5 h-5 text-muted-foreground" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'w-2 h-2 rounded-full',
                      apiStatus.mode === 'control-api' ? 'bg-success' : 'bg-muted-foreground'
                    )} />
                    <span className="text-sm font-medium">
                      {apiStatus.mode === 'control-api' ? 'Control API Connected' : 'Control API Not Connected'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {apiStatus.mode === 'control-api' 
                      ? `Connected to ${apiStatus.baseUrl}`
                      : 'Cron jobs require VITE_API_BASE_URL to be configured'
                    }
                  </p>
                </div>
              </div>
              
              {apiStatus.mode === 'supabase-only' && (
                <div className="text-xs text-muted-foreground text-right">
                  Supabase: Connected
                </div>
              )}
            </div>

            {lastError && (
              <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-destructive font-medium">Connection Error</p>
                    <p className="text-xs text-destructive/80 mt-0.5">{lastError}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadJobs} disabled={loadingJobs}>
                    Retry
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Empty States */}
        {!loadingJobs && jobs.length === 0 && apiStatus.mode !== 'control-api' && !lastError && (
          <Card className="mb-6">
            <CardContent className="p-8 text-center">
              <WifiOff className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-medium">No Control API configured</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Cron jobs require a running ClawdBot Control API.
              </p>
              <p className="text-xs text-muted-foreground mt-3">
                Set <code className="bg-muted px-1 py-0.5 rounded">VITE_API_BASE_URL</code> to connect.
              </p>
            </CardContent>
          </Card>
        )}

        {!loadingJobs && jobs.length === 0 && apiStatus.mode === 'control-api' && !lastError && (
          <Card className="mb-6">
            <CardContent className="p-8 text-center">
              <Clock className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-medium">No cron jobs found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                There are no scheduled jobs in this workspace.
              </p>
              <p className="text-xs text-muted-foreground mt-3">
                Create cron jobs through ClawdBot's cron configuration.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Job List */}
        <div className="space-y-3">
          {jobs.map((job) => (
            <Collapsible
              key={job.id}
              open={expandedJob === job.id}
              onOpenChange={(open) => {
                setExpandedJob(open ? job.id : null);
                if (open) loadRuns(job.id);
              }}
            >
              <div id={`cron-job-${job.id}`} className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Switch
                        checked={job.enabled}
                        onCheckedChange={() => handleToggle(job)}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{job.name}</h3>
                          <code className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                            {job.schedule}
                          </code>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Next run:{' '}
                          {typeof job.nextRunAtMs === 'number'
                            ? formatDateTime(job.nextRunAtMs)
                            : (job.nextRun || '—')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-sm">
                        {getStatusIcon(job.lastRunStatus)}
                        <span className="text-muted-foreground">
                          {job.lastRunStatus || 'Never run'}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(job)}
                        className="gap-2"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRunNow(job)}
                        disabled={runningJob === job.id}
                        className="gap-2"
                      >
                        <Play className={cn("w-4 h-4", runningJob === job.id && "animate-pulse")} />
                        Run Now
                      </Button>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" aria-label={expandedJob === job.id ? 'Collapse' : 'Expand'}>
                          <ChevronDown className={cn(
                            "w-4 h-4 transition-transform",
                            expandedJob === job.id && "rotate-180"
                          )} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                </div>
                <CollapsibleContent>
                  <div className="px-4 pb-4 pt-0 border-t border-border mt-2">
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-muted-foreground mb-2">Instructions</h4>
                      <div className="p-3 rounded-lg bg-muted/50 font-mono text-sm whitespace-pre-wrap">
                        {job.instructions}
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Recent runs</h4>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadRuns(job.id, { force: true })}
                          disabled={Boolean(loadingRuns[job.id])}
                          className="gap-2"
                        >
                          <RefreshCw className={cn('w-4 h-4', loadingRuns[job.id] && 'animate-spin')} />
                          Refresh runs
                        </Button>
                      </div>

                      {loadingRuns[job.id] && (
                        <div className="text-sm text-muted-foreground">Loading…</div>
                      )}

                      {!loadingRuns[job.id] && (runsByJob[job.id]?.length || 0) === 0 && (
                        <div className="text-sm text-muted-foreground">No run history yet.</div>
                      )}

                      <div className="space-y-2">
                        {(runsByJob[job.id] || []).slice(0, 5).map((r) => {
                          const when = r.runAtMs ? formatDateTime(r.runAtMs) : formatDateTime(r.ts);
                          const dur = typeof r.durationMs === 'number' ? `${Math.round(r.durationMs / 1000)}s` : '';
                          const status = r.status || 'unknown';

                          return (
                            <div key={String(r.ts)} className="rounded-lg border border-border bg-background/50 p-3">
                              <div className="flex items-center justify-between gap-4">
                                <div className="text-sm">
                                  <div className="font-medium">{when}</div>
                                  <div className="text-xs text-muted-foreground">{r.action}{dur ? ` • ${dur}` : ''}</div>
                                </div>
                                <code className={cn(
                                  "text-xs px-2 py-0.5 rounded font-mono",
                                  status === 'ok' && "bg-success/15 text-success",
                                  status !== 'ok' && "bg-destructive/15 text-destructive"
                                )}>
                                  {status}
                                </code>
                              </div>
                              {r.summary && (
                                <div className="mt-2 p-2 rounded bg-muted/40 font-mono text-xs whitespace-pre-wrap">
                                  {r.summary}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(editingJob)} onOpenChange={(open) => { if (!open) setEditingJob(null); }}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Edit scheduled job</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Name</div>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Job name" />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Schedule (cron expression)</div>
              <Input value={editSchedule} onChange={(e) => setEditSchedule(e.target.value)} placeholder="*/30 * * * *" />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Instructions</div>
              <Textarea
                value={editInstructions}
                onChange={(e) => setEditInstructions(e.target.value)}
                placeholder="What should this job do?"
                className="min-h-[140px] font-mono"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Saves through the Control API (clawdbot cron edit). This edits the job’s systemEvent payload.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingJob(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit} className="gap-2">
              {savingEdit ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
