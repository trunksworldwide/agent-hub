import { useEffect, useMemo, useState } from 'react';
import { Play, Clock, Check, X, ChevronDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { getCronJobs, toggleCronJob, runCronJob, getCronRuns, type CronJob, type CronRunEntry } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [runsByJob, setRunsByJob] = useState<Record<string, CronRunEntry[]>>({});
  const [loadingRuns, setLoadingRuns] = useState<Record<string, boolean>>({});
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const { toast } = useToast();

  const lastRefreshedLabel = useMemo(() => {
    if (!lastRefreshedAt) return '—';
    const ms = Date.now() - lastRefreshedAt;
    if (ms < 3_000) return 'just now';
    if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s ago`;
    if (ms < 60 * 60_000) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
    return new Date(lastRefreshedAt).toLocaleString();
  }, [lastRefreshedAt]);

  const loadJobs = async () => {
    if (loadingJobs) return;
    setLoadingJobs(true);
    try {
      const next = await getCronJobs();
      setJobs(next);
      setLastRefreshedAt(Date.now());
    } catch (err: any) {
      toast({
        title: 'Failed to load cron jobs',
        description: String(err?.message || err),
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
              <div className="rounded-lg border border-border bg-card overflow-hidden">
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
                          Next run: {job.nextRun}
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
                          const when = r.runAtMs ? new Date(r.runAtMs).toLocaleString() : new Date(r.ts).toLocaleString();
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
    </div>
  );
}
