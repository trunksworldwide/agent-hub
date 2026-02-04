import { useEffect, useMemo, useState, useCallback } from 'react';
import { Play, Clock, Check, X, ChevronDown, RefreshCw, Pencil, AlertCircle, Database, Wifi, WifiOff, Search, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  getCronJobs,
  toggleCronJob,
  editCronJob,
  runCronJob,
  getCronRuns,
  getApiStatus,
  getCronMirrorJobs,
  queueCronRunRequest,
  getCronRunRequests,
  type CronJob,
  type CronRunEntry,
  type CronMirrorJob,
  type CronRunRequest,
} from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useClawdOffice } from '@/lib/store';
import { hasSupabase, subscribeToProjectRealtime } from '@/lib/supabase';
import { getSelectedProjectId } from '@/lib/project';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ============= Sub-components =============

interface ConnectionStatusPanelProps {
  supabaseConnected: boolean;
  controlApiConnected: boolean;
  controlApiUrl: string | null;
  lastError: string | null;
  onRetry: () => void;
  loading: boolean;
}

function ConnectionStatusPanel({
  supabaseConnected,
  controlApiConnected,
  controlApiUrl,
  lastError,
  onRetry,
  loading,
}: ConnectionStatusPanelProps) {
  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            {/* Supabase Status */}
            <div className="flex items-center gap-2">
              <Database className={cn('w-4 h-4', supabaseConnected ? 'text-success' : 'text-muted-foreground')} />
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'w-2 h-2 rounded-full',
                    supabaseConnected ? 'bg-success' : 'bg-muted-foreground'
                  )} />
                  <span className="text-sm font-medium">
                    Supabase: {supabaseConnected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
              </div>
            </div>

            {/* Control API Status */}
            <div className="flex items-center gap-2">
              {controlApiConnected ? (
                <Wifi className="w-4 h-4 text-success" />
              ) : (
                <WifiOff className="w-4 h-4 text-muted-foreground" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'w-2 h-2 rounded-full',
                    controlApiConnected ? 'bg-success' : 'bg-muted-foreground'
                  )} />
                  <span className="text-sm font-medium">
                    Control API: {controlApiConnected ? 'Connected' : 'Not Configured'}
                  </span>
                </div>
                {controlApiConnected && controlApiUrl && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {controlApiUrl}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {lastError && (
          <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-destructive font-medium">Connection Error</p>
                <p className="text-xs text-destructive/80 mt-0.5">{lastError}</p>
              </div>
              <Button variant="outline" size="sm" onClick={onRetry} disabled={loading}>
                Retry
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RunRequestsBadgeProps {
  status: CronRunRequest['status'];
}

function RunRequestsBadge({ status }: RunRequestsBadgeProps) {
  switch (status) {
    case 'queued':
      return <Badge variant="secondary" className="bg-warning/15 text-warning border-warning/30">Queued</Badge>;
    case 'running':
      return <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/30 animate-pulse">Running</Badge>;
    case 'done':
      return <Badge variant="secondary" className="bg-success/15 text-success border-success/30">Done</Badge>;
    case 'error':
      return <Badge variant="destructive">Error</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

interface CronJobRowProps {
  job: CronMirrorJob;
  expanded: boolean;
  onToggleExpand: () => void;
  onRun: () => void;
  onEdit: () => void;
  onToggleEnabled: () => void;
  running: boolean;
  controlApiConnected: boolean;
  runHistory: CronRunEntry[];
  loadingRuns: boolean;
  onRefreshRuns: () => void;
}

function CronJobRow({
  job,
  expanded,
  onToggleExpand,
  onRun,
  onEdit,
  onToggleEnabled,
  running,
  controlApiConnected,
  runHistory,
  loadingRuns,
  onRefreshRuns,
}: CronJobRowProps) {
  const getStatusIcon = (status: string | null | undefined) => {
    switch (status) {
      case 'ok':
      case 'success':
        return <Check className="w-4 h-4 text-success" />;
      case 'error':
      case 'failed':
        return <X className="w-4 h-4 text-destructive" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-warning animate-pulse" />;
      default:
        return <span className="w-4 h-4 text-muted-foreground">—</span>;
    }
  };

  const formatNextRun = (nextRunAt: string | null | undefined) => {
    if (!nextRunAt) return '—';
    return formatDateTime(new Date(nextRunAt).getTime());
  };

  const formatLastRun = (lastRunAt: string | null | undefined) => {
    if (!lastRunAt) return 'Never';
    return formatDateTime(new Date(lastRunAt).getTime());
  };

  return (
    <Collapsible open={expanded} onOpenChange={onToggleExpand}>
      <div id={`cron-job-${job.jobId}`} className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Switch
                checked={job.enabled}
                onCheckedChange={onToggleEnabled}
                disabled={!controlApiConnected}
                title={controlApiConnected ? undefined : 'Toggle requires Control API'}
              />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{job.name}</h3>
                  <code className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                    {job.scheduleExpr || job.scheduleKind || '—'}
                  </code>
                  {job.tz && (
                    <span className="text-xs text-muted-foreground">({job.tz})</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Next: {formatNextRun(job.nextRunAt)} • Last: {formatLastRun(job.lastRunAt)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                {getStatusIcon(job.lastStatus)}
                <span className="text-muted-foreground">
                  {job.lastStatus || 'Never run'}
                </span>
              </div>
              {controlApiConnected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEdit}
                  className="gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={onRun}
                disabled={running}
                className="gap-2"
                title={controlApiConnected ? 'Run now via Control API' : 'Queue run request'}
              >
                <Play className={cn("w-4 h-4", running && "animate-pulse")} />
                Run
              </Button>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" aria-label={expanded ? 'Collapse' : 'Expand'}>
                  <ChevronDown className={cn(
                    "w-4 h-4 transition-transform",
                    expanded && "rotate-180"
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
                {job.instructions || '(No instructions)'}
              </div>
            </div>

            <div className="mt-4 text-xs text-muted-foreground space-y-1">
              <div>Job ID: <code className="bg-muted px-1 py-0.5 rounded">{job.jobId}</code></div>
              <div>Last synced: {formatDateTime(new Date(job.updatedAt).getTime())}</div>
            </div>

            {controlApiConnected && (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Recent runs (Control API)</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRefreshRuns}
                    disabled={loadingRuns}
                    className="gap-2"
                  >
                    <RefreshCw className={cn('w-4 h-4', loadingRuns && 'animate-spin')} />
                    Refresh runs
                  </Button>
                </div>

                {loadingRuns && (
                  <div className="text-sm text-muted-foreground">Loading…</div>
                )}

                {!loadingRuns && runHistory.length === 0 && (
                  <div className="text-sm text-muted-foreground">No run history yet.</div>
                )}

                <div className="space-y-2">
                  {runHistory.slice(0, 5).map((r) => {
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
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ============= Main Component =============

export function CronPage() {
  const { focusCronJobId, setFocusCronJobId } = useClawdOffice();
  const { toast } = useToast();
  const apiStatus = useMemo(() => getApiStatus(), []);

  // State
  const [mirrorJobs, setMirrorJobs] = useState<CronMirrorJob[]>([]);
  const [runRequests, setRunRequests] = useState<CronRunRequest[]>([]);
  const [runningJob, setRunningJob] = useState<string | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [runsByJob, setRunsByJob] = useState<Record<string, CronRunEntry[]>>({});
  const [loadingRuns, setLoadingRuns] = useState<Record<string, boolean>>({});
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Edit dialog state
  const [editingJob, setEditingJob] = useState<CronMirrorJob | null>(null);
  const [editName, setEditName] = useState('');
  const [editSchedule, setEditSchedule] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  const supabaseConnected = hasSupabase();
  const controlApiConnected = apiStatus.mode === 'control-api';

  const lastRefreshedLabel = useMemo(() => {
    if (!lastRefreshedAt) return '—';
    const ms = Date.now() - lastRefreshedAt;
    if (ms < 3_000) return 'just now';
    if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s ago`;
    if (ms < 60 * 60_000) return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
    return formatDateTime(lastRefreshedAt);
  }, [lastRefreshedAt]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return mirrorJobs.filter((job) => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = job.name.toLowerCase().includes(q);
        const matchesInstructions = job.instructions?.toLowerCase().includes(q);
        if (!matchesName && !matchesInstructions) return false;
      }

      // Enabled filter
      if (enabledFilter === 'enabled' && !job.enabled) return false;
      if (enabledFilter === 'disabled' && job.enabled) return false;

      return true;
    });
  }, [mirrorJobs, searchQuery, enabledFilter]);

  // Load jobs from Supabase cron_mirror
  const loadJobs = useCallback(async () => {
    if (loadingJobs) return;
    setLoadingJobs(true);
    setLastError(null);
    try {
      const [jobs, requests] = await Promise.all([
        getCronMirrorJobs(),
        getCronRunRequests(20),
      ]);
      setMirrorJobs(jobs);
      setRunRequests(requests);
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
  }, [loadingJobs, toast]);

  // Initial load
  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!supabaseConnected) return;

    const projectId = getSelectedProjectId();
    const unsubscribe = subscribeToProjectRealtime(projectId, (change) => {
      if (change?.table === 'cron_mirror' || change?.table === 'cron_run_requests') {
        // Reload data on any cron-related change
        loadJobs();
      }
    });

    return unsubscribe;
  }, [supabaseConnected, loadJobs]);

  // Focus on specific job from external navigation
  useEffect(() => {
    if (!focusCronJobId) return;
    if (!mirrorJobs.some((j) => j.jobId === focusCronJobId)) return;

    setExpandedJob(focusCronJobId);

    setTimeout(() => {
      const el = document.getElementById(`cron-job-${focusCronJobId}`);
      el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 0);

    setFocusCronJobId(null);
  }, [focusCronJobId, mirrorJobs, setFocusCronJobId]);

  // Load run history from Control API
  const loadRuns = async (jobId: string, opts?: { force?: boolean }) => {
    if (!controlApiConnected) return;
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

  // Toggle job enabled via Control API
  const handleToggle = async (job: CronMirrorJob) => {
    if (!controlApiConnected) {
      toast({
        title: 'Control API required',
        description: 'Toggling jobs requires the Control API to be connected.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await toggleCronJob(job.jobId, !job.enabled);
      // Optimistic update
      setMirrorJobs(mirrorJobs.map(j =>
        j.jobId === job.jobId ? { ...j, enabled: !j.enabled } : j
      ));
      toast({
        title: job.enabled ? 'Job disabled' : 'Job enabled',
        description: `${job.name} has been ${job.enabled ? 'disabled' : 'enabled'}.`,
      });
    } catch (err: any) {
      toast({
        title: 'Failed to toggle job',
        description: String(err?.message || err),
        variant: 'destructive',
      });
    }
  };

  // Run job: Control API direct or queue request
  const handleRunNow = async (job: CronMirrorJob) => {
    setRunningJob(job.jobId);
    try {
      if (controlApiConnected) {
        // Direct execution via Control API
        await runCronJob(job.jobId);
        toast({
          title: 'Job started',
          description: `${job.name} is now running.`,
        });
      } else {
        // Queue request for Mac mini worker
        const result = await queueCronRunRequest(job.jobId);
        if (result.ok) {
          toast({
            title: 'Run request queued',
            description: `${job.name} will run when the Mac mini worker picks it up.`,
          });
          // Reload requests
          const requests = await getCronRunRequests(20);
          setRunRequests(requests);
        } else {
          throw new Error(result.error || 'Failed to queue request');
        }
      }
    } catch (err: any) {
      toast({
        title: 'Failed to run job',
        description: String(err?.message || err),
        variant: 'destructive',
      });
    } finally {
      setRunningJob(null);
    }
  };

  // Open edit dialog
  const openEdit = (job: CronMirrorJob) => {
    setEditingJob(job);
    setEditName(job.name || '');
    setEditSchedule(job.scheduleExpr || '');
    setEditInstructions(job.instructions || '');
  };

  // Save edit via Control API
  const handleSaveEdit = async () => {
    if (!editingJob || savingEdit) return;
    setSavingEdit(true);
    try {
      await editCronJob(editingJob.jobId, {
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
        <ConnectionStatusPanel
          supabaseConnected={supabaseConnected}
          controlApiConnected={controlApiConnected}
          controlApiUrl={apiStatus.baseUrl}
          lastError={lastError}
          onRetry={loadJobs}
          loading={loadingJobs}
        />

        {/* Search and Filter */}
        {mirrorJobs.length > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search jobs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={enabledFilter} onValueChange={(v) => setEnabledFilter(v as any)}>
              <SelectTrigger className="w-[140px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Empty States */}
        {!loadingJobs && mirrorJobs.length === 0 && !lastError && (
          <Card className="mb-6">
            <CardContent className="p-8 text-center">
              <Clock className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-medium">No cron jobs mirrored yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Cron jobs live on the Mac mini executor. This UI shows a mirrored list from Supabase.
              </p>
              <p className="text-xs text-muted-foreground mt-3">
                If you just set this up, the Mac mini sync worker hasn't published jobs yet.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Job List */}
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <CronJobRow
              key={job.id}
              job={job}
              expanded={expandedJob === job.jobId}
              onToggleExpand={() => {
                const willExpand = expandedJob !== job.jobId;
                setExpandedJob(willExpand ? job.jobId : null);
                if (willExpand && controlApiConnected) {
                  loadRuns(job.jobId);
                }
              }}
              onRun={() => handleRunNow(job)}
              onEdit={() => openEdit(job)}
              onToggleEnabled={() => handleToggle(job)}
              running={runningJob === job.jobId}
              controlApiConnected={controlApiConnected}
              runHistory={runsByJob[job.jobId] || []}
              loadingRuns={Boolean(loadingRuns[job.jobId])}
              onRefreshRuns={() => loadRuns(job.jobId, { force: true })}
            />
          ))}
        </div>

        {/* No results after filtering */}
        {mirrorJobs.length > 0 && filteredJobs.length === 0 && (
          <Card className="mb-6">
            <CardContent className="p-8 text-center">
              <Search className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-medium">No jobs match your filters</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your search or filter settings.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearchQuery('');
                  setEnabledFilter('all');
                }}
              >
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Run Requests Section */}
        {runRequests.length > 0 && (
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Play className="w-4 h-4" />
                Recent Run Requests
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {runRequests.slice(0, 10).map((req) => {
                  const job = mirrorJobs.find(j => j.jobId === req.jobId);
                  return (
                    <div
                      key={req.id}
                      className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border bg-background/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {job?.name || req.jobId}
                          </span>
                          <RunRequestsBadge status={req.status} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Requested: {formatDateTime(new Date(req.requestedAt).getTime())}
                          {req.requestedBy && ` by ${req.requestedBy}`}
                        </p>
                      </div>
                      {req.completedAt && (
                        <div className="text-xs text-muted-foreground text-right">
                          Completed: {formatDateTime(new Date(req.completedAt).getTime())}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
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
              Saves through the Control API (clawdbot cron edit). This edits the job's systemEvent payload.
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
