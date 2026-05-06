/**
 * logo-skin.ts — runtime switch between the three Companion App brand marks.
 *
 *   - 'a-letter'      — original soft-teal tile with bold "A" letter
 *   - 'green-chevron' — solid teal tile, three white chevrons rising in opacity (default)
 *   - 'cream-chevron' — cream tile, three navy chevrons (signature / restrained)
 *
 * Persisted in localStorage so the choice survives reloads. The Settings
 * page exposes a three-way picker; the WelcomePage + any in-app logo
 * spots subscribe via `onLogoSkinChange` and re-render on change.
 *
 * Note: this controls IN-APP logo rendering only. The Android launcher
 * icon is fixed at build-time (currently the green-chevron — see
 * `android/app/src/main/res/mipmap-*`) and cannot be swapped at runtime
 * without `<activity-alias>` hacks that we explicitly skipped.
 */

export type LogoSkin = 'a-letter' | 'green-chevron' | 'cream-chevron';

export const DEFAULT_LOGO_SKIN: LogoSkin = 'green-chevron';

const STORAGE_KEY = 'anton-companion-logo-skin';

/** Human-readable label for each skin. Used in the Settings picker. */
export const LOGO_SKIN_LABELS: Record<LogoSkin, string> = {
  'a-letter':      'Letter A',
  'green-chevron': 'Green chevron',
  'cream-chevron': 'Cream chevron',
};

const listeners = new Set<(s: LogoSkin) => void>();

export function getLogoSkin(): LogoSkin {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'a-letter' || v === 'green-chevron' || v === 'cream-chevron') return v;
  } catch { /* private mode / quota */ }
  return DEFAULT_LOGO_SKIN;
}

export function setLogoSkin(skin: LogoSkin): void {
  try { localStorage.setItem(STORAGE_KEY, skin); } catch { /* swallow */ }
  for (const cb of listeners) {
    try { cb(skin); } catch { /* swallow — one bad listener shouldn't break others */ }
  }
}

/** Subscribe to skin changes. Returns an unsubscribe function. */
export function onLogoSkinChange(cb: (s: LogoSkin) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
