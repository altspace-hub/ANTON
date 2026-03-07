import { create } from 'zustand';
import { safeStorage } from '@/lib/safe-storage';

export interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'analyst' | 'viewer';
  display_name?: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isTeamMode: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setIsTeamMode: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: safeStorage.getItem('openexpert-token'),
  isLoading: true,
  isTeamMode: false,

  setIsTeamMode: (value: boolean) => set({ isTeamMode: value }),

  login: async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error || 'Login failed');
    }
    const data = await res.json() as { user: AuthUser; token: string };
    safeStorage.setItem('openexpert-token', data.token);
    set({ user: data.user, token: data.token });
  },

  logout: async () => {
    const { token } = get();
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    safeStorage.removeItem('openexpert-token');
    set({ user: null, token: null });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    const token = safeStorage.getItem('openexpert-token');
    if (!token) {
      set({ isLoading: false });
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const user = await res.json() as AuthUser;
        set({ user, token, isLoading: false });
      } else {
        safeStorage.removeItem('openexpert-token');
        set({ user: null, token: null, isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
