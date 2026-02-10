import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface UseBrainDocSubscriptionOptions {
  projectId: string;
  docType: string;
  fileKey: string;
  isDirty: boolean;
  onUpdate: (newContent: string) => void;
}

/**
 * Subscribes to Supabase Realtime changes on the `brain_docs` table.
 * When a matching row updates:
 *  - If the editor is clean (not dirty): silently refresh content
 *  - If the editor is dirty: show a toast so the user can manually reload
 */
export function useBrainDocSubscription({
  projectId,
  docType,
  fileKey,
  isDirty,
  onUpdate,
}: UseBrainDocSubscriptionOptions) {
  // Use refs so the subscription callback always sees latest values
  // without needing to re-subscribe on every render.
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!projectId || !docType || !fileKey) return;

    const channelName = `brain-doc-${fileKey}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'brain_docs',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const row = payload.new as {
            doc_type: string;
            agent_key: string | null;
            content: string;
            updated_by: string | null;
          };

          // Only react to changes for our doc_type and global (NULL agent_key) rows
          if (row.doc_type !== docType) return;
          if (row.agent_key !== null) return;

          // Ignore updates that came from the dashboard itself
          if (row.updated_by === 'dashboard') return;

          if (!isDirtyRef.current) {
            // Editor is clean — silently update
            onUpdateRef.current(row.content);
          } else {
            // Editor has unsaved changes — notify without overwriting
            toast({
              title: 'Remote update available',
              description: `${docType} was updated externally. Click Reload to see changes.`,
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, docType, fileKey]);
}
