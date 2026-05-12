// web-directions.jsx — the 3 shell directions.
// Each takes `tok`, `screen` (which screen to render), and renders
// its own nav chrome around the shared screen components.

// ─── Render helper: pick a screen by id ──────────────────
function renderScreen(tok, screenId) {
  switch (screenId) {
    case 'home':       return <WHome tok={tok} />;
    case 'modules':    return <WModules tok={tok} />;
    case 'sanctions':  return <WSanctions tok={tok} />;
    case 'pathfinder': return <WPathfinder tok={tok} />;
    case 'open-chat':  return <WOpenChat tok={tok} />;
    default:           return <WHome tok={tok} />;
  }
}

// Active sidebar item for each screen
const SCREEN_TO_SIDEBAR = {
  'home': 'home',
  'modules': 'home',
  'sanctions': 'home',
  'pathfinder': 'home',
  'open-chat': 'open-chat',
};
const SCREEN_TO_PILLAR = {
  'home': 'work',
  'modules': 'work',
  'sanctions': 'work',
  'pathfinder': 'pathfinder',
  'open-chat': 'work',
};

// ═══════════════════════════════════════════════════════════════════════
//   DIRECTION A — SIDEBAR COCKPIT
//   Full named sidebar + top pillar bar. Closest to today, polished.
// ═══════════════════════════════════════════════════════════════════════
function WDirectionA({ tok, screen = 'home' }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: tok.bg }}>
      <WTopbar tok={tok} activePillar={SCREEN_TO_PILLAR[screen]} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <WSidebar tok={tok} active={SCREEN_TO_SIDEBAR[screen]} />
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', background: tok.bg }}>
          {renderScreen(tok, screen)}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//   DIRECTION B — COMMAND BAR + TABS
//   No sidebar. Top: pillar bar + ⌘K command. Open modules live as tabs.
//   Keyboard-first. Closer to an IDE / tabbed browser feel.
// ═══════════════════════════════════════════════════════════════════════
function WDirectionB({ tok, screen = 'home' }) {
  const pillar = SCREEN_TO_PILLAR[screen];
  const tabs = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'sanctions', label: 'Sanctions Advisory', icon: 'shield', pinned: true },
    { id: 'pathfinder', label: 'AMLR RTS research', icon: 'compass' },
    { id: 'open-chat', label: 'Open Chat · Sanctions v4', icon: 'message' },
    { id: 'modules', label: 'Modules', icon: 'grid' },
  ];
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: tok.bg }}>
      {/* Row 1: brand + pillars + command + profile */}
      <div style={{
        height: 44, display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 14,
        background: tok.topbar, borderBottom: `1px solid ${tok.borderSoft}`,
      }}>
        <WLogo tok={tok} size={22} />
        <div style={{ height: 20, width: 1, background: tok.borderSoft, margin: '0 2px' }} />
        <WPillarBar tok={tok} active={pillar} compact />
        <div style={{ flex: 1 }} />
        {/* Command bar */}
        <div style={{
          width: 360, height: 30,
          background: tok.surfaceAlt, border: `1px solid ${tok.borderSoft}`,
          borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
          color: tok.textMuted, fontSize: 12.5,
        }}>
          {WIco.command(tok.textMuted, 13)}
          <span style={{ flex: 1 }}>Ask ANTON, jump to a module, or run a command…</span>
          <WKbd tok={tok}>⌘</WKbd><WKbd tok={tok}>K</WKbd>
        </div>
        <WConnectionChips tok={tok} />
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: tok.accent, color: tok.accentFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 11 }}>
          {WEB_DATA.user.initials}
        </div>
      </div>

      {/* Row 2: tabs */}
      <div style={{
        height: 36, display: 'flex', alignItems: 'flex-end',
        background: tok.bg, borderBottom: `1px solid ${tok.borderSoft}`,
        padding: '0 8px', gap: 1,
      }}>
        {tabs.map(t => {
          const isActive = t.id === screen;
          const Ic = WIco[t.icon];
          return (
            <div key={t.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '7px 13px 8px',
              fontSize: 12, fontWeight: isActive ? 500 : 400,
              background: isActive ? tok.surface : 'transparent',
              color: isActive ? tok.text : tok.textMuted,
              borderTopLeftRadius: 6, borderTopRightRadius: 6,
              border: isActive ? `1px solid ${tok.borderSoft}` : '1px solid transparent',
              borderBottom: isActive ? `1px solid ${tok.surface}` : '1px solid transparent',
              marginBottom: -1, cursor: 'pointer', maxWidth: 220,
            }}>
              {Ic && Ic(isActive ? tok.accent : tok.textMuted, 13)}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.label}</span>
              {t.pinned && WIco.pin(tok.textFaint, 10)}
              {!t.pinned && WIco.x(tok.textFaint, 11)}
            </div>
          );
        })}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '7px 10px', fontSize: 12, color: tok.textMuted, cursor: 'pointer',
        }}>{WIco.plus(tok.textMuted, 13)}<span>New</span></div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px 4px', fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono }}>
          <WKbd tok={tok}>⌘</WKbd><WKbd tok={tok}>\</WKbd>
          <span>split</span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: tok.bg }}>
        {renderScreen(tok, screen)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//   DIRECTION C — THREE-PANE (MAIL / IDE STYLE)
//   Thin icon rail | contextual list | detail.
//   Best for triage-heavy flows (Sanctions queue, Counsel, Inbox, Radar).
// ═══════════════════════════════════════════════════════════════════════
function WDirectionC({ tok, screen = 'home' }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: tok.bg }}>
      <WTopbar tok={tok} activePillar={SCREEN_TO_PILLAR[screen]} centerPillar={false}
        leftSlot={<>
          <WLogo tok={tok} size={22} />
          <div style={{ height: 20, width: 1, background: tok.borderSoft, margin: '0 6px' }} />
          <WPillarBar tok={tok} active={SCREEN_TO_PILLAR[screen]} compact />
        </>}
      />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <WIconRail tok={tok} active={SCREEN_TO_SIDEBAR[screen]} />
        <WContextList tok={tok} screen={screen} />
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', background: tok.bg }}>
          {renderScreen(tok, screen)}
        </div>
      </div>
    </div>
  );
}

// Context list (middle pane) — changes by screen
function WContextList({ tok, screen }) {
  const lists = {
    'home': {
      title: 'Home', count: 4,
      items: [
        { t: 'Today', sub: "Brief · 4 items", active: true, sev: 'accent' },
        { t: 'This week', sub: '12 tasks · 3 at risk', sev: 'red' },
        { t: 'Continue your work', sub: '4 recent sessions' },
        { t: 'Saved views', sub: 'Sanctions, Counsel, Radar' },
      ],
    },
    'sanctions': {
      title: 'Sanctions Advisory · Runs', count: 7,
      items: [
        { t: 'Policy v4 — Board submission', sub: 'Think Hard · 14:06 today · awaiting review', active: true, sev: 'gold' },
        { t: 'Orion sanctions policy assessment', sub: '29 Mar · 6.9k tok', sev: 'accent' },
        { t: 'Iran regime briefing', sub: '24 Mar · completed', sev: 'green' },
        { t: 'Q1 screening framework review', sub: '22 Mar · approved', sev: 'green' },
        { t: 'DPRK de-risking note', sub: '18 Mar · draft' },
        { t: 'Dual-use trade exposure', sub: '10 Mar · closed', sev: 'green' },
        { t: 'Correspondent banking — Russia', sub: '02 Mar · archived' },
      ],
    },
    'open-chat': {
      title: 'Chats', count: WEB_DATA.chatHistory.length,
      items: WEB_DATA.chatHistory.slice(0, 9).map((c, i) => ({
        t: c.title, sub: c.when, active: i === 0, sev: i === 0 ? 'accent' : null,
      })),
    },
    'pathfinder': {
      title: 'Threads', count: 6,
      items: [
        { t: 'AMLR RTS from AMLA', sub: 'Thorough · 25 sources · live', active: true, sev: 'accent' },
        { t: 'EBA de-risking guidelines', sub: '27 Mar · Thorough' },
        { t: 'FATF R.6 updates 2024', sub: '24 Mar · Deep', sev: 'green' },
        { t: 'Nordic CDD benchmarks', sub: '20 Mar · Quick' },
        { t: 'MiCA final text', sub: '15 Mar · Deep' },
        { t: 'DORA testing expectations', sub: '12 Mar · Thorough' },
      ],
    },
    'modules': {
      title: 'Modules · 168 total', count: 168,
      items: [
        { t: 'Favorites', sub: '17 pinned', active: true, sev: 'accent' },
        { t: 'Financial crime prevention', sub: '24 modules' },
        { t: 'Governance & risk', sub: '18 modules' },
        { t: 'Legal & contracts', sub: '22 modules' },
        { t: 'Finance & markets', sub: '20 modules' },
        { t: 'People & operations', sub: '15 modules' },
        { t: 'Data & analytics', sub: '19 modules' },
        { t: 'Build / custom', sub: '3 yours' },
      ],
    },
  };
  const list = lists[screen] || lists.home;

  return (
    <div style={{
      width: 280, flex: '0 0 280px',
      borderRight: `1px solid ${tok.borderSoft}`,
      background: tok.surfaceAlt, display: 'flex', flexDirection: 'column',
      fontFamily: tok.font,
    }}>
      <div style={{
        padding: '12px 14px 10px', borderBottom: `1px solid ${tok.borderSoft}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: tok.text, letterSpacing: -0.2 }}>{list.title}</div>
          <div style={{ fontSize: 10.5, color: tok.textMuted, fontFamily: tok.fontMono }}>{list.count} items</div>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button style={{ width: 24, height: 24, border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer' }}>
            {WIco.filter(tok.textMuted, 13)}
          </button>
          <button style={{ width: 24, height: 24, border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer' }}>
            {WIco.plus(tok.textMuted, 13)}
          </button>
        </div>
      </div>
      <div style={{ padding: '8px 10px 4px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '6px 9px', background: tok.surface,
          border: `1px solid ${tok.borderSoft}`, borderRadius: 5,
          fontSize: 12, color: tok.textFaint,
        }}>
          {WIco.search(tok.textMuted, 13)}
          <span>Search {list.title.split('·')[0].trim().toLowerCase()}</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 6px 12px' }}>
        {list.items.map((item, i) => {
          const sevColor = item.sev === 'accent' ? tok.accent :
                          item.sev === 'gold' ? tok.gold :
                          item.sev === 'red' ? tok.red :
                          item.sev === 'green' ? tok.green : null;
          return (
            <div key={i} style={{
              padding: '10px 12px', cursor: 'pointer',
              background: item.active ? tok.surface : 'transparent',
              border: item.active ? `1px solid ${tok.borderSoft}` : '1px solid transparent',
              borderLeft: item.active ? `2px solid ${tok.accent}` : '2px solid transparent',
              borderRadius: 5, margin: '1px 0',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              {sevColor && <WDot c={sevColor} size={7} pulse={item.sev === 'gold'} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: item.active ? 500 : 400, color: tok.text, lineHeight: 1.3, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.t}
                </div>
                <div style={{ fontSize: 10.5, color: tok.textMuted, fontFamily: tok.fontMono, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.sub}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { WDirectionA, WDirectionB, WDirectionC, WContextList, renderScreen });
