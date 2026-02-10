// Runtime Control API URL management + health check
// Allows changing the executor URL from the UI without rebuilding

import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'clawdos.controlApiUrl';
const SETTINGS_KEY = 'control_api_base_url';

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

/** Fetch the Control API URL from Supabase project_settings */
export async function fetchControlApiUrlFromSupabase(projectId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('project_settings')
    .select('value')
    .eq('project_id', projectId)
    .eq('key', SETTINGS_KEY)
    .maybeSingle();
  if (error || !data) return null;
  return data.value || null;
}

/** Save the Control API URL to Supabase project_settings (upsert) */
export async function saveControlApiUrlToSupabase(projectId: string, url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) {
    // Delete the setting if empty
    await supabase
      .from('project_settings')
      .delete()
      .eq('project_id', projectId)
      .eq('key', SETTINGS_KEY);
    return;
  }
  await supabase
    .from('project_settings')
    .upsert(
      { project_id: projectId, key: SETTINGS_KEY, value: trimmed },
      { onConflict: 'project_id,key' }
    );
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
