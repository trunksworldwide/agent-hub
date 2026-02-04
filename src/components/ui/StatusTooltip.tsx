import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import type { ReactNode } from 'react';

interface StatusTooltipProps {
  status: 'working' | 'idle' | 'offline';
  statusState?: 'idle' | 'working' | 'blocked' | 'sleeping' | null;
  lastActivityAt?: string | null;
  lastHeartbeatAt?: string | null;
  children: ReactNode;
}

const STATUS_RULES: Record<string, string> = {
  working: 'state=working AND seen within 30 minutes',
  idle: 'Seen within last 60 minutes, not actively working',
  offline: 'No heartbeat/activity in 60+ minutes OR state=sleeping',
};

export function StatusTooltip({
  status,
  statusState,
  lastActivityAt,
  lastHeartbeatAt,
  children,
}: StatusTooltipProps) {
  const formatTime = (iso: string | null | undefined): string => {
    if (!iso) return 'Unknown';
    try {
      const date = new Date(iso);
      if (isNaN(date.getTime())) return 'Invalid date';
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return iso;
    }
  };

  const getStateLabel = () => {
    if (status === 'working') return 'WORKING';
    if (status === 'idle') return 'IDLE';
    return 'OFFLINE';
  };

  const hasData = lastActivityAt || lastHeartbeatAt || statusState;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-xs p-3">
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Status:</span>
            <span className="font-mono">{getStateLabel()}</span>
          </div>
          
          {statusState && (
            <div className="flex items-center gap-2">
              <span className="font-semibold">State:</span>
              <span className="font-mono">{statusState}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <span className="font-semibold">Last heartbeat:</span>
            <span>{formatTime(lastHeartbeatAt)}</span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="font-semibold">Last activity:</span>
            <span>{formatTime(lastActivityAt)}</span>
          </div>

          {!hasData && (
            <div className="text-muted-foreground italic">
              No status data available for this agent.
            </div>
          )}

          <div className="pt-2 border-t border-border text-muted-foreground">
            <div className="font-semibold mb-1">Status rules:</div>
            <div className="text-[10px]">{STATUS_RULES[status]}</div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
