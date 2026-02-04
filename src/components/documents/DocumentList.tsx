import { FileText, Image, File, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import type { ProjectDocument } from '@/lib/api';

interface DocumentListProps {
  documents: ProjectDocument[];
  onView: (doc: ProjectDocument) => void;
  onDelete: (id: string) => void;
  isDeleting?: string | null;
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

export function DocumentList({ documents, onView, onDelete, isDeleting }: DocumentListProps) {
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
    <div className="grid gap-3">
      {documents.map((doc) => {
        const Icon = getIcon(doc.mimeType);
        const deleting = isDeleting === doc.id;

        return (
          <Card key={doc.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Icon className="w-5 h-5 text-muted-foreground" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium truncate">{doc.title}</h4>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {doc.sourceType}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{formatDate(doc.updatedAt)}</span>
                    {doc.sizeBytes && <span>{formatSize(doc.sizeBytes)}</span>}
                    {doc.mimeType && <span className="truncate">{doc.mimeType}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
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
  );
}
