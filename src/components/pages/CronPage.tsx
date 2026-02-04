import { useEffect, useMemo, useState, useCallback } from 'react';
import { Play, Clock, Check, X, ChevronDown, RefreshCw, Pencil, AlertCircle, Search, Filter, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  queueCronPatchRequest,
  queueCronCreateRequest,
  queueCronDeleteRequest,
  getCronDeleteRequests,
  getAgents,
  type CronJob,
  type CronRunEntry,
  type CronMirrorJob,
  type CronRunRequest,
  type CronDeleteRequest,
  type Agent,
} from '@/lib/api';
import {
  type ScheduleConfig,
  type FrequencyType,
  SCHEDULE_PRESETS,
  DAY_OPTIONS,
  COMMON_TIMEZONES,
  parseScheduleToConfig,
  configToScheduleExpression,
  formatScheduleDisplay,
  encodeTargetAgent,
  decodeTargetAgent,
} from '@/lib/schedule-utils';
import { InlineScheduleEditor } from '@/components/schedule/ScheduleEditor';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// ============= Helpers =============

// Format schedule is now imported from schedule-utils

// ============= Sub-components =============

interface ConnectionStatusFooterProps {
  supabaseConnected: boolean;
  controlApiConnected: boolean;
}

function ConnectionStatusFooter({ supabaseConnected, controlApiConnected }: ConnectionStatusFooterProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur px-4 py-2 text-xs text-muted-foreground z-10">
      <div className="max-w-4xl mx-auto flex items-center gap-6">
        <div className="flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full', supabaseConnected ? 'bg-success' : 'bg-muted-foreground')} />
          <span>Supabase</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full', controlApiConnected ? 'bg-success' : 'bg-muted-foreground')} />
          <span>Control API</span>
        </div>
      </div>
    </div>
  );
}

interface RequestStatusBadgeProps {
  status: 'queued' | 'running' | 'done' | 'error';
}

function RequestStatusBadge({ status }: RequestStatusBadgeProps) {
  switch (status) {
    case 'queued':
      return <Badge variant="secondary" className="bg-warning/15 text-warning border-warning/30 text-[10px]">Queued</Badge>;
    case 'running':
      return <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/30 animate-pulse text-[10px]">Running</Badge>;
    case 'done':
      return <Badge variant="secondary" className="bg-success/15 text-success border-success/30 text-[10px]">Done</Badge>;
    case 'error':
      return <Badge variant="destructive" className="text-[10px]">Error</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

interface CronJobRowProps {
  job: CronMirrorJob;
  expanded: boolean;
  onToggleExpand: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: () => void;
  onScheduleChange: (result: { kind: 'cron' | 'every'; expr: string; tz?: string }) => void;
  running: boolean;
  controlApiConnected: boolean;
  pendingToggle: boolean;
  pendingDelete: boolean;
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
  onDelete,
  onToggleEnabled,
  onScheduleChange,
  running,
  controlApiConnected,
  pendingToggle,
  pendingDelete,
  runHistory,
  loadingRuns,
  onRefreshRuns,
}: CronJobRowProps) {
  const getStatusIcon = (status: string | null | undefined) => {
    switch (status) {
      case 'ok':
      case 'success':
        return <Check className="w-3 h-3 text-success" />;
      case 'error':
      case 'failed':
        return <X className="w-3 h-3 text-destructive" />;
      case 'pending':
        return <Clock className="w-3 h-3 text-warning animate-pulse" />;
      default:
        return null;
    }
  };

  const formatLastRun = (lastRunAt: string | null | undefined) => {
    if (!lastRunAt) return null;
    return formatDateTime(new Date(lastRunAt).getTime());
  };

  const lastRunLabel = formatLastRun(job.lastRunAt);

  return (
    <Collapsible open={expanded} onOpenChange={onToggleExpand}>
      <div 
        id={`cron-job-${job.jobId}`} 
        className={cn(
          "rounded-lg border border-border bg-card overflow-hidden transition-opacity",
          pendingDelete && "opacity-60"
        )}
      >
        <div className="p-4">
          {/* Main row - two lines */}
          <div className="flex items-start justify-between gap-4">
            {/* Left side: Toggle + Name/Schedule */}
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="flex items-center gap-2 pt-0.5">
                <Switch
                  checked={job.enabled}
                  onCheckedChange={onToggleEnabled}
                  disabled={pendingToggle || pendingDelete}
                  title={controlApiConnected ? undefined : 'Will queue toggle for when executor is online'}
                />
                {pendingToggle && (
                  <Badge variant="secondary" className="text-[10px]">Pending</Badge>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium truncate">{job.name}</h3>
                  {pendingDelete && (
                    <Badge variant="secondary" className="text-[10px] bg-destructive/10 text-destructive">
                      Deletion pending
                    </Badge>
                  )}
                </div>
                {/* Schedule on second line - clickable inline editor */}
                <InlineScheduleEditor
                  scheduleKind={job.scheduleKind}
                  scheduleExpr={job.scheduleExpr}
                  tz={job.tz}
                  onSave={onScheduleChange}
                  disabled={pendingDelete}
                >
                  <button 
                    className="text-sm text-primary hover:text-primary/80 mt-0.5 truncate text-left hover:underline cursor-pointer"
                    disabled={pendingDelete}
                  >
                    {formatScheduleDisplay(job.scheduleKind, job.scheduleExpr, job.tz, true)}
                  </button>
                </InlineScheduleEditor>
              </div>
            </div>

            {/* Right side: Status + Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Last run status - compact */}
              {job.lastStatus && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {getStatusIcon(job.lastStatus)}
                  <span className="hidden sm:inline">
                    {job.lastStatus === 'ok' ? 'OK' : job.lastStatus}
                  </span>
                  {lastRunLabel && (
                    <span className="hidden md:inline">• {lastRunLabel}</span>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={onRun}
                      disabled={running || pendingDelete}
                      title={controlApiConnected ? 'Run now' : 'Queue run request'}
                    >
                      <Play className={cn("w-4 h-4", running && "animate-pulse")} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {controlApiConnected ? 'Run now' : 'Queue run request'}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                      onClick={onDelete}
                      disabled={pendingDelete}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete job</TooltipContent>
                </Tooltip>

                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={expanded ? 'Collapse' : 'Expand'}>
                    <ChevronDown className={cn(
                      "w-4 h-4 transition-transform",
                      expanded && "rotate-180"
                    )} />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
          </div>
        </div>

        {/* Expanded details */}
        <CollapsibleContent>
          <div className="px-4 pb-4 pt-0 border-t border-border mt-2">
            {/* Edit button in expanded section */}
            {controlApiConnected && (
              <div className="mt-3 mb-4">
                <Button variant="outline" size="sm" onClick={onEdit} className="gap-2">
                  <Pencil className="w-3 h-3" />
                  Edit
                </Button>
              </div>
            )}

            <div className="mt-3">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Instructions</h4>
              <div className="p-3 rounded-lg bg-muted/50 font-mono text-sm whitespace-pre-wrap">
                {job.instructions || '(No instructions)'}
              </div>
            </div>

            <div className="mt-4 text-xs text-muted-foreground space-y-1">
              <div>Job ID: <code className="bg-muted px-1 py-0.5 rounded">{job.jobId}</code></div>
              <div>Schedule: <code className="bg-muted px-1 py-0.5 rounded">{job.scheduleKind || 'cron'}: {job.scheduleExpr}</code></div>
              {job.tz && <div>Timezone: {job.tz}</div>}
              <div>Last synced: {formatDateTime(new Date(job.updatedAt).getTime())}</div>
              {job.lastRunAt && <div>Last run: {formatDateTime(new Date(job.lastRunAt).getTime())}</div>}
              {job.lastDurationMs != null && <div>Duration: {Math.round(job.lastDurationMs / 1000)}s</div>}
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
                    <RefreshCw className={cn('w-3 h-3', loadingRuns && 'animate-spin')} />
                    Refresh
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
  const [deleteRequests, setDeleteRequests] = useState<CronDeleteRequest[]>([]);
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

  // Create dialog state - human-friendly
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createFrequency, setCreateFrequency] = useState<FrequencyType>('every-15');
  const [createTime, setCreateTime] = useState('09:00');
  const [createDays, setCreateDays] = useState<string[]>(['mon']);
  const [createCustomCron, setCreateCustomCron] = useState('');
  const [createTz, setCreateTz] = useState('America/New_York');
  const [createInstructions, setCreateInstructions] = useState('');
  const [createTargetAgent, setCreateTargetAgent] = useState('');
  const [savingCreate, setSavingCreate] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);

  // Delete dialog state
  const [deletingJob, setDeletingJob] = useState<CronMirrorJob | null>(null);
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());

  // Pending toggle requests (for offline mode)
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  const supabaseConnected = hasSupabase();
  const controlApiConnected = apiStatus.mode === 'control-api';

  // Compute pending deletes from delete requests
  useEffect(() => {
    const pendingJobIds = new Set(
      deleteRequests
        .filter(r => r.status === 'queued' || r.status === 'running')
        .map(r => r.jobId)
    );
    setPendingDeletes(pendingJobIds);
  }, [deleteRequests]);

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
      const [jobs, requests, delRequests] = await Promise.all([
        getCronMirrorJobs(),
        getCronRunRequests(20),
        getCronDeleteRequests(20),
      ]);
      setMirrorJobs(jobs);
      setRunRequests(requests);
      setDeleteRequests(delRequests);
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
      if (
        change?.table === 'cron_mirror' || 
        change?.table === 'cron_run_requests' ||
        change?.table === 'cron_delete_requests' ||
        change?.table === 'cron_job_patch_requests' ||
        change?.table === 'cron_create_requests'
      ) {
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

  // Toggle job enabled - via Control API or queue request
  const handleToggle = async (job: CronMirrorJob) => {
    if (controlApiConnected) {
      // Direct toggle via Control API
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
    } else {
      // Queue toggle request for offline execution
      setPendingToggles((prev) => new Set(prev).add(job.jobId));
      try {
        const result = await queueCronPatchRequest(job.jobId, { enabled: !job.enabled });
        if (result.ok) {
          // Optimistic update
          setMirrorJobs(mirrorJobs.map(j =>
            j.jobId === job.jobId ? { ...j, enabled: !j.enabled } : j
          ));
          toast({
            title: 'Toggle queued',
            description: `${job.name} will be ${job.enabled ? 'disabled' : 'enabled'} when the Mac mini executor picks up the request.`,
          });
        } else {
          throw new Error(result.error || 'Failed to queue toggle');
        }
      } catch (err: any) {
        toast({
          title: 'Failed to queue toggle',
          description: String(err?.message || err),
          variant: 'destructive',
        });
      } finally {
        setPendingToggles((prev) => {
          const next = new Set(prev);
          next.delete(job.jobId);
          return next;
        });
      }
    }
  };

  // Delete job handler
  const handleDelete = async () => {
    if (!deletingJob) return;
    
    const job = deletingJob;
    setDeletingJob(null);
    
    try {
      // Always queue delete request (even with Control API, we use the queue pattern)
      const result = await queueCronDeleteRequest(job.jobId);
      if (result.ok) {
        toast({
          title: 'Delete queued',
          description: `${job.name} will be removed when the Mac mini executor picks up the request.`,
        });
        // Reload to show pending state
        await loadJobs();
      } else {
        throw new Error(result.error || 'Failed to queue delete');
      }
    } catch (err: any) {
      toast({
        title: 'Failed to delete job',
        description: String(err?.message || err),
        variant: 'destructive',
      });
    }
  };

  // Handle schedule change from inline editor
  const handleScheduleChange = async (job: CronMirrorJob, result: { kind: 'cron' | 'every'; expr: string; tz?: string }) => {
    try {
      if (controlApiConnected) {
        // Direct edit via Control API
        await editCronJob(job.jobId, {
          schedule: result.expr,
        });
        // Optimistic update
        setMirrorJobs(mirrorJobs.map(j =>
          j.jobId === job.jobId 
            ? { ...j, scheduleKind: result.kind, scheduleExpr: result.expr, tz: result.tz || j.tz }
            : j
        ));
        toast({
          title: 'Schedule updated',
          description: `${job.name} schedule has been changed.`,
        });
      } else {
        // Queue patch request for offline execution
        const patchResult = await queueCronPatchRequest(job.jobId, {
          scheduleKind: result.kind,
          scheduleExpr: result.expr,
          tz: result.tz,
        });
        if (patchResult.ok) {
          // Optimistic update
          setMirrorJobs(mirrorJobs.map(j =>
            j.jobId === job.jobId
              ? { ...j, scheduleKind: result.kind, scheduleExpr: result.expr, tz: result.tz || j.tz }
              : j
          ));
          toast({
            title: 'Schedule update queued',
            description: `${job.name} schedule will be updated when the Mac mini executor picks up the request.`,
          });
        } else {
          throw new Error(patchResult.error || 'Failed to queue schedule update');
        }
      }
    } catch (err: any) {
      toast({
        title: 'Failed to update schedule',
        description: String(err?.message || err),
        variant: 'destructive',
      });
    }
  };

  // Create new scheduled job with human-friendly config
  const handleCreate = async () => {
    if (!createName.trim()) return;
    
    // Convert human-friendly config to schedule expression
    const scheduleConfig: ScheduleConfig = {
      frequency: createFrequency,
      time: createTime,
      days: createDays,
      cronExpr: createCustomCron,
      tz: createTz,
    };
    const scheduleResult = configToScheduleExpression(scheduleConfig);
    
    // Encode target agent into instructions if set
    const finalInstructions = encodeTargetAgent(createTargetAgent || null, createInstructions);
    
    setSavingCreate(true);
    try {
      // Queue create request (works for both modes)
      const result = await queueCronCreateRequest({
        name: createName,
        scheduleKind: scheduleResult.kind,
        scheduleExpr: scheduleResult.expr,
        tz: createTz || undefined,
        instructions: finalInstructions || undefined,
      });
      
      if (result.ok) {
        toast({
          title: 'Create request queued',
          description: `"${createName}" will be created when the Mac mini executor picks up the request.`,
        });
        setShowCreateDialog(false);
        setCreateName('');
        setCreateFrequency('every-15');
        setCreateTime('09:00');
        setCreateDays(['mon']);
        setCreateCustomCron('');
        setCreateTz('America/New_York');
        setCreateInstructions('');
        setCreateTargetAgent('');
        setShowAdvanced(false);
        await loadJobs();
      } else {
        throw new Error(result.error || 'Failed to queue creation');
      }
    } catch (err: any) {
      toast({
        title: 'Failed to create job',
        description: String(err?.message || err),
        variant: 'destructive',
      });
    } finally {
      setSavingCreate(false);
    }
  };

  // Load agents for target dropdown
  useEffect(() => {
    getAgents().then(setAgents).catch(console.error);
  }, []);

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

  // Combine all pending requests for display
  const pendingRequests = useMemo(() => {
    const pending: Array<{
      id: string;
      type: 'run' | 'delete';
      jobId: string;
      jobName: string;
      status: 'queued' | 'running' | 'done' | 'error';
      requestedAt: string;
    }> = [];

    runRequests
      .filter(r => r.status === 'queued' || r.status === 'running')
      .forEach(r => {
        const job = mirrorJobs.find(j => j.jobId === r.jobId);
        pending.push({
          id: r.id,
          type: 'run',
          jobId: r.jobId,
          jobName: job?.name || r.jobId,
          status: r.status,
          requestedAt: r.requestedAt,
        });
      });

    deleteRequests
      .filter(r => r.status === 'queued' || r.status === 'running')
      .forEach(r => {
        const job = mirrorJobs.find(j => j.jobId === r.jobId);
        pending.push({
          id: r.id,
          type: 'delete',
          jobId: r.jobId,
          jobName: job?.name || r.jobId,
          status: r.status,
          requestedAt: r.requestedAt,
        });
      });

    return pending.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  }, [runRequests, deleteRequests, mirrorJobs]);

  return (
    <div className="flex-1 p-6 pb-16 overflow-auto scrollbar-thin">
      <div className="max-w-4xl mx-auto">
        {/* Header - Compact layout */}
        <div className="mb-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Scheduled Jobs</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Manage cron jobs and scheduled tasks.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={loadJobs}
                    disabled={loadingJobs}
                  >
                    <RefreshCw className={cn('w-4 h-4', loadingJobs && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>
              <Button
                size="sm"
                onClick={() => setShowCreateDialog(true)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                New Job
              </Button>
            </div>
          </div>
        </div>

        {/* Error banner (prominent when there's an error) */}
        {lastError && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
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
              <h3 className="text-lg font-medium">No scheduled jobs yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Cron jobs live on the Mac mini executor. This UI shows a mirrored list from Supabase.
              </p>
              <Button 
                className="mt-4" 
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create First Job
              </Button>
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
              onDelete={() => setDeletingJob(job)}
              onToggleEnabled={() => handleToggle(job)}
              onScheduleChange={(result) => handleScheduleChange(job, result)}
              running={runningJob === job.jobId}
              controlApiConnected={controlApiConnected}
              pendingToggle={pendingToggles.has(job.jobId)}
              pendingDelete={pendingDeletes.has(job.jobId)}
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

        {/* Pending Requests Section */}
        {pendingRequests.length > 0 && (
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Pending Requests
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border bg-background/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {req.type === 'run' ? 'Run' : 'Delete'}
                        </Badge>
                        <span className="font-medium truncate">{req.jobName}</span>
                        <RequestStatusBadge status={req.status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Requested: {formatDateTime(new Date(req.requestedAt).getTime())}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Completed Requests (collapsed by default) */}
        {runRequests.filter(r => r.status === 'done' || r.status === 'error').length > 0 && (
          <Collapsible className="mt-4">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                <ChevronDown className="w-4 h-4" />
                Recent History ({runRequests.filter(r => r.status === 'done' || r.status === 'error').length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mt-2">
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    {runRequests
                      .filter(r => r.status === 'done' || r.status === 'error')
                      .slice(0, 10)
                      .map((req) => {
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
                                <RequestStatusBadge status={req.status} />
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {formatDateTime(new Date(req.requestedAt).getTime())}
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
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {/* Connection Status Footer */}
      <ConnectionStatusFooter
        supabaseConnected={supabaseConnected}
        controlApiConnected={controlApiConnected}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={Boolean(deletingJob)} onOpenChange={(open) => { if (!open) setDeletingJob(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scheduled job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{deletingJob?.name}" from the executor. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Create Dialog - Human-Friendly */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Scheduled Job</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Job Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Job Name</label>
              <Input 
                value={createName} 
                onChange={(e) => setCreateName(e.target.value)} 
                placeholder="e.g., Daily Summary, Hourly Sync" 
              />
            </div>

            {/* Schedule Frequency */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Runs...</label>
              <Select value={createFrequency} onValueChange={(v) => setCreateFrequency(v as FrequencyType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {SCHEDULE_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time Picker - for daily/weekdays/weekly */}
            {(createFrequency === 'daily' || createFrequency === 'weekdays' || createFrequency === 'weekly') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">At time</label>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={createTime}
                    onChange={(e) => setCreateTime(e.target.value)}
                    className="w-32"
                  />
                </div>
              </div>
            )}

            {/* Day Picker - for weekly */}
            {createFrequency === 'weekly' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">On days</label>
                <div className="flex flex-wrap gap-2">
                  {DAY_OPTIONS.map((day) => (
                    <label
                      key={day.id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer transition-colors",
                        createDays.includes(day.id) 
                          ? "bg-primary text-primary-foreground border-primary" 
                          : "bg-muted/50 border-border hover:bg-muted"
                      )}
                    >
                      <Checkbox
                        checked={createDays.includes(day.id)}
                        onCheckedChange={() => {
                          setCreateDays(prev => {
                            if (prev.includes(day.id)) {
                              if (prev.length === 1) return prev; // Don't remove last day
                              return prev.filter(d => d !== day.id);
                            }
                            return [...prev, day.id];
                          });
                        }}
                        className="sr-only"
                      />
                      <span className="text-sm">{day.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Cron Input */}
            {createFrequency === 'custom' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Cron expression</label>
                <Input
                  value={createCustomCron}
                  onChange={(e) => setCreateCustomCron(e.target.value)}
                  placeholder="0 9 * * *"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Format: minute hour day-of-month month day-of-week
                </p>
              </div>
            )}

            {/* Timezone */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Timezone</label>
              <Select value={createTz} onValueChange={setCreateTz}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {COMMON_TIMEZONES.map((tz) => (
                    <SelectItem key={tz.id} value={tz.id}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target Agent */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Target Agent (optional)</label>
              <Select value={createTargetAgent} onValueChange={setCreateTargetAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an agent..." />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="">No specific agent</SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.avatar || '🤖'} {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The agent that will receive this scheduled task
              </p>
            </div>

            {/* Instructions */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Instructions</label>
              <Textarea
                value={createInstructions}
                onChange={(e) => setCreateInstructions(e.target.value)}
                placeholder="What should this job do?"
                className="min-h-[80px]"
              />
            </div>

            {/* Advanced Toggle */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <ChevronDown className={cn("w-4 h-4 transition-transform", showAdvanced && "rotate-180")} />
                  Advanced
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="p-3 rounded-md bg-muted/50 font-mono text-sm">
                  <div className="text-xs text-muted-foreground mb-1">Generated expression:</div>
                  <code>
                    {(() => {
                      const config: ScheduleConfig = {
                        frequency: createFrequency,
                        time: createTime,
                        days: createDays,
                        cronExpr: createCustomCron,
                        tz: createTz,
                      };
                      const result = configToScheduleExpression(config);
                      return `${result.kind}: ${result.expr}`;
                    })()}
                  </code>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Offline Warning */}
            {!controlApiConnected && (
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                <p className="text-sm text-warning">
                  This will queue a create request for when the Mac mini executor is online.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={savingCreate}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreate} 
              disabled={savingCreate || !createName.trim()} 
              className="gap-2"
            >
              {savingCreate ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              {controlApiConnected ? 'Create' : 'Queue Creation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
