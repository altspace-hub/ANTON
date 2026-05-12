// web-v3-screens.jsx — v3: Home combined (Digest + Agent toggle), Sanctions with full settings panel + bottom chat

// ═════════════════════════════════════════════════════════════
//   HOME v3 — Digest + Agent on the side (toggleable)
// ═════════════════════════════════════════════════════════════
function WHomeCombined({ tok, rightMode: rmInit = 'digest' }) {
  const [rightMode, setRightMode] = React.useState(rmInit);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', minHeight: '100%' }}>
      <div><WHome tok={tok} /></div>
      <div style={{
        borderLeft: `1px solid ${tok.borderSoft}`, background: tok.rail,
        display: 'flex', flexDirection: 'column', minHeight: 0, fontFamily: tok.font,
      }}>
        {/* Toggle header */}
        <div style={{
          padding: '14px 16px 10px', borderBottom: `1px solid ${tok.borderSoft}`,
          display: 'flex', alignItems: 'center', gap: 8, background: tok.surface,
        }}>
          <div style={{ display: 'flex', gap: 3, flex: 1, background: tok.surfaceMuted, padding: 3, borderRadius: 6 }}>
            {[['digest', 'Activity', 'inbox'], ['agent', 'Agent status', 'sparkles']].map(([id, label, icon]) => {
              const active = rightMode === id;
              return (
                <div key={id} onClick={() => setRightMode(id)} style={{
                  flex: 1, padding: '5px 10px', fontSize: 12, fontWeight: active ? 600 : 500,
                  borderRadius: 4, cursor: 'pointer', textAlign: 'center',
                  background: active ? tok.surface : 'transparent',
                  color: active ? tok.text : tok.textMuted,
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}>
                  {WIco[icon] && WIco[icon](active ? tok.accent : tok.textMuted, 12)}
                  {label}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 14px 20px' }}>
          {rightMode === 'digest' ? <HomeDigestBody tok={tok} /> : <HomeAgentBody tok={tok} />}
        </div>
      </div>
    </div>
  );
}

function HomeDigestBody({ tok }) {
  const feed = [
    { when: '14:02', icon: 'shield', tone: 'gold', title: 'Sanctions policy v4 ready for review', sub: 'Board submission · 3,523 words · Think Hard' },
    { when: '13:40', icon: 'compass', tone: 'accent', title: 'Pathfinder thread refreshed', sub: 'AMLR RTS from AMLA · 25 sources · 2 new' },
    { when: '12:15', icon: 'users', tone: 'blue', title: 'Sara commented on Orion policy assessment', sub: '"Can we cite the AMLR final text here?"' },
    { when: '11:30', icon: 'radar', tone: 'red', title: 'Radar: 2 new consultations', sub: 'AMLA CDD RTS · EBA screening guidelines' },
    { when: '09:12', icon: 'sparkles', tone: 'accent', title: 'Your 5-minute brief is ready', sub: 'Overnight regulatory updates · 4 items' },
    { when: '08:58', icon: 'checklist', tone: 'green', title: 'Phase 2A · Client Intelligence complete', sub: 'ICA Eng 2 · moved to Expert Config' },
    { when: 'yesterday', icon: 'book', tone: 'blue', title: 'KB updated: Sanctions training v3', sub: '12 pages revised · regenerate downstream docs?' },
  ];
  const tones = {
    accent: { bg: tok.accentSoft, fg: tok.accent, bd: tok.accentDim },
    gold: { bg: tok.goldSoft, fg: tok.gold, bd: tok.goldDim },
    red: { bg: tok.redSoft, fg: tok.red, bd: tok.redDim },
    green: { bg: tok.greenSoft, fg: tok.green, bd: tok.greenDim },
    blue: { bg: tok.blueSoft, fg: tok.blue, bd: tok.blueDim },
  };
  return (
    <>
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
              <div style={{ fontSize: 11, color: tok.textMuted, lineHeight: 1.4 }}>{f.sub}</div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function HomeAgentBody({ tok }) {
  const tasks = [
    { title: 'Refreshing AMLR RTS research',      module: 'Pathfinder', progress: 72, eta: '~1 min', state: 'running' },
    { title: 'Drafting Q1 evidence pack',         module: 'Doc Creation', progress: 40, eta: '~4 min', state: 'running' },
    { title: 'Monitoring Horizon Radar sources',  module: 'Radar', progress: 100, eta: 'hourly', state: 'monitoring' },
    { title: 'Watching EBA + FATF feeds',         module: 'Reg Monitor', progress: 100, eta: 'live', state: 'monitoring' },
    { title: 'Awaiting your review',              module: 'Sanctions Advisory', progress: 100, eta: 'board submission ready', state: 'waiting' },
  ];
  const stateColor = { running: tok.accent, monitoring: tok.blue, waiting: tok.gold };
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ position: 'relative', width: 10, height: 10 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: tok.accent }}/>
          <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: tok.accent, opacity: 0.2 }}/>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: tok.accent, fontFamily: tok.fontMono, letterSpacing: 0.4, textTransform: 'uppercase' }}>Live · 2 running · 2 watching · 1 waiting</span>
      </div>
      {tasks.map((t, i) => (
        <div key={i} style={{
          background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r2, padding: '11px 12px', marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: tok.text, lineHeight: 1.3 }}>{t.title}</div>
            <WPill tok={tok} tone={t.state === 'running' ? 'accent' : t.state === 'waiting' ? 'gold' : 'blue'}>
              {t.state}
            </WPill>
          </div>
          <div style={{ fontSize: 10.5, color: tok.textMuted, fontFamily: tok.fontMono, marginBottom: 7, display: 'flex', justifyContent: 'space-between' }}>
            <span>{t.module}</span><span>{t.eta}</span>
          </div>
          <div style={{ height: 3, background: tok.surfaceMuted, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${t.progress}%`, background: stateColor[t.state], borderRadius: 2 }}/>
          </div>
        </div>
      ))}
      <div style={{
        marginTop: 8, padding: '11px 12px',
        background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.r2,
      }}>
        <WSection tok={tok} style={{ marginBottom: 8 }}>Session resources</WSection>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[['API spend', '€0.41'], ['Tokens out', '12,850'], ['Time saved', '2h 40m'], ['Active since', '08:02']].map(([l, v], i) => (
            <div key={i}>
              <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono }}>{l}</div>
              <div style={{ fontSize: 13.5, fontWeight: 500, color: tok.text, letterSpacing: -0.2 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════
//   SANCTIONS v3 — collapsible top settings + bottom chat
// ═════════════════════════════════════════════════════════════
function WSanctionsFullRun({ tok }) {
  const s = WEB_DATA.sanctionsRun;
  const [settingsOpen, setSettingsOpen] = React.useState(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: tok.bg, minHeight: 0 }}>
      <WRunHeader tok={tok}
        crumbs={['Work', 'Financial crime', 'Sanctions Advisory']}
        title="Sanctions policy v4 — Board submission"
        subtitle="Sanctions regime briefings, screening assessments, policy reviews, de-risking analysis, incident response guidance."
        chips={[
          { label: 'Think Hard', tone: 'accent' },
          'Claude Haiku 4.5',
          'Balanced',
          { label: 'Sanctions Policy Review', tone: 'neutral' },
          { label: '3,523 words · 18 min', tone: 'neutral' },
          { label: '3 citations', tone: 'accent' },
          { label: 'Needs review', tone: 'gold' },
        ]}
        actions={<>
          <WBtn tok={tok} variant="secondary" size="sm" icon={WIco.share(tok.textMuted, 12)}>Share</WBtn>
          <WBtn tok={tok} variant="secondary" size="sm" icon={WIco.download(tok.textMuted, 12)}>Export</WBtn>
          <WBtn tok={tok} variant="primary" size="sm" icon={WIco.check(tok.accentFg, 12)}>Approve</WBtn>
        </>}
      />

      {/* Collapsible Settings header */}
      <div
        onClick={() => setSettingsOpen(!settingsOpen)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 28px', background: tok.surface,
          borderBottom: `1px solid ${tok.borderSoft}`, cursor: 'pointer',
        }}>
        {WIco.settings(tok.textMuted, 13)}
        <span style={{ fontSize: 12.5, fontWeight: 600, color: tok.text }}>Run configuration</span>
        <span style={{ fontSize: 11, color: tok.textMuted }}>
          Think Hard · Haiku 4.5 · Balanced · Persona · Multi-agent off · Sanctions Policy Review · DORA
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono }}>
          {settingsOpen ? 'Hide' : 'Show'}
        </span>
        {settingsOpen ? WIco.chevronDown(tok.textMuted, 14) : WIco.chevronRight(tok.textMuted, 14)}
      </div>

      {settingsOpen && <SanctionsSettingsPanel tok={tok} s={s} />}

      {/* Body: output + right rail */}
      <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 300px', gap: 0, minHeight: 0 }}>
        <div style={{ padding: '20px 28px 20px', overflow: 'auto' }}>
          <div style={{
            background: tok.goldSoft, border: `1px solid ${tok.goldDim}`,
            borderRadius: tok.r2, padding: '10px 14px', marginBottom: 16,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            {WIco.shield(tok.gold, 15)}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: tok.gold, marginBottom: 2 }}>Professional review required · EU AI Act Art. 14</div>
              <div style={{ fontSize: 11.5, color: tok.textBody }}>This AI run requires professional sign-off before user-in-compliance decisions.</div>
            </div>
          </div>

          <div style={{ background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.r3, padding: '22px 28px' }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: tok.textBody, whiteSpace: 'pre-wrap' }}>
              {s.output.body}
            </div>
          </div>

          <WActionBar tok={tok} style={{ marginTop: 12 }}
            left={<>
              <span style={{ fontSize: 11.5, color: tok.textMuted, marginRight: 4 }}>Export:</span>
              {['DOCX', 'PDF', 'MD'].map(e => <WBtn key={e} tok={tok} variant="secondary" size="sm">{e}</WBtn>)}
              <WBtn tok={tok} variant="secondary" size="sm" icon={WIco.share(tok.textMuted, 12)}>Share</WBtn>
              <WBtn tok={tok} variant="subtle" size="sm">Explain differently</WBtn>
            </>}
            right={<>
              <span style={{ fontSize: 11, color: tok.textMuted }}>Rate:</span>
              <span style={{ fontSize: 12, color: tok.textFaint, letterSpacing: 2 }}>☆ ☆ ☆ ☆ ☆</span>
            </>}
          />

          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {WIco.sparkles(tok.textMuted, 12)} Transform this document
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {s.transform.map((t, i) => (
                <WBtn key={i} tok={tok} variant={t.active ? 'accent' : 'secondary'} size="sm">{t.label}</WBtn>
              ))}
              <WBtn tok={tok} variant="secondary" size="sm">Board slides</WBtn>
              <WBtn tok={tok} variant="secondary" size="sm">Client brief</WBtn>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <WSuggestedNext tok={tok} items={s.nextSteps.map(n => ({ ...n, icon: 'chevronRight' }))} />
          </div>
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
          <WRailCard tok={tok} title="Citations · 3">
            {[['AMLR Art. 28(1)', 'Regulation (EU) 2024/1624'], ['EBA RTS on screening', 'Final Report · Dec 2025'], ['FATF R. 6', 'Updated 2024']].map(([a, b], i) => (
              <div key={i} style={{ padding: '6px 0', borderTop: i === 0 ? 'none' : `1px solid ${tok.borderSoft}` }}>
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

      {/* Bottom chat composer */}
      <SanctionsComposer tok={tok} />
    </div>
  );
}

// ─── The full settings panel (depth/model/persona/multi-agent/...) ──
function SanctionsSettingsPanel({ tok, s }) {
  return (
    <div style={{
      padding: '14px 28px 16px', background: tok.surface,
      borderBottom: `1px solid ${tok.borderSoft}`,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
        {/* Depth */}
        <SettingBlock tok={tok} label="How deeply should Claude analyse?">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 3 }}>
            {s.depth.map((d, i) => {
              const active = d.selected;
              return (
                <div key={d.id} style={{
                  padding: '8px 4px', textAlign: 'center', fontSize: 10.5, fontWeight: active ? 600 : 500,
                  border: `1px solid ${active ? tok.accent : tok.border}`,
                  background: active ? tok.accentSoft : tok.surface,
                  color: active ? tok.accent : tok.textBody,
                  borderRadius: 5, cursor: 'pointer', lineHeight: 1.1,
                }}>{d.label}{d.badge && <div style={{ fontSize: 8, color: tok.textFaint, marginTop: 2 }}>{d.badge}</div>}</div>
              );
            })}
          </div>
        </SettingBlock>

        {/* Model */}
        <SettingBlock tok={tok} label="Model">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 11px', border: `1px solid ${tok.border}`,
            background: tok.surface, borderRadius: 5, fontSize: 12, color: tok.text, cursor: 'pointer',
          }}>
            <WDot c={tok.accent} size={6} />
            <span style={{ flex: 1 }}>{s.model}</span>
            {WIco.chevronDown(tok.textMuted, 12)}
          </div>
        </SettingBlock>

        {/* Precision */}
        <SettingBlock tok={tok} label="Precision" right={<span style={{ fontSize: 10, color: tok.textFaint }}>Controls temperature / creativity</span>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
            {s.precision.map((p, i) => {
              const active = i === s.precisionSelected;
              return (
                <div key={p} style={{
                  padding: '6px 4px', textAlign: 'center', fontSize: 10.5, fontWeight: active ? 600 : 500,
                  border: `1px solid ${active ? tok.accent : tok.border}`,
                  background: active ? tok.accentSoft : tok.surface,
                  color: active ? tok.accent : tok.textBody, borderRadius: 5, cursor: 'pointer',
                }}>{p}</div>
              );
            })}
          </div>
        </SettingBlock>

        {/* Writing style */}
        <SettingBlock tok={tok} label="Writing style">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
            {s.writing.map((w, i) => {
              const active = i === s.writingSelected;
              return (
                <div key={w} style={{
                  padding: '6px 4px', textAlign: 'center', fontSize: 10.5, fontWeight: active ? 600 : 500,
                  border: `1px solid ${active ? tok.accent : tok.border}`,
                  background: active ? tok.accentSoft : tok.surface,
                  color: active ? tok.accent : tok.textBody, borderRadius: 5, cursor: 'pointer',
                }}>{w}</div>
              );
            })}
          </div>
          <div style={{ fontSize: 10.5, color: tok.textMuted, marginTop: 5, fontStyle: 'italic' }}>{s.writingDesc}</div>
        </SettingBlock>
      </div>

      {/* Row 2: toggles and config fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.3fr', gap: 18, marginTop: 14 }}>
        {/* Persona + toggles stacked */}
        <div>
          <ToggleRow tok={tok} label="Persona" on pill="13 available" />
          <ToggleRow tok={tok} label="Multi-Agent Mode" on={false} />
          <ToggleRow tok={tok} label="De-liberation Mode" on={false} />
        </div>

        {/* Output Controls */}
        <SettingBlock tok={tok} label="Output Controls">
          <div style={{ fontSize: 10.5, color: tok.textMuted, marginBottom: 4 }}>Writing tone</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, marginBottom: 8 }}>
            {['Formal', 'Professional', 'Casual', 'Conversational'].map((t, i) => {
              const active = i === 1;
              return (
                <div key={t} style={{
                  padding: '5px 4px', textAlign: 'center', fontSize: 10, fontWeight: active ? 600 : 500,
                  border: `1px solid ${active ? tok.accent : tok.border}`,
                  background: active ? tok.accentSoft : tok.surface,
                  color: active ? tok.accent : tok.textBody, borderRadius: 4, cursor: 'pointer',
                }}>{t}</div>
              );
            })}
          </div>
          <div style={{ fontSize: 10.5, color: tok.textMuted, marginBottom: 4 }}>Reasoning · Approach Transparency</div>
          <div style={{ display: 'flex', gap: 3 }}>
            {['Off', 'Summary', 'Detailed'].map((t, i) => {
              const active = i === 1;
              return (
                <div key={t} style={{
                  flex: 1, padding: '5px 4px', textAlign: 'center', fontSize: 10, fontWeight: active ? 600 : 500,
                  border: `1px solid ${active ? tok.accent : tok.border}`,
                  background: active ? tok.accentSoft : tok.surface,
                  color: active ? tok.accent : tok.textBody, borderRadius: 4, cursor: 'pointer',
                }}>{t}</div>
              );
            })}
          </div>
        </SettingBlock>

        {/* Knowledge / Memory */}
        <SettingBlock tok={tok} label="Knowledge · Memory">
          <ToggleRow tok={tok} label="Use prior insights" on small />
          <div style={{ fontSize: 10, color: tok.textFaint, marginTop: -4, marginBottom: 6 }}>Recall insights from past sessions</div>
          <ToggleRow tok={tok} label="Build & update" on small />
          <div style={{ fontSize: 10, color: tok.textFaint, marginTop: -4 }}>Save new insights to knowledge base</div>
        </SettingBlock>

        {/* Module Settings */}
        <SettingBlock tok={tok} label="Module Settings">
          <div style={{ fontSize: 10.5, color: tok.textMuted, marginBottom: 4 }}>Task Type</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', border: `1px solid ${tok.border}`,
            background: tok.surface, borderRadius: 4, fontSize: 11, color: tok.text, marginBottom: 8, cursor: 'pointer',
          }}>
            <span style={{ flex: 1 }}>Sanctions Policy Review</span>
            {WIco.chevronDown(tok.textMuted, 11)}
          </div>
          <div style={{ fontSize: 10.5, color: tok.textMuted, marginBottom: 4 }}>Sanctions Regimes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
            {['EU', 'US / OFAC', 'UK', 'UN', 'Russia · Iran · DPRK', 'Other'].map((t, i) => (
              <div key={t} style={{
                padding: '5px 3px', textAlign: 'center', fontSize: 9.5, fontWeight: i < 4 ? 600 : 500,
                border: `1px solid ${i < 4 ? tok.accent : tok.border}`,
                background: i < 4 ? tok.accentSoft : tok.surface,
                color: i < 4 ? tok.accent : tok.textBody, borderRadius: 4, cursor: 'pointer',
                gridColumn: i === 4 ? 'span 2' : 'auto',
              }}>{t}</div>
            ))}
          </div>
        </SettingBlock>
      </div>

      {/* Row 3: situation + uploads */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 14 }}>
        <SettingBlock tok={tok} label="Situation / Context">
          <div style={{
            minHeight: 50, padding: '8px 10px',
            border: `1px solid ${tok.border}`, background: tok.surface,
            borderRadius: 5, fontSize: 11.5, color: tok.text, lineHeight: 1.4,
          }}>
            Swedish bank (ICA Banken, mid-tier). Context is a board-level assessment of sanctions framework readiness against EBA/GL/2024/14 and EBA/GL/2024/15. Focus on screening, CDD, de-risking and 2nd-line oversight.
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, color: tok.textFaint, fontFamily: tok.fontMono }}>Advanced Settings</span>
            {WIco.chevronRight(tok.textFaint, 10)}
          </div>
        </SettingBlock>

        <SettingBlock tok={tok} label="Uploaded Documents" right={<span style={{ fontSize: 10.5, color: tok.accent, cursor: 'pointer' }}>+ Add file</span>}>
          <div style={{
            padding: '14px 12px', textAlign: 'center',
            border: `1px dashed ${tok.border}`, background: tok.surfaceAlt,
            borderRadius: 5, fontSize: 11, color: tok.textMuted,
          }}>
            <div style={{ marginBottom: 4 }}>Drag & drop files here, or browse</div>
            <div style={{ fontSize: 10, color: tok.textFaint, fontFamily: tok.fontMono }}>
              PDF · DOCX · TXT · XLSX · HTML · images (PNG, JPG, WebP) · max 50MB
            </div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', background: tok.accentSoft, borderRadius: 4, fontSize: 11, color: tok.accent, border: `1px solid ${tok.accentDim}` }}>
            {WIco.book(tok.accent, 12)}
            <span style={{ flex: 1 }}>board_report_draft.pdf</span>
            <span style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono }}>1.4 MB</span>
          </div>
        </SettingBlock>
      </div>
    </div>
  );
}

function SettingBlock({ tok, label, right, children }) {
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 10.5, fontWeight: 600, color: tok.textMuted,
        fontFamily: tok.fontMono, letterSpacing: 0.5, textTransform: 'uppercase',
        marginBottom: 6,
      }}>
        <span>{label}</span>
        {right}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ tok, label, on, pill, small }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: small ? '4px 0' : '8px 10px',
      background: small ? 'transparent' : tok.surface,
      border: small ? 'none' : `1px solid ${tok.border}`,
      borderRadius: 5, marginBottom: small ? 2 : 6,
    }}>
      <span style={{ fontSize: 11.5, color: tok.text, flex: 1, fontWeight: 500 }}>{label}</span>
      {pill && <WPill tok={tok} tone="accent">{pill}</WPill>}
      <div style={{
        width: 28, height: 15, borderRadius: 8, position: 'relative',
        background: on ? tok.accent : tok.surfaceMuted,
        border: `1px solid ${on ? tok.accent : tok.border}`, cursor: 'pointer',
      }}>
        <div style={{
          position: 'absolute', top: 1, left: on ? 14 : 1,
          width: 11, height: 11, borderRadius: '50%',
          background: '#fff', transition: 'left 120ms',
        }}/>
      </div>
    </div>
  );
}

// ─── Bottom chat composer ───────────────────────────────────
function SanctionsComposer({ tok }) {
  return (
    <div style={{
      borderTop: `1px solid ${tok.borderSoft}`, background: tok.surface,
      padding: '12px 28px 14px',
    }}>
      {/* History strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 11, color: tok.textMuted }}>
        <span style={{ fontFamily: tok.fontMono }}>History 3/6</span>
        <span style={{ flex: 1, height: 1, background: tok.borderSoft }} />
        {['v1 Initial draft', 'v2 Expanded', 'v3 Final · current'].map((v, i) => {
          const active = i === 2;
          return (
            <div key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 8px', fontSize: 11, borderRadius: 4,
              background: active ? tok.accentSoft : 'transparent',
              color: active ? tok.accent : tok.textMuted,
              border: `1px solid ${active ? tok.accentDim : tok.borderSoft}`,
              cursor: 'pointer',
            }}>
              {active && <WDot c={tok.accent} size={5} />}
              {v}
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div style={{
        background: tok.bg, border: `1px solid ${tok.border}`,
        borderRadius: 10, padding: '10px 12px 8px',
      }}>
        <div style={{
          minHeight: 44, fontSize: 13, color: tok.textMuted, lineHeight: 1.5,
          padding: '2px 0 6px',
        }}>
          Ask a follow-up question or request changes — e.g. "Tighten Phase 3 to one paragraph and add a risk matrix for Section 7."
          <span style={{ display: 'inline-block', width: 1.5, height: 14, background: tok.accent, verticalAlign: -2, marginLeft: 2 }}/>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          paddingTop: 6, borderTop: `1px solid ${tok.borderSoft}`,
        }}>
          <WBtn tok={tok} variant="subtle" size="sm" icon={WIco.plus(tok.textMuted, 12)}>Attach</WBtn>
          <WBtn tok={tok} variant="subtle" size="sm" icon={WIco.sparkles(tok.textMuted, 12)}>Prompt Lib</WBtn>
          <WBtn tok={tok} variant="subtle" size="sm" icon={WIco.book(tok.textMuted, 12)}>KB</WBtn>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10.5, color: tok.textFaint, fontFamily: tok.fontMono }}>0 / 8k · Haiku 4.5 · €0.004/msg</span>
          <WBtn tok={tok} variant="secondary" size="sm">Re-run</WBtn>
          <WBtn tok={tok} variant="primary" size="sm" iconRight={WIco.chevronRight(tok.accentFg, 12)}>Send</WBtn>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  WHomeCombined, WSanctionsFullRun,
});
