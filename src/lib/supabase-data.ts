import { supabase } from '@/integrations/supabase/client';

// ===========================================
// Types
// ===========================================

export interface SupabaseTask {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: 'inbox' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked';
  assignee_agent_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseProject {
  id: string;
  name: string;
  workspace_path: string | null;
  created_at: string;
}

export interface SupabaseAgent {
  id: string;
  project_id: string;
  agent_key: string;
  name: string;
  role: string | null;
  emoji: string | null;
  color: string | null;
  created_at: string;
}

export interface SupabaseAgentStatus {
  id: string;
  project_id: string;
  agent_key: string;
  state: 'idle' | 'working' | 'blocked' | 'sleeping';
  current_task_id: string | null;
  last_heartbeat_at: string | null;
  last_activity_at: string;
  note: string | null;
}

export interface SupabaseActivity {
  id: string;
  project_id: string;
  type: string;
  message: string;
  actor_agent_key: string | null;
  task_id: string | null;
  created_at: string;
}

// ===========================================
// Helpers
// ===========================================

export function getProjectId(): string {
  return localStorage.getItem('clawdos.project') || 'front-office';
}

// ===========================================
// Projects
// ===========================================

export async function getSupabaseProjects(): Promise<SupabaseProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching projects:', error);
    return [];
  }

  return data || [];
}

// ===========================================
// Tasks
// ===========================================

export async function getSupabaseTasks(): Promise<SupabaseTask[]> {
  const projectId = getProjectId();
  
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching tasks:', error);
    return [];
  }

  return (data || []) as SupabaseTask[];
}

export async function createSupabaseTask(input: {
  title: string;
  description?: string;
  status?: SupabaseTask['status'];
  assignee_agent_key?: string;
}): Promise<SupabaseTask | null> {
  const projectId = getProjectId();

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id: projectId,
      title: input.title,
      description: input.description || null,
      status: input.status || 'inbox',
      assignee_agent_key: input.assignee_agent_key || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating task:', error);
    return null;
  }

  // Log activity
  await logActivity({
    type: 'task_created',
    message: `Task created: ${input.title}`,
    task_id: data.id,
  });

  return data as SupabaseTask;
}

export async function updateSupabaseTask(
  id: string,
  patch: Partial<Pick<SupabaseTask, 'title' | 'description' | 'status' | 'assignee_agent_key'>>
): Promise<boolean> {
  const projectId = getProjectId();

  const { error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .eq('project_id', projectId);

  if (error) {
    console.error('Error updating task:', error);
    return false;
  }

  // Log activity
  const changes = Object.entries(patch)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
  
  await logActivity({
    type: 'task_updated',
    message: `Task updated: ${changes}`,
    task_id: id,
  });

  return true;
}

export async function deleteSupabaseTask(id: string): Promise<boolean> {
  const projectId = getProjectId();

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)
    .eq('project_id', projectId);

  if (error) {
    console.error('Error deleting task:', error);
    return false;
  }

  return true;
}

// ===========================================
// Agents
// ===========================================

export async function getSupabaseAgents(): Promise<SupabaseAgent[]> {
  const projectId = getProjectId();

  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('project_id', projectId)
    .order('name');

  if (error) {
    console.error('Error fetching agents:', error);
    return [];
  }

  return data || [];
}

// ===========================================
// Agent Status
// ===========================================

export async function getAgentStatuses(): Promise<SupabaseAgentStatus[]> {
  const projectId = getProjectId();

  const { data, error } = await supabase
    .from('agent_status')
    .select('*')
    .eq('project_id', projectId);

  if (error) {
    console.error('Error fetching agent statuses:', error);
    return [];
  }

  return (data || []) as SupabaseAgentStatus[];
}

// ===========================================
// Activities
// ===========================================

export async function getActivities(limit = 50): Promise<SupabaseActivity[]> {
  const projectId = getProjectId();

  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching activities:', error);
    return [];
  }

  return data || [];
}

export async function logActivity(input: {
  type: string;
  message: string;
  actor_agent_key?: string;
  task_id?: string;
}): Promise<void> {
  const projectId = getProjectId();

  const { error } = await supabase
    .from('activities')
    .insert({
      project_id: projectId,
      type: input.type,
      message: input.message,
      actor_agent_key: input.actor_agent_key || null,
      task_id: input.task_id || null,
    });

  if (error) {
    console.error('Error logging activity:', error);
  }
}
