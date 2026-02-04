import { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { createTask, type Agent } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: Agent[];
  defaultAssignee?: string;
  onCreated?: () => void;
}

export function NewTaskDialog({ 
  open, 
  onOpenChange, 
  agents, 
  defaultAssignee,
  onCreated 
}: NewTaskDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);

  // Set default assignee when dialog opens
  useEffect(() => {
    if (open && defaultAssignee) {
      setAssignee(defaultAssignee);
    }
  }, [open, defaultAssignee]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setAssignee('');
    }
  }, [open]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    
    setIsCreating(true);
    try {
      await createTask({ 
        title: title.trim(), 
        description: description.trim() || undefined,
        assigneeAgentKey: assignee || undefined,
      });
      
      toast({
        title: 'Task created',
        description: title.trim(),
      });
      
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      console.error('Failed to create task:', e);
      toast({
        title: 'Failed to create task',
        description: String(e),
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              disabled={isCreating}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description (optional)</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Task description..."
              rows={3}
              disabled={isCreating}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Assignee</label>
            <Select
              value={assignee || '__unassigned__'}
              onValueChange={(v) => setAssignee(v === '__unassigned__' ? '' : v)}
              disabled={isCreating}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned__">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span>Unassigned</span>
                  </div>
                </SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <div className="flex items-center gap-2">
                      <span>{a.avatar}</span>
                      <span>{a.name}</span>
                      {a.role && <span className="text-muted-foreground">· {a.role}</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Assign this task to a project agent
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!title.trim() || isCreating}>
            {isCreating ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
