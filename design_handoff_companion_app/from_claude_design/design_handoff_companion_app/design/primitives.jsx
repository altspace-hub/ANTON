// primitives.jsx — small shared UI bits used across all companion-app screens.
// Every primitive takes a `tok` (direction token set).

// ─── Icons (lucide-style, 1.75 stroke, 20px) ─────────────────
const Ico = {
  chevronRight: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
  ),
  chevronDown: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
  ),
  chevronLeft: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
  ),
  check: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
  ),
  x: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
  ),
  shield: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
  ),
  shieldCheck: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
  ),
  fingerprint: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 17.5c.9-1.4 1.5-3.4 1.5-5.5a4 4 0 018 0c0 2 .6 4 1.5 5.5"/><path d="M3 12a9 9 0 0118 0c0 3-.5 5.5-1.5 7.5"/><path d="M8 22c1-1 2-3 2-6"/><path d="M12 12v2a6 6 0 0012 0"/></svg>
  ),
  qr: (c = 'currentColor', s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14v3M17 20h3v1"/></svg>
  ),
  mic: (c = 'currentColor', s = 20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>
  ),
  camera: (c = 'currentColor', s = 20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
  ),
  bell: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>
  ),
  grid: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
  ),
  search: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></svg>
  ),
  home: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>
  ),
  message: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H8l-4 4V5a2 2 0 012-2h13a2 2 0 012 2z"/></svg>
  ),
  inbox: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v7a2 2 0 01-2 2H4a2 2 0 01-2-2v-7z"/></svg>
  ),
  more: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><circle cx="5" cy="12" r="1.5" fill={c} stroke="none"/><circle cx="12" cy="12" r="1.5" fill={c} stroke="none"/><circle cx="19" cy="12" r="1.5" fill={c} stroke="none"/></svg>
  ),
  plus: (c = 'currentColor', s = 20) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
  ),
  wifi: (c = 'currentColor', s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5 8.5a16 16 0 0121 0"/><path d="M5 12a11 11 0 0114 0"/><path d="M8.5 15.5a6 6 0 017 0"/><circle cx="12" cy="19" r="1" fill={c}/></svg>
  ),
  dot: (c = 'currentColor', s = 8) => (
    <svg width={s} height={s} viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill={c}/></svg>
  ),
  arrowUp: (c = 'currentColor', s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
  ),
  key: (c = 'currentColor', s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="14" r="4"/><path d="M10.5 11.5L21 1l-2.5 2.5M15 7l3 3M13 9l3 3"/></svg>
  ),
  alert: (c = 'currentColor', s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>
  ),
  sparkles: (c = 'currentColor', s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z"/></svg>
  ),
};

// ─── Button — primary / secondary / ghost ─────────────────────
function Btn({ tok, variant = 'primary', children, block, icon, style = {}, size = 'md' }) {
  const pads = size === 'sm' ? '8px 14px' : size === 'lg' ? '14px 20px' : '12px 18px';
  const fs = size === 'sm' ? 13 : size === 'lg' ? 16 : 14;
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: pads, fontSize: fs, fontWeight: 600, letterSpacing: -0.1,
    borderRadius: tok.r1, border: '1px solid transparent',
    fontFamily: tok.font, cursor: 'pointer',
    width: block ? '100%' : 'auto',
    lineHeight: 1,
    ...style,
  };
  if (variant === 'primary') {
    return <button style={{ ...base, background: tok.accent, color: tok.accentFg, borderColor: tok.accent }}>{icon}{children}</button>;
  }
  if (variant === 'ghost') {
    return <button style={{ ...base, background: 'transparent', color: tok.textBody, borderColor: tok.border }}>{icon}{children}</button>;
  }
  if (variant === 'danger') {
    return <button style={{ ...base, background: tok.red, color: '#fff', borderColor: tok.red }}>{icon}{children}</button>;
  }
  // secondary
  return <button style={{ ...base, background: tok.surface, color: tok.text, borderColor: tok.border }}>{icon}{children}</button>;
}

// ─── Card ─────────────────────────────────────────────────────
function Card({ tok, children, style = {}, p = 16, hover = false }) {
  return (
    <div style={{
      background: tok.surface, border: `1px solid ${tok.border}`,
      borderRadius: tok.r2, padding: p, ...style,
    }}>{children}</div>
  );
}

// ─── Badge / pill ─────────────────────────────────────────────
function Pill({ tok, tone = 'neutral', children, style = {}, mono }) {
  const tones = {
    neutral: { bg: tok.surfaceAlt, fg: tok.textBody, bd: tok.border },
    teal:    { bg: tok.accentSoft, fg: tok.accent, bd: tok.accentDim },
    gold:    { bg: tok.goldDim, fg: tok.gold, bd: tok.goldDim },
    red:     { bg: tok.redDim, fg: tok.red, bd: tok.redDim },
    green:   { bg: tok.greenDim, fg: tok.green, bd: tok.greenDim },
    blue:    { bg: tok.blueDim, fg: tok.blue, bd: tok.blueDim },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', fontSize: 11, fontWeight: 600,
      letterSpacing: mono ? 0 : 0.2,
      fontFamily: mono ? tok.fontMono : tok.font,
      background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
      borderRadius: 999, whiteSpace: 'nowrap',
      ...style,
    }}>{children}</span>
  );
}

// ─── Status dot ───────────────────────────────────────────────
function StatusDot({ tok, tone = 'green', size = 8, pulse = false }) {
  const c = { green: tok.green, gold: tok.gold, red: tok.red, gray: tok.textFaint }[tone];
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: c, position: 'relative',
      boxShadow: pulse ? `0 0 0 3px ${c}22` : 'none',
    }} />
  );
}

// ─── Section label (mono/uppercase) ───────────────────────────
function SectionLabel({ tok, children, style = {} }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: 0.8, color: tok.textMuted,
      fontFamily: tok.fontMono,
      ...style,
    }}>{children}</div>
  );
}

// ─── Avatar (flat, no image) ──────────────────────────────────
function Avatar({ tok, initials = 'AB', size = 36, color }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color || tok.accentSoft,
      color: color ? '#fff' : tok.accent,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: tok.font, fontSize: size * 0.36, fontWeight: 600,
      letterSpacing: -0.2, flexShrink: 0,
    }}>{initials}</div>
  );
}

Object.assign(window, { Ico, Btn, Card, Pill, StatusDot, SectionLabel, Avatar });
