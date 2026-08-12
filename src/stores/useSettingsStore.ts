import { create } from 'zustand';
import type { HealthStatus, ModelId, ThinkingLevel, CreativityLevel } from '@/lib/types';
import { fetchHealth, fetchWithAuth } from '@/lib/api';
import { safeStorage } from '@/lib/safe-storage';

type Theme = 'dark' | 'light' | 'corporate';

function getInitialTheme(): Theme {
  if (typeof window !== 'undefined') {
    const saved = safeStorage.getItem('openexpert-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'corporate') {
      return saved;
    }
  }
  return 'light';
}

function getInitialSidebarCollapsed(): boolean {
  if (typeof window !== 'undefined') {
    return safeStorage.getItem('openexpert-sidebar-collapsed') === 'true';
  }
  return false;
}

export function getStoredDefaultModel(): ModelId {
  if (typeof window !== 'undefined') {
    const saved = safeStorage.getItem('openexpert-default-model');
    if (saved && saved.length > 0) {
      // Accept any stored model ID — Claude, OpenAI, Azure, Mistral, Gemini, Ollama, custom
      return saved as ModelId;
    }
  }
  // Fallback only — a user's saved choice above always wins, so existing
  // installs keep whatever they had and are not silently moved to a new model.
  return 'claude-opus-5';
}

export function getStoredDefaultThinking(): ThinkingLevel {
  if (typeof window !== 'undefined') {
    const saved = safeStorage.getItem('openexpert-default-thinking');
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
    const saved = safeStorage.getItem('openexpert-default-creativity');
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
// 12 pillars — Procure / Civic / Grow promoted into the union per
// ANTON_Improvement_and_Investigation_Brief.md §C.3. Sidebar still detects
// per-pillar variants by pathname (Sidebar.tsx:346-380); appMode is the
// persisted preference for which surface the user starts in.
export type AppMode =
  | 'work'
  | 'school'
  | 'life'
  | 'pathfinder'
  | 'markets'
  | 'community'
  | 'payments'
  | 'portals'
  | 'missions'
  | 'procure'
  | 'civic'
  | 'grow';

const VALID_APP_MODES: ReadonlyArray<AppMode> = [
  'work', 'school', 'life', 'pathfinder', 'markets', 'community',
  'payments', 'portals', 'missions', 'procure', 'civic', 'grow',
];

function getInitialAppMode(): AppMode {
  if (typeof window !== 'undefined') {
    const saved = safeStorage.getItem('openexpert-app-mode') as AppMode | null;
    if (saved && (VALID_APP_MODES as readonly string[]).includes(saved)) return saved;
  }
  return 'work';
}

function getInitialEmailNotificationsEnabled(): boolean {
  if (typeof window !== 'undefined') {
    return safeStorage.getItem('openexpert-email-notifications') === 'true';
  }
  return false;
}

export interface UserLocation {
  city: string;
  country: string;
}

function getInitialLocation(): UserLocation {
  if (typeof window !== 'undefined') {
    const saved = safeStorage.getItem('openexpert-location');
    if (saved) {
      try { return JSON.parse(saved) as UserLocation; } catch { /* ignore */ }
    }
  }
  return { city: '', country: '' };
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
  location: UserLocation;
  appMode: AppMode;
  checkHealth: () => Promise<void>;
  fetchDeploymentConfig: () => Promise<void>;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setDefaultModel: (model: ModelId) => void;
  setDefaultThinking: (thinking: ThinkingLevel) => void;
  setDefaultCreativity: (creativity: CreativityLevel) => void;
  setEmailNotificationsEnabled: (enabled: boolean) => void;
  setLocation: (location: UserLocation) => void;
  setAppMode: (mode: AppMode) => void;
  compactionEnabled: boolean;
  setCompactionEnabled: (enabled: boolean) => void;
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
  location: getInitialLocation(),
  appMode: getInitialAppMode(),
  compactionEnabled: safeStorage.getItem('openexpert-compaction-enabled') !== 'false', // default: true

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
    safeStorage.setItem('openexpert-theme', next);
    applyThemeToDOM(next);
    set({ theme: next });
  },

  setTheme: (theme: Theme) => {
    safeStorage.setItem('openexpert-theme', theme);
    applyThemeToDOM(theme);
    set({ theme });
  },

  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    safeStorage.setItem('openexpert-sidebar-collapsed', String(next));
    set({ sidebarCollapsed: next });
  },

  setDefaultModel: (model: ModelId) => {
    safeStorage.setItem('openexpert-default-model', model);
    set({ defaultModel: model });
    // Server-side write-through (plan 2.12): persist to app_settings so the
    // same model governs missions / agents / renderers / the extractor —
    // not just module runs. Best-effort: localStorage remains the frontend
    // source of truth if the server is unreachable.
    fetchWithAuth('/api/settings/default-model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
    }).catch(() => {
      // Non-fatal — server default falls back to env DEFAULT_MODEL
    });
  },

  setDefaultThinking: (thinking: ThinkingLevel) => {
    safeStorage.setItem('openexpert-default-thinking', thinking);
    set({ defaultThinking: thinking });
  },

  setDefaultCreativity: (creativity: CreativityLevel) => {
    safeStorage.setItem('openexpert-default-creativity', creativity);
    set({ defaultCreativity: creativity });
  },

  setEmailNotificationsEnabled: (enabled: boolean) => {
    safeStorage.setItem('openexpert-email-notifications', String(enabled));
    set({ emailNotificationsEnabled: enabled });
  },

  setLocation: (location: UserLocation) => {
    safeStorage.setItem('openexpert-location', JSON.stringify(location));
    set({ location });
  },

  setAppMode: (mode: AppMode) => {
    safeStorage.setItem('openexpert-app-mode', mode);
    set({ appMode: mode });
  },

  setCompactionEnabled: (enabled: boolean) => {
    safeStorage.setItem('openexpert-compaction-enabled', String(enabled));
    set({ compactionEnabled: enabled });
  },
}));
