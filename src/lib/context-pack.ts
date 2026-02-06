/**
 * Context Pack Builder
 * 
 * Generates a curated, minimal bundle of context for agents at runtime.
 * Includes project overview, pinned documents (notes only), and recent changes.
 */

import { supabase, hasSupabase } from './supabase';
import { format } from 'date-fns';

// ============= Types =============

export interface DocReference {
  id: string;
  title: string;
  docType: string;
  notes: string[];
  rules: string[];
  isCredential: boolean;
}

export interface ContextPack {
  builtAt: string;
  projectId: string;
  agentKey: string;
  projectOverview: string;
  globalDocs: DocReference[];
  agentDocs: DocReference[];
  recentChanges: string;
  taskContext?: string;
}

// Hard limits to keep context windows small
const MAX_PINNED_DOCS = 10;
const MAX_RECENT_ACTIVITIES = 20;
const MAX_SUMMARY_BULLETS = 10;

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
      projectOverview: '_Supabase not configured._',
      globalDocs: [],
      agentDocs: [],
      recentChanges: '_Unable to load recent changes._',
    };
  }

  try {
    // Fetch all data in parallel
    const [projectOverview, globalDocs, agentDocs, recentChanges, taskContext] = await Promise.all([
      fetchProjectOverview(projectId),
      fetchPinnedDocs(projectId, null), // global docs
      fetchPinnedDocs(projectId, agentKey), // agent-specific docs
      generateRecentChangesForPack(projectId),
      taskId ? fetchTaskContext(projectId, taskId) : Promise.resolve(undefined),
    ]);

    return {
      builtAt: new Date().toISOString(),
      projectId,
      agentKey,
      projectOverview,
      globalDocs,
      agentDocs,
      recentChanges,
      taskContext,
    };
  } catch (err) {
    console.error('buildContextPack failed:', err);
    return {
      builtAt: new Date().toISOString(),
      projectId,
      agentKey,
      projectOverview: '_Failed to load project overview._',
      globalDocs: [],
      agentDocs: [],
      recentChanges: '_Failed to load recent changes._',
    };
  }
}

// ============= Data Fetchers =============

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

  return (data || []).map((d: any) => {
    const notes = d.doc_notes as any;
    const isCredential = d.sensitivity === 'contains_secrets';

    // Extract summary and rules from doc_notes (if available)
    let summaryBullets: string[] = [];
    let rulesList: string[] = [];

    if (notes && !isCredential) {
      summaryBullets = Array.isArray(notes.summary) 
        ? notes.summary.slice(0, MAX_SUMMARY_BULLETS) 
        : [];
      rulesList = Array.isArray(notes.rules) ? notes.rules : [];
    }

    return {
      id: d.id,
      title: d.title,
      docType: d.doc_type || 'general',
      notes: summaryBullets,
      rules: rulesList,
      isCredential,
    };
  });
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

// ============= Markdown Renderer =============

/**
 * Render a ContextPack as markdown text for LLM consumption.
 */
export function renderContextPackAsMarkdown(pack: ContextPack): string {
  const lines: string[] = [];

  lines.push(`# Context Pack`);
  lines.push(`Built: ${pack.builtAt}`);
  lines.push(`Agent: ${pack.agentKey}`);
  lines.push('');

  // Project Overview
  lines.push('## Project Overview');
  lines.push(pack.projectOverview);
  lines.push('');

  // Recent Changes
  lines.push('## Recent Changes');
  lines.push(pack.recentChanges);
  lines.push('');

  // Global Documents
  if (pack.globalDocs.length > 0) {
    lines.push('## Global Knowledge');
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
