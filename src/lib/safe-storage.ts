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

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      if (isQuotaError(err)) {
        console.warn('[safe-storage] localStorage quota exceeded — value not persisted:', key);
      }
      // Other errors (e.g. private browsing): silently swallow
    }
  },

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Silently ignore — nothing to remove if storage is inaccessible
    }
  },
};
