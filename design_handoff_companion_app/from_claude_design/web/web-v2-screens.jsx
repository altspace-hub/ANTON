// web-v2-screens.jsx — Home variants (editorial/digest/agent) + Sanctions variants (tabbed/drawer)

// ═════════════════════════════════════════════════════════════
//   HOME variant A — Editorial (v1 refined)
// ═════════════════════════════════════════════════════════════
function WHomeEditorial({ tok }) {
  return <WHome tok={tok} />;
}

// ═════════════════════════════════════════════════════════════
//   HOME variant B — Digest (editorial + activity inbox right)
// ═════════════════════════════════════════════════════════════
function WHomeDigest({ tok }) {
  const feed = [
    { when: '14:02', icon: 'shield', tone: 'gold', title: 'Sanctions policy v4 ready for review', sub: 'Board submission · 3,523 words · Think Hard', pill: 'Review' },
    { when: '13:40', icon: 'compass', tone: 'accent', title: 'Pathfinder thread refreshed', sub: 'AMLR RTS from AMLA · 25 sources · 2 new', pill: 'New' },
    { when: '12:15', icon: 'users', tone: 'blue', title: 'Sara commented on Orion policy assessment', sub: '"Can we cite the AMLR final text here?"', pill: '@mention' },
    { when: '11:30', icon: 'radar', tone: 'red', title: 'Radar: 2 new consultations', sub: 'AMLA CDD RTS · EBA screening guidelines · both close in 30d', pill: 'Radar' },
    { when: '09:12', icon: 'sparkles', tone: 'accent', title: 'Your 5-minute brief is ready', sub: 'Overnight regulatory updates · 4 items', pill: 'Brief' },
    { when: '08:58', icon: 'checklist', tone: 'green', title: 'Phase 2A · Client Intelligence complete', sub: 'ICA Eng 2 · moved to Expert Config', pill: 'Engagement' },
    { when: 'yesterday', icon: 'book', tone: 'blue', title: 'KB updated: Sanctions training v3', sub: '12 pages revised · regenerate downstream docs?', pill: 'KB' },
  ];
  const tones = {
    accent: { bg: tok.accentSoft, fg: tok.accent, bd: tok.accentDim },
    gold: { bg: tok.goldSoft, fg: tok.gold, bd: tok.goldDim },
    red: { bg: tok.redSoft, fg: tok.red, bd: tok.redDim },
    green: { bg: tok.greenSoft, fg: tok.green, bd: tok.greenDim },
    blue: { bg: tok.blueSoft, fg: tok.blue, bd: tok.blueDim },
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', minHeight: '100%' }}>
      <div><WHome tok={tok} /></div>
      <div style={{ borderLeft: `1px solid ${tok.borderSoft}`, background: tok.rail, padding: '20px 16px 30px', fontFamily: tok.font }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <WSection tok={tok}>Activity</WSection>
          <WPill tok={tok} tone="red">3 need you</WPill>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {['All', 'Mentions', 'Reviews', 'Radar'].map((t, i) => (
            <div key={t} style={{
              padding: '3px 9px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
              background: i === 0 ? tok.accent : tok.surface, color: i === 0 ? tok.accentFg : tok.textBody,
              border: `1px solid ${i === 0 ? tok.accent : tok.borderSoft}`,
            }}>{t}</div>
          ))}
        </div>
        {feed.map((f, i) => {
          const t = tones[f.tone]; const Ic = WIco[f.icon];
          return (
            <div key={i} style={{
              display: 'flex', gap: 9, padding: '10px 0',
              borderTop: i === 0 ? 'none' : `1px solid ${tok.borderSoft}`,
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 6, flex: '0 0 26px',
                background: t.bg, color: t.fg, border: `1px solid ${t.bd}`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>{Ic && Ic(t.fg, 13)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: tok.text, lineHeight: 1.3 }}>{f.title}</div>
                  <span style={{ fontSize: 10, color: tok.textFaint, fontFamily: tok.fontMono }}>{f.when}</span>
                </div>
                <div style={{ fontSize: 11, color: tok.textMuted, lineHeight: 1.4, marginBottom: 4 }}>{f.sub}</div>
              </div>
            </div>
          );
        })}
        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11.5, color: tok.accent, cursor: 'pointer', fontWeight: 500 }}>
          Open full activity log →
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
//   HOME variant C — Agent Status (what ANTON is doing)
// ═════════════════════════════════════════════════════════════
function WHomeAgent({ tok }) {
  const tasks = [
    { title: 'Refreshing AMLR RTS research',      module: 'Pathfinder', progress: 72, eta: '~1 min', state: 'running' },
    { title: 'Drafting Q1 evidence pack',         module: 'Doc Creation', progress: 40, eta: '~4 min', state: 'running' },
    { title: 'Monitoring Horizon Radar sources',  module: 'Radar', progress: 100, eta: 'hourly', state: 'monitoring' },
    { title: 'Watching EBA + FATF feeds',         module: 'Reg Monitor', progress: 100, eta: 'live', state: 'monitoring' },
    { title: 'Awaiting your review',              module: 'Sanctions Advisory', progress: 100, eta: 'board submission ready', state: 'waiting' },
  ];
  const stateColor = { running: tok.accent, monitoring: tok.blue, waiting: tok.gold };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', minHeight: '100%' }}>
      <div><WHome tok={tok} /></div>
      <div style={{ borderLeft: `1px solid ${tok.borderSoft}`, background: tok.rail, padding: '20px 18px 30px', fontFamily: tok.font }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ position: 'relative', width: 10, height: 10 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: tok.accent }}/>
            <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: tok.accent, opacity: 0.2 }}/>
          </div>
          <WSection tok={tok} style={{ color: tok.accent }}>Agent status · live</WSection>
        </div>
        <div style={{ fontSize: 13, color: tok.textBody, marginBottom: 14, lineHeight: 1.45 }}>
          <b style={{ color: tok.text }}>ANTON is working on 2 things</b> and watching 2 feeds for you. 1 run is ready for your review.
        </div>

        {/* Tasks */}
        {tasks.map((t, i) => (
          <div key={i} style={{
            background: tok.surface, border: `1px solid ${tok.border}`,
            borderRadius: tok.r2, padding: '12px 13px', marginBottom: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: tok.text, lineHeight: 1.3 }}>{t.title}</div>
              <WPill tok={tok} tone={t.state === 'running' ? 'accent' : t.state === 'waiting' ? 'gold' : 'blue'}>
                {t.state}
              </WPill>
            </div>
            <div style={{ fontSize: 10.5, color: tok.textMuted, fontFamily: tok.fontMono, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>{t.module}</span><span>{t.eta}</span>
            </div>
            <div style={{ height: 3, background: tok.surfaceMuted, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${t.progress}%`,
                background: stateColor[t.state],
                borderRadius: 2,
              }}/>
            </div>
          </div>
        ))}

        {/* Resource use */}
        <div style={{
          marginTop: 10, padding: '12px 13px',
          background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.r2,
        }}>
          <WSection tok={tok} style={{ marginBottom: 8 }}>Session resources</WSection>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              ['API spend', '€0.41'], ['Tokens out', '12,850'],
              ['Time saved', '2h 40m'], ['Active since', '08:02'],
            ].map(([l, v], i) => (
              <div key={i}>
                <div style={{ fontSize: 10.5, color: tok.textMuted, fontFamily: tok.fontMono }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: tok.text, letterSpacing: -0.2 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <WBtn tok={tok} variant="secondary" size="sm" block style={{ marginTop: 10 }}
          iconRight={WIco.chevronRight(tok.text, 13)}>Pause all background tasks</WBtn>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
//   SANCTIONS variant A — Tabbed (Controls / Output / Review / History)
// ═════════════════════════════════════════════════════════════
function WSanctionsTabbed({ tok }) {
  const s = WEB_DATA.sanctionsRun;
  const tabs = [
    { id: 'output', label: 'Output', icon: 'book', badge: null },
    { id: 'controls', label: 'Controls', icon: 'settings', badge: null },
    { id: 'review', label: 'Review', icon: 'check', badge: 'Required' },
    { id: 'history', label: 'History', icon: 'history', badge: null },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: tok.bg }}>
      <WRunHeader tok={tok}
        crumbs={['Work', 'Financial crime', 'Sanctions Advisory']}
        title={s.output.title}
        subtitle="Sanctions regime briefings, screening assessments, policy reviews, de-risking analysis."
        chips={[
          'Think Hard', 'Claude Haiku 4.5', 'Balanced',
          { label: '3,523 words', tone: 'neutral' },
          { label: '18 min read', tone: 'neutral' },
          { label: '3 citations', tone: 'accent' },
          { label: 'Draft', tone: 'gold' },
        ]}
        actions={<>
          <WBtn tok={tok} variant="secondary" size="sm" icon={WIco.share(tok.textMuted, 12)}>Share</WBtn>
          <WBtn tok={tok} variant="secondary" size="sm" icon={WIco.download(tok.textMuted, 12)}>Export</WBtn>
          <WBtn tok={tok} variant="primary" size="sm" icon={WIco.check(tok.accentFg, 12)}>Approve</WBtn>
        </>}
      />

      {/* Tabs */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '0 28px', background: tok.surface,
        borderBottom: `1px solid ${tok.borderSoft}`,
      }}>
        {tabs.map((t, i) => {
          const isActive = i === 0;
          const Ic = WIco[t.icon];
          return (
            <div key={t.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '11px 14px', fontSize: 12.5, fontWeight: isActive ? 600 : 500,
              color: isActive ? tok.accent : tok.textBody,
              borderBottom: isActive ? `2px solid ${tok.accent}` : '2px solid transparent',
              marginBottom: -1, cursor: 'pointer',
            }}>
              {Ic && Ic(isActive ? tok.accent : tok.textMuted, 13)}
              {t.label}
              {t.badge && <WPill tok={tok} tone="gold">{t.badge}</WPill>}
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono }}>
          Last run: today 14:06 · 4.2s · Claude Haiku 4.5
        </span>
      </div>

      {/* Body: Output tab */}
      <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 300px', gap: 0 }}>
        <div style={{ padding: '20px 28px 28px', overflow: 'auto' }}>
          {/* Review banner */}
          <div style={{
            background: tok.goldSoft, border: `1px solid ${tok.goldDim}`,
            borderRadius: tok.r2, padding: '10px 14px', marginBottom: 16,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            {WIco.shield(tok.gold, 15)}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: tok.gold, marginBottom: 2 }}>Professional review required · EU AI Act Art. 14</div>
              <div style={{ fontSize: 11.5, color: tok.textBody }}>Open the Review tab to walk through assertions, citations, and sign-off.</div>
            </div>
            <WBtn tok={tok} variant="secondary" size="sm">Open review →</WBtn>
          </div>

          {/* Document */}
          <div style={{ background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.r3, padding: '22px 28px' }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: tok.textBody, whiteSpace: 'pre-wrap' }}>
              {s.output.body}
            </div>
          </div>

          {/* Action bar */}
          <WActionBar tok={tok} style={{ marginTop: 12 }}
            left={<>
              <span style={{ fontSize: 11.5, color: tok.textMuted, marginRight: 6 }}>Export:</span>
              {['DOCX', 'PDF', 'MD'].map(e => <WBtn key={e} tok={tok} variant="secondary" size="sm">{e}</WBtn>)}
              <WBtn tok={tok} variant="secondary" size="sm" icon={WIco.share(tok.textMuted, 12)}>Share</WBtn>
              <WBtn tok={tok} variant="subtle" size="sm">Explain differently</WBtn>
            </>}
            right={<>
              <span style={{ fontSize: 11, color: tok.textMuted }}>Rate:</span>
              <span style={{ fontSize: 12, color: tok.textFaint, letterSpacing: 2 }}>☆ ☆ ☆ ☆ ☆</span>
            </>}
          />

          {/* Transform pills */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {WIco.sparkles(tok.textMuted, 12)} Transform this document
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['Executive one-pager', 'Plain language (CEFR B1)', 'Board slides', 'Client-facing brief'].map((t, i) => (
                <WBtn key={t} tok={tok} variant={i < 2 ? 'accent' : 'secondary'} size="sm">{t}</WBtn>
              ))}
            </div>
          </div>

          <WSuggestedNext tok={tok} items={s.nextSteps.map(n => ({ ...n, icon: 'chevronRight' }))} />
        </div>

        {/* Right rail */}
        <div style={{ borderLeft: `1px solid ${tok.borderSoft}`, background: tok.rail, overflow: 'auto', padding: '16px 14px 24px' }}>
          <WRailCard tok={tok} title="Trust score" right={<WPill tok={tok} tone="green">High</WPill>}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 600, color: tok.green, letterSpacing: -0.4 }}>87</span>
              <span style={{ fontSize: 11, color: tok.textMuted }}>/ 100</span>
            </div>
            <div style={{ fontSize: 11.5, color: tok.textBody, lineHeight: 1.4 }}>
              3 primary regulatory sources. All citations verifiable. 1 section flagged for human review.
            </div>
          </WRailCard>

          <WRailCard tok={tok} title="Citations · 3" right={<span style={{ fontSize: 10.5, color: tok.textMuted, cursor: 'pointer' }}>View all →</span>}>
            {[['AMLR Art. 28(1)', 'Regulation (EU) 2024/1624'], ['EBA RTS on screening', 'Final Report · Dec 2025'], ['FATF R. 6', 'Updated 2024']].map(([a, b]) => (
              <div key={a} style={{ padding: '6px 0', borderTop: `1px solid ${tok.borderSoft}` }}>
                <div style={{ fontSize: 12, color: tok.text, fontWeight: 500 }}>{a}</div>
                <div style={{ fontSize: 10.5, color: tok.textMuted, fontFamily: tok.fontMono }}>{b}</div>
              </div>
            ))}
          </WRailCard>

          <WRailCard tok={tok} title="Run timeline">
            {[['14:02', 'Prompt received', tok.textMuted], ['14:02', 'Searching KB', tok.textMuted], ['14:03', '17 sources retrieved', tok.green], ['14:04', 'Multi-agent reasoning', tok.accent], ['14:06', 'Document drafted', tok.green], ['14:06', 'Awaiting sign-off', tok.gold]].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                <span style={{ fontSize: 10.5, fontFamily: tok.fontMono, color: tok.textMuted, minWidth: 32 }}>{r[0]}</span>
                <WDot c={r[2]} size={6} />
                <span style={{ fontSize: 11.5, color: tok.textBody }}>{r[1]}</span>
              </div>
            ))}
          </WRailCard>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
//   SANCTIONS variant B — Drawer (controls hide when reading)
// ═════════════════════════════════════════════════════════════
function WSanctionsDrawer({ tok }) {
  const s = WEB_DATA.sanctionsRun;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: tok.bg }}>
      <WRunHeader tok={tok}
        crumbs={['Work', 'Financial crime', 'Sanctions Advisory']}
        title={s.output.title}
        subtitle="Read mode · controls hidden to maximise reading space."
        chips={[
          'Think Hard', 'Claude Haiku 4.5',
          { label: '3,523 words · 18 min', tone: 'neutral' },
          { label: '3 citations', tone: 'accent' },
          { label: 'Needs review', tone: 'gold' },
        ]}
        actions={<>
          <WBtn tok={tok} variant="secondary" size="sm" icon={WIco.settings(tok.textMuted, 12)}>Run settings</WBtn>
          <WBtn tok={tok} variant="secondary" size="sm" icon={WIco.history(tok.textMuted, 12)}>History</WBtn>
          <WBtn tok={tok} variant="secondary" size="sm" icon={WIco.download(tok.textMuted, 12)}>Export</WBtn>
          <WBtn tok={tok} variant="primary" size="sm" icon={WIco.check(tok.accentFg, 12)}>Approve</WBtn>
        </>}
      />

      {/* Centered reading column, no rails */}
      <div style={{ flex: 1, overflow: 'auto', padding: '26px 0 40px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 780, maxWidth: 'calc(100% - 48px)' }}>
          <div style={{
            background: tok.goldSoft, border: `1px solid ${tok.goldDim}`,
            borderRadius: tok.r2, padding: '10px 14px', marginBottom: 18,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            {WIco.shield(tok.gold, 15)}
            <div style={{ flex: 1, fontSize: 12, color: tok.textBody }}>
              <b style={{ color: tok.gold }}>Professional review required.</b> Open the review drawer on the right when you're ready to sign off. EU AI Act Art. 14.
            </div>
          </div>

          <div style={{ fontSize: 14.5, lineHeight: 1.7, color: tok.textBody, whiteSpace: 'pre-wrap' }}>
            {s.output.body}
          </div>

          {/* Quiet action bar at the bottom of the reading column */}
          <div style={{
            marginTop: 28, padding: '14px 0 0', borderTop: `1px solid ${tok.borderSoft}`,
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            {WIco.sparkles(tok.accent, 13)}
            <span style={{ fontSize: 12, color: tok.textBody }}>Transform for:</span>
            {['Executive one-pager', 'Plain language', 'Board slides'].map((t, i) => (
              <WBtn key={t} tok={tok} variant={i === 0 ? 'accent' : 'subtle'} size="sm">{t}</WBtn>
            ))}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono }}>Rate: ☆ ☆ ☆ ☆ ☆</span>
          </div>
        </div>
      </div>

      {/* Edge tabs for drawers */}
      <div style={{
        position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: 3,
      }}>
        {[['settings', 'Controls'], ['check', 'Review'], ['history', 'History'], ['book', 'Citations']].map(([ic, lbl]) => (
          <div key={lbl} style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '10px 14px 10px 12px',
            background: tok.surface, border: `1px solid ${tok.border}`,
            borderRight: 'none', borderTopLeftRadius: 8, borderBottomLeftRadius: 8,
            fontSize: 12, color: tok.textBody, cursor: 'pointer',
            boxShadow: tok.shadow,
          }}>
            {WIco[ic](tok.textMuted, 13)} {lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  WHomeEditorial, WHomeDigest, WHomeAgent,
  WSanctionsTabbed, WSanctionsDrawer,
});
