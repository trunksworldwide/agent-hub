// Schedule utilities for human-friendly schedule editing

export type FrequencyType = 
  | 'every-5' 
  | 'every-15' 
  | 'every-30' 
  | 'hourly' 
  | 'daily' 
  | 'weekdays' 
  | 'weekly' 
  | 'custom';

export interface ScheduleConfig {
  frequency: FrequencyType;
  time?: string; // HH:mm for daily/weekly
  days?: string[]; // ['mon', 'tue', ...] for weekly
  cronExpr?: string; // for custom
  tz?: string;
}

export interface SchedulePreset {
  id: FrequencyType;
  label: string;
  kind: 'cron' | 'every';
  expr?: string;
  requiresTime?: boolean;
  requiresDays?: boolean;
  isCustom?: boolean;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  { id: 'every-5', label: 'Every 5 minutes', kind: 'every', expr: '300000' },
  { id: 'every-15', label: 'Every 15 minutes', kind: 'every', expr: '900000' },
  { id: 'every-30', label: 'Every 30 minutes', kind: 'every', expr: '1800000' },
  { id: 'hourly', label: 'Hourly', kind: 'cron', expr: '0 * * * *' },
  { id: 'daily', label: 'Daily at...', kind: 'cron', requiresTime: true },
  { id: 'weekdays', label: 'Weekdays at...', kind: 'cron', requiresTime: true },
  { id: 'weekly', label: 'Weekly on...', kind: 'cron', requiresTime: true, requiresDays: true },
  { id: 'custom', label: 'Custom cron expression', kind: 'cron', isCustom: true },
];

export const DAY_OPTIONS = [
  { id: 'mon', label: 'Mon', cronValue: '1' },
  { id: 'tue', label: 'Tue', cronValue: '2' },
  { id: 'wed', label: 'Wed', cronValue: '3' },
  { id: 'thu', label: 'Thu', cronValue: '4' },
  { id: 'fri', label: 'Fri', cronValue: '5' },
  { id: 'sat', label: 'Sat', cronValue: '6' },
  { id: 'sun', label: 'Sun', cronValue: '0' },
];

export const COMMON_TIMEZONES = [
  { id: 'America/New_York', label: 'Eastern Time (ET)' },
  { id: 'America/Chicago', label: 'Central Time (CT)' },
  { id: 'America/Denver', label: 'Mountain Time (MT)' },
  { id: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { id: 'UTC', label: 'UTC' },
  { id: 'Europe/London', label: 'London (GMT/BST)' },
  { id: 'Europe/Paris', label: 'Paris (CET)' },
  { id: 'Asia/Tokyo', label: 'Tokyo (JST)' },
];

// ============= Job Intent & Context Policy Constants =============

export const JOB_INTENTS = [
  { id: 'daily_brief', label: 'Daily Brief', description: 'Morning/evening summaries' },
  { id: 'task_suggestions', label: 'Task Suggestions', description: 'Propose tasks or priorities' },
  { id: 'monitoring', label: 'Monitoring', description: 'Health checks and alerts' },
  { id: 'housekeeping', label: 'Housekeeping', description: 'Cleanup and maintenance' },
  { id: 'sync', label: 'Sync', description: 'Data synchronization' },
  { id: 'custom', label: 'Custom', description: 'User-defined' },
] as const;

export type JobIntent = typeof JOB_INTENTS[number]['id'];

export const CONTEXT_POLICIES = [
  { id: 'minimal', label: 'Minimal', description: 'Overview + recent changes only' },
  { id: 'default', label: 'Default', description: 'Full context pack' },
  { id: 'expanded', label: 'Expanded', description: 'Include unpinned relevant docs' },
] as const;

export type ContextPolicy = typeof CONTEXT_POLICIES[number]['id'];

/**
 * Parse schedule expression into human-friendly config
 */
export function parseScheduleToConfig(
  kind: string | null | undefined, 
  expr: string | null | undefined, 
  tz?: string | null
): ScheduleConfig {
  if (!expr) {
    return { frequency: 'daily', time: '09:00', tz: tz || 'America/New_York' };
  }

  // Handle "every" type (milliseconds)
  if (kind === 'every' || (!kind && /^\d+$/.test(expr))) {
    const ms = parseInt(expr, 10);
    if (ms === 300000) return { frequency: 'every-5', tz: tz || undefined };
    if (ms === 900000) return { frequency: 'every-15', tz: tz || undefined };
    if (ms === 1800000) return { frequency: 'every-30', tz: tz || undefined };
    // Default to every-15 for unknown intervals
    return { frequency: 'every-15', tz: tz || undefined };
  }

  // Handle cron expressions
  if (kind === 'cron' || expr.includes(' ')) {
    const parts = expr.split(' ');
    if (parts.length === 5) {
      const [min, hour, dom, mon, dow] = parts;
      
      // Hourly
      if (hour === '*' && dom === '*' && mon === '*' && dow === '*') {
        return { frequency: 'hourly', tz: tz || undefined };
      }
      
      // Daily at specific time
      if (dom === '*' && mon === '*' && dow === '*' && hour !== '*' && min !== '*') {
        const hourNum = parseInt(hour, 10);
        const minNum = parseInt(min, 10);
        const time = `${String(hourNum).padStart(2, '0')}:${String(minNum).padStart(2, '0')}`;
        return { frequency: 'daily', time, tz: tz || undefined };
      }
      
      // Weekdays at specific time
      if (dom === '*' && mon === '*' && dow === '1-5' && hour !== '*' && min !== '*') {
        const hourNum = parseInt(hour, 10);
        const minNum = parseInt(min, 10);
        const time = `${String(hourNum).padStart(2, '0')}:${String(minNum).padStart(2, '0')}`;
        return { frequency: 'weekdays', time, tz: tz || undefined };
      }
      
      // Weekly on specific days
      if (dom === '*' && mon === '*' && dow !== '*' && hour !== '*' && min !== '*') {
        const hourNum = parseInt(hour, 10);
        const minNum = parseInt(min, 10);
        const time = `${String(hourNum).padStart(2, '0')}:${String(minNum).padStart(2, '0')}`;
        
        // Parse days
        const dayNums = dow.split(',');
        const days = dayNums.map(d => {
          const dayOpt = DAY_OPTIONS.find(opt => opt.cronValue === d);
          return dayOpt?.id || 'mon';
        });
        
        return { frequency: 'weekly', time, days, tz: tz || undefined };
      }
    }
    
    // Unknown cron - treat as custom
    return { frequency: 'custom', cronExpr: expr, tz: tz || undefined };
  }

  return { frequency: 'daily', time: '09:00', tz: tz || undefined };
}

/**
 * Convert human-friendly config back to schedule expression
 */
export function configToScheduleExpression(config: ScheduleConfig): { 
  kind: 'cron' | 'every'; 
  expr: string;
  tz?: string;
} {
  const preset = SCHEDULE_PRESETS.find(p => p.id === config.frequency);
  
  // Fixed interval presets
  if (preset?.expr && !preset.requiresTime) {
    return { kind: preset.kind, expr: preset.expr, tz: config.tz };
  }
  
  // Custom cron
  if (config.frequency === 'custom') {
    return { kind: 'cron', expr: config.cronExpr || '0 9 * * *', tz: config.tz };
  }
  
  // Time-based schedules
  const [hourStr, minStr] = (config.time || '09:00').split(':');
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  
  switch (config.frequency) {
    case 'daily':
      return { kind: 'cron', expr: `${min} ${hour} * * *`, tz: config.tz };
      
    case 'weekdays':
      return { kind: 'cron', expr: `${min} ${hour} * * 1-5`, tz: config.tz };
      
    case 'weekly': {
      const days = config.days || ['mon'];
      const cronDays = days
        .map(d => DAY_OPTIONS.find(opt => opt.id === d)?.cronValue)
        .filter(Boolean)
        .join(',') || '1';
      return { kind: 'cron', expr: `${min} ${hour} * * ${cronDays}`, tz: config.tz };
    }
    
    case 'hourly':
      return { kind: 'cron', expr: '0 * * * *', tz: config.tz };
      
    default:
      // Fallback to daily at 9am
      return { kind: 'cron', expr: `${min} ${hour} * * *`, tz: config.tz };
  }
}

/**
 * Encode target agent into instructions
 */
export function encodeTargetAgent(agentKey: string | null, instructions: string): string {
  if (!agentKey) return instructions;
  return `@target:${agentKey}\n${instructions}`;
}

/**
 * Decode target agent from instructions
 */
export function decodeTargetAgent(instructions: string | null | undefined): { 
  targetAgent: string | null; 
  body: string;
} {
  if (!instructions) return { targetAgent: null, body: '' };
  
  const match = instructions.match(/^@target:([^\n]+)\n([\s\S]*)$/);
  if (match) {
    return { targetAgent: match[1], body: match[2] };
  }
  return { targetAgent: null, body: instructions };
}

/**
 * Format schedule for display
 */
export function formatScheduleDisplay(
  kind: string | null | undefined, 
  expr: string | null | undefined, 
  tz?: string | null,
  compact = true
): string {
  if (!expr) return '—';
  
  const tzLabel = compact ? abbreviateTz(tz) : tz;
  
  // Handle "every" type (milliseconds)
  if (kind === 'every' || (!kind && /^\d+$/.test(expr))) {
    const ms = parseInt(expr, 10);
    if (!isNaN(ms)) {
      if (ms < 60000) return `Every ${Math.round(ms / 1000)}s`;
      if (ms < 3600000) {
        const mins = Math.round(ms / 60000);
        return `Every ${mins} minute${mins > 1 ? 's' : ''}`;
      }
      const hours = Math.round(ms / 3600000);
      return `Every ${hours} hour${hours > 1 ? 's' : ''}`;
    }
  }
  
  // Handle cron expressions
  if (kind === 'cron' || (!kind && expr.includes(' '))) {
    const parts = expr.split(' ');
    if (parts.length === 5) {
      const [min, hour, dom, mon, dow] = parts;
      
      // Daily at specific time
      if (dom === '*' && mon === '*' && dow === '*' && hour !== '*' && min !== '*') {
        const hourNum = parseInt(hour, 10);
        const minNum = parseInt(min, 10);
        const ampm = hourNum >= 12 ? 'PM' : 'AM';
        const hour12 = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
        const timeStr = `${hour12}:${String(minNum).padStart(2, '0')} ${ampm}`;
        return `Daily at ${timeStr}${tzLabel ? ` ${tzLabel}` : ''}`;
      }
      
      // Weekdays
      if (dom === '*' && mon === '*' && dow === '1-5' && hour !== '*' && min !== '*') {
        const hourNum = parseInt(hour, 10);
        const minNum = parseInt(min, 10);
        const ampm = hourNum >= 12 ? 'PM' : 'AM';
        const hour12 = hourNum === 0 ? 12 : hourNum > 12 ? hourNum - 12 : hourNum;
        const timeStr = `${hour12}:${String(minNum).padStart(2, '0')} ${ampm}`;
        return `Weekdays at ${timeStr}${tzLabel ? ` ${tzLabel}` : ''}`;
      }
      
      // Every N minutes
      if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
        const interval = parseInt(min.slice(2), 10);
        return `Every ${interval} minute${interval > 1 ? 's' : ''}`;
      }
      
      // Hourly
      if (min !== '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
        return `Hourly at :${min.padStart(2, '0')}`;
      }
    }
    
    // Fallback: show cron expression
    return `Cron: ${expr}${tzLabel ? ` (${tzLabel})` : ''}`;
  }
  
  return expr;
}

/** Abbreviate common timezone names for compact display */
function abbreviateTz(tz: string | null | undefined): string {
  if (!tz) return '';
  const abbrevMap: Record<string, string> = {
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Denver': 'MT',
    'America/Los_Angeles': 'PT',
    'America/Phoenix': 'AZ',
    'Europe/London': 'GMT',
    'Europe/Paris': 'CET',
    'Asia/Tokyo': 'JST',
    'UTC': 'UTC',
  };
  return abbrevMap[tz] || tz;
}
