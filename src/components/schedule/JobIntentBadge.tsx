import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { JobIntent } from '@/lib/schedule-utils';

interface JobIntentBadgeProps {
  intent: JobIntent | string | null | undefined;
  className?: string;
}

const INTENT_STYLES: Record<string, { label: string; className: string }> = {
  daily_brief: {
    label: 'Daily Brief',
    className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30',
  },
  task_suggestions: {
    label: 'Tasks',
    className: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30',
  },
  monitoring: {
    label: 'Monitoring',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  },
  housekeeping: {
    label: 'Housekeeping',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  },
  sync: {
    label: 'Sync',
    className: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30',
  },
  custom: {
    label: 'Custom',
    className: 'bg-muted text-muted-foreground border-border',
  },
};

export function JobIntentBadge({ intent, className }: JobIntentBadgeProps) {
  if (!intent) return null;

  const style = INTENT_STYLES[intent] || INTENT_STYLES.custom;

  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] font-medium', style.className, className)}
    >
      {style.label}
    </Badge>
  );
}
