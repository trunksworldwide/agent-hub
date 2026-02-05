import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, FileText, Link as LinkIcon, MessageSquare, Sparkles, Trash2, ExternalLink } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type TaskOutput, deleteTaskOutput, getDocumentStorageUrl } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const OUTPUT_ICONS: Record<string, React.ReactNode> = {
  summary: <FileText className="w-4 h-4" />,
  file: <FileText className="w-4 h-4" />,
  link: <LinkIcon className="w-4 h-4" />,
  message: <MessageSquare className="w-4 h-4" />,
  log_summary: <Sparkles className="w-4 h-4" />,
};

const OUTPUT_LABELS: Record<string, string> = {
  summary: 'Summary',
  file: 'File',
  link: 'Link',
  message: 'Message',
  log_summary: 'Activity Log',
};

interface TaskOutputSectionProps {
  outputs: TaskOutput[];
  onAddOutput?: () => void;
  onOutputDeleted?: () => void;
  isLoading?: boolean;
  readOnly?: boolean;
}

export function TaskOutputSection({ outputs, onAddOutput, onOutputDeleted, isLoading, readOnly }: TaskOutputSectionProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (output: TaskOutput) => {
    if (readOnly || !onOutputDeleted) return;
    setDeletingId(output.id);
    try {
      const result = await deleteTaskOutput(output.id);
      if (result.ok) {
        toast({ title: 'Output deleted' });
        onOutputDeleted();
      } else {
        throw new Error(result.error || 'Failed to delete');
      }
    } catch (e) {
      console.error('Failed to delete output:', e);
      toast({ title: 'Failed to delete output', description: String(e), variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenFile = (output: TaskOutput) => {
    if (output.storagePath) {
      const url = getDocumentStorageUrl(output.storagePath);
      if (url) window.open(url, '_blank');
    }
  };

  const handleOpenLink = (output: TaskOutput) => {
    if (output.linkUrl) {
      window.open(output.linkUrl, '_blank');
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-sm font-medium hover:text-foreground/80 transition-colors">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Outputs
            {outputs.length > 0 && (
              <span className="text-xs text-muted-foreground">({outputs.length})</span>
            )}
          </button>
        </CollapsibleTrigger>
        {!readOnly && onAddOutput && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddOutput}
            className="h-7 px-2 text-xs"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add
          </Button>
        )}
      </div>

      <CollapsibleContent>
        <div className="mt-3 space-y-2">
          {isLoading ? (
            <div className="text-center py-4 text-xs text-muted-foreground">
              Loading outputs...
            </div>
          ) : outputs.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground border border-dashed rounded-lg">
              No outputs yet — add a summary, file, or link
            </div>
          ) : (
            outputs.map((output) => (
              <div
                key={output.id}
                className={cn(
                  'bg-muted/50 rounded-lg p-3 group',
                  deletingId === output.id && 'opacity-50'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {OUTPUT_ICONS[output.outputType] || <FileText className="w-4 h-4" />}
                    </span>
                    <span className="font-medium">
                      {output.title || OUTPUT_LABELS[output.outputType] || output.outputType}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {output.outputType === 'file' && output.storagePath && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleOpenFile(output)}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    )}
                    {output.outputType === 'link' && output.linkUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleOpenLink(output)}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    )}
                    {!readOnly && onOutputDeleted && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(output)}
                        disabled={deletingId === output.id}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Content based on type */}
                {(output.outputType === 'summary' || output.outputType === 'message' || output.outputType === 'log_summary') && output.contentText && (
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                    {output.contentText}
                  </p>
                )}

                {output.outputType === 'link' && output.linkUrl && (
                  <a
                    href={output.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline mt-2 block truncate"
                  >
                    {output.linkUrl}
                  </a>
                )}

                {output.outputType === 'file' && output.storagePath && (
                  <button
                    onClick={() => handleOpenFile(output)}
                    className="text-sm text-primary hover:underline mt-2 block text-left"
                  >
                    View file
                  </button>
                )}

                <div className="text-xs text-muted-foreground mt-2">
                  {output.createdBy && <span>{output.createdBy} · </span>}
                  {formatDistanceToNow(new Date(output.createdAt), { addSuffix: true })}
                </div>
              </div>
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
