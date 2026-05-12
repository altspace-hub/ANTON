// web-chrome.jsx — Firefox-ish browser window frame + shared shell bits
// (sidebar, topbar, pillar switcher) used inside the 3 shell directions.

// ─── Browser chrome (Firefox-style, subtle) ─────────────────
function WBrowserFrame({ tok, url = 'http://localhost:5183', zoom = '110%', children }) {
  const isDark = tok.theme === 'dark';
  const chromeBg = isDark ? '#1E1F24' : '#E5E4E0';
  const chromeFg = isDark ? '#D4D4D8' : '#2C2C2E';
  const chromeBar = isDark ? '#2A2B31' : '#F4F3EF';
  const chromeDiv = isDark ? '#3A3B42' : '#D0CFCA';

  return (
    <div style={{
      width: 1600, height: 1000,
      background: chromeBg, borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 30px 80px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.12)',
      fontFamily: tok.font,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Toolbar row */}
      <div style={{
        height: 40, display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 10px',
        background: chromeBar, color: chromeFg,
        borderBottom: `1px solid ${chromeDiv}`,
      }}>
        {/* Nav arrows */}
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {['M15 18l-6-6 6-6','M9 18l6-6-6-6','M23 4v6h-6 M20.5 9a9 9 0 11-2.1-9.5L23 4'].map((d, i) => (
            <button key={i} style={{
              width: 26, height: 26, border: 'none', background: 'transparent',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 4, cursor: 'pointer', color: chromeFg, opacity: 0.85,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d={d} />
              </svg>
            </button>
          ))}
        </div>
        {/* URL bar */}
        <div style={{
          flex: 1, height: 26,
          background: isDark ? '#121317' : '#FFFFFF',
          border: `1px solid ${chromeDiv}`, borderRadius: 4,
          display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
          fontSize: 12, color: chromeFg,
        }}>
          <span style={{ fontSize: 11, opacity: 0.6 }}>🔒</span>
          <span style={{ flex: 1 }}>{url}</span>
          <span style={{ fontSize: 11, opacity: 0.7 }}>{zoom}</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>☆</span>
        </div>
        {/* Right icons */}
        <div style={{ display: 'flex', gap: 3, alignItems: 'center', fontSize: 11, color: chromeFg }}>
          <span style={{ opacity: 0.7, padding: '0 6px' }}>⬇</span>
          <span style={{ opacity: 0.7, padding: '0 6px' }}>👤 Sign in</span>
          <span style={{ padding: '0 6px' }}>🦊</span>
        </div>
      </div>
      {/* Content */}
      <div style={{ flex: 1, background: tok.bg, color: tok.text, overflow: 'hidden', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Pillar switcher (top-center, 7 items) ──────────────────
function WPillarBar({ tok, active = 'work', compact }) {
  const items = WEB_DATA.pillars;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      background: tok.surfaceAlt,
      border: `1px solid ${tok.borderSoft}`,
      borderRadius: 8, padding: 3,
      gap: 1,
    }}>
      {items.map(p => {
        const isActive = p.id === active;
        const Ic = WIco[p.icon];
        return (
          <div key={p.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: compact ? '5px 10px' : '6px 12px',
            fontSize: 12.5, fontWeight: isActive ? 600 : 500,
            borderRadius: 6,
            background: isActive ? tok.accent : 'transparent',
            color: isActive ? tok.accentFg : tok.textBody,
            cursor: 'pointer', letterSpacing: -0.1,
          }}>
            {Ic && Ic(isActive ? tok.accentFg : tok.textMuted, 14)}
            <span>{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Connection / command chips for top-right of topbar ─────
function WConnectionChips({ tok }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', background: tok.greenSoft,
        border: `1px solid ${tok.greenDim}`, borderRadius: 6,
        fontSize: 11.5, color: tok.green, fontWeight: 500,
      }}>
        <WDot c={tok.green} size={6} pulse />
        API Connected
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', background: tok.accentSoft,
        border: `1px solid ${tok.accentDim}`, borderRadius: 6,
        fontSize: 11.5, color: tok.accent, fontWeight: 500, fontFamily: tok.fontMono,
      }}>
        Local + API · Anthropic
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 10px', background: tok.surface,
        border: `1px solid ${tok.border}`, borderRadius: 6,
        fontSize: 11.5, color: tok.textBody, fontWeight: 500,
      }}>
        {WIco.command(tok.textMuted, 12)}
        Commands
        <WKbd tok={tok}>⌘K</WKbd>
      </div>
    </div>
  );
}

// ─── Topbar icons (right end) ───────────────────────────────
function WTopbarIcons({ tok }) {
  const items = [WIco.bell, WIco.bell, WIco.settings];
  return (
    <div style={{ display: 'inline-flex', gap: 2 }}>
      {items.map((Ic, i) => (
        <button key={i} style={{
          width: 30, height: 30, border: 'none', background: 'transparent',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6, cursor: 'pointer', color: tok.textMuted,
        }}>
          {Ic(tok.textMuted, 15)}
        </button>
      ))}
    </div>
  );
}

// ─── Sidebar item ───────────────────────────────────────────
function WSidebarItem({ tok, icon, label, active, badge, star, compact, onClick }) {
  const Ic = typeof icon === 'string' ? WIco[icon] : null;
  const activeBg = tok.accentSoft;
  const activeFg = tok.accent;

  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 9,
      padding: compact ? '6px 10px' : '7px 10px',
      marginLeft: 6, marginRight: 6,
      fontSize: 12.5, fontWeight: active ? 500 : 400,
      color: active ? activeFg : tok.textBody,
      background: active ? activeBg : 'transparent',
      borderRadius: 6, cursor: 'pointer', letterSpacing: -0.1,
      borderLeft: active ? `2px solid ${tok.accent}` : '2px solid transparent',
      paddingLeft: active ? 8 : 10,
    }}>
      {Ic && Ic(active ? activeFg : tok.textMuted, 15)}
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {badge != null && (
        <span style={{
          minWidth: 16, height: 15, padding: '0 5px',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 600, fontFamily: tok.fontMono,
          background: active ? tok.accent : tok.surfaceAlt,
          color: active ? tok.accentFg : tok.textMuted,
          borderRadius: 3,
        }}>{badge}</span>
      )}
      {star && WIco.star(tok.gold, 11)}
    </div>
  );
}

// ─── Full topbar (used by Direction A + C) ──────────────────
function WTopbar({ tok, activePillar = 'work', compact, centerPillar = true, leftSlot }) {
  return (
    <div style={{
      height: 46, display: 'flex', alignItems: 'center',
      padding: '0 12px', gap: 12,
      background: tok.topbar, borderBottom: `1px solid ${tok.borderSoft}`,
    }}>
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
        {leftSlot ?? <span style={{ fontSize: 12.5, color: tok.textMuted }}>Anton</span>}
      </div>
      {centerPillar ? (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <WPillarBar tok={tok} active={activePillar} compact={compact} />
        </div>
      ) : <div style={{ flex: 1 }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <WConnectionChips tok={tok} />
        <WTopbarIcons tok={tok} />
      </div>
    </div>
  );
}

// ─── Left sidebar (used by Direction A) ─────────────────────
function WSidebar({ tok, active = 'home', width = 240 }) {
  return (
    <div style={{
      width, flex: `0 0 ${width}px`,
      background: tok.sidebar,
      borderRight: `1px solid ${tok.borderSoft}`,
      display: 'flex', flexDirection: 'column',
      fontFamily: tok.font,
    }}>
      {/* Org header */}
      <div style={{
        padding: '12px 14px 12px 14px',
        borderBottom: `1px solid ${tok.borderSoft}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8,
          background: tok.accent, color: tok.accentFg,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 14,
        }}>A</div>
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: tok.text }}>Anton</div>
          <div style={{ fontSize: 10.5, color: tok.textMuted, fontFamily: tok.fontMono }}>by openEXPERT</div>
        </div>
      </div>

      {/* Favorites */}
      <div style={{ padding: '10px 0 6px' }}>
        <WSection tok={tok} style={{ padding: '0 14px 6px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            {WIco.star(tok.gold, 10)} Favorites
          </span>
        </WSection>
        {WEB_DATA.favorites.map(f => (
          <WSidebarItem key={f.id} tok={tok} icon={f.icon} label={f.label}
            active={f.id === active} badge={f.badge} star />
        ))}
      </div>

      <div style={{ padding: '4px 14px' }}>
        {WEB_DATA.sidebarSections.map(s => (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 0', fontSize: 10.5, fontWeight: 600,
            letterSpacing: 0.6, textTransform: 'uppercase',
            color: tok.textMuted, fontFamily: tok.fontMono, cursor: 'pointer',
          }}>
            <span>{s.label}</span>
            {WIco.chevronRight(tok.textMuted, 12)}
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* User footer */}
      <div style={{
        padding: '10px 14px', borderTop: `1px solid ${tok.borderSoft}`,
        display: 'flex', alignItems: 'center', gap: 9,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', background: tok.accent,
          color: tok.accentFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 600, fontSize: 12,
        }}>{WEB_DATA.user.initials}</div>
        <div style={{ lineHeight: 1.2, flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: tok.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{WEB_DATA.user.name}</div>
          <div style={{ fontSize: 10.5, color: tok.textMuted }}>{WEB_DATA.user.role}</div>
        </div>
        {WIco.chevronLeft(tok.textMuted, 14)}
      </div>
      <div style={{
        padding: '8px 14px', fontSize: 10.5, color: tok.textFaint,
        fontFamily: tok.fontMono, textAlign: 'center',
        borderTop: `1px solid ${tok.borderSoft}`,
      }}>
        Anton {WEB_DATA.user.antonVersion}
      </div>
    </div>
  );
}

// ─── Thin icon rail (used by Direction C) ───────────────────
function WIconRail({ tok, active = 'home', width = 52 }) {
  const items = WEB_DATA.favorites.slice(0, 8);
  return (
    <div style={{
      width, flex: `0 0 ${width}px`,
      background: tok.sidebar,
      borderRight: `1px solid ${tok.borderSoft}`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '10px 0',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8,
        background: tok.accent, color: tok.accentFg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 15, marginBottom: 14,
      }}>A</div>
      {items.map(f => {
        const Ic = WIco[f.icon];
        const isActive = f.id === active;
        return (
          <div key={f.id} title={f.label} style={{
            width: 36, height: 36, marginBottom: 4,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7,
            background: isActive ? tok.accentSoft : 'transparent',
            color: isActive ? tok.accent : tok.textMuted,
            cursor: 'pointer', position: 'relative',
          }}>
            {Ic && Ic(isActive ? tok.accent : tok.textMuted, 17)}
            {isActive && <span style={{
              position: 'absolute', left: -8, top: 8, bottom: 8, width: 2,
              background: tok.accent, borderRadius: 2,
            }}/>}
          </div>
        );
      })}
      <div style={{ flex: 1 }} />
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: tok.accent, color: tok.accentFg,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 600, fontSize: 12, marginBottom: 8,
      }}>{WEB_DATA.user.initials}</div>
    </div>
  );
}

Object.assign(window, {
  WBrowserFrame, WPillarBar, WConnectionChips, WTopbarIcons,
  WSidebarItem, WTopbar, WSidebar, WIconRail,
});
