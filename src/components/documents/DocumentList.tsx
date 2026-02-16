import { useState } from 'react';
import { FileText, Image, File, Trash2, Eye, Pin, PinOff, Lock, Users, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { generateImageCaption, updateImageCaption, updateDocument } from '@/lib/api';
import type { ProjectDocument, Agent } from '@/lib/api';
import { ImageCaptionModal } from './ImageCaptionModal';

interface DocumentListProps {
  documents: ProjectDocument[];
  onView: (doc: ProjectDocument) => void;
  onDelete: (id: string) => void;
  isDeleting?: string | null;
  agents?: Agent[];
  onReload?: () => void;
}

function getIcon(mimeType: string | null | undefined) {
  if (!mimeType) return File;
  if (mimeType.startsWith('image/')) return Image;
  return FileText;
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const DOC_TYPE_LABELS: Record<string, string> = {
  general: 'General',
  playbook: 'Playbook',
  reference: 'Reference',
  credentials: 'Credentials',
  style_guide: 'Style Guide',
};

export function DocumentList({ documents, onView, onDelete, isDeleting, agents = [], onReload }: DocumentListProps) {
  const { toast } = useToast();
  const [generatingCaptionFor, setGeneratingCaptionFor] = useState<string | null>(null);
  const [togglingPinFor, setTogglingPinFor] = useState<string | null>(null);

  const handleTogglePin = async (doc: ProjectDocument) => {
    const newPinned = !doc.pinned;
    setTogglingPinFor(doc.id);
    try {
      await updateDocument(doc.id, { pinned: newPinned });
      toast({ title: newPinned ? 'Pinned' : 'Unpinned', description: doc.title });
      onReload?.();
    } catch (err: any) {
      toast({ title: 'Failed to update pin', description: err.message, variant: 'destructive' });
    } finally {
      setTogglingPinFor(null);
    }
  };
  const [captionModalOpen, setCaptionModalOpen] = useState(false);
  const [captionModalDocId, setCaptionModalDocId] = useState<string | null>(null);
  const [captionModalCaption, setCaptionModalCaption] = useState('');
  const [captionModalTags, setCaptionModalTags] = useState<string[]>([]);

  // Build a map of image_document_id -> companion doc for quick lookup
  const captionMap = new Map<string, ProjectDocument>();
  for (const doc of documents) {
    const notes = doc.docNotes as any;
    if (notes?.image_document_id) {
      captionMap.set(notes.image_document_id, doc);
    }
  }

  const getAgentName = (agentKey: string): string => {
    const agent = agents.find((a) => a.id === agentKey);
    return agent?.name || agentKey.split(':')[1] || 'Agent';
  };

  const getAgentEmoji = (agentKey: string): string => {
    const agent = agents.find((a) => a.id === agentKey);
    return agent?.avatar || '🤖';
  };

  const handleCaptionClick = async (doc: ProjectDocument) => {
    const companion = captionMap.get(doc.id);
    if (companion) {
      // Open edit modal pre-filled
      const notes = companion.docNotes as any;
      setCaptionModalDocId(doc.id);
      setCaptionModalCaption(notes?.caption || companion.contentText || '');
      setCaptionModalTags(notes?.tags || []);
      setCaptionModalOpen(true);
    } else {
      // Generate caption first
      setGeneratingCaptionFor(doc.id);
      toast({ title: 'Generating image caption...', description: doc.title });
      const result = await generateImageCaption(doc.id);
      setGeneratingCaptionFor(null);
      if (result.ok) {
        toast({ title: 'Caption generated', description: doc.title });
        onReload?.();
        // Open edit modal with result
        setCaptionModalDocId(doc.id);
        setCaptionModalCaption(result.caption || '');
        setCaptionModalTags(result.tags || []);
        setCaptionModalOpen(true);
      } else {
        toast({ title: 'Caption failed', description: result.error || 'Unknown error', variant: 'destructive' });
      }
    }
  };

  const handleCaptionSave = async (caption: string, tags: string[]) => {
    if (!captionModalDocId) return;
    const result = await updateImageCaption(captionModalDocId, caption, tags);
    if (!result.ok) {
      toast({ title: 'Failed to update caption', description: result.error, variant: 'destructive' });
      throw new Error(result.error);
    }
    toast({ title: 'Caption updated' });
    onReload?.();
  };

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium">No documents yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Add knowledge for your agents to reference.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3">
        {documents.map((doc) => {
          const Icon = getIcon(doc.mimeType);
          const deleting = isDeleting === doc.id;
          const isPinned = doc.pinned;
          const isCredential = doc.sensitivity === 'contains_secrets';
          const isAgentSpecific = !!doc.agentKey;
          const isImage = doc.mimeType?.startsWith('image/');
          const hasCaption = captionMap.has(doc.id);
          const isGenerating = generatingCaptionFor === doc.id;

          return (
            <Card key={doc.id} className={cn('overflow-hidden', isPinned && 'border-primary/30')}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium truncate">{doc.title}</h4>
                      
                      {/* Pinned badge */}
                      {isPinned && (
                        <Badge variant="default" className="text-xs shrink-0 gap-1">
                          <Pin className="w-3 h-3" />
                          Pinned
                        </Badge>
                      )}

                      {/* Doc type badge */}
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {DOC_TYPE_LABELS[doc.docType || 'general'] || doc.docType}
                      </Badge>

                      {/* Caption indicator */}
                      {isImage && hasCaption && (
                        <Badge variant="outline" className="text-xs shrink-0 gap-1">
                          <Sparkles className="w-3 h-3" />
                          Captioned
                        </Badge>
                      )}

                      {/* Scope indicator */}
                      {isAgentSpecific ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="text-xs shrink-0 gap-1">
                              <span>{getAgentEmoji(doc.agentKey!)}</span>
                              {getAgentName(doc.agentKey!)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Only visible to this agent
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="text-xs shrink-0 gap-1">
                              <Users className="w-3 h-3" />
                              Global
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Available to all agents
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {/* Secret indicator */}
                      {isCredential && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Lock className="w-3.5 h-3.5 text-warning" />
                          </TooltipTrigger>
                          <TooltipContent>
                            Contains secrets — only pointer shown in Context Pack
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{formatDate(doc.updatedAt)}</span>
                      {doc.sizeBytes && <span>{formatSize(doc.sizeBytes)}</span>}
                      {doc.docNotes && (
                        <span className="text-success">✓ Indexed</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {/* Pin toggle */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleTogglePin(doc)}
                          disabled={togglingPinFor === doc.id}
                        >
                          {isPinned ? (
                            <PinOff className="w-4 h-4 text-primary" />
                          ) : (
                            <Pin className="w-4 h-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isPinned ? 'Unpin from Context Pack' : 'Pin to Context Pack'}
                      </TooltipContent>
                    </Tooltip>

                    {/* Caption button for images */}
                    {isImage && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCaptionClick(doc)}
                            disabled={isGenerating}
                            title={hasCaption ? 'Edit caption' : 'Generate caption'}
                          >
                            {isGenerating ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Sparkles className="w-4 h-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {hasCaption ? 'Edit caption' : 'Generate AI caption'}
                        </TooltipContent>
                      </Tooltip>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onView(doc)}
                      title="View document"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={deleting}
                          title="Delete document"
                        >
                          <Trash2 className={cn('w-4 h-4', deleting && 'animate-pulse')} />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete document?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{doc.title}". This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(doc.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ImageCaptionModal
        open={captionModalOpen}
        onOpenChange={setCaptionModalOpen}
        caption={captionModalCaption}
        tags={captionModalTags}
        onSave={handleCaptionSave}
      />
    </>
  );
}
