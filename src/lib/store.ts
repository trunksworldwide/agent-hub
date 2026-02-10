import { create } from 'zustand';
import type { Agent, SystemStatus, AgentFile } from './api';
import { getSelectedProjectId, setSelectedProjectId as persistSelectedProjectId, DEFAULT_PROJECT_ID } from './project';
import {
  getControlApiUrl,
  setControlApiUrl as persistControlApiUrl,
  fetchControlApiUrlFromSupabase,
  type ExecutorCheckResult,
} from './control-api';

export type ViewMode = 'dashboard' | 'manage';
export type MainTab = 'agents' | 'activity' | 'skills' | 'channels' | 'cron' | 'config';
export type AgentTab = 'overview' | 'soul' | 'user' | 'memory' | 'tools' | 'skills' | 'sessions';

interface FileState {
  content: string;
  originalContent: string;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: string | null;
  // Whether this editor is currently backed by the global brain_docs row (agent_key IS NULL)
  // or an agent-specific override row (agent_key = selectedAgentId).
  source: 'global' | 'agent' | 'unknown';
}

interface ClawdOfficeState {
  // Project selection
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;

  // View mode (Dashboard vs Manage)
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Navigation
  activeMainTab: MainTab;
  setActiveMainTab: (tab: MainTab) => void;

  // Optional deep-linking within Manage pages (lightweight).
  focusCronJobId: string | null;
  setFocusCronJobId: (id: string | null) => void;

  // Agent selection
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;

  activeAgentTab: AgentTab;
  setActiveAgentTab: (tab: AgentTab) => void;

  // Task selection (for detail sheet)
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;

  // System status
  status: SystemStatus | null;
  setStatus: (status: SystemStatus) => void;
  lastRefresh: Date | null;
  setLastRefresh: (date: Date) => void;

  // File editing state
  files: Record<string, FileState>;
  setFileContent: (key: string, content: string) => void;
  setFileOriginal: (key: string, content: string, opts?: { source?: FileState['source'] }) => void;
  setFileSaving: (key: string, isSaving: boolean) => void;
  markFileSaved: (key: string) => void;
  resetFile: (key: string) => void;

  // Control API URL (runtime-configurable)
  controlApiUrl: string;
  setControlApiUrl: (url: string) => void;

  // Executor health check result (shared across components)
  executorCheck: ExecutorCheckResult | null;
  setExecutorCheck: (result: ExecutorCheckResult | null) => void;

  // Init control API URL from Supabase (async, called on mount)
  initControlApiUrl: (projectId: string) => Promise<void>;

  // UI state
  isRestarting: boolean;
  setIsRestarting: (value: boolean) => void;
  isRefreshing: boolean;
  setIsRefreshing: (value: boolean) => void;
}

const initialProjectId = getSelectedProjectId();

export const useClawdOffice = create<ClawdOfficeState>((set, get) => ({
  // Project selection with validation guard
  selectedProjectId: initialProjectId,
  setSelectedProjectId: (id) => {
    // Guard: never allow empty or invalid selection
    const safeId = (id && typeof id === 'string' && id.trim()) ? id.trim() : DEFAULT_PROJECT_ID;
    persistSelectedProjectId(safeId);
    set({ selectedProjectId: safeId });
  },

  // View mode
  viewMode: 'manage',
  setViewMode: (mode) => set({ viewMode: mode }),
  
  // Navigation
  activeMainTab: 'agents',
  setActiveMainTab: (tab) => set({ activeMainTab: tab }),

  // Optional deep-linking within Manage pages
  focusCronJobId: null,
  setFocusCronJobId: (id) => set({ focusCronJobId: id }),

  // Agent selection
  // Default to the canonical main session-key style id used in Supabase.
  selectedAgentId: 'agent:main:main',
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  
  activeAgentTab: 'soul',
  setActiveAgentTab: (tab) => set({ activeAgentTab: tab }),

  // Task selection (for detail sheet)
  selectedTaskId: null,
  setSelectedTaskId: (id) => set({ selectedTaskId: id }),
  
  
  // System status
  status: null,
  setStatus: (status) => set({ status }),
  lastRefresh: null,
  setLastRefresh: (date) => set({ lastRefresh: date }),
  
  // File editing
  files: {},
  setFileContent: (key, content) => set((state) => ({
    files: {
      ...state.files,
      [key]: {
        ...state.files[key],
        content,
        isDirty: content !== state.files[key]?.originalContent,
      },
    },
  })),
  setFileOriginal: (key, content, opts) => set((state) => ({
    files: {
      ...state.files,
      [key]: {
        content,
        originalContent: content,
        isDirty: false,
        isSaving: false,
        lastSaved: null,
        source: opts?.source ?? state.files[key]?.source ?? 'unknown',
      },
    },
  })),
  setFileSaving: (key, isSaving) => set((state) => ({
    files: {
      ...state.files,
      [key]: {
        ...state.files[key],
        isSaving,
      },
    },
  })),
  markFileSaved: (key) => set((state) => ({
    files: {
      ...state.files,
      [key]: {
        ...state.files[key],
        originalContent: state.files[key].content,
        isDirty: false,
        isSaving: false,
        lastSaved: new Date().toISOString(),
      },
    },
  })),
  resetFile: (key) => set((state) => ({
    files: {
      ...state.files,
      [key]: {
        ...state.files[key],
        content: state.files[key].originalContent,
        isDirty: false,
      },
    },
  })),
  
  // Control API URL
  controlApiUrl: getControlApiUrl(),
  setControlApiUrl: (url) => {
    persistControlApiUrl(url);
    set({ controlApiUrl: url });
  },

  // Executor health check result
  executorCheck: null,
  setExecutorCheck: (result) => set({ executorCheck: result }),

  // Init control API URL from Supabase if localStorage is empty
  initControlApiUrl: async (projectId) => {
    // IMPORTANT: distinguish "stored" (user-set) vs env fallback.
    // We always try Supabase when there's no explicit localStorage override,
    // even if VITE_API_BASE_URL is set.
    const { getStoredControlApiUrl, getControlApiUrl } = await import('./control-api');

    const stored = getStoredControlApiUrl();
    const envFallback = import.meta.env.VITE_API_BASE_URL || '';

    if (stored) {
      const current = stored;
      // localStorage has a value — ensure it's also in Supabase
      fetchControlApiUrlFromSupabase(projectId)
        .then((fromSupa) => {
          if (!fromSupa || fromSupa !== current) {
            import('./control-api').then(({ saveControlApiUrlToSupabase }) =>
              saveControlApiUrlToSupabase(projectId, current).catch(() => {})
            );
          }
        })
        .catch(() => {});
      return;
    }

    try {
      const fromSupabase = await fetchControlApiUrlFromSupabase(projectId);
      if (fromSupabase) {
        persistControlApiUrl(fromSupabase); // cache to localStorage
        set({ controlApiUrl: fromSupabase });
        return;
      }

      // No Supabase setting — fall back to env var.
      // Best-effort: persist env fallback to Supabase so other clients inherit it.
      if (envFallback) {
        set({ controlApiUrl: envFallback });
        import('./control-api').then(({ saveControlApiUrlToSupabase }) =>
          saveControlApiUrlToSupabase(projectId, envFallback).catch(() => {})
        );
      } else {
        // Ensure store reflects computed fallback (usually '')
        set({ controlApiUrl: getControlApiUrl() });
      }
    } catch {
      // Supabase fetch failed, keep env var fallback
      set({ controlApiUrl: getControlApiUrl() });
    }
  },

  // UI state
  isRestarting: false,
  setIsRestarting: (value) => set({ isRestarting: value }),
  isRefreshing: false,
  setIsRefreshing: (value) => set({ isRefreshing: value }),
}));
