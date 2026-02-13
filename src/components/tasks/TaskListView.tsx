import { useMemo, useState } from 'react';
import { Search, Filter, ChevronDown, ChevronRight, User, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type Task, type Agent, type TaskStatus } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const STATUS_ORDER: TaskStatus[] = ['in_progress', 'blocked', 'assigned', 'review', 'stopped', 'done'];
const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: 'Inbox',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
  blocked: 'Blocked',
  stopped: 'Stopped',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  inbox: 'bg-muted',
  assigned: 'bg-blue-500/20 text-blue-700',
  in_progress: 'bg-yellow-500/20 text-yellow-700',
  review: 'bg-purple-500/20 text-purple-700',
  done: 'bg-green-500/20 text-green-700',
  blocked: 'bg-red-500/20 text-red-700',
  stopped: 'bg-orange-500/20 text-orange-700',
};

interface TaskListViewProps {
  tasks: Task[];
  agents: Agent[];
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
}

export function TaskListView({ tasks, agents, onTaskClick, onStatusChange }: TaskListViewProps) {
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('__all__');
  const [showDone, setShowDone] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [showStopped, setShowStopped] = useState(false);
  const [groupByStatus, setGroupByStatus] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<TaskStatus>>(new Set(['done']));

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Filter out rejected tasks unless showing them
      if (task.rejectedAt && !showRejected) return false;
      
      // Filter out done tasks unless showing them
      if (task.status === 'done' && !task.rejectedAt && !showDone) return false;

      // Filter out stopped tasks unless showing them
      if (task.status === 'stopped' && !showStopped) return false;
      
      // Filter out inbox tasks (those go to the board)
      if (task.status === 'inbox') return false;

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        if (
          !task.title.toLowerCase().includes(searchLower) &&
          !(task.description || '').toLowerCase().includes(searchLower)
        ) {
          return false;
        }
      }

      // Assignee filter
      if (assigneeFilter !== '__all__') {
        if (assigneeFilter === '__unassigned__') {
          if (task.assigneeAgentKey) return false;
        } else {
          if (task.assigneeAgentKey !== assigneeFilter) return false;
        }
      }

      return true;
    });
  }, [tasks, search, assigneeFilter, showDone, showRejected, showStopped]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    
    if (!groupByStatus) {
      // Return all tasks sorted by updated_at
      groups['all'] = [...filteredTasks].sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      return groups;
    }

    for (const status of STATUS_ORDER) {
      const tasksInStatus = filteredTasks.filter((t) => t.status === status);
      if (tasksInStatus.length > 0) {
        groups[status] = tasksInStatus.sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      }
    }
    return groups;
  }, [filteredTasks, groupByStatus]);

  const toggleGroup = (status: TaskStatus) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const getAgentDisplay = (agentKey: string | undefined) => {
    if (!agentKey) return { emoji: '👤', name: 'Unassigned' };
    const agent = agents.find((a) => a.id === agentKey);
    if (agent) return { emoji: agent.avatar || '🤖', name: agent.name };
    return { emoji: '🤖', name: agentKey };
  };

  return (
    <div className="h-full flex flex-col">
      {/* Filters */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="pl-9"
            />
          </div>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="w-[160px]">
              <User className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Assignees</SelectItem>
              <SelectItem value="__unassigned__">Unassigned</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <div className="flex items-center gap-2">
                    <span>{a.avatar}</span>
                    <span>{a.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="showDone"
              checked={showDone}
              onCheckedChange={(c) => setShowDone(c === true)}
            />
            <label htmlFor="showDone" className="text-sm cursor-pointer">
              Show Done
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="showRejected"
              checked={showRejected}
              onCheckedChange={(c) => setShowRejected(c === true)}
            />
            <label htmlFor="showRejected" className="text-sm cursor-pointer">
              Show Rejected
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="showStopped"
              checked={showStopped}
              onCheckedChange={(c) => setShowStopped(c === true)}
            />
            <label htmlFor="showStopped" className="text-sm cursor-pointer">
              Show Stopped
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="groupByStatus"
              checked={groupByStatus}
              onCheckedChange={(c) => setGroupByStatus(c === true)}
            />
            <label htmlFor="groupByStatus" className="text-sm cursor-pointer">
              Group by Status
            </label>
          </div>
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No tasks match these filters
            </div>
          ) : groupByStatus ? (
            // Grouped view
            Object.entries(groupedTasks).map(([status, statusTasks]) => {
              const isCollapsed = collapsedGroups.has(status as TaskStatus);
              return (
                <div key={status}>
                  <button
                    onClick={() => toggleGroup(status as TaskStatus)}
                    className="flex items-center gap-2 w-full text-left py-2 hover:bg-accent/50 rounded px-2 -mx-2"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                    <span className="font-medium">
                      {STATUS_LABELS[status as TaskStatus]}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {statusTasks?.length || 0}
                    </Badge>
                  </button>
                  {!isCollapsed && (
                    <div className="space-y-2 mt-2">
                      {(statusTasks || []).map((task) => (
                        <TaskListRow
                          key={task.id}
                          task={task}
                          agents={agents}
                          onTaskClick={onTaskClick}
                          onStatusChange={onStatusChange}
                          getAgentDisplay={getAgentDisplay}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            // Flat view
            <div className="space-y-2">
              {(groupedTasks.all || []).map((task) => (
                <TaskListRow
                  key={task.id}
                  task={task}
                  agents={agents}
                  onTaskClick={onTaskClick}
                  onStatusChange={onStatusChange}
                  getAgentDisplay={getAgentDisplay}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface TaskListRowProps {
  task: Task;
  agents: Agent[];
  onTaskClick: (task: Task) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  getAgentDisplay: (agentKey: string | undefined) => { emoji: string; name: string };
}

function TaskListRow({ task, agents, onTaskClick, onStatusChange, getAgentDisplay }: TaskListRowProps) {
  const agent = getAgentDisplay(task.assigneeAgentKey);

  return (
    <div
      onClick={() => onTaskClick(task)}
      className={cn(
        'flex items-center gap-3 p-3 bg-card rounded-lg border border-border cursor-pointer transition-colors hover:bg-accent/50',
        task.status === 'blocked' && 'border-red-500/40'
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm truncate">{task.title}</span>
          {task.rejectedAt && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-500/50 text-red-600">
              Rejected
            </Badge>
          )}
        </div>
        {task.status === 'blocked' && task.blockedReason && (
          <div className="text-xs text-red-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {task.blockedReason}
          </div>
        )}
      </div>

      <Badge className={cn('text-xs shrink-0', STATUS_COLORS[task.status])}>
        {STATUS_LABELS[task.status]}
      </Badge>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
        <span>{agent.emoji}</span>
        <span className="hidden sm:inline">{agent.name}</span>
      </div>

      <span className="text-xs text-muted-foreground shrink-0 hidden md:block">
        {formatDistanceToNow(new Date(task.updatedAt), { addSuffix: true })}
      </span>

      <Select
        value={task.status}
        onValueChange={(v) => onStatusChange(task.id, v as TaskStatus)}
      >
        <SelectTrigger 
          className="h-7 w-auto text-xs shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_LABELS).map(([id, label]) => (
            <SelectItem key={id} value={id}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
