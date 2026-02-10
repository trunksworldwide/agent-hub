import { useEffect, useRef } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface UseBrainDocSubscriptionOptions {
  projectId: string;
  docType: string;
  /**
   * Agent key to match (for agent-specific rows). If omitted/null, only global rows (agent_key IS NULL) match.
   */
  agentKey?: string | null;
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
  agentKey = null,
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

  const agentKeyRef = useRef(agentKey);
  agentKeyRef.current = agentKey;

  useEffect(() => {
    if (!projectId || !docType || !fileKey) return;

    const channelName = `brain-doc-${fileKey}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'brain_docs',
          filter: `project_id=eq.${projectId}`,
        },
        (payload: RealtimePostgresChangesPayload<{
          doc_type: string;
          agent_key: string | null;
          content: string;
          updated_by: string | null;
        }>) => {
          const row = payload.new;

          // DELETE events may not have `new`
          if (!row) return;

          // Only react to changes for our doc_type
          if (row.doc_type !== docType) return;

          // Match exactly one row source:
          // - If agentKey is set: only the agent-specific row (agent_key = agentKey).
          // - If agentKey is null/omitted: only the global row (agent_key IS NULL).
          // This prevents global fallback updates from clobbering an agent-specific override editor.
          const ak = agentKeyRef.current;
          const matches = ak ? row.agent_key === ak : row.agent_key === null;
          if (!matches) return;

          // NOTE: we intentionally do NOT ignore `updated_by==='dashboard'` here.
          // Multiple dashboard clients should still sync with each other via realtime.
          // (If you want to suppress self-echo, do it with a per-client id, not a shared string.)

          if (!isDirtyRef.current) {
            // Editor is clean — silently update
            onUpdateRef.current(row.content ?? '');
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
