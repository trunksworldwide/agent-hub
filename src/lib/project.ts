export const DEFAULT_PROJECT_ID = 'front-office';

/**
 * Read the currently selected project id.
 *
 * Safe in environments where `localStorage` may be unavailable (SSR/tests).
 */
export function getSelectedProjectId(): string {
  try {
    return localStorage.getItem('clawdos.project') || DEFAULT_PROJECT_ID;
  } catch {
    return DEFAULT_PROJECT_ID;
  }
}

/**
 * Persist the currently selected project id.
 *
 * Safe in environments where `localStorage` may be unavailable.
 */
export function setSelectedProjectId(id: string): void {
  try {
    localStorage.setItem('clawdos.project', id);
  } catch {
    // noop
  }
}
