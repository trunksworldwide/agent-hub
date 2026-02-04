// Activity summary template mapper for human-friendly messages

const TEMPLATES: Record<string, (msg: string, type: string) => string> = {
  task_created: (msg) => `Created a new task: "${msg}"`,
  
  task_moved: (msg) => {
    const match = msg.match(/Moved\s+"?(.+?)"?\s*→\s*(.+)/);
    if (match) return `Moved task "${match[1]}" to ${match[2]}`;
    const simpleMatch = msg.match(/Moved (.+) → (.+)/);
    if (simpleMatch) return `Moved task to ${simpleMatch[2]}`;
    return msg;
  },
  
  task_assigned: (msg) => {
    const match = msg.match(/Assigned (.+) to (.+)/);
    if (match) return `Assigned task to ${match[2]}`;
    return msg;
  },
  
  agent_created: (msg) => {
    const match = msg.match(/Created agent (.+)/);
    if (match) return `Added team member: ${match[1]}`;
    return msg;
  },
  
  agent_updated: (msg) => {
    const match = msg.match(/Updated agent (.+)/);
    if (match) return `Updated ${match[1]}'s profile`;
    return msg;
  },
  
  brain_doc_updated: (msg) => {
    const match = msg.match(/Updated (.+)/);
    if (match) return `Updated ${match[1]} documentation`;
    return msg;
  },
  
  cron_run_requested: (msg) => {
    const match = msg.match(/Requested cron run:\s*(.+)/);
    if (match) return `Scheduled "${match[1]}" to run`;
    return msg;
  },
  
  cron_job_toggled: (msg) => {
    const match = msg.match(/Toggled (.+) (enabled|disabled)/);
    if (match) return `${match[2] === 'enabled' ? 'Enabled' : 'Disabled'} scheduled job "${match[1]}"`;
    return msg;
  },
  
  project_created: (msg) => {
    const match = msg.match(/Created project (.+)/);
    if (match) return `Created new project: ${match[1]}`;
    return msg;
  },
  
  document_uploaded: (msg) => `Uploaded document: ${msg}`,
  
  document_created: (msg) => `Created document: ${msg}`,
};

/**
 * Generate a human-friendly summary from activity type and raw message.
 * Falls back to original message if no template matches.
 */
export function generateActivitySummary(type: string, message: string): string {
  const template = TEMPLATES[type];
  if (template) {
    try {
      return template(message, type);
    } catch {
      return message;
    }
  }
  return message;
}

/**
 * Get a simple category label for an activity type.
 */
export function getActivityCategory(type: string): string {
  const categories: Record<string, string> = {
    task_created: 'Tasks',
    task_moved: 'Tasks',
    task_assigned: 'Tasks',
    agent_created: 'Team',
    agent_updated: 'Team',
    brain_doc_updated: 'Knowledge',
    cron_run_requested: 'Schedule',
    cron_job_toggled: 'Schedule',
    project_created: 'Projects',
    document_uploaded: 'Knowledge',
    document_created: 'Knowledge',
  };
  return categories[type] || 'Activity';
}
