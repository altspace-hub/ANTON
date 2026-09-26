/**
 * safe-storage.ts
 * COMPAT-03: localStorage wrapper that silently handles QuotaExceededError
 * and other storage failures (private browsing, storage disabled, etc.).
 *
 * Drop-in replacement for direct `localStorage` calls:
 *   import { safeStorage } from '@/lib/safe-storage';
 *   safeStorage.getItem('key');
 *   safeStorage.setItem('key', 'value');
 *   safeStorage.removeItem('key');
 *
 * On a public demo (DEMO_MODE=true) the sign-in token is kept in
 * sessionStorage instead — see setSessionOnlyAuthStorage below.
 */

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  // Webkit: QuotaExceededError, Firefox: NS_ERROR_DOM_QUOTA_REACHED
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 // legacy numeric code
  );
}

// ── The sign-in token on a public demo ────────────────────────────────────────

/** The key that holds the sign-in token. */
export const AUTH_TOKEN_KEY = 'openexpert-token';

let sessionOnlyAuth = false;

/** The store a key lives in: sessionStorage for the token while session-only storage is on. */
function storeFor(key: string): Storage {
  return sessionOnlyAuth && key === AUTH_TOKEN_KEY ? sessionStorage : localStorage;
}

/**
 * On a public demo the sign-in token lives in sessionStorage, which the
 * browser drops with the tab, not in localStorage, which never expires:
 * storage that keeps a sign-in across browser sessions needs consent
 * (privacy review M4 / D25). useAuthStore switches this on from the demo
 * config. A token an earlier visit left in localStorage moves over, so the
 * open tab stays signed in and nothing persistent is left behind.
 */
export function setSessionOnlyAuthStorage(on: boolean): void {
  sessionOnlyAuth = on;
  if (!on) return;
  try {
    const left = localStorage.getItem(AUTH_TOKEN_KEY);
    if (left === null) return;
    if (sessionStorage.getItem(AUTH_TOKEN_KEY) === null) sessionStorage.setItem(AUTH_TOKEN_KEY, left);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Storage unavailable: nothing to move.
  }
}

/** Whether the sign-in token is kept for the tab only. */
export function isSessionOnlyAuthStorage(): boolean {
  return sessionOnlyAuth;
}

// ── Preferences ───────────────────────────────────────────────────────────────

/**
 * The keys (by prefix) where the web client remembers a person's choices:
 * theme, layout, favourites, default model settings, the tour, dismissed tips
 * and banners, recent commands. Read off the pages a demo visitor reaches.
 */
export const PREFERENCE_KEY_PREFIXES: readonly string[] = [
  'openexpert-',
  'anton-favorites',
  'anton-home-v2-',
  'anton-deadlines',
  'pwa-install-dismissed',
  'recent-commands',
  'command-macros',
  'dismissed-skills-',
  'dismissed-lib-suggest-',
];

/**
 * Removes every preference key from localStorage and sessionStorage, the
 * sign-in token included. Called at sign-out on a public demo (D25), so
 * nothing the demo stored stays in the browser. Returns how many went.
 */
export function clearPreferenceKeys(): number {
  let removed = 0;
  for (const pick of [() => localStorage, () => sessionStorage]) {
    try {
      const store = pick();
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key !== null && PREFERENCE_KEY_PREFIXES.some((p) => key.startsWith(p))) keys.push(key);
      }
      for (const key of keys) store.removeItem(key);
      removed += keys.length;
    } catch {
      // Storage unavailable: nothing stored there.
    }
  }
  return removed;
}

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return storeFor(key).getItem(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      storeFor(key).setItem(key, value);
    } catch (err) {
      if (isQuotaError(err)) {
        console.warn('[safe-storage] localStorage quota exceeded — value not persisted:', key);
      }
      // Other errors (e.g. private browsing): silently swallow
    }
  },

  removeItem(key: string): void {
    try {
      storeFor(key).removeItem(key);
      // A token some page wrote to localStorage directly goes too.
      if (sessionOnlyAuth && key === AUTH_TOKEN_KEY) localStorage.removeItem(key);
    } catch {
      // Silently ignore — nothing to remove if storage is inaccessible
    }
  },
};
