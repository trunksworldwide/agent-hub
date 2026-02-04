import { User, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { type Task, type Agent, type TaskStatus } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUS_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
  { id: 'blocked', label: 'Blocked' },
];

interface TaskCardProps {
  task: Task;
  agents: Agent[];
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onAssigneeChange: (taskId: string, agentKey: string | undefined) => void;
  onClick: () => void;
  showStatusSelect?: boolean;
  showAssigneeSelect?: boolean;
}

export function TaskCard({
  task,
  agents,
  onStatusChange,
  onAssigneeChange,
  onClick,
  showStatusSelect = true,
  showAssigneeSelect = true,
}: TaskCardProps) {
  const agent = task.assigneeAgentKey
    ? agents.find((a) => a.id === task.assigneeAgentKey)
    : null;

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger card click if clicking on a select
    if ((e.target as HTMLElement).closest('[data-radix-select-trigger]')) {
      return;
    }
    onClick();
  };

  return (
    <div
      onClick={handleCardClick}
      className={cn(
        'p-3 bg-card rounded-lg border shadow-sm cursor-pointer transition-colors hover:bg-accent/50',
        task.isProposed && 'border-amber-500/40 bg-amber-500/5',
        task.status === 'blocked' && 'border-red-500/40 bg-red-500/5'
      )}
    >
      {/* Title and badges */}
      <div className="flex items-start gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{task.title}</div>
        </div>
        {task.isProposed && (
          <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 border-amber-500/50 text-amber-600 bg-amber-500/10">
            Needs review
          </Badge>
        )}
        {task.status === 'blocked' && (
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
        )}
      </div>

      {/* Description */}
      {task.description && (
        <div className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {task.description}
        </div>
      )}

      {/* Blocked reason */}
      {task.status === 'blocked' && task.blockedReason && (
        <div className="text-xs text-red-600 bg-red-500/10 rounded px-2 py-1 mb-2">
          {task.blockedReason}
        </div>
      )}

      {/* Assignee display and quick reassign */}
      {showAssigneeSelect && (
        <div className="mb-2">
          <Select
            value={task.assigneeAgentKey || '__unassigned__'}
            onValueChange={(v) =>
              onAssigneeChange(task.id, v === '__unassigned__' ? undefined : v)
            }
          >
            <SelectTrigger className="h-7 w-full text-xs" data-radix-select-trigger>
              <div className="flex items-center gap-1.5">
                {agent ? (
                  <>
                    <span>{agent.avatar}</span>
                    <span>{agent.name}</span>
                  </>
                ) : (
                  <>
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Unassigned</span>
                  </>
                )}
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__unassigned__">
                <div className="flex items-center gap-1.5">
                  <User className="w-3 h-3" />
                  <span>Unassigned</span>
                </div>
              </SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <div className="flex items-center gap-1.5">
                    <span>{a.avatar}</span>
                    <span>{a.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Status selector */}
      {showStatusSelect && (
        <div className="flex items-center justify-end">
          <Select
            value={task.status}
            onValueChange={(v) => onStatusChange(task.id, v as TaskStatus)}
          >
            <SelectTrigger className="h-6 w-auto text-xs" data-radix-select-trigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_COLUMNS.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
