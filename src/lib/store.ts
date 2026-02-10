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
export type AgentTab = 'soul' | 'user' | 'memory' | 'tools' | 'skills' | 'sessions';

interface FileState {
  content: string;
  originalContent: string;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: string | null;
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
  setFileOriginal: (key: string, content: string) => void;
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
  setFileOriginal: (key, content) => set((state) => ({
    files: {
      ...state.files,
      [key]: {
        content,
        originalContent: content,
        isDirty: false,
        isSaving: false,
        lastSaved: null,
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
    const current = getControlApiUrl();
    if (current) {
      // localStorage has a value — ensure it's also in Supabase
      fetchControlApiUrlFromSupabase(projectId).then((fromSupa) => {
        if (!fromSupa || fromSupa !== current) {
          import('./control-api').then(({ saveControlApiUrlToSupabase }) =>
            saveControlApiUrlToSupabase(projectId, current).catch(() => {})
          );
        }
      }).catch(() => {});
      return;
    }
    try {
      const fromSupabase = await fetchControlApiUrlFromSupabase(projectId);
      if (fromSupabase) {
        persistControlApiUrl(fromSupabase); // cache to localStorage
        set({ controlApiUrl: fromSupabase });
      }
    } catch {
      // Supabase fetch failed, keep env var fallback
    }
  },

  // UI state
  isRestarting: false,
  setIsRestarting: (value) => set({ isRestarting: value }),
  isRefreshing: false,
  setIsRefreshing: (value) => set({ isRefreshing: value }),
}));
