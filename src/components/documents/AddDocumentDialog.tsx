import { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Loader2, Pin, Lock, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { DocumentType, DocumentSensitivity, CreateDocumentOptions, Agent } from '@/lib/api';

interface AddDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateNote: (title: string, content: string, options?: CreateDocumentOptions) => Promise<void>;
  onUploadFile: (file: File, title: string, options?: CreateDocumentOptions) => Promise<void>;
  agents?: Agent[];
}

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'playbook', label: 'Playbook' },
  { value: 'reference', label: 'Reference' },
  { value: 'credentials', label: 'Credentials' },
  { value: 'style_guide', label: 'Style Guide' },
];

export function AddDocumentDialog({
  open,
  onOpenChange,
  onCreateNote,
  onUploadFile,
  agents = [],
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

  // Context flow options (shared)
  const [scope, setScope] = useState<'global' | string>('global');
  const [pinned, setPinned] = useState(false);
  const [docType, setDocType] = useState<DocumentType>('general');
  const [sensitivity, setSensitivity] = useState<DocumentSensitivity>('normal');

  // Auto-set sensitivity when docType is credentials
  useEffect(() => {
    if (docType === 'credentials') {
      setSensitivity('contains_secrets');
    }
  }, [docType]);

  const resetForm = () => {
    setNoteTitle('');
    setNoteContent('');
    setUploadTitle('');
    setSelectedFile(null);
    setSaving(false);
    setScope('global');
    setPinned(false);
    setDocType('general');
    setSensitivity('normal');
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const buildOptions = (): CreateDocumentOptions => ({
    agentKey: scope === 'global' ? null : scope,
    pinned,
    docType,
    sensitivity,
  });

  const handleSaveNote = async () => {
    if (!noteTitle.trim() || !noteContent.trim()) return;
    setSaving(true);
    try {
      await onCreateNote(noteTitle.trim(), noteContent.trim(), buildOptions());
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
      await onUploadFile(selectedFile, title, buildOptions());
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

  const ContextFlowOptions = () => (
    <div className="space-y-4 border-t pt-4 mt-4">
      <div className="text-sm font-medium text-muted-foreground">Context Settings</div>
      
      {/* Scope */}
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          Scope
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>Global documents are available to all agents. Agent-specific documents are only visible to that agent.</p>
            </TooltipContent>
          </Tooltip>
        </label>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="global">🌐 All Agents (Global)</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.avatar || '🤖'} {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Document Type */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Document Type</label>
        <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOC_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Pinned & Sensitivity */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={pinned}
            onCheckedChange={setPinned}
            id="pinned"
          />
          <label htmlFor="pinned" className="text-sm flex items-center gap-1.5 cursor-pointer">
            <Pin className="w-3.5 h-3.5" />
            Pin to Context Pack
          </label>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>Pinned documents are automatically included in every agent's Context Pack.</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {docType !== 'credentials' && (
          <div className="flex items-center gap-2">
            <Switch
              checked={sensitivity === 'contains_secrets'}
              onCheckedChange={(checked) => setSensitivity(checked ? 'contains_secrets' : 'normal')}
              id="sensitivity"
            />
            <label htmlFor="sensitivity" className="text-sm flex items-center gap-1.5 cursor-pointer">
              <Lock className="w-3.5 h-3.5" />
              Contains Secrets
            </label>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
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
                className="min-h-[150px] font-mono text-sm"
              />
            </div>
            
            <ContextFlowOptions />

            <div className="flex justify-end gap-2 pt-2">
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
                'border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer',
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
                <div className="space-y-1">
                  <FileText className="w-6 h-6 mx-auto text-success" />
                  <p className="font-medium text-sm">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-6 h-6 mx-auto text-muted-foreground" />
                  <p className="font-medium text-sm">Drop a file or click to browse</p>
                  <p className="text-xs text-muted-foreground">
                    TXT, MD, PDF, PNG, JPG, GIF, WEBP
                  </p>
                </div>
              )}
            </div>

            <ContextFlowOptions />

            <div className="flex justify-end gap-2 pt-2">
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
