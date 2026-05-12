// web-shell-v2.jsx — upgraded shell for Direction A v2.
// Changes from v1:
//  - Collapsible sidebar (icon-only mode)
//  - Sidebar search
//  - Favorites pinned at the top, sections below are collapsible
//  - Breadcrumbs component
//  - Run header component (title + meta + primary actions) reused across modules
//  - Action bar component (Export/Share/Review/Approve/Tools)
//  - Right-rail pattern (RunContextRail) reused across modules
//  - Notifications panel, Command palette, Shortcuts overlay
//  - Tuned dark mode in tokens file

// ─── Breadcrumbs ────────────────────────────────────────────
function WBreadcrumbs({ tok, items = [] }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 11.5, fontFamily: tok.fontMono,
      color: tok.textMuted, letterSpacing: 0.2,
      textTransform: 'uppercase',
    }}>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ color: tok.textFaint }}>/</span>}
          <span style={{
            color: i === items.length - 1 ? tok.accent : tok.textMuted,
            cursor: i === items.length - 1 ? 'default' : 'pointer',
          }}>{it}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Run header (used by every module page) ─────────────────
function WRunHeader({ tok, crumbs, title, subtitle, chips = [], actions }) {
  return (
    <div style={{
      padding: '16px 28px 14px', borderBottom: `1px solid ${tok.borderSoft}`,
      background: tok.surface,
    }}>
      {crumbs && <div style={{ marginBottom: 10 }}><WBreadcrumbs tok={tok} items={crumbs} /></div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{
            fontSize: 22, fontWeight: 600, letterSpacing: -0.4,
            margin: '0 0 4px', color: tok.text,
          }}>{title}</h1>
          {subtitle && <div style={{ fontSize: 12.5, color: tok.textMuted, lineHeight: 1.45, maxWidth: 680 }}>{subtitle}</div>}
          {chips.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
              {chips.map((c, i) => (
                typeof c === 'string'
                  ? <WPill key={i} tok={tok} tone="neutral">{c}</WPill>
                  : <WPill key={i} tok={tok} tone={c.tone}>{c.label}</WPill>
              ))}
            </div>
          )}
        </div>
        {actions && <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>{actions}</div>}
      </div>
    </div>
  );
}

// ─── Action bar ─────────────────────────────────────────────
function WActionBar({ tok, left, right, style = {} }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '10px 14px', flexWrap: 'wrap',
      background: tok.surface, border: `1px solid ${tok.border}`,
      borderRadius: tok.r2, ...style,
    }}>
      {left}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

// ─── Right-rail panels (reusable: section + body) ──────────
function WRailCard({ tok, title, right, children, style = {} }) {
  return (
    <div style={{
      background: tok.surface, border: `1px solid ${tok.border}`,
      borderRadius: tok.r2, padding: '12px 13px', marginBottom: 10,
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <WSection tok={tok}>{title}</WSection>
        {right}
      </div>
      {children}
    </div>
  );
}

// ─── Suggested-next strip ──────────────────────────────────
function WSuggestedNext({ tok, items = [] }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        {WIco.sparkles(tok.textMuted, 12)} Suggested next
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 8 }}>
        {items.map((n, i) => (
          <div key={i} style={{
            padding: '12px 14px', background: tok.surface,
            border: `1px solid ${tok.border}`, borderRadius: tok.r2, cursor: 'pointer',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, flex: '0 0 28px',
              background: tok.accentSoft, color: tok.accent,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>{WIco[n.icon ?? 'chevronRight'](tok.accent, 14)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3, color: tok.text }}>{n.title}</div>
              <div style={{ fontSize: 11.5, color: tok.textMuted, lineHeight: 1.4 }}>{n.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
//   UPGRADED SIDEBAR
//   - collapsible: expanded (240) / icon-rail (56)
//   - search at top
//   - favorites pinned, everything else collapsed by default
// ═════════════════════════════════════════════════════════════
function WSidebarV2({ tok, active = 'home', collapsed = false }) {
  const width = collapsed ? 56 : 236;

  return (
    <div style={{
      width, flex: `0 0 ${width}px`,
      background: tok.sidebar,
      borderRight: `1px solid ${tok.borderSoft}`,
      display: 'flex', flexDirection: 'column',
      fontFamily: tok.font,
      transition: 'width 180ms',
    }}>
      {/* Brand + collapse toggle */}
      <div style={{
        padding: collapsed ? '12px 8px' : '12px 12px',
        borderBottom: `1px solid ${tok.borderSoft}`,
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: 8,
      }}>
        {collapsed ? (
          <div style={{
            width: 30, height: 30, borderRadius: 7,
            background: tok.accent, color: tok.accentFg,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 14,
          }}>A</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: tok.accent, color: tok.accentFg,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13,
              }}>A</div>
              <div style={{ lineHeight: 1.15 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: tok.text }}>Anton</div>
                <div style={{ fontSize: 10.5, color: tok.textMuted, fontFamily: tok.fontMono }}>by openEXPERT</div>
              </div>
            </div>
            <button style={{
              width: 24, height: 24, border: 'none', background: 'transparent',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: tok.textMuted, borderRadius: 4,
            }} title="Collapse sidebar · ⌘B">
              {WIco.chevronLeft(tok.textMuted, 14)}
            </button>
          </>
        )}
      </div>

      {/* Search */}
      {!collapsed && (
        <div style={{ padding: '10px 10px 8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '6px 9px', background: tok.surface,
            border: `1px solid ${tok.borderSoft}`, borderRadius: 5,
            fontSize: 12, color: tok.textFaint,
          }}>
            {WIco.search(tok.textMuted, 13)}
            <span style={{ flex: 1 }}>Jump to…</span>
            <WKbd tok={tok}>⌘K</WKbd>
          </div>
        </div>
      )}

      {/* Scroll area */}
      <div style={{ flex: 1, overflow: 'auto', padding: collapsed ? '8px 0' : '4px 0 8px' }}>
        {/* Favorites (always visible) */}
        {!collapsed && (
          <div style={{ padding: '4px 14px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{
              fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: 0.6, color: tok.textMuted, fontFamily: tok.fontMono,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              {WIco.star(tok.gold, 10)} Favorites
            </div>
            {WIco.plus(tok.textFaint, 13)}
          </div>
        )}
        {WEB_DATA.favorites.slice(0, collapsed ? 8 : 17).map(f => (
          collapsed ? <WSidebarIconItem key={f.id} tok={tok} icon={f.icon} label={f.label} active={f.id === active} badge={f.badge} />
                    : <WSidebarItem key={f.id} tok={tok} icon={f.icon} label={f.label} active={f.id === active} badge={f.badge} star />
        ))}

        {!collapsed && (
          <>
            <WSidebarGroup tok={tok} label="Interactive Modes" open={false} />
            <WSidebarGroup tok={tok} label="Tools & Features" open={false} />
            <WSidebarGroup tok={tok} label="Modules" open={false} count="168" />
          </>
        )}
      </div>

      {/* Footer */}
      {collapsed ? (
        <div style={{ padding: '10px 0', borderTop: `1px solid ${tok.borderSoft}`, display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', background: tok.accent,
            color: tok.accentFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, fontSize: 12,
          }}>{WEB_DATA.user.initials}</div>
        </div>
      ) : (
        <>
          <div style={{
            padding: '10px 12px', borderTop: `1px solid ${tok.borderSoft}`,
            display: 'flex', alignItems: 'center', gap: 9,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%', background: tok.accent,
              color: tok.accentFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 600, fontSize: 12,
            }}>{WEB_DATA.user.initials}</div>
            <div style={{ lineHeight: 1.2, flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: tok.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{WEB_DATA.user.name}</div>
              <div style={{ fontSize: 10.5, color: tok.textMuted }}>{WEB_DATA.user.role} · openEXPERT</div>
            </div>
            {WIco.moreV(tok.textMuted, 14)}
          </div>
          <div style={{
            padding: '7px 12px', fontSize: 10, color: tok.textFaint,
            fontFamily: tok.fontMono, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderTop: `1px solid ${tok.borderSoft}`,
          }}>
            <span>Anton {WEB_DATA.user.antonVersion}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <WDot c={tok.green} size={5} /> Connected
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function WSidebarGroup({ tok, label, count, open = false }) {
  return (
    <div style={{ padding: '8px 14px 4px', marginTop: 6 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '5px 0', fontSize: 10.5, fontWeight: 600,
        letterSpacing: 0.6, textTransform: 'uppercase',
        color: tok.textMuted, fontFamily: tok.fontMono, cursor: 'pointer',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {open ? WIco.chevronDown(tok.textMuted, 11) : WIco.chevronRight(tok.textMuted, 11)}
          {label}
        </span>
        {count && <span style={{ fontWeight: 500, color: tok.textFaint }}>{count}</span>}
      </div>
    </div>
  );
}

function WSidebarIconItem({ tok, icon, label, active, badge }) {
  const Ic = WIco[icon];
  return (
    <div title={label} style={{
      width: 36, height: 36, margin: '2px auto',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 7, cursor: 'pointer', position: 'relative',
      background: active ? tok.accentSoft : 'transparent',
      color: active ? tok.accent : tok.textMuted,
    }}>
      {Ic && Ic(active ? tok.accent : tok.textMuted, 17)}
      {active && <span style={{
        position: 'absolute', left: 2, top: 8, bottom: 8, width: 2,
        background: tok.accent, borderRadius: 2,
      }}/>}
      {badge != null && <span style={{
        position: 'absolute', top: 2, right: 2,
        minWidth: 13, height: 13, padding: '0 3px',
        fontSize: 9, fontWeight: 600, fontFamily: tok.fontMono,
        background: tok.red, color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 7,
      }}>{badge}</span>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
//   TOPBAR V2 — with breadcrumb mode, better chips
// ═════════════════════════════════════════════════════════════
function WTopbarV2({ tok, activePillar = 'work', crumbs }) {
  return (
    <div style={{
      height: 46, display: 'flex', alignItems: 'center',
      padding: '0 14px', gap: 14,
      background: tok.topbar, borderBottom: `1px solid ${tok.borderSoft}`,
    }}>
      <div style={{ minWidth: 180, display: 'flex', alignItems: 'center', gap: 10 }}>
        {crumbs
          ? <WBreadcrumbs tok={tok} items={crumbs} />
          : <span style={{ fontSize: 12.5, color: tok.textMuted, fontFamily: tok.fontMono, letterSpacing: 0.3 }}>Anton</span>}
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <WPillarBar tok={tok} active={activePillar} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Connection - single combined chip */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '5px 10px', background: tok.surface,
          border: `1px solid ${tok.border}`, borderRadius: 6,
          fontSize: 11.5, color: tok.textBody, fontWeight: 500,
        }}>
          <WDot c={tok.green} size={6} pulse />
          <span>Local + Anthropic</span>
          <span style={{ color: tok.textFaint, fontFamily: tok.fontMono, fontSize: 10.5 }}>· 4.33€</span>
        </div>
        {/* Command */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', background: tok.surface,
          border: `1px solid ${tok.border}`, borderRadius: 6,
          fontSize: 11.5, color: tok.textBody, fontWeight: 500, cursor: 'pointer',
        }}>
          {WIco.command(tok.textMuted, 12)}
          Commands
          <WKbd tok={tok}>⌘K</WKbd>
        </div>
        <WTopbarIcons tok={tok} />
      </div>
    </div>
  );
}

Object.assign(window, {
  WBreadcrumbs, WRunHeader, WActionBar, WRailCard, WSuggestedNext,
  WSidebarV2, WSidebarGroup, WSidebarIconItem,
  WTopbarV2,
});
