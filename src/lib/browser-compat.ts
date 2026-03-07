/**
 * browser-compat.ts
 * COMPAT-02: Feature detection for critical browser APIs used by openEXPERT.
 * Import `checkBrowserCompat` and call it once during app initialisation.
 */

export interface BrowserCapabilities {
  abortController: boolean;
  readableStream: boolean;
  clipboard: boolean;
  localStorage: boolean;
  fetchApi: boolean;
  serviceWorker: boolean;
}

/** Detect availability of browser APIs needed by openEXPERT. */
export function detectCapabilities(): BrowserCapabilities {
  return {
    abortController: typeof AbortController !== 'undefined',
    readableStream: typeof ReadableStream !== 'undefined',
    clipboard: !!(typeof navigator !== 'undefined' && navigator.clipboard),
    localStorage: (() => {
      try {
        localStorage.setItem('__cap_test__', '1');
        localStorage.removeItem('__cap_test__');
        return true;
      } catch {
        return false;
      }
    })(),
    fetchApi: typeof fetch !== 'undefined',
    serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  };
}

/** Critical APIs: app streaming and cancellation will not work without these. */
const CRITICAL: Array<keyof BrowserCapabilities> = ['abortController', 'readableStream', 'fetchApi'];

/**
 * Check browser compatibility and log warnings for missing APIs.
 * Returns true if all critical APIs are present; false if the environment is degraded.
 * Safe to call in SSR / non-browser environments.
 */
export function checkBrowserCompat(): boolean {
  if (typeof window === 'undefined') return true; // SSR — skip

  const caps = detectCapabilities();
  const missing = CRITICAL.filter((k) => !caps[k]);

  if (missing.length > 0) {
    console.warn('[browser-compat] Missing critical APIs:', missing.join(', '));
    return false;
  }
  if (!caps.clipboard) {
    console.info('[browser-compat] Clipboard API unavailable — copy buttons will be hidden');
  }
  if (!caps.localStorage) {
    console.warn(
      '[browser-compat] localStorage unavailable — settings will not persist between sessions'
    );
  }
  return true;
}
