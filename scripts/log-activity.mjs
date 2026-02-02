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

console.log('[log-activity] ok');
