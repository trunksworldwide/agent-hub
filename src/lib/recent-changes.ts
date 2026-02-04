import { supabase, hasSupabase } from './supabase';
import { format } from 'date-fns';

export interface RecentChange {
  id: string;
  type: string;
  message: string;
  actor: string;
  createdAt: string;
}

/**
 * Generate a markdown summary of recent project activity.
 */
export async function generateRecentChangesSummary(
  projectId: string,
  limit: number = 20
): Promise<string> {
  if (!hasSupabase() || !supabase) {
    return '# Recent Changes\n\n_Supabase not configured. Unable to generate activity summary._';
  }

  try {
    const { data, error } = await supabase
      .from('activities')
      .select('id, type, message, actor_agent_key, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    if (!data || data.length === 0) {
      return '# Recent Changes\n\n_No recent activity recorded._';
    }

    const lines: string[] = ['# Recent Changes', ''];

    // Group by date
    const byDate = new Map<string, typeof data>();
    for (const item of data) {
      const dateKey = format(new Date(item.created_at), 'yyyy-MM-dd');
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, []);
      }
      byDate.get(dateKey)!.push(item);
    }

    for (const [dateKey, items] of byDate) {
      const dateLabel = format(new Date(dateKey), 'EEEE, MMMM d, yyyy');
      lines.push(`## ${dateLabel}`, '');
      
      for (const item of items) {
        const time = format(new Date(item.created_at), 'HH:mm');
        const actor = item.actor_agent_key || 'system';
        lines.push(`- **[${time}]** ${item.message} _(${actor})_`);
      }
      
      lines.push('');
    }

    return lines.join('\n');
  } catch (err) {
    console.error('Failed to generate recent changes:', err);
    return '# Recent Changes\n\n_Failed to load activity. Please try again._';
  }
}

/**
 * Get a context pack for agents: recent documents + changes summary.
 */
export async function getProjectContextPack(
  projectId: string
): Promise<{ documents: string[]; recentChanges: string }> {
  if (!hasSupabase() || !supabase) {
    return {
      documents: [],
      recentChanges: '_Supabase not configured._',
    };
  }

  try {
    const [docsRes, changes] = await Promise.all([
      supabase
        .from('project_documents')
        .select('title, source_type, updated_at')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false })
        .limit(10),
      generateRecentChangesSummary(projectId, 20),
    ]);

    const documents = (docsRes.data || []).map((d: any) => {
      const updated = format(new Date(d.updated_at), 'MMM d');
      return `- ${d.title} (${d.source_type}, updated ${updated})`;
    });

    return { documents, recentChanges: changes };
  } catch (err) {
    console.error('getProjectContextPack failed:', err);
    return {
      documents: [],
      recentChanges: '_Failed to load context._',
    };
  }
}
