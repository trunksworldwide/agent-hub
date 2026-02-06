import { useEffect, useState } from 'react';
import { Plus, RefreshCw, FileStack, ChevronDown, ChevronUp, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useClawdOffice } from '@/lib/store';
import {
  getDocuments,
  createNoteDocument,
  uploadDocument,
  deleteDocument,
  getDocumentStorageUrl,
  getAgents,
  type ProjectDocument,
  type Agent,
  type CreateDocumentOptions,
} from '@/lib/api';
import { generateRecentChangesSummary } from '@/lib/recent-changes';
import { DocumentList } from '@/components/documents/DocumentList';
import { AddDocumentDialog } from '@/components/documents/AddDocumentDialog';
import { DocumentViewer } from '@/components/documents/DocumentViewer';
import { ProjectOverviewCard } from '@/components/documents/ProjectOverviewCard';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export function DocumentsPage() {
  const { selectedProjectId } = useClawdOffice();
  const { toast } = useToast();

  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Viewer state
  const [viewingDoc, setViewingDoc] = useState<ProjectDocument | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  // Recent changes state
  const [recentChanges, setRecentChanges] = useState<string>('');
  const [recentChangesOpen, setRecentChangesOpen] = useState(true);
  const [loadingChanges, setLoadingChanges] = useState(false);

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

  useEffect(() => {
    loadDocuments();
    loadRecentChanges();
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
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileStack className="w-6 h-6 text-muted-foreground" />
            <div>
              <h1 className="text-2xl font-semibold">Knowledge</h1>
              <p className="text-muted-foreground text-sm">
                Context and documents for your agents.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
    </div>
  );
}
