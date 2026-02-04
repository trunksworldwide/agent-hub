import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle } from 'lucide-react';

interface BlockedReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, postToThread: boolean) => void;
  taskTitle: string;
}

export function BlockedReasonModal({
  open,
  onOpenChange,
  onConfirm,
  taskTitle,
}: BlockedReasonModalProps) {
  const [reason, setReason] = useState('');
  const [postToThread, setPostToThread] = useState(true);

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm(reason.trim(), postToThread);
    setReason('');
    setPostToThread(true);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setReason('');
      setPostToThread(true);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Why is this blocked?
          </DialogTitle>
          <DialogDescription>
            Explain what's blocking "{taskTitle}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What's blocking this? What do you need?"
            className="min-h-[100px]"
            autoFocus
          />

          <div className="flex items-center gap-2">
            <Checkbox
              id="postToThread"
              checked={postToThread}
              onCheckedChange={(checked) => setPostToThread(checked === true)}
            />
            <label
              htmlFor="postToThread"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Post to thread too
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!reason.trim()}>
            Block Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
