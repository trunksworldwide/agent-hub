import { X, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import type { ProjectDocument } from '@/lib/api';

interface DocumentViewerProps {
  document: ProjectDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storageUrl?: string | null;
}

export function DocumentViewer({
  document,
  open,
  onOpenChange,
  storageUrl,
}: DocumentViewerProps) {
  if (!document) return null;

  const isImage = document.mimeType?.startsWith('image/');
  const isPdf = document.mimeType === 'application/pdf';
  const isText = document.sourceType === 'note' || document.mimeType?.startsWith('text/');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-4 border-b border-border">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="truncate">{document.title}</SheetTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {document.sourceType}
                </Badge>
                {document.mimeType && (
                  <span className="text-xs text-muted-foreground">
                    {document.mimeType}
                  </span>
                )}
              </div>
            </div>
            
            {storageUrl && (
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <a href={storageUrl} download={document.title} target="_blank" rel="noopener">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </a>
                </Button>
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-auto p-4">
          {/* Text/Note content */}
          {isText && document.contentText && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <pre className="whitespace-pre-wrap font-mono text-sm bg-muted/50 p-4 rounded-lg">
                {document.contentText}
              </pre>
            </div>
          )}

          {/* Image preview */}
          {isImage && storageUrl && (
            <div className="flex items-center justify-center">
              <img
                src={storageUrl}
                alt={document.title}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          )}

          {/* PDF link */}
          {isPdf && storageUrl && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground mb-4">
                PDF documents cannot be previewed inline.
              </p>
              <Button asChild>
                <a href={storageUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open PDF
                </a>
              </Button>
            </div>
          )}

          {/* Fallback for uploaded files without URL */}
          {document.sourceType === 'upload' && !storageUrl && (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <p>Unable to load file preview.</p>
              <p className="text-sm mt-1">The file may have been removed from storage.</p>
            </div>
          )}

          {/* Empty note */}
          {isText && !document.contentText && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <p>This document has no content.</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
