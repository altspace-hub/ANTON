import { create } from 'zustand';
import type { HealthStatus, ModelId, ThinkingLevel, CreativityLevel } from '@/lib/types';
import { fetchHealth } from '@/lib/api';

type Theme = 'dark' | 'light' | 'corporate';

function getInitialTheme(): Theme {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('openexpert-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'corporate') {
      return saved;
    }
  }
  return 'dark';
}

function getInitialSidebarCollapsed(): boolean {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('openexpert-sidebar-collapsed') === 'true';
  }
  return false;
}

export function getStoredDefaultModel(): ModelId {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('openexpert-default-model');
    if (
      saved === 'claude-opus-4-6' ||
      saved === 'claude-sonnet-4-5-20250929' ||
      saved === 'claude-haiku-4-5-20251001'
    ) {
      return saved;
    }
  }
  return 'claude-opus-4-6';
}

export function getStoredDefaultThinking(): ThinkingLevel {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('openexpert-default-thinking');
    if (
      saved === 'quick' ||
      saved === 'think' ||
      saved === 'think_hard' ||
      saved === 'investigate' ||
      saved === 'plan_first'
    ) {
      return saved;
    }
  }
  return 'think_hard';
}

export function getStoredDefaultCreativity(): CreativityLevel {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('openexpert-default-creativity');
    if (saved === 'strict' || saved === 'balanced' || saved === 'creative') {
      return saved;
    }
  }
  return 'balanced';
}

function applyThemeToDOM(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('light', 'corporate');
    if (theme === 'light') {
      document.documentElement.classList.add('light');
    } else if (theme === 'corporate') {
      document.documentElement.classList.add('corporate');
    }
  }
}

type DeploymentMode = 'solo' | 'team';

function getInitialEmailNotificationsEnabled(): boolean {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('openexpert-email-notifications') === 'true';
  }
  return false;
}

interface SettingsState {
  health: HealthStatus | null;
  isLoading: boolean;
  error: string | null;
  theme: Theme;
  sidebarCollapsed: boolean;
  defaultModel: ModelId;
  defaultThinking: ThinkingLevel;
  defaultCreativity: CreativityLevel;
  deploymentMode: DeploymentMode;
  emailNotificationsEnabled: boolean;
  checkHealth: () => Promise<void>;
  fetchDeploymentConfig: () => Promise<void>;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setDefaultModel: (model: ModelId) => void;
  setDefaultThinking: (thinking: ThinkingLevel) => void;
  setDefaultCreativity: (creativity: CreativityLevel) => void;
  setEmailNotificationsEnabled: (enabled: boolean) => void;
}

// Apply the initial theme immediately so there is no flash
const initialTheme = getInitialTheme();
applyThemeToDOM(initialTheme);

export const useSettingsStore = create<SettingsState>((set, get) => ({
  health: null,
  isLoading: false,
  error: null,
  theme: initialTheme,
  sidebarCollapsed: getInitialSidebarCollapsed(),
  defaultModel: getStoredDefaultModel(),
  defaultThinking: getStoredDefaultThinking(),
  defaultCreativity: getStoredDefaultCreativity(),
  deploymentMode: 'solo' as DeploymentMode,
  emailNotificationsEnabled: getInitialEmailNotificationsEnabled(),

  checkHealth: async () => {
    set({ isLoading: true, error: null });
    try {
      const health = await fetchHealth();
      set({ health, isLoading: false });
    } catch (error) {
      set({
        health: { status: 'error', apiKeyConfigured: true, database: false, version: '0.1.0' },
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to connect',
      });
    }
  },

  fetchDeploymentConfig: async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        set({ deploymentMode: data.deploymentMode === 'team' ? 'team' : 'solo' });
      }
    } catch {
      // Non-fatal — default to solo
    }
  },

  toggleTheme: () => {
    const current = get().theme;
    const next: Theme = current === 'dark' ? 'light' : current === 'light' ? 'corporate' : 'dark';
    localStorage.setItem('openexpert-theme', next);
    applyThemeToDOM(next);
    set({ theme: next });
  },

  setTheme: (theme: Theme) => {
    localStorage.setItem('openexpert-theme', theme);
    applyThemeToDOM(theme);
    set({ theme });
  },

  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    localStorage.setItem('openexpert-sidebar-collapsed', String(next));
    set({ sidebarCollapsed: next });
  },

  setDefaultModel: (model: ModelId) => {
    localStorage.setItem('openexpert-default-model', model);
    set({ defaultModel: model });
  },

  setDefaultThinking: (thinking: ThinkingLevel) => {
    localStorage.setItem('openexpert-default-thinking', thinking);
    set({ defaultThinking: thinking });
  },

  setDefaultCreativity: (creativity: CreativityLevel) => {
    localStorage.setItem('openexpert-default-creativity', creativity);
    set({ defaultCreativity: creativity });
  },

  setEmailNotificationsEnabled: (enabled: boolean) => {
    localStorage.setItem('openexpert-email-notifications', String(enabled));
    set({ emailNotificationsEnabled: enabled });
  },
}));
