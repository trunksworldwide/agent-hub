/**
 * Context Pack Builder
 * 
 * Generates a curated, minimal bundle of context for agents at runtime.
 * Includes project overview, pinned documents (notes only), and recent changes.
 */

import { supabase, hasSupabase } from './supabase';
import { format } from 'date-fns';
import { getSelectedProjectId } from './project';

// ============= Types =============

export interface DocReference {
  id: string;
  title: string;
  docType: string;
  notes: string[];
  rules: string[];
  isCredential: boolean;
}

export interface KnowledgeExcerpt {
  title: string;
  sourceUrl: string | null;
  chunkText: string;
}

export interface ContextPack {
  builtAt: string;
  projectId: string;
  agentKey: string;
  mission: string;
  projectOverview: string;
  globalDocs: DocReference[];
  agentDocs: DocReference[];
  recentChanges: string;
  taskContext?: string;
  relevantKnowledge?: KnowledgeExcerpt[];
}

// Hard limits to keep context windows small
const MAX_PINNED_DOCS = 5;
const MAX_PINNED_CHARS = 8000;
const MAX_RECENT_ACTIVITIES = 20;
const MAX_SUMMARY_BULLETS = 10;
const MAX_KNOWLEDGE_RESULTS = 5;
const MAX_KNOWLEDGE_CHARS = 6000;

// ============= Core Builder =============

/**
 * Build a Context Pack for an agent, optionally with task-specific context.
 */
export async function buildContextPack(
  projectId: string,
  agentKey: string,
  taskId?: string
): Promise<ContextPack> {
  if (!hasSupabase() || !supabase) {
    return {
      builtAt: new Date().toISOString(),
      projectId,
      agentKey,
      mission: '',
      projectOverview: '_Supabase not configured._',
      globalDocs: [],
      agentDocs: [],
      recentChanges: '_Unable to load recent changes._',
    };
  }

  try {
    // Fetch all data in parallel
    const [mission, projectOverview, globalDocs, agentDocs, recentChanges, taskContext] = await Promise.all([
      fetchMission(projectId),
      fetchProjectOverview(projectId),
      fetchPinnedDocs(projectId, null), // global docs
      fetchPinnedDocs(projectId, agentKey), // agent-specific docs
      generateRecentChangesForPack(projectId),
      taskId ? fetchTaskContext(projectId, taskId) : Promise.resolve(undefined),
    ]);

    // Per-task knowledge retrieval
    let relevantKnowledge: KnowledgeExcerpt[] | undefined;
    if (taskContext && taskId) {
      relevantKnowledge = await fetchRelevantKnowledge(projectId, taskContext);
    }

    return {
      builtAt: new Date().toISOString(),
      projectId,
      agentKey,
      mission,
      projectOverview,
      globalDocs,
      agentDocs,
      recentChanges,
      taskContext,
      relevantKnowledge,
    };
  } catch (err) {
    console.error('buildContextPack failed:', err);
    return {
      builtAt: new Date().toISOString(),
      projectId,
      agentKey,
      mission: '',
      projectOverview: '_Failed to load project overview._',
      globalDocs: [],
      agentDocs: [],
      recentChanges: '_Failed to load recent changes._',
      relevantKnowledge: undefined,
    };
  }
}

// ============= Data Fetchers =============

/**
 * Fetch mission statement from brain_docs (doc_type = 'mission').
 */
async function fetchMission(projectId: string): Promise<string> {
  if (!supabase) return '';

  const { data, error } = await supabase
    .from('brain_docs')
    .select('content')
    .eq('project_id', projectId)
    .eq('doc_type', 'mission')
    .is('agent_key', null)
    .maybeSingle();

  if (error) {
    console.error('fetchMission error:', error);
    return '';
  }

  return data?.content?.trim() || '';
}

/**
 * Fetch project overview from brain_docs (doc_type = 'project_overview').
 */
async function fetchProjectOverview(projectId: string): Promise<string> {
  if (!supabase) return '_No project overview set._';

  const { data, error } = await supabase
    .from('brain_docs')
    .select('content')
    .eq('project_id', projectId)
    .eq('doc_type', 'project_overview')
    .is('agent_key', null)
    .maybeSingle();

  if (error) {
    console.error('fetchProjectOverview error:', error);
    return '_Failed to load project overview._';
  }

  return data?.content?.trim() || '_No project overview set. Add one in the Knowledge section._';
}

/**
 * Fetch pinned documents for the context pack.
 * If agentKey is null, fetches global docs. Otherwise fetches agent-specific.
 */
async function fetchPinnedDocs(
  projectId: string,
  agentKey: string | null
): Promise<DocReference[]> {
  if (!supabase) return [];

  let query = supabase
    .from('project_documents')
    .select('id, title, doc_type, sensitivity, doc_notes')
    .eq('project_id', projectId)
    .eq('pinned', true)
    .order('updated_at', { ascending: false })
    .limit(MAX_PINNED_DOCS);

  if (agentKey === null) {
    query = query.is('agent_key', null);
  } else {
    query = query.eq('agent_key', agentKey);
  }

  const { data, error } = await query;

  if (error) {
    console.error('fetchPinnedDocs error:', error);
    return [];
  }

  const results: DocReference[] = [];
  let totalChars = 0;
  let dropped = 0;

  for (const d of (data || [])) {
    const notes = d.doc_notes as any;
    const isCredential = d.sensitivity === 'contains_secrets';

    let summaryBullets: string[] = [];
    let rulesList: string[] = [];

    if (notes && !isCredential) {
      summaryBullets = Array.isArray(notes.summary) 
        ? notes.summary.slice(0, MAX_SUMMARY_BULLETS) 
        : [];
      rulesList = Array.isArray(notes.rules) ? notes.rules : [];
    }

    const docChars = summaryBullets.join('').length + rulesList.join('').length;
    if (totalChars + docChars > MAX_PINNED_CHARS && results.length > 0) {
      dropped++;
      continue;
    }
    totalChars += docChars;

    results.push({
      id: d.id,
      title: d.title,
      docType: d.doc_type || 'general',
      notes: summaryBullets,
      rules: rulesList,
      isCredential,
    });
  }

  if (dropped > 0) {
    console.warn(`fetchPinnedDocs: dropped ${dropped} docs exceeding ${MAX_PINNED_CHARS} char cap`);
  }

  return results;
}

/**
 * Generate a compact recent changes summary for the context pack.
 */
async function generateRecentChangesForPack(projectId: string): Promise<string> {
  if (!supabase) return '_Unable to load recent changes._';

  const { data, error } = await supabase
    .from('activities')
    .select('type, message, actor_agent_key, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(MAX_RECENT_ACTIVITIES);

  if (error) {
    console.error('generateRecentChangesForPack error:', error);
    return '_Failed to load recent changes._';
  }

  if (!data || data.length === 0) {
    return '_No recent activity._';
  }

  const lines = data.map((item: any) => {
    const time = format(new Date(item.created_at), 'HH:mm');
    const actor = item.actor_agent_key || 'system';
    return `- [${time}] ${item.message} _(${actor})_`;
  });

  return lines.join('\n');
}

/**
 * Fetch task-specific context (description + recent comments).
 */
async function fetchTaskContext(projectId: string, taskId: string): Promise<string | undefined> {
  if (!supabase) return undefined;

  const [taskRes, commentsRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('title, description, status')
      .eq('id', taskId)
      .eq('project_id', projectId)
      .maybeSingle(),
    supabase
      .from('task_comments')
      .select('content, author_agent_key, created_at')
      .eq('task_id', taskId)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  if (taskRes.error || !taskRes.data) return undefined;

  const task = taskRes.data;
  const comments = commentsRes.data || [];

  let context = `## Current Task: ${task.title}\n`;
  context += `Status: ${task.status}\n`;
  
  if (task.description) {
    context += `\n${task.description}\n`;
  }

  if (comments.length > 0) {
    context += '\n### Recent Discussion\n';
    for (const c of comments) {
      const author = c.author_agent_key || 'user';
      context += `- **${author}**: ${c.content}\n`;
    }
  }

  return context;
}

/**
 * Fetch relevant knowledge excerpts for a task via the knowledge-worker edge function.
 */
async function fetchRelevantKnowledge(projectId: string, taskContext: string): Promise<KnowledgeExcerpt[]> {
  try {
    if (!supabase) return [];

    const query = taskContext.slice(0, 300).replace(/[#*_\n]+/g, ' ').trim();
    if (!query) return [];

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return [];

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) return [];

    const res = await fetch(`${supabaseUrl}/functions/v1/knowledge-worker`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'search',
        projectId,
        query,
        limit: MAX_KNOWLEDGE_RESULTS,
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const raw = (data.results || []).map((r: any) => ({
      title: r.title as string,
      sourceUrl: r.sourceUrl as string | null,
      chunkText: r.chunkText as string,
    }));

    // Enforce char cap
    const capped: KnowledgeExcerpt[] = [];
    let totalChars = 0;
    for (const item of raw) {
      let text = item.chunkText;
      const remaining = MAX_KNOWLEDGE_CHARS - totalChars;
      if (remaining <= 0) break;
      if (text.length > remaining) {
        text = text.slice(0, remaining) + '\n_(truncated)_';
      }
      totalChars += text.length;
      capped.push({ ...item, chunkText: text });
    }
    return capped;
  } catch (err) {
    console.error('fetchRelevantKnowledge error:', err);
    return [];
  }
}


/**
 * Render a ContextPack as markdown text for LLM consumption.
 */
export function renderContextPackAsMarkdown(pack: ContextPack): string {
  const lines: string[] = [];

  lines.push(`# Context Pack`);
  lines.push(`Built: ${pack.builtAt}`);
  lines.push(`Agent: ${pack.agentKey}`);
  lines.push('');

  // Mission
  if (pack.mission && !pack.mission.startsWith('_')) {
    lines.push('## Mission');
    lines.push(pack.mission);
    lines.push('');
  }

  // Project Overview
  lines.push('## Project Overview');
  lines.push(pack.projectOverview);
  lines.push('');

  // Recent Changes
  lines.push('## Recent Changes');
  lines.push(pack.recentChanges);
  lines.push('');

  // Global Documents (Pinned Knowledge)
  if (pack.globalDocs.length > 0) {
    lines.push('## Pinned Knowledge (Global)');
    for (const doc of pack.globalDocs) {
      lines.push(`### ${doc.title} (${doc.docType})`);
      if (doc.isCredential) {
        lines.push('_Contains credentials — see document for details_');
      } else {
        if (doc.notes.length > 0) {
          for (const note of doc.notes) {
            lines.push(`- ${note}`);
          }
        }
        if (doc.rules.length > 0) {
          lines.push('**Rules:**');
          for (const rule of doc.rules) {
            lines.push(`- ${rule}`);
          }
        }
        if (doc.notes.length === 0 && doc.rules.length === 0) {
          lines.push('_No extracted notes yet._');
        }
      }
      lines.push('');
    }
  }

  // Agent-Specific Documents
  if (pack.agentDocs.length > 0) {
    lines.push('## Your Knowledge');
    for (const doc of pack.agentDocs) {
      lines.push(`### ${doc.title} (${doc.docType})`);
      if (doc.isCredential) {
        lines.push('_Contains credentials — see document for details_');
      } else {
        if (doc.notes.length > 0) {
          for (const note of doc.notes) {
            lines.push(`- ${note}`);
          }
        }
        if (doc.rules.length > 0) {
          lines.push('**Rules:**');
          for (const rule of doc.rules) {
            lines.push(`- ${rule}`);
          }
        }
        if (doc.notes.length === 0 && doc.rules.length === 0) {
          lines.push('_No extracted notes yet._');
        }
      }
      lines.push('');
    }
  }

  // Task Context
  if (pack.taskContext) {
    lines.push(pack.taskContext);
    lines.push('');
  }

  // Relevant Knowledge (per-task retrieved)
  if (pack.relevantKnowledge && pack.relevantKnowledge.length > 0) {
    lines.push('## Relevant Knowledge');
    lines.push('_Auto-retrieved from project knowledge base. Use this context and cite sources._');
    lines.push('');
    for (const k of pack.relevantKnowledge) {
      lines.push(`### ${k.title}`);
      if (k.sourceUrl) {
        lines.push(`Source: ${k.sourceUrl}`);
      }
      lines.push(k.chunkText);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ============= Default Templates =============

export const DEFAULT_SOUL_TEMPLATE = `# SOUL.md - {{AGENT_NAME}}

> {{AGENT_PURPOSE}}

## Core Behavior

### Context Awareness
Before acting on any task, you receive a **Context Pack** containing:
- Project overview and goals
- Relevant documents assigned to you
- Recent changes in the project
- Task-specific context

Read and apply this context. Do not assume information not provided.

### Communication
- Be direct and clear
- Match the project's communication style
- Ask clarifying questions when context is insufficient

## Your Role
{{AGENT_ROLE_DETAILS}}

## Tools Available
{{TOOLS_LIST}}
`;

/**
 * Generate SOUL content from template.
 */
export function generateSoulFromTemplate(
  template: string,
  variables: {
    agentName: string;
    agentPurpose: string;
    roleDetails?: string;
    toolsList?: string;
  }
): string {
  return template
    .replace(/\{\{AGENT_NAME\}\}/g, variables.agentName)
    .replace(/\{\{AGENT_PURPOSE\}\}/g, variables.agentPurpose)
    .replace(/\{\{AGENT_ROLE_DETAILS\}\}/g, variables.roleDetails || variables.agentPurpose)
    .replace(/\{\{TOOLS_LIST\}\}/g, variables.toolsList || 'Default tools enabled');
}
