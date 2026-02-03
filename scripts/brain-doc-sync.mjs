import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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

const DOCS = [
  { doc_type: 'soul', path: join(WORKSPACE, 'SOUL.md') },
  { doc_type: 'agents', path: join(WORKSPACE, 'AGENTS.md') },
  { doc_type: 'user', path: join(WORKSPACE, 'USER.md') },
  { doc_type: 'memory_long', path: join(WORKSPACE, 'MEMORY.md') },
];

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

async function upsertDoc(doc_type, content, updated_by) {
  await sb.from('brain_docs').upsert(
    {
      project_id: PROJECT_ID,
      doc_type,
      content,
      updated_by,
    },
    { onConflict: 'project_id,doc_type' }
  );
}

async function pullOnce() {
  const { data, error } = await sb
    .from('brain_docs')
    .select('doc_type,content')
    .eq('project_id', PROJECT_ID);
  if (error) throw error;

  const map = new Map((data || []).map((r) => [r.doc_type, r.content]));

  for (const d of DOCS) {
    const content = map.get(d.doc_type);
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
  for (const d of DOCS) {
    try {
      const { data, error } = await sb
        .from('brain_docs')
        .select('id')
        .eq('project_id', PROJECT_ID)
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

async function watchLocal() {
  // simple polling watcher (cross-platform reliable)
  for (const d of DOCS) {
    const content = await readFile(d.path, 'utf8').catch(() => '');
    lastLocal.set(d.doc_type, content);
  }

  setInterval(async () => {
    for (const d of DOCS) {
      try {
        const content = await readFile(d.path, 'utf8').catch(() => '');
        const prev = lastLocal.get(d.doc_type);
        if (content !== prev) {
          lastLocal.set(d.doc_type, content);
          await upsertDoc(d.doc_type, content, 'local_file');
        }
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
      { event: '*', schema: 'public', table: 'brain_docs', filter: `project_id=eq.${PROJECT_ID}` },
      async (payload) => {
        const row = payload.new || payload.old;
        const docType = row?.doc_type;
        const content = row?.content;
        const target = DOCS.find((d) => d.doc_type === docType);
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
