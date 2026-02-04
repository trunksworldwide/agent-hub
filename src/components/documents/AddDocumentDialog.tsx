import { useState, useRef } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface AddDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateNote: (title: string, content: string) => Promise<void>;
  onUploadFile: (file: File, title: string) => Promise<void>;
}

export function AddDocumentDialog({
  open,
  onOpenChange,
  onCreateNote,
  onUploadFile,
}: AddDocumentDialogProps) {
  const [tab, setTab] = useState<'note' | 'upload'>('note');
  const [saving, setSaving] = useState(false);

  // Note form state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');

  // Upload form state
  const [uploadTitle, setUploadTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setNoteTitle('');
    setNoteContent('');
    setUploadTitle('');
    setSelectedFile(null);
    setSaving(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSaveNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) return;
    setSaving(true);
    try {
      await onCreateNote(noteTitle.trim(), noteContent.trim());
      handleClose();
    } catch {
      setSaving(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    const title = uploadTitle.trim() || selectedFile.name;
    setSaving(true);
    try {
      await onUploadFile(selectedFile, title);
      handleClose();
    } catch {
      setSaving(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      if (!uploadTitle) setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!uploadTitle) setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add Document</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'note' | 'upload')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="note" className="gap-2">
              <FileText className="w-4 h-4" />
              Create Note
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="w-4 h-4" />
              Upload File
            </TabsTrigger>
          </TabsList>

          <TabsContent value="note" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="Document title"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Content</label>
              <Textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Write your document content here..."
                className="min-h-[200px] font-mono text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={handleSaveNote}
                disabled={saving || !noteTitle.trim() || !noteContent.trim()}
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Note
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="upload" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Document title (defaults to filename)"
              />
            </div>

            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground',
                selectedFile && 'border-success bg-success/5'
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.gif,.webp"
              />
              
              {selectedFile ? (
                <div className="space-y-2">
                  <FileText className="w-8 h-8 mx-auto text-success" />
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                  <p className="font-medium">Drop a file here or click to browse</p>
                  <p className="text-sm text-muted-foreground">
                    Supports: TXT, MD, PDF, PNG, JPG, GIF, WEBP
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={saving || !selectedFile}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Upload
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
