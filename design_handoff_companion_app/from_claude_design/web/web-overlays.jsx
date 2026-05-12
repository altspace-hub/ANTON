// web-overlays.jsx — command palette, notifications panel, shortcuts overlay.
// Rendered as absolutely-positioned layers inside the browser frame.

// ═════════════════════════════════════════════════════════════
//   COMMAND PALETTE (⌘K)
// ═════════════════════════════════════════════════════════════
function WCommandPalette({ tok, query = 'san' }) {
  const sections = [
    {
      label: 'Jump to',
      items: [
        { icon: 'shield', title: 'Sanctions Advisory', sub: 'Module · Financial crime', kbd: 'G S' },
        { icon: 'home', title: 'Home', sub: 'Your brief + recent work', kbd: 'G H' },
        { icon: 'compass', title: 'Pathfinder · AMLR RTS research', sub: 'Thread · live', kbd: null },
      ],
    },
    {
      label: 'Recent sessions',
      items: [
        { icon: 'message', title: 'Futurechain Session Open Ready…', sub: '29 Mar · 15.4k tok', kbd: null },
        { icon: 'shield', title: 'Sanctions policy v4 — Board submission', sub: '18 Mar · think-hard · awaiting review', kbd: null },
      ],
    },
    {
      label: 'Actions',
      items: [
        { icon: 'plus', title: 'New chat', sub: 'Open Chat · blank conversation', kbd: '⌘ N' },
        { icon: 'sparkles', title: 'Ask ANTON — free form', sub: 'Route me to the right module', kbd: '⌘ I' },
        { icon: 'download', title: 'Export current run as DOCX', sub: null, kbd: null },
        { icon: 'settings', title: 'Switch pillar → School', sub: null, kbd: null },
      ],
    },
    {
      label: 'Ask ANTON',
      items: [
        { icon: 'compass', title: `"${query}" — let Pathfinder research it`, sub: 'Search the web + your knowledge base · Thorough', kbd: '↵' },
      ],
    },
  ];

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40,
      background: tok.theme === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(17,24,39,0.35)',
      backdropFilter: 'blur(2px)',
      display: 'flex', justifyContent: 'center', paddingTop: 90,
    }}>
      <div style={{
        width: 580, maxHeight: 520,
        background: tok.surface, border: `1px solid ${tok.border}`,
        borderRadius: 12, boxShadow: tok.shadowLg,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        fontFamily: tok.font,
      }}>
        {/* Input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', borderBottom: `1px solid ${tok.borderSoft}`,
        }}>
          {WIco.command(tok.textMuted, 16)}
          <div style={{ flex: 1, fontSize: 16, color: tok.text, letterSpacing: -0.1 }}>
            {query}<span style={{
              display: 'inline-block', width: 1.5, height: 16, background: tok.accent,
              verticalAlign: -2, marginLeft: 1, animation: 'none',
            }}/>
          </div>
          <WPill tok={tok} tone="neutral">Commands</WPill>
          <WPill tok={tok} tone="accent">Ask</WPill>
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflow: 'auto', padding: '6px 0 10px' }}>
          {sections.map((sec, si) => (
            <div key={si} style={{ marginBottom: 6 }}>
              <div style={{
                padding: '8px 16px 4px',
                fontSize: 10, fontWeight: 600,
                fontFamily: tok.fontMono, letterSpacing: 0.6, textTransform: 'uppercase',
                color: tok.textMuted,
              }}>{sec.label}</div>
              {sec.items.map((it, i) => {
                const isFirst = si === 0 && i === 0;
                const Ic = WIco[it.icon];
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 16px',
                    background: isFirst ? tok.accentSoft : 'transparent',
                    borderLeft: isFirst ? `2px solid ${tok.accent}` : '2px solid transparent',
                    cursor: 'pointer',
                  }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 6,
                      background: isFirst ? tok.accent : tok.surfaceAlt,
                      color: isFirst ? tok.accentFg : tok.textMuted,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{Ic && Ic(isFirst ? tok.accentFg : tok.textMuted, 14)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: tok.text, letterSpacing: -0.1 }}>{it.title}</div>
                      {it.sub && <div style={{ fontSize: 11, color: tok.textMuted, marginTop: 1 }}>{it.sub}</div>}
                    </div>
                    {it.kbd && <WKbd tok={tok}>{it.kbd}</WKbd>}
                    {isFirst && WIco.chevronRight(tok.accent, 14)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 14px', borderTop: `1px solid ${tok.borderSoft}`,
          display: 'flex', alignItems: 'center', gap: 14,
          fontSize: 10.5, color: tok.textMuted, fontFamily: tok.fontMono,
          background: tok.surfaceAlt,
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <WKbd tok={tok}>↑</WKbd><WKbd tok={tok}>↓</WKbd> navigate
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <WKbd tok={tok}>↵</WKbd> select
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <WKbd tok={tok}>⌘↵</WKbd> open in new tab
          </span>
          <div style={{ flex: 1 }} />
          <span>⌘K · Haiku 4.5</span>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
//   NOTIFICATIONS PANEL (top-right dropdown)
// ═════════════════════════════════════════════════════════════
function WNotifPanel({ tok }) {
  const notifs = [
    { ic: 'shield', tone: 'gold',  when: 'just now',  title: 'Sanctions policy v4 ready for review', sub: 'Board submission · 3,523 words · Think Hard' },
    { ic: 'sparkles', tone: 'accent', when: '12 min',  title: 'ANTON drafted a summary of today\'s regulatory updates', sub: '4 items · AMLA, EBA, FATF' },
    { ic: 'users',  tone: 'blue',  when: '1 hr',      title: 'Sara commented on “Orion policy assessment”', sub: '"Can we cite the AMLR final text here?"' },
    { ic: 'radar',  tone: 'red',   when: '3 hr',      title: 'Horizon Radar: 2 new consultations relevant to you', sub: 'Both close within 30 days' },
    { ic: 'checklist', tone: 'green', when: 'yesterday', title: 'Phase 2A · Client Intelligence marked complete', sub: 'ICA Eng 2 · moved to Expert Config' },
  ];
  const toneMap = {
    accent: { bg: tok.accentSoft, fg: tok.accent, bd: tok.accentDim },
    gold: { bg: tok.goldSoft, fg: tok.gold, bd: tok.goldDim },
    red: { bg: tok.redSoft, fg: tok.red, bd: tok.redDim },
    green: { bg: tok.greenSoft, fg: tok.green, bd: tok.greenDim },
    blue: { bg: tok.blueSoft, fg: tok.blue, bd: tok.blueDim },
  };
  return (
    <div style={{
      position: 'absolute', top: 46, right: 10, zIndex: 30,
      width: 380, maxHeight: 560,
      background: tok.surface, border: `1px solid ${tok.border}`,
      borderRadius: 10, boxShadow: tok.shadowLg,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: tok.font,
    }}>
      <div style={{
        padding: '12px 14px', borderBottom: `1px solid ${tok.borderSoft}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Notifications</div>
          <WPill tok={tok} tone="red">3 new</WPill>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          <WBtn tok={tok} variant="ghost" size="sm">Mark all read</WBtn>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '6px 10px', borderBottom: `1px solid ${tok.borderSoft}` }}>
        {['All', 'Mentions', 'Reviews', 'Radar', 'System'].map((t, i) => (
          <div key={t} style={{
            padding: '4px 10px', fontSize: 11.5, fontWeight: i === 0 ? 500 : 400,
            borderRadius: 5, cursor: 'pointer',
            background: i === 0 ? tok.accent : 'transparent',
            color: i === 0 ? tok.accentFg : tok.textBody,
          }}>{t}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {notifs.map((n, i) => {
          const t = toneMap[n.tone];
          const Ic = WIco[n.ic];
          return (
            <div key={i} style={{
              padding: '11px 14px', borderBottom: i < notifs.length - 1 ? `1px solid ${tok.borderSoft}` : 'none',
              display: 'flex', gap: 10, cursor: 'pointer', background: i < 3 ? tok.surfaceAlt : 'transparent',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 7, flex: '0 0 28px',
                background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{Ic && Ic(t.fg, 14)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: tok.text, lineHeight: 1.3 }}>{n.title}</div>
                  <span style={{ fontSize: 10.5, color: tok.textFaint, fontFamily: tok.fontMono, flexShrink: 0 }}>{n.when}</span>
                </div>
                <div style={{ fontSize: 11.5, color: tok.textMuted, lineHeight: 1.35 }}>{n.sub}</div>
              </div>
              {i < 3 && <WDot c={tok.accent} size={6} />}
            </div>
          );
        })}
      </div>
      <div style={{
        padding: '8px 14px', borderTop: `1px solid ${tok.borderSoft}`,
        background: tok.surfaceAlt, textAlign: 'center',
        fontSize: 11.5, color: tok.accent, cursor: 'pointer', fontWeight: 500,
      }}>Open notifications center →</div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
//   SHORTCUTS OVERLAY (?  to open)
// ═════════════════════════════════════════════════════════════
function WShortcutsOverlay({ tok }) {
  const groups = [
    {
      label: 'Navigation',
      items: [
        ['⌘ K', 'Command palette'],
        ['⌘ B', 'Toggle sidebar'],
        ['⌘ /', 'Focus search'],
        ['G H', 'Go to Home'],
        ['G M', 'Go to Modules'],
        ['G P', 'Go to Pathfinder'],
        ['G C', 'Go to Open Chat'],
      ],
    },
    {
      label: 'Actions',
      items: [
        ['⌘ N', 'New chat'],
        ['⌘ ↵', 'Send'],
        ['⌘ ⇧ E', 'Export DOCX'],
        ['⌘ ⇧ R', 'Re-run last prompt'],
        ['@', 'Attach document'],
        ['⌘ J', 'Switch pillar'],
      ],
    },
    {
      label: 'Depth',
      items: [
        ['⌥ 1', 'Quick'],
        ['⌥ 2', 'Think'],
        ['⌥ 3', 'Think Hard'],
        ['⌥ 4', 'Investigate'],
        ['⌥ 5', 'Plan First'],
        ['⌥ 6', 'Deep'],
      ],
    },
    {
      label: 'View',
      items: [
        ['?', 'Shortcuts (this overlay)'],
        ['⌘ \\', 'Toggle right rail'],
        ['⌘ .', 'Settings'],
        ['⌘ ⇧ L', 'Toggle theme'],
        ['Esc', 'Dismiss overlay'],
      ],
    },
  ];

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: tok.theme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(17,24,39,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 780,
        background: tok.surface, border: `1px solid ${tok.border}`,
        borderRadius: 12, boxShadow: tok.shadowLg,
        padding: '20px 24px', fontFamily: tok.font,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 600, fontFamily: tok.fontMono, letterSpacing: 0.6, textTransform: 'uppercase', color: tok.textMuted, marginBottom: 3 }}>Keyboard shortcuts</div>
            <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.3, margin: 0 }}>Move through ANTON faster</h2>
          </div>
          <WBtn tok={tok} variant="ghost" size="sm" icon={WIco.x(tok.textMuted, 14)}>Close</WBtn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
          {groups.map((g, gi) => (
            <div key={gi}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: tok.accent, fontFamily: tok.fontMono, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>{g.label}</div>
              {g.items.map(([k, label], i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 0',
                  borderTop: i === 0 ? 'none' : `1px solid ${tok.borderSoft}`,
                }}>
                  <span style={{ fontSize: 12.5, color: tok.textBody }}>{label}</span>
                  <div style={{ display: 'inline-flex', gap: 3 }}>
                    {k.split(' ').map((part, j) => <WKbd key={j} tok={tok}>{part}</WKbd>)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 16, paddingTop: 14, borderTop: `1px solid ${tok.borderSoft}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 11.5, color: tok.textMuted, fontFamily: tok.fontMono,
        }}>
          <span>Press <WKbd tok={tok}>?</WKbd> anywhere to open this overlay</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { WCommandPalette, WNotifPanel, WShortcutsOverlay });
