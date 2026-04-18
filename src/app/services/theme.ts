/**
 * theme.ts — DEPRECATED shim.
 *
 * Old companion app had three themes (dark / light / corporate). The
 * Evolution redesign is light-only, so themes were replaced by
 * `personalization.ts` (accent + app mode). This module is kept solely
 * so the old call sites (e.g. ProfilePage's appearance picker) compile
 * during the migration. Remove once those screens are rewritten in the
 * Phase 5 auth/onboarding refresh.
 *
 * Side-effect import here triggers personalization to apply the user's
 * accent + mode to <html> before React renders (parity with the old
 * `import './services/theme'` in main.tsx).
 */

import './personalization';

export type AppTheme = 'light';

export function getTheme(): AppTheme { return 'light'; }

export function setTheme(_theme: AppTheme): void {
  /* no-op — themes are gone; use setAccent / setMode from personalization.ts */
}

export function applyTheme(_theme: AppTheme): void { /* no-op */ }
