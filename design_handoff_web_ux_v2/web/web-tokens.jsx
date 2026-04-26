// web-tokens.jsx — design tokens for the ANTON web UX
// Extends the companion app's Evolution system for larger screens.
//
// Same accent palette, same status colours, same Inter + JetBrains Mono.
// Differences from companion:
//  - Denser spacing (web has more room; don't waste it, but be generous)
//  - Adds "dark" and "corporate" themes so we can show all three modes
//  - Adds web-specific surface tokens (sidebar, topbar, split rails)

const WEB_THEMES = {
  light: {
    id: 'light',
    label: 'Light',
    bg: '#F5F3EF',               // warm linen — same as companion
    bgDeep: '#EFECE5',           // behind floating panels
    surface: '#FFFFFF',
    surfaceAlt: '#FAFAF8',
    surfaceRaised: '#FFFFFF',
    surfaceMuted: '#EFECE5',
    sidebar: '#F9F7F2',          // slightly warmer than bg
    sidebarHover: '#F1EEE7',
    topbar: '#FFFFFF',
    rail: '#FAFAF8',             // right-rail panels
    text: '#1A1B2E',
    textBody: '#3B3D50',
    textMuted: '#636577',
    textFaint: '#878999',
    border: '#DDD9D2',
    borderSoft: '#EAE7E0',
    borderStrong: '#C9C4BA',
    shadow: '0 1px 2px rgba(26,27,46,0.04), 0 4px 12px rgba(26,27,46,0.04)',
    shadowLg: '0 4px 8px rgba(26,27,46,0.06), 0 12px 32px rgba(26,27,46,0.08)',
  },
  dark: {
    id: 'dark',
    label: 'Dark',
    // Calmer, neutral dark — less blue, higher contrast text
    bg: '#121316',
    bgDeep: '#0B0C0E',
    surface: '#1A1B1F',
    surfaceAlt: '#1F2024',
    surfaceRaised: '#22242A',
    surfaceMuted: '#17181B',
    sidebar: '#141518',
    sidebarHover: '#1F2024',
    topbar: '#17181B',
    rail: '#1A1B1F',
    text: '#F5F5F4',
    textBody: '#D0D0CC',
    textMuted: '#93938E',
    textFaint: '#5C5C58',
    border: '#2A2B2F',
    borderSoft: '#1F2024',
    borderStrong: '#3A3B40',
    shadow: '0 1px 2px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.3)',
    shadowLg: '0 4px 8px rgba(0,0,0,0.45), 0 12px 32px rgba(0,0,0,0.5)',
  },
  corporate: {
    id: 'corporate',
    label: 'Corporate',
    bg: '#F3F5F9',               // cool off-white
    bgDeep: '#E7EAF0',
    surface: '#FFFFFF',
    surfaceAlt: '#F7F9FC',
    surfaceRaised: '#FFFFFF',
    surfaceMuted: '#E9ECF2',
    sidebar: '#F6F8FB',
    sidebarHover: '#ECEFF5',
    topbar: '#FFFFFF',
    rail: '#F7F9FC',
    text: '#111827',
    textBody: '#1F2937',
    textMuted: '#4B5563',
    textFaint: '#6B7280',
    border: '#D8DDE5',
    borderSoft: '#E5E9F0',
    borderStrong: '#BEC5D1',
    shadow: '0 1px 2px rgba(17,24,39,0.04), 0 4px 12px rgba(17,24,39,0.05)',
    shadowLg: '0 4px 8px rgba(17,24,39,0.06), 0 12px 32px rgba(17,24,39,0.08)',
  },
};

// Accents — same palette as companion, so personal colour stays consistent
// across devices. Each has light-theme and dark-theme variants for soft tints.
const WEB_ACCENTS = {
  emerald: {
    id: 'emerald', label: 'Emerald',
    accent: '#0D7D6C', accentHover: '#0A6E5F', accentDark: '#06655A',
    accentDim: { light: '#D5F0EB', dark: '#1A3A34', corporate: '#D5F0EB' },
    accentSoft: { light: '#E5F5F2', dark: '#122623', corporate: '#E5F5F2' },
    accentFg: '#FFFFFF',
  },
  ocean: {
    id: 'ocean', label: 'Ocean',
    accent: '#1F5FAE', accentHover: '#1B5499', accentDark: '#174880',
    accentDim: { light: '#D5E2F2', dark: '#172B44', corporate: '#D5E2F2' },
    accentSoft: { light: '#E8EFF9', dark: '#101B2C', corporate: '#E8EFF9' },
    accentFg: '#FFFFFF',
  },
  sunrise: {
    id: 'sunrise', label: 'Sunrise',
    accent: '#C97220', accentHover: '#B36619', accentDark: '#A15A15',
    accentDim: { light: '#F5DDC0', dark: '#402910', corporate: '#F5DDC0' },
    accentSoft: { light: '#FBEEDB', dark: '#2B1B0B', corporate: '#FBEEDB' },
    accentFg: '#FFFFFF',
  },
  ember: {
    id: 'ember', label: 'Ember',
    accent: '#B02E3B', accentHover: '#992834', accentDark: '#8A1F2A',
    accentDim: { light: '#F0CDD1', dark: '#401820', corporate: '#F0CDD1' },
    accentSoft: { light: '#F8E2E4', dark: '#2B1014', corporate: '#F8E2E4' },
    accentFg: '#FFFFFF',
  },
  plum: {
    id: 'plum', label: 'Plum',
    accent: '#6A3E8F', accentHover: '#5C3579', accentDark: '#522D71',
    accentDim: { light: '#E0D0ED', dark: '#2A1A3A', corporate: '#E0D0ED' },
    accentSoft: { light: '#EEE3F5', dark: '#1C1126', corporate: '#EEE3F5' },
    accentFg: '#FFFFFF',
  },
  slate: {
    id: 'slate', label: 'Slate',
    accent: '#2D3142', accentHover: '#242835', accentDark: '#1A1C2A',
    accentDim: { light: '#D3D6DC', dark: '#343844', corporate: '#D3D6DC' },
    accentSoft: { light: '#E6E8EC', dark: '#1F2128', corporate: '#E6E8EC' },
    accentFg: '#FFFFFF',
  },
  forest: {
    id: 'forest', label: 'Forest',
    accent: '#3E6B3A', accentHover: '#355D32', accentDark: '#2C4F2A',
    accentDim: { light: '#D4E2D1', dark: '#1A2E18', corporate: '#D4E2D1' },
    accentSoft: { light: '#E5EEE3', dark: '#121F11', corporate: '#E5EEE3' },
    accentFg: '#FFFFFF',
  },
  gold: {
    id: 'gold', label: 'Gold',
    accent: '#A07C26', accentHover: '#8C6C20', accentDark: '#7E5F15',
    accentDim: { light: '#EADFBE', dark: '#3A2E12', corporate: '#EADFBE' },
    accentSoft: { light: '#F3EDD6', dark: '#26200D', corporate: '#F3EDD6' },
    accentFg: '#FFFFFF',
  },
};

// Status colours — never change with accent
const WEB_STATUS = {
  light: {
    gold: '#C8842B', goldDim: '#F7ECD9', goldSoft: '#FCF5E8',
    red: '#C7361F', redDim: '#F9E2DD', redSoft: '#FCEFEB',
    green: '#1F8A5C', greenDim: '#DCEEE4', greenSoft: '#EEF6F1',
    blue: '#3070C7', blueDim: '#DEE8F6', blueSoft: '#EFF4FA',
  },
  dark: {
    gold: '#E0A050', goldDim: '#3A2D13', goldSoft: '#27200C',
    red: '#E5573F', redDim: '#3A1915', redSoft: '#26110E',
    green: '#3FBD85', greenDim: '#13301F', greenSoft: '#0C1F14',
    blue: '#5F9AE0', blueDim: '#1A2A3E', blueSoft: '#0F1A29',
  },
  corporate: {
    gold: '#C8842B', goldDim: '#F7ECD9', goldSoft: '#FCF5E8',
    red: '#C7361F', redDim: '#F9E2DD', redSoft: '#FCEFEB',
    green: '#1F8A5C', greenDim: '#DCEEE4', greenSoft: '#EEF6F1',
    blue: '#3070C7', blueDim: '#DEE8F6', blueSoft: '#EFF4FA',
  },
};

// Typography, radii, density — shared across themes
const WEB_TYPE = {
  font: `"Inter", "Helvetica Neue", system-ui, sans-serif`,
  fontMono: `"JetBrains Mono", ui-monospace, monospace`,
  fontDisplay: `"Inter", system-ui, sans-serif`,
};

const WEB_RADII = {
  r1: 6, r2: 10, r3: 14, r4: 20,
};

// Compose a single token set for a theme + accent
function buildWebTok(themeKey = 'light', accentKey = 'emerald') {
  const theme = WEB_THEMES[themeKey] || WEB_THEMES.light;
  const accent = WEB_ACCENTS[accentKey] || WEB_ACCENTS.emerald;
  const status = WEB_STATUS[themeKey] || WEB_STATUS.light;
  return {
    ...theme,
    ...status,
    ...WEB_TYPE,
    ...WEB_RADII,
    theme: theme.id,
    accentKey: accent.id,
    accent: accent.accent,
    accentHover: accent.accentHover,
    accentDark: accent.accentDark,
    accentDim: accent.accentDim[themeKey] || accent.accentDim.light,
    accentSoft: accent.accentSoft[themeKey] || accent.accentSoft.light,
    accentFg: accent.accentFg,
  };
}

Object.assign(window, { WEB_THEMES, WEB_ACCENTS, WEB_STATUS, buildWebTok });
