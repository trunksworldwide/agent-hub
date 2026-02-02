import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error('Missing env vars. Need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, service);

function parseArgs(argv) {
  const out = { positional: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out.positional.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    const hasValue = next && !next.startsWith('--');
    out[key] = hasValue ? next : true;
    if (hasValue) i++;
  }
  return out;
}

const args = parseArgs(process.argv);
const projectId = args.positional[0] || 'front-office';

async function main() {
  console.log('Supabase URL:', url);
  console.log('Project:', projectId);

  // 1) Ensure projects row exists
  {
    const { data, error } = await sb.from('projects').select('id,name').eq('id', projectId).maybeSingle();
    if (error) throw error;
    if (!data) {
      const { error: insErr } = await sb.from('projects').insert({
        id: projectId,
        name: projectId === 'front-office' ? 'Front Office' : projectId,
        workspace_path: '/Users/trunks/clawd',
      });
      if (insErr) throw insErr;
      console.log('Inserted project row');
    } else {
      console.log('Project row exists');
    }
  }

  // 2) List agents
  const { data: agents, error: agentsErr } = await sb
    .from('agents')
    .select('project_id,agent_key,name,role,emoji,created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (agentsErr) throw agentsErr;

  console.log('Agents in DB:', agents?.length || 0);
  for (const a of agents || []) console.log('-', a.agent_key, a.name);

  // 3) Wipe non-trunks agents if requested
  if (process.argv.includes('--reset-agents')) {
    const { error: delErr } = await sb.from('agents').delete().eq('project_id', projectId);
    if (delErr) throw delErr;
    console.log('Deleted all agents for project');
  }

  // 4) Ensure Trunks exists
  {
    const { data, error } = await sb
      .from('agents')
      .select('agent_key')
      .eq('project_id', projectId)
      .eq('agent_key', 'agent:main:main')
      .maybeSingle();
    if (error) throw error;

    if (!data) {
      const { error: insErr } = await sb.from('agents').insert({
        project_id: projectId,
        agent_key: 'agent:main:main',
        name: 'Trunks',
        role: 'Chief of Staff',
        emoji: '⚡',
        color: '#FF4500',
      });
      if (insErr) throw insErr;
      console.log('Inserted Trunks agent');
    } else {
      console.log('Trunks agent exists');
    }
  }

  // 5) Optionally write an activity entry
  // Usage:
  //   node scripts/supabase-admin.mjs front-office --activity "message" --type build_update
  // Defaults: type=build_update actor=agent:main:main
  if (args.activity) {
    const type = typeof args.type === 'string' ? args.type : 'build_update';
    const actor = typeof args.actor === 'string' ? args.actor : 'agent:main:main';

    const { data, error } = await sb
      .from('activities')
      .insert({
        project_id: projectId,
        type,
        message: String(args.activity),
        actor_agent_key: actor,
      })
      .select('id,created_at')
      .single();

    if (error) throw error;
    console.log('Inserted activity:', data?.id, data?.created_at);
  }

  // 6) Show final agents
  {
    const { data, error } = await sb
      .from('agents')
      .select('agent_key,name,role,emoji')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    console.log('Final agents:');
    for (const a of data || []) console.log('-', a.agent_key, a.name, a.emoji);
  }
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
