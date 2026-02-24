import { User, AlertTriangle } from 'lucide-react';
import { type Task, type Agent, type TaskStatus } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Zack workflow: Suggested → In Progress → Completed
// Keep the dropdown aligned so agents can’t accidentally use extra statuses.
const STATUS_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'inbox', label: 'Suggested' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Completed' },
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
        'group p-3.5 bg-card rounded-lg border border-border/60 cursor-pointer transition-all hover:border-border hover:shadow-md',
        task.isProposed && 'border-amber-400/30',
        task.status === 'blocked' && 'border-red-400/30'
      )}
    >
      {/* Title */}
      <div className="flex items-start gap-2 mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-snug line-clamp-3">{task.title}</div>
        </div>
        {task.status === 'blocked' && (
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
        )}
      </div>

      {/* Description */}
      {task.description && (
        <div className="text-xs text-muted-foreground line-clamp-2 mb-3">
          {task.description}
        </div>
      )}

      {/* Blocked reason */}
      {task.status === 'blocked' && task.blockedReason && (
        <div className="text-xs text-red-600 bg-red-500/10 rounded px-2 py-1 mb-3">
          {task.blockedReason}
        </div>
      )}

      {/* Footer: assignee + status */}
      <div className="flex items-center gap-2">
        {/* Assignee */}
        {showAssigneeSelect && (
          <div className="flex-1 min-w-0">
            <Select
              value={task.assigneeAgentKey || '__unassigned__'}
              onValueChange={(v) =>
                onAssigneeChange(task.id, v === '__unassigned__' ? undefined : v)
              }
            >
              <SelectTrigger className="h-7 w-full text-xs border-0 bg-muted/50 hover:bg-muted" data-radix-select-trigger>
                <div className="flex items-center gap-1.5 truncate">
                  {agent ? (
                    <>
                      <span className="shrink-0">{agent.avatar}</span>
                      <span className="truncate">{agent.name}</span>
                    </>
                  ) : (
                    <>
                      <User className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground truncate">Unassigned</span>
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

        {/* Status */}
        {showStatusSelect && (
          <Select
            value={task.status}
            onValueChange={(v) => onStatusChange(task.id, v as TaskStatus)}
          >
            <SelectTrigger className="h-7 w-auto text-xs border-0 bg-muted/50 hover:bg-muted shrink-0" data-radix-select-trigger>
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
        )}
      </div>
    </div>
  );
}
