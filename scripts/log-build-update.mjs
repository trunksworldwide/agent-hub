#!/usr/bin/env node

/**
 * Log a short Supabase activities entry (type=build_update).
 *
 * Usage:
 *   node scripts/log-build-update.mjs --message "..." [--project front-office] [--actor agent:main:main]
 *
 * Env:
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 *   (or SUPABASE_URL / SUPABASE_ANON_KEY)
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load .env then .env.local (local should override)
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const message = (args.message || '').toString().trim();
const projectId = (args.project || process.env.CLAWDOS_PROJECT || 'front-office').toString();
const actor = (args.actor || 'agent:main:main').toString();

if (!message) {
  console.error('Missing --message');
  process.exit(2);
}

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('Missing Supabase env (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY). Skipping.');
  process.exit(0);
}

const supabase = createClient(url, anon);

const { error } = await supabase.from('activities').insert({
  project_id: projectId,
  type: 'build_update',
  message,
  actor_agent_key: actor,
});

if (error) {
  console.error('Failed to insert build_update activity:', error);
  process.exit(1);
}

console.log('Logged build_update activity.');
