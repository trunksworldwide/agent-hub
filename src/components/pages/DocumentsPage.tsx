import { useEffect, useState, useCallback, useRef } from 'react';
import { Plus, RefreshCw, FileStack, ChevronDown, ChevronUp, RotateCw, Search, Loader2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useClawdOffice } from '@/lib/store';
import {
  getDocuments,
  createNoteDocument,
  uploadDocument,
  deleteDocument,
  getDocumentStorageUrl,
  getAgents,
  searchKnowledge,
  ingestKnowledge,
  generateImageCaption,
  type ProjectDocument,
  type Agent,
  type CreateDocumentOptions,
  type KnowledgeSearchResult,
} from '@/lib/api';
import { generateRecentChangesSummary } from '@/lib/recent-changes';
import { DocumentList } from '@/components/documents/DocumentList';
import { AddDocumentDialog } from '@/components/documents/AddDocumentDialog';
import { DocumentViewer } from '@/components/documents/DocumentViewer';
import { ProjectOverviewCard } from '@/components/documents/ProjectOverviewCard';
import { ContextPackPreviewDialog } from '@/components/documents/ContextPackPreviewDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export function DocumentsPage() {
  const { selectedProjectId } = useClawdOffice();
  const { toast } = useToast();

  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Viewer state
  const [viewingDoc, setViewingDoc] = useState<ProjectDocument | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Recent changes state
  const [recentChanges, setRecentChanges] = useState<string>('');
  const [recentChangesOpen, setRecentChangesOpen] = useState(true);
  const [loadingChanges, setLoadingChanges] = useState(false);

  // Drive spine link (optional)
  const [driveFolderUrl, setDriveFolderUrl] = useState<string>('');
  const [copyingDriveUrl, setCopyingDriveUrl] = useState(false);

  // Knowledge search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const [docs, agentsList] = await Promise.all([
        getDocuments(),
        getAgents(),
      ]);
      setDocuments(docs);
      setAgents(agentsList);
    } catch (err: any) {
      toast({
        title: 'Failed to load documents',
        description: String(err?.message || err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadRecentChanges = async () => {
    setLoadingChanges(true);
    try {
      const summary = await generateRecentChangesSummary(selectedProjectId, 20);
      setRecentChanges(summary);
    } catch (err) {
      console.error('Failed to load recent changes:', err);
      setRecentChanges('_Failed to load recent changes._');
    } finally {
      setLoadingChanges(false);
    }
  };

  const loadDriveFolderUrl = async () => {
    try {
      const { data, error } = await supabase
        .from('project_settings')
        .select('value')
        .eq('project_id', selectedProjectId)
        .eq('key', 'drive_project_folder_url')
        .maybeSingle();
      if (error) return;
      setDriveFolderUrl(data?.value || '');
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadDocuments();
    loadRecentChanges();
    loadDriveFolderUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  const handleCreateNote = async (title: string, content: string, options?: CreateDocumentOptions) => {
    const res = await createNoteDocument(title, content, options);
    if (!res.ok) {
      toast({
        title: 'Failed to create note',
        description: res.error || 'Unknown error',
        variant: 'destructive',
      });
      throw new Error(res.error);
    }
    toast({ title: 'Note created', description: title });
    await loadDocuments();

    // Best-effort auto-ingest for knowledge search
    ingestKnowledge({ title, text: content, source_type: 'note' }).then(r => {
      if (r.ok && !r.wasDuplicate) {
        toast({ title: 'Indexing for search...', description: title });
      }
    }).catch(() => { /* silent */ });
  };

  const handleUploadFile = async (file: File, title: string, options?: CreateDocumentOptions) => {
    const res = await uploadDocument(file, title, options);
    if (!res.ok) {
      toast({
        title: 'Failed to upload file',
        description: res.error || 'Unknown error',
        variant: 'destructive',
      });
      throw new Error(res.error);
    }
    toast({ title: 'File uploaded', description: title });
    await loadDocuments();

    // Auto-generate caption for image uploads
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);
    if (isImage && res.id) {
      toast({ title: 'Generating image caption...', description: title });
      generateImageCaption(res.id).then(captionRes => {
        if (captionRes.ok) {
          toast({ title: 'Caption generated', description: title });
          loadDocuments();
        } else {
          toast({ title: 'Caption generation failed', description: captionRes.error || 'Try again via the ✨ button', variant: 'destructive' });
        }
      }).catch(() => { /* silent */ });
    }

    // Best-effort auto-ingest for non-image files
    const textTypes = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
    if (textTypes.some(t => file.type.startsWith(t) || file.name.endsWith('.md') || file.name.endsWith('.txt') || file.name.endsWith('.csv'))) {
      try {
        const text = await file.text();
        ingestKnowledge({ title, text, source_type: 'file' }).catch(() => {});
      } catch { /* silent */ }
    } else if (!isImage) {
      // Create placeholder for unsupported types
      ingestKnowledge({ title, source_type: 'file' }).catch(() => {});
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await deleteDocument(id);
      if (!res.ok) {
        toast({
          title: 'Failed to delete document',
          description: res.error || 'Unknown error',
          variant: 'destructive',
        });
        return;
      }
      toast({ title: 'Document deleted' });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const handleView = (doc: ProjectDocument) => {
    setViewingDoc(doc);
    setViewerOpen(true);
  };

  return (
    <div className="flex-1 p-6 overflow-auto scrollbar-thin">
      <div className="max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileStack className="w-6 h-6 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-semibold">Knowledge</h1>
              <p className="text-muted-foreground text-sm">
                Context and documents for your agents.
              </p>
              {driveFolderUrl ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">Drive folder: {driveFolderUrl}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    disabled={copyingDriveUrl}
                    onClick={async () => {
                      try {
                        setCopyingDriveUrl(true);
                        await navigator.clipboard.writeText(driveFolderUrl);
                        toast({ title: 'Copied Drive folder link' });
                      } catch {
                        toast({ title: 'Failed to copy', variant: 'destructive' });
                      } finally {
                        setCopyingDriveUrl(false);
                      }
                    }}
                    title="Copy Drive folder link"
                  >
                    Copy
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              title="Preview Context Pack"
            >
              <Eye className="w-4 h-4 mr-1" />
              Preview
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadDocuments}
              disabled={loading}
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </Button>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Document
            </Button>
          </div>
        </div>

        {/* Knowledge Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search across project knowledge..."
              value={searchQuery}
              onChange={(e) => {
                const q = e.target.value;
                setSearchQuery(q);
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                if (!q.trim()) { setSearchResults([]); setSearching(false); return; }
                setSearching(true);
                searchTimerRef.current = setTimeout(async () => {
                  try {
                    const results = await searchKnowledge(q, 5);
                    setSearchResults(results);
                  } catch { setSearchResults([]); }
                  finally { setSearching(false); }
                }, 500);
              }}
              className="pl-9 pr-9"
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
          </div>
          {searchQuery.trim() && !searching && searchResults.length === 0 && (
            <p className="text-xs text-muted-foreground mt-2">No results found. Knowledge is indexed when documents are added.</p>
          )}
          {searchResults.length > 0 && (
            <div className="mt-2 space-y-2">
              {searchResults.map((r, i) => (
                <Card key={`${r.sourceId}-${i}`} className="p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{r.title}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{r.sourceType}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{r.chunkText}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Project Overview */}
        <div className="mb-6">
          <ProjectOverviewCard />
        </div>

        {/* Recent Changes - Collapsible */}
        <Card className="mb-6">
          <Collapsible open={recentChangesOpen} onOpenChange={setRecentChangesOpen}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  🕐 Recent Changes
                  <span className="text-xs font-normal text-muted-foreground">
                    (auto-generated)
                  </span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadRecentChanges}
                    disabled={loadingChanges}
                    title="Regenerate"
                  >
                    <RotateCw className={cn('w-4 h-4', loadingChanges && 'animate-spin')} />
                  </Button>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">
                      {recentChangesOpen ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                </div>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="p-3 rounded-lg bg-muted/50 font-mono text-xs whitespace-pre-wrap max-h-60 overflow-auto">
                  {recentChanges || 'Loading...'}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  💡 This summary is included in every agent's Context Pack.
                </p>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Document List */}
        <DocumentList
          documents={documents}
          onView={handleView}
          onDelete={handleDelete}
          isDeleting={deletingId}
          agents={agents}
          onReload={loadDocuments}
        />
      </div>

      {/* Add Document Dialog */}
      <AddDocumentDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreateNote={handleCreateNote}
        onUploadFile={handleUploadFile}
        agents={agents}
      />

      {/* Document Viewer */}
      <DocumentViewer
        document={viewingDoc}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        storageUrl={getDocumentStorageUrl(viewingDoc?.storagePath)}
      />

      {/* Context Pack Preview */}
      <ContextPackPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        agents={agents}
      />
    </div>
  );
}
