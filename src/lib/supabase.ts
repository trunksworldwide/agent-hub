import { supabase } from '@/integrations/supabase/client';

export { supabase };

/**
 * We consider Supabase "enabled" whenever the app was built with the Supabase
 * client available.
 *
 * Note: the generated client uses a publishable (anon) key + Supabase Auth.
 * RLS policies typically require an authenticated session for writes.
 */
export function hasSupabase() {
  return Boolean(supabase);
}

export type RealtimeUnsubscribe = () => void;

/**
 * Best-effort realtime subscription for a project.
 */
export function subscribeToProjectRealtime(projectId: string, onChange: () => void): RealtimeUnsubscribe {
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
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'brain_docs', filter: `project_id=eq.${projectId}` },
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
