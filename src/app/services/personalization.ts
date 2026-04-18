/**
 * Personalization — accent colour + app mode for the companion app.
 *
 * Two runtime axes, both persisted to localStorage:
 *   • accent  — one of 8 swatches (emerald default). Drives every primary
 *               button, live/pulse dot, and accent-tinted surface.
 *   • mode    — 'pro' (full cockpit) or 'standard' (simplified).
 *
 * Applied as <html data-accent="..." data-mode="..."> attributes that
 * `app.css` reacts to. Status colours (red/gold/green/blue) are LOCKED
 * and never change with the accent — that contract lives in the CSS.
 */

export const ACCENTS = [
  { id: 'emerald', label: 'Emerald', sub: 'ANTON standard',     hex: '#0D7D6C' },
  { id: 'ocean',   label: 'Ocean',   sub: 'Finance · calm',      hex: '#1F5FAE' },
  { id: 'sunrise', label: 'Sunrise', sub: 'Warm · optimistic',   hex: '#C97220' },
  { id: 'ember',   label: 'Ember',   sub: 'Counsel · bold',      hex: '#B02E3B' },
  { id: 'plum',    label: 'Plum',    sub: 'Creative · distinct', hex: '#6A3E8F' },
  { id: 'slate',   label: 'Slate',   sub: 'Ink · utilitarian',   hex: '#2D3142' },
  { id: 'forest',  label: 'Forest',  sub: 'NGO · grounded',      hex: '#3E6B3A' },
  { id: 'gold',    label: 'Gold',    sub: 'Heritage · formal',   hex: '#A07C26' },
] as const;

export type AccentKey = typeof ACCENTS[number]['id'];
export type AppMode   = 'pro' | 'standard';

const ACCENT_KEY = 'anton-companion-accent';
const MODE_KEY   = 'anton-companion-mode';

const ACCENT_IDS = new Set<string>(ACCENTS.map(a => a.id));

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
    if (v === 'pro' || v === 'standard') return v;
  } catch { /* localStorage may be unavailable */ }
  return 'pro';
}

function applyAccent(accent: AccentKey): void {
  document.documentElement.setAttribute('data-accent', accent);
}

function applyMode(mode: AppMode): void {
  document.documentElement.setAttribute('data-mode', mode);
  // Update the mobile-browser chrome colour to track the canvas
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#F5F3EF');
}

// ── Imperative getters/setters ──────────────────────────────────

export function getAccent(): AccentKey { return readAccent(); }
export function getMode(): AppMode     { return readMode(); }

export function setAccent(accent: AccentKey): void {
  try { localStorage.setItem(ACCENT_KEY, accent); } catch { /* ignore */ }
  applyAccent(accent);
  notify();
}

export function setMode(mode: AppMode): void {
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  applyMode(mode);
  notify();
}

// ── Listener pattern so React can re-render on change ───────────

type Listener = () => void;
const listeners = new Set<Listener>();

export function onPersonalizationChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notify(): void {
  for (const fn of listeners) {
    try { fn(); } catch { /* swallow listener errors */ }
  }
}

// ── Apply immediately on module load (prevents flash) ───────────

applyAccent(readAccent());
applyMode(readMode());
