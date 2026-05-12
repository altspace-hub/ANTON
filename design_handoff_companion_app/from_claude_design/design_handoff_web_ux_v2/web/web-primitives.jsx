// web-primitives.jsx — shared UI for the ANTON web designs.
// Every primitive takes `tok` (web token object) and adapts to theme + accent.

// ─── Lucide-style icons, 1.5 stroke (web uses 16–18px default) ─────
const WIco = {
  chevronRight: (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>),
  chevronDown:  (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>),
  chevronLeft:  (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>),
  check:        (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>),
  x:            (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>),
  search:       (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></svg>),
  home:         (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>),
  message:      (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h13a2 2 0 012 2z"/></svg>),
  inbox:        (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v7a2 2 0 01-2 2H4a2 2 0 01-2-2v-7l3.5-7z"/></svg>),
  calendar:     (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>),
  grid:         (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>),
  briefcase:    (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>),
  academic:     (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>),
  heart:        (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>),
  users:        (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8"/></svg>),
  chart:        (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></svg>),
  wallet:       (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-4"/><path d="M16 12h6v4h-6a2 2 0 010-4z"/></svg>),
  compass:      (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16.2 7.8l-2.9 6.4-6.4 2.8 2.8-6.4 6.5-2.8z"/></svg>),
  terminal:     (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17l6-6-6-6M12 19h8"/></svg>),
  book:         (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4a2 2 0 012-2h14v20H6a2 2 0 01-2-2z"/><path d="M6 2v20M20 7H6"/></svg>),
  shield:       (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>),
  scale:        (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M5 6h14M6 6l-3 8a4 4 0 008 0zM18 6l-3 8a4 4 0 008 0z"/></svg>),
  checklist:    (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>),
  folder:       (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>),
  radar:        (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill={c} stroke="none"/><path d="M12 12l4-7"/></svg>),
  more:         (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.5" fill={c}/><circle cx="12" cy="12" r="1.5" fill={c}/><circle cx="19" cy="12" r="1.5" fill={c}/></svg>),
  moreV:        (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="1.5" fill={c}/><circle cx="12" cy="12" r="1.5" fill={c}/><circle cx="12" cy="19" r="1.5" fill={c}/></svg>),
  plus:         (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>),
  sparkles:     (c='currentColor', s=14) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg>),
  star:         (c='currentColor', s=14) => (<svg width={s} height={s} viewBox="0 0 24 24" fill={c === 'currentColor' ? 'none' : c} stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>),
  bell:         (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>),
  settings:     (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 012.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>),
  command:      (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 3a3 3 0 00-3 3v12a3 3 0 003 3 3 3 0 003-3 3 3 0 00-3-3H6a3 3 0 00-3 3 3 3 0 003 3 3 3 0 003-3V6a3 3 0 00-3-3 3 3 0 00-3 3 3 3 0 003 3h12a3 3 0 003-3 3 3 0 00-3-3z"/></svg>),
  filter:       (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 3H2l8 9.5V19l4 2v-8.5z"/></svg>),
  download:     (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>),
  share:        (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v14"/></svg>),
  history:      (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5M3.05 13A9 9 0 1014 3l-10 10"/><path d="M12 7v5l4 2"/></svg>),
  pin:          (c='currentColor', s=14) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 2h6v4l2 4H7l2-4z"/><path d="M7 10h10v4a5 5 0 01-10 0z"/></svg>),
  send:         (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>),
  mic:          (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v4"/></svg>),
  attach:       (c='currentColor', s=16) => (<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.4 11.1L12.5 20a5.5 5.5 0 01-7.8-7.8L13.6 3.3a3.7 3.7 0 015.2 5.2L9.9 17.4a1.8 1.8 0 01-2.6-2.6l8.2-8.2"/></svg>),
};

// ─── Primary button ─────────────────────────────────────────────
function WBtn({ tok, variant = 'primary', size = 'md', children, icon, iconRight, block, onClick, active, disabled, style = {} }) {
  const pads = size === 'sm' ? '6px 11px' : size === 'lg' ? '11px 18px' : '8px 14px';
  const fs = size === 'sm' ? 12 : size === 'lg' ? 14 : 13;
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: pads, fontSize: fs, fontWeight: 500, letterSpacing: -0.05,
    borderRadius: tok.r1, border: '1px solid transparent',
    fontFamily: tok.font, cursor: disabled ? 'not-allowed' : 'pointer',
    width: block ? '100%' : 'auto',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    opacity: disabled ? 0.5 : 1,
    transition: 'background 120ms, border-color 120ms, color 120ms',
  };
  const variants = {
    primary: { background: tok.accent, color: tok.accentFg, border: `1px solid ${tok.accent}` },
    secondary: { background: tok.surface, color: tok.text, border: `1px solid ${tok.border}` },
    ghost: { background: 'transparent', color: tok.textBody, border: '1px solid transparent' },
    danger: { background: tok.red, color: '#fff', border: `1px solid ${tok.red}` },
    subtle: { background: tok.surfaceAlt, color: tok.textBody, border: `1px solid ${tok.borderSoft}` },
    accent: { background: tok.accentSoft, color: tok.accent, border: `1px solid ${tok.accentDim}` },
  };
  const v = variants[variant] || variants.primary;
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...v, ...style }}>
      {icon}{children}{iconRight}
    </button>
  );
}

// ─── Pill / badge ────────────────────────────────────────────────
function WPill({ tok, tone = 'neutral', children, mono, style = {} }) {
  const tones = {
    neutral: { bg: tok.surfaceAlt, fg: tok.textBody, bd: tok.border },
    accent: { bg: tok.accentSoft, fg: tok.accent, bd: tok.accentDim },
    gold: { bg: tok.goldSoft, fg: tok.gold, bd: tok.goldDim },
    red: { bg: tok.redSoft, fg: tok.red, bd: tok.redDim },
    green: { bg: tok.greenSoft, fg: tok.green, bd: tok.greenDim },
    blue: { bg: tok.blueSoft, fg: tok.blue, bd: tok.blueDim },
    solid: { bg: tok.text, fg: tok.surface, bd: tok.text },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 7px', fontSize: 10.5, fontWeight: 500,
      letterSpacing: mono ? 0 : 0.1,
      fontFamily: mono ? tok.fontMono : tok.font,
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      borderRadius: 4, whiteSpace: 'nowrap',
      ...style,
    }}>{children}</span>
  );
}

// ─── Live dot (with pulse halo) ─────────────────────────────────
function WDot({ c, size = 7, pulse }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: c,
      boxShadow: pulse ? `0 0 0 3px ${c}22` : 'none',
    }} />
  );
}

// ─── Section label (mono uppercase) ────────────────────────────
function WSection({ tok, children, right, style = {} }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: 0.6, color: tok.textMuted,
      fontFamily: tok.fontMono,
      ...style,
    }}>
      <span>{children}</span>
      {right}
    </div>
  );
}

// ─── Keyboard shortcut glyph ────────────────────────────────────
function WKbd({ tok, children, style = {} }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 18, height: 18, padding: '0 4px',
      fontSize: 10.5, fontFamily: tok.fontMono, fontWeight: 500,
      color: tok.textMuted, background: tok.surface,
      border: `1px solid ${tok.border}`, borderRadius: 4,
      ...style,
    }}>{children}</span>
  );
}

// ─── ANTON logotype (stylized A) ────────────────────────────────
function WLogo({ tok, size = 22, showWord = true }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <div style={{
        width: size, height: size, borderRadius: 6,
        background: tok.accent, color: tok.accentFg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontFamily: tok.font, fontSize: size * 0.55,
        letterSpacing: -0.5,
      }}>A</div>
      {showWord && <span style={{
        fontWeight: 600, fontSize: 14, color: tok.text, letterSpacing: -0.3,
      }}>Anton</span>}
    </div>
  );
}

Object.assign(window, {
  WIco, WBtn, WPill, WDot, WSection, WKbd, WLogo,
});
