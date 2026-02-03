import { create } from 'zustand';
import type { Agent, SystemStatus, AgentFile } from './api';
import { getSelectedProjectId } from './project';

export type ViewMode = 'dashboard' | 'manage';
export type MainTab = 'agents' | 'skills' | 'channels' | 'cron' | 'config';
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
  
  // Agent selection
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;
  
  activeAgentTab: AgentTab;
  setActiveAgentTab: (tab: AgentTab) => void;
  
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
  
  // UI state
  isRestarting: boolean;
  setIsRestarting: (value: boolean) => void;
  isRefreshing: boolean;
  setIsRefreshing: (value: boolean) => void;
}

const initialProjectId = getSelectedProjectId();

export const useClawdOffice = create<ClawdOfficeState>((set, get) => ({
  // Project selection
  selectedProjectId: initialProjectId,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),

  // View mode
  viewMode: 'manage',
  setViewMode: (mode) => set({ viewMode: mode }),
  
  // Navigation
  activeMainTab: 'agents',
  setActiveMainTab: (tab) => set({ activeMainTab: tab }),
  
  // Agent selection
  selectedAgentId: 'trunks',
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  
  activeAgentTab: 'soul',
  setActiveAgentTab: (tab) => set({ activeAgentTab: tab }),
  
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
  
  // UI state
  isRestarting: false,
  setIsRestarting: (value) => set({ isRestarting: value }),
  isRefreshing: false,
  setIsRefreshing: (value) => set({ isRefreshing: value }),
}));
