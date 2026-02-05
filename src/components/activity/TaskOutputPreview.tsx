import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskOutputSection } from '@/components/tasks/TaskOutputSection';
import { getTaskById, getTaskOutputs, type Task, type TaskOutput } from '@/lib/api';

const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  inbox: { label: 'Inbox', variant: 'outline' },
  assigned: { label: 'Assigned', variant: 'secondary' },
  in_progress: { label: 'In Progress', variant: 'default' },
  review: { label: 'Review', variant: 'secondary' },
  done: { label: 'Done', variant: 'default' },
  blocked: { label: 'Blocked', variant: 'destructive' },
};

interface TaskOutputPreviewProps {
  taskId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewFullTask: () => void;
}

export function TaskOutputPreview({ taskId, open, onOpenChange, onViewFullTask }: TaskOutputPreviewProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [outputs, setOutputs] = useState<TaskOutput[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!open || !taskId) return;

    setIsLoading(true);
    Promise.all([getTaskById(taskId), getTaskOutputs(taskId)])
      .then(([taskData, outputsData]) => {
        setTask(taskData);
        setOutputs(outputsData);
      })
      .catch((err) => {
        console.error('Failed to load task preview:', err);
        setTask(null);
        setOutputs([]);
      })
      .finally(() => setIsLoading(false));
  }, [open, taskId]);

  const statusInfo = task ? STATUS_LABELS[task.status] || { label: task.status, variant: 'outline' as const } : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader className="pb-4 border-b border-border">
          {isLoading ? (
            <>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/4 mt-2" />
            </>
          ) : task ? (
            <div className="flex items-start justify-between gap-2">
              <SheetTitle className="text-left">{task.title}</SheetTitle>
              <Badge variant={statusInfo?.variant}>{statusInfo?.label}</Badge>
            </div>
          ) : (
            <SheetTitle className="text-muted-foreground">Task not found</SheetTitle>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : task ? (
            <TaskOutputSection
              outputs={outputs}
              isLoading={false}
              readOnly
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              This task may have been deleted or is no longer accessible.
            </p>
          )}
        </div>

        {task && (
          <div className="pt-4 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onViewFullTask}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View Full Task
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
