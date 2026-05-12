// web-screens-1.jsx — Home + Modules screens.
// These render the "main content area" inside any shell direction.

// ═══════════════════════════════════════════════════════════
//   HOME — context-aware brief, not raw stats
// ═══════════════════════════════════════════════════════════
function WHome({ tok, variant = 'editorial' }) {
  // variant: 'editorial' (generous), 'cockpit' (dense), 'instrument' (mono)
  const isCockpit = variant === 'cockpit';
  const isInstrument = variant === 'instrument';

  return (
    <div style={{
      padding: isCockpit ? '20px 28px 40px' : '32px 48px 60px',
      maxWidth: isCockpit ? 1180 : 1080, margin: '0 auto',
      fontFamily: tok.font, color: tok.text,
    }}>
      {/* Greeting band */}
      <div style={{ marginBottom: isCockpit ? 18 : 28 }}>
        <div style={{
          fontFamily: tok.fontMono, fontSize: 11, letterSpacing: 0.6,
          textTransform: 'uppercase', color: tok.textMuted, marginBottom: 6,
        }}>
          {WEB_DATA.brief.date}
        </div>
        <div style={{
          fontSize: isCockpit ? 26 : 34, fontWeight: 500, letterSpacing: -0.6,
          color: tok.text, marginBottom: 6,
        }}>
          {WEB_DATA.brief.greeting}, <span style={{ fontWeight: 400, color: tok.textBody }}>Daniel.</span>
        </div>
        <div style={{
          fontSize: 14.5, color: tok.textBody, maxWidth: 680,
          lineHeight: 1.5, textWrap: 'pretty',
        }}>
          {WEB_DATA.brief.summary}
        </div>
      </div>

      {/* Top row: Today's brief (hero) + 5-Minute Brief CTA */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 20 }}>
        {/* At risk */}
        <div style={{
          background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r3, padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <WSection tok={tok}>Today's brief</WSection>
              <WPill tok={tok} tone="red">1 urgent</WPill>
            </div>
            <span style={{ fontSize: 12, color: tok.textMuted, cursor: 'pointer' }}>View all →</span>
          </div>
          <div>
            {WEB_DATA.brief.atRisk.map((r, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '8px 1fr auto',
                gap: 14, alignItems: 'center',
                padding: '11px 0',
                borderTop: i === 0 ? 'none' : `1px solid ${tok.borderSoft}`,
              }}>
                <WDot c={r.sev === 'red' ? tok.red : tok.gold} size={8} pulse={r.sev === 'red'} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: tok.text, marginBottom: 2 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: tok.textMuted }}>{r.hint}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <WPill tok={tok} tone={r.sev === 'red' ? 'red' : 'gold'}>{r.due}</WPill>
                  {WIco.chevronRight(tok.textMuted, 14)}
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* 5-minute brief */}
        <div style={{
          background: `linear-gradient(135deg, ${tok.accentSoft}, ${tok.accentDim})`,
          border: `1px solid ${tok.accentDim}`,
          borderRadius: tok.r3, padding: '16px 18px',
          display: 'flex', flexDirection: 'column',
        }}>
          <WSection tok={tok} style={{ color: tok.accent, marginBottom: 10 }}>5-minute brief</WSection>
          <div style={{ fontSize: 15, fontWeight: 500, color: tok.text, lineHeight: 1.35, marginBottom: 6 }}>
            Your personalised briefing covering overnight regulatory developments, open engagements, and today's priorities.
          </div>
          <div style={{ fontSize: 12, color: tok.textBody, marginBottom: 14 }}>
            Last refreshed 08:12 · 4 items
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <WBtn tok={tok} variant="primary" size="sm" iconRight={WIco.chevronRight(tok.accentFg, 13)}>Open brief</WBtn>
            <WBtn tok={tok} variant="secondary" size="sm">Listen 4:32</WBtn>
          </div>
        </div>
      </div>

      {/* Stats — quiet, not loud */}
      <div style={{
        background: tok.surface, border: `1px solid ${tok.border}`,
        borderRadius: tok.r3, padding: '14px 18px', marginBottom: 20,
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto', gap: 14, alignItems: 'center',
      }}>
        {WEB_DATA.brief.stats.map((s, i) => (
          <div key={i} style={{ borderLeft: i === 0 ? 'none' : `1px solid ${tok.borderSoft}`, paddingLeft: i === 0 ? 0 : 14 }}>
            <div style={{ fontSize: 11, color: tok.textMuted, letterSpacing: 0.2, marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: tok.text, fontFamily: tok.fontDisplay, lineHeight: 1, marginBottom: 3, letterSpacing: -0.3 }}>{s.value}</div>
            <div style={{ fontSize: 10.5, color: tok.textMuted }}>{s.delta}</div>
          </div>
        ))}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          paddingLeft: 14, borderLeft: `1px solid ${tok.borderSoft}`,
        }}>
          <div style={{ fontSize: 10.5, color: tok.green, fontWeight: 600, letterSpacing: 0.2 }}>ROI this month</div>
          <div style={{ fontSize: 14, color: tok.text, fontWeight: 500 }}>€3,750 value · €4.33 spend</div>
          <div style={{ fontSize: 10.5, color: tok.textMuted }}>8.7h saved per €1</div>
        </div>
      </div>

      {/* Continue your work */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <WSection tok={tok}>Continue your work</WSection>
          <span style={{ fontSize: 12, color: tok.textMuted, cursor: 'pointer' }}>View all →</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {WEB_DATA.continueWork.map(w => (
            <div key={w.id} style={{
              background: tok.surface, border: `1px solid ${tok.border}`,
              borderRadius: tok.r2, padding: '12px 13px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', gap: 8, minHeight: 108,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <WPill tok={tok} tone={w.accent === 'emerald' ? 'accent' : w.accent}>{w.module}</WPill>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: tok.text, lineHeight: 1.3, flex: 1 }}>
                {w.label}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: tok.textMuted, fontFamily: tok.fontMono }}>
                <span>{w.when}</span><span>{w.tokens}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pathfinder prompt */}
      <div style={{
        background: tok.surface, border: `1px solid ${tok.border}`,
        borderRadius: tok.r3, padding: '16px 18px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {WIco.compass(tok.accent, 16)}
            <WSection tok={tok} style={{ color: tok.accent }}>Pathfinder</WSection>
            <span style={{ fontSize: 12, color: tok.textMuted }}>Search that thinks before it answers. You're never the product.</span>
          </div>
          <span style={{ fontSize: 12, color: tok.textMuted, cursor: 'pointer' }}>Open full search →</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', background: tok.surfaceAlt,
          border: `1px solid ${tok.borderSoft}`, borderRadius: tok.r2,
        }}>
          {WIco.search(tok.textMuted, 15)}
          <span style={{ flex: 1, fontSize: 13, color: tok.textFaint }}>Ask ANTON — regulations, research, your knowledge base…</span>
          <WKbd tok={tok}>⌘</WKbd>
          <WKbd tok={tok}>K</WKbd>
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
          {['Knowledge', 'Web', 'Regulations', 'Docs', 'Community', 'Deals'].map((t, i) => (
            <WPill key={t} tok={tok} tone={i === 0 ? 'accent' : 'neutral'}>{t}</WPill>
          ))}
        </div>
      </div>

      {/* Find the right module (router) */}
      <div style={{
        background: tok.surface, border: `1px solid ${tok.border}`,
        borderRadius: tok.r3, padding: '16px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {WIco.sparkles(tok.accent, 15)}
          <WSection tok={tok} style={{ color: tok.accent }}>Find the right module</WSection>
        </div>
        <div style={{ fontSize: 13, color: tok.textBody, marginBottom: 12 }}>
          Describe what you need in plain language — ANTON will find the right modules for you.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {WEB_DATA.findModuleSuggestions.map(s => (
            <WPill key={s} tok={tok} tone="neutral" style={{ padding: '6px 10px', fontSize: 11.5, cursor: 'pointer' }}>{s}</WPill>
          ))}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: tok.surfaceAlt,
          border: `1px solid ${tok.borderSoft}`, borderRadius: tok.r2,
        }}>
          <span style={{ flex: 1, fontSize: 13, color: tok.textFaint }}>
            e.g. I need to do a gap analysis against the new AML regulation…
          </span>
          <WBtn tok={tok} variant="primary" size="sm" icon={WIco.send(tok.accentFg, 13)}>Find</WBtn>
        </div>
        <div style={{ fontSize: 10.5, color: tok.textFaint, marginTop: 8, fontFamily: tok.fontMono }}>
          Powered by Claude Haiku · results in ~2 seconds
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//   MODULES — grid + categories
// ═══════════════════════════════════════════════════════════
function WModules({ tok, variant = 'editorial' }) {
  const cat = WEB_DATA.moduleCategories[0];
  return (
    <div style={{
      padding: '28px 40px 50px',
      maxWidth: 1180, margin: '0 auto',
      fontFamily: tok.font, color: tok.text,
    }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: tok.fontMono, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: tok.textMuted, marginBottom: 6 }}>
          Work · Modules
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 500, letterSpacing: -0.5, margin: '0 0 6px', color: tok.text }}>All modules</h1>
            <div style={{ fontSize: 13.5, color: tok.textBody, maxWidth: 620 }}>
              ANTON's modules — structured workflows for regulated work. Describe what you need and ANTON routes you, or browse the catalog.
            </div>
          </div>
          <WBtn tok={tok} variant="secondary" icon={WIco.plus(tok.text, 13)}>Build a module</WBtn>
        </div>

        {/* Router */}
        <div style={{
          background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r3, padding: '14px 16px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            {WIco.sparkles(tok.accent, 15)}
            <WSection tok={tok} style={{ color: tok.accent }}>Find the right module</WSection>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {WEB_DATA.findModuleSuggestions.map(s => (
              <WPill key={s} tok={tok} tone="neutral" style={{ padding: '5px 9px', fontSize: 11.5, cursor: 'pointer' }}>{s}</WPill>
            ))}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', background: tok.surfaceAlt,
            border: `1px solid ${tok.borderSoft}`, borderRadius: tok.r1,
          }}>
            <span style={{ flex: 1, fontSize: 13, color: tok.textFaint }}>
              e.g. I need to do a gap analysis against the new AML regulation…
            </span>
            <WBtn tok={tok} variant="primary" size="sm" icon={WIco.send(tok.accentFg, 12)}>Find</WBtn>
          </div>
        </div>

        {/* Search + filter row */}
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center',
          background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r2, padding: '8px 12px',
        }}>
          {WIco.search(tok.textMuted, 14)}
          <span style={{ flex: 1, fontSize: 13, color: tok.textFaint }}>Search modules — e.g. GDPR, stress testing, contract review…</span>
          <WBtn tok={tok} variant="ghost" size="sm" icon={WIco.filter(tok.textMuted, 13)}>Filter</WBtn>
        </div>
      </div>

      {/* Category header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: tok.accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>{cat.label}</div>
        <div style={{ flex: 1, height: 1, background: tok.borderSoft }} />
        <WPill tok={tok} tone="accent">{cat.count} modules</WPill>
      </div>

      {/* Module cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {cat.modules.map(m => <WModuleCard key={m.id} tok={tok} m={m} />)}
      </div>
    </div>
  );
}

function WModuleCard({ tok, m }) {
  const toneMap = {
    accent: { bg: tok.accentSoft, fg: tok.accent, bd: tok.accentDim },
    blue: { bg: tok.blueSoft, fg: tok.blue, bd: tok.blueDim },
    gold: { bg: tok.goldSoft, fg: tok.gold, bd: tok.goldDim },
    red: { bg: tok.redSoft, fg: tok.red, bd: tok.redDim },
  };
  const t = toneMap[m.tone] || toneMap.accent;
  const Ic = WIco[m.icon];
  return (
    <div style={{
      background: tok.surface, border: `1px solid ${tok.border}`,
      borderRadius: tok.r3, padding: '16px', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 10, minHeight: 180,
      transition: 'border-color 120ms, transform 120ms',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 8,
        background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {Ic && Ic(t.fg, 17)}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: tok.text, letterSpacing: -0.1 }}>{m.name}</div>
      <div style={{ fontSize: 12, color: tok.textMuted, lineHeight: 1.4, flex: 1 }}>{m.desc}</div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 8, borderTop: `1px solid ${tok.borderSoft}`,
        fontSize: 11, color: tok.textMuted,
      }}>
        <span style={{ fontFamily: tok.fontMono }}>Open →</span>
        {WIco.pin(tok.textFaint, 12)}
      </div>
    </div>
  );
}

Object.assign(window, { WHome, WModules, WModuleCard });
