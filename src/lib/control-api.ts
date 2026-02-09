// Runtime Control API URL management + health check
// Allows changing the executor URL from the UI without rebuilding

const STORAGE_KEY = 'clawdos.controlApiUrl';

export interface ExecutorCheckResult {
  binary: string;
  version: string;
  checks: {
    version: { ok: boolean; output?: string; error?: string };
    sessions: { ok: boolean; error?: string };
    cron: { ok: boolean; error?: string };
  };
}

/** Returns the runtime Control API URL: localStorage → VITE_API_BASE_URL → '' */
export function getControlApiUrl(): string {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  return import.meta.env.VITE_API_BASE_URL || '';
}

/** Persist a new Control API URL to localStorage */
export function setControlApiUrl(url: string): void {
  const trimmed = url.trim();
  if (trimmed) {
    localStorage.setItem(STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** Remove the stored URL, reverting to env var default */
export function clearControlApiUrl(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Test the Control API by calling /api/executor-check */
export async function testControlApi(baseUrl: string): Promise<ExecutorCheckResult> {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/executor-check`;
  const res = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => 'Unknown error')}`);
  }
  return res.json() as Promise<ExecutorCheckResult>;
}
