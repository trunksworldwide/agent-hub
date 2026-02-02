import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && anon ? createClient(url, anon) : null;

export function hasSupabase() {
  return Boolean(supabase);
}

export type RealtimeUnsubscribe = () => void;

/**
 * Best-effort realtime subscription for a project.
 *
 * When Supabase isn't configured, this returns a no-op unsubscribe.
 */
export function subscribeToProjectRealtime(projectId: string, onChange: () => void): RealtimeUnsubscribe {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`clawdos:project:${projectId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'activities', filter: `project_id=eq.${projectId}` },
      () => onChange()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'agent_status', filter: `project_id=eq.${projectId}` },
      () => onChange()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // ignore
    }
  };
}
