import { useEffect, useState } from 'react';
import { Play, Clock, Check, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { getCronJobs, toggleCronJob, runCronJob, type CronJob } from '@/lib/api';
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
  const { toast } = useToast();

  useEffect(() => {
    getCronJobs().then(setJobs);
  }, []);

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
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Scheduled Jobs</h1>
          <p className="text-muted-foreground">
            Manage cron jobs and scheduled tasks.
          </p>
        </div>

        <div className="space-y-3">
          {jobs.map((job) => (
            <Collapsible
              key={job.id}
              open={expandedJob === job.id}
              onOpenChange={(open) => setExpandedJob(open ? job.id : null)}
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
                        <Button variant="ghost" size="sm">
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
                      <div className="p-3 rounded-lg bg-muted/50 font-mono text-sm">
                        {job.instructions}
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
