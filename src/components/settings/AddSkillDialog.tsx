import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { installSkill } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface AddSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: () => void;
}

export function AddSkillDialog({ open, onOpenChange, onInstalled }: AddSkillDialogProps) {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const trimmed = identifier.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      const result = await installSkill(trimmed);
      if (result.ok) {
        toast({ description: `Skill "${trimmed}" install requested successfully.` });
        setIdentifier('');
        onOpenChange(false);
        onInstalled();
      } else {
        toast({ variant: 'destructive', description: result.error || 'Install failed' });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', description: err.message || 'Install failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Skill</DialogTitle>
          <DialogDescription>
            Paste a skill name, ClawdHub slug, or git URL to install.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="e.g. apple-notes, @org/my-skill, https://github.com/..."
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleSubmit()}
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            If the Control API is connected, the skill will install immediately.
            Otherwise, it will be queued for the executor to pick up.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!identifier.trim() || loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Install
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
