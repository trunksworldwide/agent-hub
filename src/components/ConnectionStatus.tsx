import { useEffect, useState, useCallback } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useClawdOffice } from '@/lib/store';
import { testControlApi } from '@/lib/control-api';
import { cn } from '@/lib/utils';

type ConnectionMode = 'live' | 'backup' | 'offline';

/**
 * ConnectionStatus - shows Live / Backup / Offline mode in the top bar.
 * Polls the Control API every 30s to determine mode.
 */
export function ConnectionStatus() {
  const { controlApiUrl, setExecutorCheck, executorCheck } = useClawdOffice();
  const [mode, setMode] = useState<ConnectionMode>('backup');
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);

  const check = useCallback(async () => {
    if (!controlApiUrl) {
      setMode('backup');
      setLastCheckTime(new Date());
      return;
    }
    try {
      const result = await testControlApi(controlApiUrl);
      setExecutorCheck(result);
      setMode('live');
      setLastCheckTime(new Date());
    } catch {
      setMode(controlApiUrl ? 'backup' : 'offline');
      setLastCheckTime(new Date());
    }
  }, [controlApiUrl, setExecutorCheck]);

  useEffect(() => {
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, [check]);

  const label =
    mode === 'live'
      ? 'Live'
      : mode === 'backup'
        ? 'Backup'
        : 'Offline';

  const description =
    mode === 'live'
      ? `Control API connected${executorCheck?.version ? ` (${executorCheck.version})` : ''}`
      : mode === 'backup'
        ? 'Using Supabase only'
        : 'No connectivity';

  const timeStr = lastCheckTime
    ? lastCheckTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : '';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 cursor-default select-none">
          <span
            className={cn(
              'w-2 h-2 rounded-full',
              mode === 'live' && 'bg-[hsl(var(--success))]',
              mode === 'backup' && 'bg-[hsl(var(--warning))]',
              mode === 'offline' && 'bg-destructive',
            )}
          />
          <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
            {label}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <p className="font-medium">{description}</p>
        {timeStr && <p className="text-muted-foreground">Last check: {timeStr}</p>}
      </TooltipContent>
    </Tooltip>
  );
}
