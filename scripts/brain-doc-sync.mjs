import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(_exec);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const PROJECT_ID = process.env.CLAWDOS_PROJECT_ID || 'front-office';
const WORKSPACE = process.env.CLAWD_WORKSPACE || '/Users/trunks/clawd';
const BRAIN_REPO = process.env.CLAWD_BRAIN_REPO || WORKSPACE;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const STATIC_DOCS = [
  { doc_type: 'soul', path: join(WORKSPACE, 'SOUL.md') },
  { doc_type: 'agents', path: join(WORKSPACE, 'AGENTS.md') },
  { doc_type: 'user', path: join(WORKSPACE, 'USER.md') },
  { doc_type: 'memory_long', path: join(WORKSPACE, 'MEMORY.md') },
];

// Daily memory file rolls over at midnight
function getTodayMemoryPath() {
  const today = new Date().toISOString().slice(0, 10);
  return join(WORKSPACE, 'memory', `${today}.md`);
}

function getDocs() {
  return [
    ...STATIC_DOCS,
    { doc_type: 'memory_today', path: getTodayMemoryPath() },
  ];
}

// Used to prevent immediate echo loops where a remote update writes a local file and the
// local polling watcher immediately upserts the same content back to Supabase.
const lastLocal = new Map();

async function ensureParent(fp) {
  await mkdir(dirname(fp), { recursive: true });
}

async function gitCommit(filePath, message) {
  try {
    const rel = filePath.startsWith(BRAIN_REPO) ? filePath.slice(BRAIN_REPO.length + 1) : null;
    if (!rel) return;
    await exec(`cd ${JSON.stringify(BRAIN_REPO)} && git add ${JSON.stringify(rel)}`);
    const { stdout } = await exec(`cd ${JSON.stringify(BRAIN_REPO)} && git status --porcelain ${JSON.stringify(rel)}`);
    if (!stdout.trim()) return;
    await exec(`cd ${JSON.stringify(BRAIN_REPO)} && git commit -m ${JSON.stringify(message)} -- ${JSON.stringify(rel)}`);
  } catch {
    // best effort
  }
}

const GLOBAL_AGENT_KEY = null;

async function upsertDoc(doc_type, content, updated_by) {
  await sb.from('brain_docs').upsert(
    {
      project_id: PROJECT_ID,
      agent_key: GLOBAL_AGENT_KEY,
      doc_type,
      content,
      updated_by,
    },
    { onConflict: 'project_id,agent_key,doc_type' }
  );

  // If the canonical source is a local file edit, also write an activity row so
  // ClawdOS dashboards see brain-doc edits even when the editor is outside the UI.
  if (updated_by === 'local_file') {
    try {
      const labelByType = {
        soul: 'SOUL.md',
        agents: 'AGENTS.md',
        user: 'USER.md',
        memory_long: 'MEMORY.md',
      };

      await sb.from('activities').insert({
        project_id: PROJECT_ID,
        type: 'brain_doc_updated',
        message: `Updated ${labelByType[doc_type] || doc_type} (local file sync)`,
        actor_agent_key: 'agent:sync:brain-doc',
      });
    } catch {
      // best effort
    }
  }
}

async function getRemoteDoc(doc_type) {
  const { data, error } = await sb
    .from('brain_docs')
    .select('content,updated_at')
    .eq('project_id', PROJECT_ID)
    .is('agent_key', GLOBAL_AGENT_KEY)
    .eq('doc_type', doc_type)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function pullOnce() {
  const { data, error } = await sb
    .from('brain_docs')
    .select('doc_type,content,updated_at')
    .eq('project_id', PROJECT_ID)
    .is('agent_key', GLOBAL_AGENT_KEY);
  if (error) throw error;

  const map = new Map((data || []).map((r) => [r.doc_type, r]));

  for (const d of getDocs()) {
    const row = map.get(d.doc_type);
    const content = row?.content;
    if (typeof content !== 'string') continue;

    const existing = await readFile(d.path, 'utf8').catch(() => null);
    if (existing === content) continue;

    await ensureParent(d.path);
    await writeFile(d.path, content, 'utf8');
    lastLocal.set(d.doc_type, content);
    await gitCommit(d.path, `ClawdOS: sync ${d.doc_type} from Supabase`);
  }
}

async function seedIfMissing() {
  for (const d of getDocs()) {
    try {
      const { data, error } = await sb
        .from('brain_docs')
        .select('id')
        .eq('project_id', PROJECT_ID)
        .is('agent_key', GLOBAL_AGENT_KEY)
        .eq('doc_type', d.doc_type)
        .maybeSingle();
      if (error) throw error;
      if (data?.id) continue;
      const content = await readFile(d.path, 'utf8').catch(() => '');
      await upsertDoc(d.doc_type, content, 'local_seed');
    } catch {
      // ignore
    }
  }
}

async function writeConflictBackup(targetPath, content) {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${targetPath}.local-conflict-${ts}.bak`;
    await ensureParent(backup);
    await writeFile(backup, content, 'utf8');
    console.warn('brain-doc-sync: wrote conflict backup', backup);
  } catch {
    // ignore
  }
}

async function watchLocal() {
  // simple polling watcher (cross-platform reliable)
  for (const d of getDocs()) {
    const content = await readFile(d.path, 'utf8').catch(() => '');
    lastLocal.set(d.doc_type, content);
  }

  setInterval(async () => {
    for (const d of getDocs()) {
      try {
        const content = await readFile(d.path, 'utf8').catch(() => '');
        const prev = lastLocal.get(d.doc_type);
        if (content === prev) continue;

        // Safety: avoid clobbering a newer Supabase edit if the local file changed while a more
        // recent remote update exists. This can happen if the sync process is interrupted or
        // a user edits the file around the same time as a dashboard edit.
        const st = await stat(d.path).catch(() => null);
        const localMtimeMs = st?.mtimeMs || 0;

        const remote = await getRemoteDoc(d.doc_type).catch(() => null);
        const remoteUpdatedAtMs = remote?.updated_at ? Date.parse(remote.updated_at) : 0;

        if (remote && typeof remote.content === 'string' && remoteUpdatedAtMs > localMtimeMs + 1000) {
          // Remote is clearly newer than the local file write time → don't overwrite Supabase.
          // Preserve local edits to a backup and re-apply remote canonical content.
          await writeConflictBackup(d.path, content);
          await ensureParent(d.path);
          await writeFile(d.path, remote.content, 'utf8');
          lastLocal.set(d.doc_type, remote.content);
          console.warn('brain-doc-sync: skipped local upsert; remote was newer', {
            doc_type: d.doc_type,
            remote_updated_at: remote.updated_at,
          });
          continue;
        }

        lastLocal.set(d.doc_type, content);
        await upsertDoc(d.doc_type, content, 'local_file');
      } catch {
        // ignore
      }
    }
  }, 5000);
}

async function subscribeRemote() {
  const channel = sb
    .channel(`brain-docs:${PROJECT_ID}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'brain_docs',
        filter: `project_id=eq.${PROJECT_ID},agent_key=is.null`,
      },
      async (payload) => {
        const row = payload.new || payload.old;
        const docType = row?.doc_type;
        const content = row?.content;
        const target = getDocs().find((d) => d.doc_type === docType);
        if (!target || typeof content !== 'string') return;

        const existing = await readFile(target.path, 'utf8').catch(() => null);
        if (existing === content) return;

        await ensureParent(target.path);
        await writeFile(target.path, content, 'utf8');
        lastLocal.set(docType, content);
        await gitCommit(target.path, `ClawdOS: sync ${docType} from Supabase`);
      }
    )
    .subscribe();

  return channel;
}

async function main() {
  console.log('brain-doc-sync starting', { PROJECT_ID, WORKSPACE });
  await seedIfMissing();
  await pullOnce();
  await subscribeRemote();
  await watchLocal();
  console.log('brain-doc-sync running');
  // keep alive
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => {
  console.error('brain-doc-sync error', e);
  process.exit(1);
});
