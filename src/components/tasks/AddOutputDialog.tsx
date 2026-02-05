import { useState, useRef } from 'react';
import { FileText, Link as LinkIcon, MessageSquare, Sparkles, Upload, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { createTaskOutput, uploadTaskOutput, generateTaskLogSummary, type TaskOutputType } from '@/lib/api';

interface AddOutputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  taskTitle: string;
  onOutputAdded: () => void;
}

export function AddOutputDialog({ open, onOpenChange, taskId, taskTitle, onOutputAdded }: AddOutputDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [activeTab, setActiveTab] = useState<'summary' | 'link' | 'file' | 'auto'>('summary');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [summaryTitle, setSummaryTitle] = useState('');
  const [summaryContent, setSummaryContent] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [fileTitle, setFileTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const resetForm = () => {
    setSummaryTitle('');
    setSummaryContent('');
    setLinkTitle('');
    setLinkUrl('');
    setFileTitle('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSubmitSummary = async () => {
    if (!summaryContent.trim()) {
      toast({ title: 'Please enter a summary', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createTaskOutput({
        taskId,
        outputType: 'summary',
        title: summaryTitle.trim() || 'Summary',
        contentText: summaryContent.trim(),
      });

      if (result.ok) {
        toast({ title: 'Summary added' });
        onOutputAdded();
        handleClose();
      } else {
        throw new Error(result.error || 'Failed to add summary');
      }
    } catch (e) {
      console.error('Failed to add summary:', e);
      toast({ title: 'Failed to add summary', description: String(e), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitLink = async () => {
    if (!linkUrl.trim()) {
      toast({ title: 'Please enter a URL', variant: 'destructive' });
      return;
    }

    // Basic URL validation
    try {
      new URL(linkUrl.trim());
    } catch {
      toast({ title: 'Please enter a valid URL', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createTaskOutput({
        taskId,
        outputType: 'link',
        title: linkTitle.trim() || 'Link',
        linkUrl: linkUrl.trim(),
      });

      if (result.ok) {
        toast({ title: 'Link added' });
        onOutputAdded();
        handleClose();
      } else {
        throw new Error(result.error || 'Failed to add link');
      }
    } catch (e) {
      console.error('Failed to add link:', e);
      toast({ title: 'Failed to add link', description: String(e), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitFile = async () => {
    if (!selectedFile) {
      toast({ title: 'Please select a file', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await uploadTaskOutput(
        taskId,
        selectedFile,
        fileTitle.trim() || selectedFile.name
      );

      if (result.ok) {
        toast({ title: 'File uploaded' });
        onOutputAdded();
        handleClose();
      } else {
        throw new Error(result.error || 'Failed to upload file');
      }
    } catch (e) {
      console.error('Failed to upload file:', e);
      toast({ title: 'Failed to upload file', description: String(e), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAutoSummarize = async () => {
    setIsSubmitting(true);
    try {
      const result = await generateTaskLogSummary(taskId);

      if (result.ok && result.summary) {
        toast({ title: 'Activity log summarized' });
        onOutputAdded();
        handleClose();
      } else if (result.ok && !result.summary) {
        toast({ title: 'No activities to summarize', description: 'This task has no related activity logs.' });
      } else {
        throw new Error(result.error || 'Failed to generate summary');
      }
    } catch (e) {
      console.error('Failed to auto-summarize:', e);
      toast({ title: 'Failed to generate summary', description: String(e), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!fileTitle.trim()) {
        setFileTitle(file.name);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Output</DialogTitle>
          <DialogDescription className="truncate">
            Record an outcome for "{taskTitle}"
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="summary" className="text-xs">
              <FileText className="w-3 h-3 mr-1" />
              Summary
            </TabsTrigger>
            <TabsTrigger value="link" className="text-xs">
              <LinkIcon className="w-3 h-3 mr-1" />
              Link
            </TabsTrigger>
            <TabsTrigger value="file" className="text-xs">
              <Upload className="w-3 h-3 mr-1" />
              File
            </TabsTrigger>
            <TabsTrigger value="auto" className="text-xs">
              <Sparkles className="w-3 h-3 mr-1" />
              Auto
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="summary-title">Title (optional)</Label>
              <Input
                id="summary-title"
                value={summaryTitle}
                onChange={(e) => setSummaryTitle(e.target.value)}
                placeholder="Summary"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="summary-content">What was done?</Label>
              <Textarea
                id="summary-content"
                value={summaryContent}
                onChange={(e) => setSummaryContent(e.target.value)}
                placeholder="Describe the outcome..."
                className="min-h-[100px]"
                disabled={isSubmitting}
              />
            </div>
            <Button
              onClick={handleSubmitSummary}
              disabled={isSubmitting || !summaryContent.trim()}
              className="w-full"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Add Summary
            </Button>
          </TabsContent>

          <TabsContent value="link" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="link-title">Title (optional)</Label>
              <Input
                id="link-title"
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="e.g., Pull Request"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                type="url"
                disabled={isSubmitting}
              />
            </div>
            <Button
              onClick={handleSubmitLink}
              disabled={isSubmitting || !linkUrl.trim()}
              className="w-full"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Add Link
            </Button>
          </TabsContent>

          <TabsContent value="file" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="file-title">Title (optional)</Label>
              <Input
                id="file-title"
                value={fileTitle}
                onChange={(e) => setFileTitle(e.target.value)}
                placeholder="File name"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label>File</Label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="block w-full text-sm text-muted-foreground
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-medium
                  file:bg-primary file:text-primary-foreground
                  hover:file:bg-primary/90
                  cursor-pointer"
                disabled={isSubmitting}
              />
              {selectedFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                </p>
              )}
            </div>
            <Button
              onClick={handleSubmitFile}
              disabled={isSubmitting || !selectedFile}
              className="w-full"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Upload File
            </Button>
          </TabsContent>

          <TabsContent value="auto" className="space-y-4 mt-4">
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
              <p className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4" />
                <span className="font-medium text-foreground">Auto-summarize</span>
              </p>
              <p>
                Generate a summary from this task's activity logs. Works best for tasks with recorded actions (cron runs, status changes, etc.).
              </p>
            </div>
            <Button
              onClick={handleAutoSummarize}
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Generate Summary
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
