/**
 * personalization.ts — accent colour + light/dark mode for the Comm App.
 *
 * Mirrors the Companion App's personalization service (src/app/services/
 * personalization.ts) so the ANTON suite shares one mental model.
 *
 * Two runtime axes, both persisted to localStorage:
 *   • accent — one of 8 swatches (emerald = ANTON default). Drives every
 *              primary button, accent-tinted surface, the chevron logo
 *              treatment, and the active-tab colour.
 *   • mode   — 'light' (warm-linen canvas) or 'dark' (deep-navy canvas).
 *
 * Applied as <html data-accent="…" data-mode="…"> attributes that
 * `app.css` reacts to. Status colours (red/gold/green/blue) are LOCKED
 * and never change with the accent — that contract lives in the CSS.
 *
 * The module self-applies on import (side effect) so the user's choice
 * is on <html> before React's first paint — no flash of default theme.
 */

export const ACCENTS = [
  { id: 'emerald', label: 'Emerald', sub: 'ANTON standard',     hex: '#0D7D6C' },
  { id: 'ocean',   label: 'Ocean',   sub: 'Calm · focused',     hex: '#1F5FAE' },
  { id: 'sunrise', label: 'Sunrise', sub: 'Warm · optimistic',  hex: '#C97220' },
  { id: 'ember',   label: 'Ember',   sub: 'Bold · expressive',  hex: '#B02E3B' },
  { id: 'plum',    label: 'Plum',    sub: 'Creative · distinct', hex: '#6A3E8F' },
  { id: 'slate',   label: 'Slate',   sub: 'Ink · utilitarian',  hex: '#2D3142' },
  { id: 'forest',  label: 'Forest',  sub: 'Grounded · natural', hex: '#3E6B3A' },
  { id: 'gold',    label: 'Gold',    sub: 'Heritage · formal',  hex: '#A07C26' },
] as const;

export type AccentKey = typeof ACCENTS[number]['id'];
export type AppMode = 'light' | 'dark';

const ACCENT_KEY = 'anton-comm-accent';
const MODE_KEY = 'anton-comm-mode';

const ACCENT_IDS = new Set<string>(ACCENTS.map((a) => a.id));

function readAccent(): AccentKey {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    if (v && ACCENT_IDS.has(v)) return v as AccentKey;
  } catch { /* localStorage may be unavailable */ }
  return 'emerald';
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
  // Track the mobile-browser chrome colour to the canvas.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0F1B2D' : '#F5F3EF');
}

// ── Public API ───────────────────────────────────────────────────────

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
