import { createClient } from '@supabase/supabase-js';

const [,, typeArg, ...rest] = process.argv;
const type = typeArg || 'build_update';
const message = rest.join(' ').trim() || 'Build update';

const projectId = process.env.CLAWDOS_PROJECT_ID || process.env.CLAWD_PROJECT_ID || 'front-office';
const actor = process.env.CLAWDOS_ACTOR || 'agent:main:main';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log('[log-activity] Supabase env not set; skipping');
  process.exit(0);
}

const supabase = createClient(url, key);

const { error } = await supabase.from('activities').insert({
  project_id: projectId,
  type,
  message,
  actor_agent_key: actor,
});

if (error) {
  console.error('[log-activity] insert failed:', error);
  process.exit(1);
}

// Best-effort presence bump so the dashboard presence stays fresh even when
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
