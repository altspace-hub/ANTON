// tokens.jsx — three design directions for the ANTON Companion App
// Each direction is a self-contained color+type token set that screens consume.
// Direction IDs: "evolution", "editorial", "instrument"
//
// Each token group exposes the same keys so <Screen dir={tok}/> can swap directions.

const DIRECTIONS = {
  // ─────────────────────────────────────────────────────────────
  // Evolution — faithful to the current ANTON light theme.
  // Same deep teal, warm linen, same density. Just cleaner bones,
  // tighter primitives, quieter chrome.
  // ─────────────────────────────────────────────────────────────
  evolution: {
    id: 'evolution',
    label: 'Evolution',
    tagline: 'Same app, better bones',
    desc: 'Keeps the deep teal + warm linen. Restricts color to primary action and live state. Reworks chrome so content leads.',
    font: `"Inter", "Helvetica Neue", system-ui, sans-serif`,
    fontMono: `"JetBrains Mono", ui-monospace, monospace`,
    // canvas
    bg: '#F5F3EF',          // warm linen (adv-dark)
    surface: '#FFFFFF',     // cards
    surfaceAlt: '#FAFAF8',  // header / raised
    surfaceMuted: '#EFECE5',
    // text
    text: '#1A1B2E',
    textBody: '#3B3D50',
    textMuted: '#636577',
    textFaint: '#878999',
    // lines
    border: '#DDD9D2',
    borderSoft: '#EAE7E0',
    // brand
    accent: '#0D7D6C',          // brand teal (locked)
    accentDark: '#06655A',
    accentDim: '#D5F0EB',
    accentSoft: '#E5F5F2',
    accentFg: '#FFFFFF',
    // status
    gold: '#C8842B',
    goldDim: '#F7ECD9',
    red: '#C7361F',
    redDim: '#F9E2DD',
    green: '#1F8A5C',
    greenDim: '#DCEEE4',
    blue: '#3070C7',
    blueDim: '#DEE8F6',
    // radii
    r1: 8, r2: 12, r3: 16, r4: 22,
    // density
    density: 'default',
  },

  // ─────────────────────────────────────────────────────────────
  // Editorial — calmer. Teal becomes punctuation, not wallpaper.
  // Warmer linen expanded across surfaces. Bigger type, more air.
  // Makes approvals feel serious and deliberate.
  // ─────────────────────────────────────────────────────────────
  editorial: {
    id: 'editorial',
    label: 'Editorial',
    tagline: 'Quiet authority',
    desc: 'Restricts teal to primary action + live status. Warm grays do the rest. Larger type, editorial rhythm, paper-like surfaces. Best for CISO-grade approvals.',
    font: `"Inter", "Helvetica Neue", system-ui, sans-serif`,
    fontDisplay: `"Fraunces", "Inter", serif`, // used only in approvals narrative
    fontMono: `"JetBrains Mono", ui-monospace, monospace`,
    bg: '#F0ECE2',
    surface: '#FBF8F1',
    surfaceAlt: '#F5F1E6',
    surfaceMuted: '#EAE5D8',
    text: '#1C1A14',
    textBody: '#3C382C',
    textMuted: '#6B6456',
    textFaint: '#9A9380',
    border: '#D8D2C0',
    borderSoft: '#E5DFCD',
    accent: '#0B6F5E',
    accentDark: '#055447',
    accentDim: '#D1EAE2',
    accentSoft: '#E4F1EC',
    accentFg: '#FBF8F1',
    gold: '#B07326',
    goldDim: '#F1E3C8',
    red: '#B82E1A',
    redDim: '#F4DAD2',
    green: '#1F7A50',
    greenDim: '#D3E8D9',
    blue: '#29609E',
    blueDim: '#D6E2F1',
    r1: 10, r2: 14, r3: 20, r4: 28,
    density: 'loose',
  },

  // ─────────────────────────────────────────────────────────────
  // Instrument — darker, monospaced, Apple-Wallet-like stacking.
  // Near-black ink on cool off-white, with a deep signal-green.
  // Leans into "secure instrument" identity — for CISOs + NGO ops.
  // ─────────────────────────────────────────────────────────────
  instrument: {
    id: 'instrument',
    label: 'Instrument',
    tagline: 'Confident remote',
    desc: 'Cool off-white canvas, near-black ink, signal green only for live state. Mono for keys, hashes and codes. Card-stacked like Apple Wallet. Feels like a secure instrument.',
    font: `"Inter", "Helvetica Neue", system-ui, sans-serif`,
    fontMono: `"JetBrains Mono", "SF Mono", ui-monospace, monospace`,
    bg: '#ECECEC',
    surface: '#FFFFFF',
    surfaceAlt: '#F5F5F5',
    surfaceMuted: '#E4E4E4',
    text: '#0A0A0A',
    textBody: '#1F1F1F',
    textMuted: '#595959',
    textFaint: '#8A8A8A',
    border: '#D1D1D1',
    borderSoft: '#E5E5E5',
    accent: '#0A0A0A',        // primary is ink
    accentDark: '#000000',
    accentDim: '#E5E5E5',
    accentSoft: '#F0F0F0',
    accentFg: '#FFFFFF',
    // signal green reserved for live/connected state only
    signal: '#0A8F5F',
    signalDim: '#DBEDE3',
    gold: '#A6751C',
    goldDim: '#F0E4CA',
    red: '#B02A18',
    redDim: '#F2D5CF',
    green: '#0A8F5F',
    greenDim: '#DBEDE3',
    blue: '#1A4C8C',
    blueDim: '#D5E0EF',
    r1: 6, r2: 10, r3: 14, r4: 18,
    density: 'tight',
  },
};

// Padding scale by density
function pad(tok, size) {
  const scale = tok.density === 'loose' ? 1.15 : tok.density === 'tight' ? 0.88 : 1;
  return Math.round(size * scale);
}

// ── Accent palette — user-selectable personal color ─────────
// Each accent keeps the same role as "brand teal" in Evolution:
// used for primary action, live/pulse dots, highlight chips.
// We pair each accent with its own dim/soft tints tuned by hand so
// contrast and warmth track the hue.
const ACCENTS = {
  emerald: {
    id: 'emerald', label: 'Emerald', sub: 'ANTON standard',
    accent: '#0D7D6C', accentDark: '#06655A',
    accentDim: '#D5F0EB', accentSoft: '#E5F5F2', accentFg: '#FFFFFF',
  },
  ocean: {
    id: 'ocean', label: 'Ocean', sub: 'Finance · calm',
    accent: '#1F5FAE', accentDark: '#174880',
    accentDim: '#D5E2F2', accentSoft: '#E8EFF9', accentFg: '#FFFFFF',
  },
  sunrise: {
    id: 'sunrise', label: 'Sunrise', sub: 'Warm · optimistic',
    accent: '#C97220', accentDark: '#A15A15',
    accentDim: '#F5DDC0', accentSoft: '#FBEEDB', accentFg: '#FFFFFF',
  },
  ember: {
    id: 'ember', label: 'Ember', sub: 'Counsel · bold',
    accent: '#B02E3B', accentDark: '#8A1F2A',
    accentDim: '#F0CDD1', accentSoft: '#F8E2E4', accentFg: '#FFFFFF',
  },
  plum: {
    id: 'plum', label: 'Plum', sub: 'Creative · distinct',
    accent: '#6A3E8F', accentDark: '#522D71',
    accentDim: '#E0D0ED', accentSoft: '#EEE3F5', accentFg: '#FFFFFF',
  },
  slate: {
    id: 'slate', label: 'Slate', sub: 'Ink · utilitarian',
    accent: '#2D3142', accentDark: '#1A1C2A',
    accentDim: '#D3D6DC', accentSoft: '#E6E8EC', accentFg: '#FFFFFF',
  },
  forest: {
    id: 'forest', label: 'Forest', sub: 'NGO · grounded',
    accent: '#3E6B3A', accentDark: '#2C4F2A',
    accentDim: '#D4E2D1', accentSoft: '#E5EEE3', accentFg: '#FFFFFF',
  },
  gold: {
    id: 'gold', label: 'Gold', sub: 'Heritage · formal',
    accent: '#A07C26', accentDark: '#7E5F15',
    accentDim: '#EADFBE', accentSoft: '#F3EDD6', accentFg: '#FFFFFF',
  },
};

// Apply an accent on top of a base direction token set — returns a new token object.
function withAccent(baseTok, accentKey) {
  const a = ACCENTS[accentKey] || ACCENTS.emerald;
  return { ...baseTok, ...a, accentKey: a.id };
}

Object.assign(window, { DIRECTIONS, ACCENTS, withAccent, pad });
