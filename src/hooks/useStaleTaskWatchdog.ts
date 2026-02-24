import { useEffect, useRef, useCallback } from 'react';
import { supabase, hasSupabase } from '@/lib/supabase';
import { createTaskEvent, sendChatMessage, type Task } from '@/lib/api';
import { getSelectedProjectId } from '@/lib/project';

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Watches in_progress tasks for agent inactivity (30 min).
 * Posts a system comment + War Room notification when stale.
 */
export function useStaleTaskWatchdog(tasks: Task[]) {
  const flaggedRef = useRef<Set<string>>(new Set());

  const checkStaleTasks = useCallback(async () => {
    if (!hasSupabase() || !supabase) return;

    const projectId = getSelectedProjectId();
    const inProgressTasks = tasks.filter((t) => t.status === 'in_progress');
    if (inProgressTasks.length === 0) return;

    const now = Date.now();
    const cutoff = new Date(now - STALE_THRESHOLD_MS).toISOString();

    for (const task of inProgressTasks) {
      // Skip if already flagged
      if (flaggedRef.current.has(task.id)) continue;

      try {
        // Check for recent agent activity (events authored by non-system, non-ui)
        const { data: events } = await supabase
          .from('task_events')
          .select('id, author, created_at')
          .eq('task_id', task.id)
          .eq('project_id', projectId)
          .gte('created_at', cutoff)
          .order('created_at', { ascending: false })
          .limit(5);

        const hasAgentActivity = (events || []).some(
          (e) => e.author !== 'system' && e.author !== 'ui' && e.author !== 'dashboard'
        );

        if (!hasAgentActivity) {
          // Flag it
          flaggedRef.current.add(task.id);

          // Post system comment on task timeline
          createTaskEvent({
            taskId: task.id,
            eventType: 'comment',
            content: '⚠️ STATUS: NEEDS ATTENTION — no activity in 30m. Either reassign or clarify.',
            author: 'system',
          }).catch(console.error);

          // Notify War Room
          sendChatMessage({
            message: `⚠️ Stale task: "${task.title}" (assigned to ${task.assigneeAgentKey || 'unassigned'}) — no activity in 30m. Reassign or clarify.`,
          }).catch(console.error);
        }
      } catch (err) {
        console.error(`Watchdog check failed for task ${task.id}:`, err);
      }
    }

    // Reset flags for tasks that are no longer in_progress
    const inProgressIds = new Set(inProgressTasks.map((t) => t.id));
    for (const id of flaggedRef.current) {
      if (!inProgressIds.has(id)) {
        flaggedRef.current.delete(id);
      }
    }
  }, [tasks]);

  useEffect(() => {
    // Run once on mount / task change
    checkStaleTasks();

    const interval = setInterval(checkStaleTasks, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkStaleTasks]);
}
