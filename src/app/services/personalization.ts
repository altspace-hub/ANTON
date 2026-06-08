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

/** Display size — fit the app to any device (it was laid out for a tall phone).
 *  'auto' is responsive (full-width on phones, a centred column on tablets); the
 *  rest override the UI scale + column width via --app-scale / --app-max-width in
 *  app.css (driven by <html data-display="…">). Orthogonal to the pro/standard
 *  data-mode (which sets the base font 14px/16px). */
export const DISPLAY_SIZES = [
  { id: 'auto',     label: 'Automatic', sub: 'Adapts to your screen width' },
  { id: 'compact',  label: 'Compact',   sub: 'Smaller · fits more' },
  { id: 'standard', label: 'Standard',  sub: 'Default size' },
  { id: 'large',    label: 'Large',     sub: 'Bigger text' },
  { id: 'tablet',   label: 'Tablet',    sub: 'Wider column' },
] as const;
export type DisplaySize = typeof DISPLAY_SIZES[number]['id'];

const ACCENT_KEY = 'anton-companion-accent';
const MODE_KEY   = 'anton-companion-mode';
const DISPLAY_KEY = 'anton-companion-display';

const ACCENT_IDS = new Set<string>(ACCENTS.map(a => a.id));
const DISPLAY_IDS = new Set<string>(DISPLAY_SIZES.map(d => d.id));

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

function readDisplay(): DisplaySize {
  try {
    const v = localStorage.getItem(DISPLAY_KEY);
    if (v && DISPLAY_IDS.has(v)) return v as DisplaySize;
  } catch { /* localStorage may be unavailable */ }
  return 'auto';
}

function applyDisplay(size: DisplaySize): void {
  // 'auto' = the responsive CSS default → no attribute (keeps the :root values).
  if (size === 'auto') document.documentElement.removeAttribute('data-display');
  else document.documentElement.setAttribute('data-display', size);
}

// ── Imperative getters/setters ──────────────────────────────────

export function getAccent(): AccentKey { return readAccent(); }
export function getMode(): AppMode     { return readMode(); }
export function getDisplaySize(): DisplaySize { return readDisplay(); }

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

export function setDisplaySize(size: DisplaySize): void {
  try { localStorage.setItem(DISPLAY_KEY, size); } catch { /* ignore */ }
  applyDisplay(size);
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
applyDisplay(readDisplay());
