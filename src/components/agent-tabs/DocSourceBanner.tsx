import { Globe, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClawdOffice } from '@/lib/store';
import { createDocOverride, type AgentFile } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

interface Props {
  source: 'global' | 'agent' | 'unknown';
  docType: AgentFile['type'];
  onOverrideCreated?: () => void;
}

export function DocSourceBanner({ source, docType, onOverrideCreated }: Props) {
  const { selectedAgentId } = useClawdOffice();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);

  // Don't show for primary agent or unknown source
  if (!selectedAgentId || selectedAgentId === 'agent:main:main' || source === 'unknown') {
    return null;
  }

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createDocOverride(selectedAgentId, docType);
      if (!result.ok) throw new Error(result.error);
      toast({ title: 'Override created', description: 'Agent-specific docs created. Reload to see them.' });
      onOverrideCreated?.();
    } catch (e: any) {
      toast({ title: 'Error', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-xs border-b border-border bg-muted/30">
      {source === 'global' ? (
        <>
          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Viewing inherited global docs (shared with all agents)</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs ml-auto"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Generating with AI...' : 'Create agent override'}
          </Button>
        </>
      ) : (
        <>
          <User className="w-3.5 h-3.5 text-primary" />
          <span className="text-primary">Agent-specific docs</span>
        </>
      )}
    </div>
  );
}
