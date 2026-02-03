import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load local env for CLI usage (best-effort; does not throw).
// Prefer .env.local (secrets) then .env (defaults).
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' ? v.trim() : '';
}

const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL');
const key =
  env('SUPABASE_SERVICE_ROLE_KEY') ||
  env('SUPABASE_SERVICE_KEY') ||
  env('SUPABASE_ANON_KEY') ||
  env('VITE_SUPABASE_ANON_KEY');

const projectId = env('PROJECT_ID') || env('VITE_PROJECT_ID') || 'front-office';
const type = env('ACTIVITY_TYPE') || 'build_update';
const message = env('ACTIVITY_MESSAGE');
const actor = env('ACTIVITY_ACTOR') || null;

if (!url || !key || !message) {
  // Best-effort helper: if not configured, fail soft (so CI/builds don't break).
  const missing = [
    !url ? 'SUPABASE_URL' : null,
    !key ? 'SUPABASE_SERVICE_ROLE_KEY (or anon key)' : null,
    !message ? 'ACTIVITY_MESSAGE' : null,
  ].filter(Boolean);

  console.warn(`[log-activity] skipped (missing: ${missing.join(', ')})`);
  process.exit(0);
}

const supabase = createClient(url, key);

const { error } = await supabase.from('activities').insert({
  project_id: projectId,
  type,
  message,
  actor_agent_key: actor,
  task_id: null,
});

if (error) {
  console.error('[log-activity] insert failed:', error);
  process.exit(1);
}

// Best-effort presence bump so dashboard presence stays fresh even when
// activities are emitted via scripts (cron, CI, etc.).
const normalizeAgentKey = (raw) => {
  const parts = String(raw || '').split(':');
  if (parts[0] === 'agent' && parts.length >= 3) return parts.slice(0, 3).join(':');
  return String(raw || '').trim();
};

if (String(actor || '').startsWith('agent:')) {
  try {
    await supabase.from('agent_status').upsert(
      {
        project_id: projectId,
        agent_key: normalizeAgentKey(actor),
        last_activity_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,agent_key' }
    );
  } catch {
    // fail soft
  }
}

console.log('[log-activity] ok');
