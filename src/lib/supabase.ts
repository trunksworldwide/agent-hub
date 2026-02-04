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

export interface RealtimeChange {
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  new?: any;
  old?: any;
}

/**
 * Best-effort realtime subscription for a project.
 *
 * Note: `onChange` is called for *every* matching postgres change event.
 * Consumers can either do a full refresh, or apply small incremental patches.
 */
export function subscribeToProjectRealtime(projectId: string, onChange: (change?: RealtimeChange) => void): RealtimeUnsubscribe {
  const channel = supabase
    .channel(`clawdos:project:${projectId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'activities', filter: `project_id=eq.${projectId}` },
      (payload) =>
        onChange({
          table: 'activities',
          event: (payload as any).eventType,
          new: (payload as any).new,
          old: (payload as any).old,
        })
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'agent_status', filter: `project_id=eq.${projectId}` },
      (payload) =>
        onChange({
          table: 'agent_status',
          event: (payload as any).eventType,
          new: (payload as any).new,
          old: (payload as any).old,
        })
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'agents', filter: `project_id=eq.${projectId}` },
      (payload) =>
        onChange({
          table: 'agents',
          event: (payload as any).eventType,
          new: (payload as any).new,
          old: (payload as any).old,
        })
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `project_id=eq.${projectId}` },
      (payload) =>
        onChange({
          table: 'tasks',
          event: (payload as any).eventType,
          new: (payload as any).new,
          old: (payload as any).old,
        })
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'brain_docs', filter: `project_id=eq.${projectId}` },
      (payload) =>
        onChange({
          table: 'brain_docs',
          event: (payload as any).eventType,
          new: (payload as any).new,
          old: (payload as any).old,
        })
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cron_mirror', filter: `project_id=eq.${projectId}` },
      (payload) =>
        onChange({
          table: 'cron_mirror',
          event: (payload as any).eventType,
          new: (payload as any).new,
          old: (payload as any).old,
        })
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cron_run_requests', filter: `project_id=eq.${projectId}` },
      (payload) =>
        onChange({
          table: 'cron_run_requests',
          event: (payload as any).eventType,
          new: (payload as any).new,
          old: (payload as any).old,
        })
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
