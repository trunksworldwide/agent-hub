// server/executor.mjs — Compatibility wrapper for openclaw / clawdbot CLI
// Prefers openclaw, falls back to clawdbot. Supports EXECUTOR_BIN env override.

import { exec as _exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(_exec);
const ENV_BIN = process.env.EXECUTOR_BIN || null;
let _resolved = ENV_BIN;

export async function resolveExecutorBin() {
  if (_resolved) return _resolved;

  for (const bin of ['openclaw', 'clawdbot']) {
    try {
      await execAsync(`command -v ${bin}`);
      _resolved = bin;
      console.log(`[executor] Resolved binary: ${bin}`);
      return bin;
    } catch { /* not found, try next */ }
  }

  throw new Error(
    'Neither "openclaw" nor "clawdbot" found in PATH. ' +
    'Set EXECUTOR_BIN=/absolute/path/to/openclaw in your environment.'
  );
}

export async function execExecutor(args, opts = {}) {
  const bin = await resolveExecutorBin();
  const cmd = `${bin} ${args}`;
  return execAsync(cmd, { timeout: opts.timeout || 30000, ...opts });
}
