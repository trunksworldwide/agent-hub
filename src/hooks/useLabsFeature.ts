import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useClawdOffice } from '@/lib/store';

/**
 * All known Labs feature flags.
 * New features should be added here with a default of `false`.
 */
export type LabsFeatureKey =
  | 'task_threads'
  | 'team_room'
  | 'operator_chat'
  | 'multi_dm'
  | 'heartbeat_ui'
  | 'mission_banner';

const SETTINGS_KEY = 'labs_features';

/** Default flags – everything off until explicitly enabled */
const DEFAULTS: Record<LabsFeatureKey, boolean> = {
  task_threads: false,
  team_room: false,
  operator_chat: false,
  multi_dm: false,
  heartbeat_ui: false,
  mission_banner: false,
};

let cachedFlags: Record<string, boolean> | null = null;
let lastProjectId: string | null = null;

/**
 * Hook: returns whether a specific Labs feature is enabled for the current project.
 * Reads from `project_settings` table (key = 'labs_features', value = JSON).
 */
export function useLabsFeature(key: LabsFeatureKey): boolean {
  const { selectedProjectId } = useClawdOffice();
  const [enabled, setEnabled] = useState<boolean>(
    cachedFlags && lastProjectId === selectedProjectId
      ? cachedFlags[key] ?? DEFAULTS[key]
      : DEFAULTS[key]
  );

  useEffect(() => {
    if (!selectedProjectId) return;

    // If we already fetched for this project, use cache
    if (cachedFlags && lastProjectId === selectedProjectId) {
      setEnabled(cachedFlags[key] ?? DEFAULTS[key]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase
          .from('project_settings')
          .select('value')
          .eq('project_id', selectedProjectId)
          .eq('key', SETTINGS_KEY)
          .maybeSingle();

        if (cancelled) return;

        const parsed = data?.value ? JSON.parse(data.value) : {};
        cachedFlags = { ...DEFAULTS, ...parsed };
        lastProjectId = selectedProjectId;
        setEnabled(cachedFlags[key] ?? DEFAULTS[key]);
      } catch {
        if (!cancelled) setEnabled(DEFAULTS[key]);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedProjectId, key]);

  return enabled;
}

/**
 * Fetch all labs flags for a project (used by Settings page).
 */
export async function getLabsFlags(projectId: string): Promise<Record<LabsFeatureKey, boolean>> {
  try {
    const { data } = await supabase
      .from('project_settings')
      .select('value')
      .eq('project_id', projectId)
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    const parsed = data?.value ? JSON.parse(data.value) : {};
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Save labs flags for a project.
 * Invalidates the in-memory cache so hooks re-fetch.
 */
export async function setLabsFlags(
  projectId: string,
  flags: Partial<Record<LabsFeatureKey, boolean>>
): Promise<void> {
  const current = await getLabsFlags(projectId);
  const merged = { ...current, ...flags };

  await supabase
    .from('project_settings')
    .upsert(
      { project_id: projectId, key: SETTINGS_KEY, value: JSON.stringify(merged) },
      { onConflict: 'project_id,key' }
    );

  // Invalidate cache
  cachedFlags = merged;
  lastProjectId = projectId;
}
