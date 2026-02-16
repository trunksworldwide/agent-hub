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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface ImageCaptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caption: string;
  tags: string[];
  onSave: (caption: string, tags: string[]) => Promise<void>;
}

export function ImageCaptionModal({ open, onOpenChange, caption, tags, onSave }: ImageCaptionModalProps) {
  const [captionText, setCaptionText] = useState(caption);
  const [tagsText, setTagsText] = useState(tags.join(', '));
  const [saving, setSaving] = useState(false);

  // Sync when modal opens with new data
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setCaptionText(caption);
      setTagsText(tags.join(', '));
    }
    onOpenChange(v);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const parsedTags = tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await onSave(captionText, parsedTags);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Image Caption</DialogTitle>
          <DialogDescription>
            Update the AI-generated caption and tags for this image.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="caption">Caption</Label>
            <Textarea
              id="caption"
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
              rows={6}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="e.g. diagram, architecture, screenshot"
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !captionText.trim()}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
