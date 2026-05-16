/**
 * personalization.ts — accent colour + light/dark mode for the Pay app.
 *
 * Mirrors the Business app's personalization service so the ANTON
 * suite shares one mental model. Two runtime axes, both persisted to
 * localStorage:
 *   • accent — one of 8 swatches (sunrise = Pay signature default).
 *   • mode   — 'light' (warm-linen canvas) or 'dark' (deep-navy canvas).
 *
 * Applied as <html data-accent="…" data-mode="…"> attributes that
 * `app.css` reacts to. Self-applies on import so the choice is on
 * <html> before React's first paint — no flash of default theme.
 */

export const ACCENTS = [
  { id: 'sunrise', label: 'Sunrise', hex: '#C97220' },
  { id: 'teal',    label: 'Teal',    hex: '#0D7D6C' },
  { id: 'blue',    label: 'Blue',    hex: '#3070C7' },
  { id: 'ocean',   label: 'Ocean',   hex: '#1F5FAE' },
  { id: 'ember',   label: 'Ember',   hex: '#B02E3B' },
  { id: 'plum',    label: 'Plum',    hex: '#6A3E8F' },
  { id: 'slate',   label: 'Slate',   hex: '#2D3142' },
  { id: 'forest',  label: 'Forest',  hex: '#3E6B3A' },
] as const;

export type AccentKey = typeof ACCENTS[number]['id'];
export type AppMode = 'light' | 'dark';

const ACCENT_KEY = 'anton-pay-accent';
const MODE_KEY = 'anton-pay-mode';

const ACCENT_IDS = new Set<string>(ACCENTS.map((a) => a.id));

function readAccent(): AccentKey {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    if (v && ACCENT_IDS.has(v)) return v as AccentKey;
  } catch { /* localStorage may be unavailable */ }
  return 'sunrise';
}

function readMode(): AppMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* localStorage may be unavailable */ }
  return 'light';
}

function applyAccent(accent: AccentKey): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-accent', accent);
}

function applyMode(mode: AppMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-mode', mode);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0F1B2D' : '#F5F3EF');
}

export function getAccent(): AccentKey {
  return readAccent();
}

export function setAccent(accent: AccentKey): void {
  try { localStorage.setItem(ACCENT_KEY, accent); } catch { /* ignore */ }
  applyAccent(accent);
}

export function getMode(): AppMode {
  return readMode();
}

export function setMode(mode: AppMode): void {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  applyMode(mode);
}

/** Apply persisted choices to <html>. Called once on module import so
 *  the theme is set before React renders. Safe to call again. */
export function applyPersonalization(): void {
  applyAccent(readAccent());
  applyMode(readMode());
}

// Self-apply on import — keep this LAST so the functions above exist.
applyPersonalization();
