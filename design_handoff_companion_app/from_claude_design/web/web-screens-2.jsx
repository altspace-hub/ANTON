// web-screens-2.jsx — Sanctions Advisory + Pathfinder + Open Chat.

// ═══════════════════════════════════════════════════════════
//   SANCTIONS ADVISORY — dense work surface, 3-pane
// ═══════════════════════════════════════════════════════════
function WSanctions({ tok }) {
  const s = WEB_DATA.sanctionsRun;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '300px 1fr 280px',
      height: '100%',
      fontFamily: tok.font, color: tok.text,
      background: tok.bg,
    }}>
      {/* LEFT: controls rail */}
      <div style={{
        borderRight: `1px solid ${tok.borderSoft}`,
        overflow: 'auto', padding: '16px 16px 24px',
        background: tok.surfaceAlt,
      }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono, marginBottom: 10 }}>
          Work / Sanctions Advisory
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px', letterSpacing: -0.3 }}>{s.title}</h2>
        <div style={{ fontSize: 11.5, color: tok.textMuted, lineHeight: 1.45, marginBottom: 16 }}>
          {s.subtitle}
        </div>

        {/* Depth selector */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, color: tok.textBody, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            How deeply should Claude analyze?
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: tok.surfaceMuted, color: tok.textMuted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontFamily: tok.fontMono }}>i</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {s.depth.map(d => (
              <div key={d.id} style={{
                padding: '8px 4px', textAlign: 'center', cursor: 'pointer',
                fontSize: 11, fontWeight: 500,
                background: d.selected ? tok.accentSoft : tok.surface,
                color: d.selected ? tok.accent : tok.textBody,
                border: d.selected ? `1px solid ${tok.accent}` : `1px solid ${tok.borderSoft}`,
                borderRadius: tok.r1,
                position: 'relative',
              }}>
                {d.label}
                {d.badge && <div style={{ fontSize: 8, fontFamily: tok.fontMono, color: tok.textFaint, marginTop: 2 }}>{d.badge}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Model */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, color: tok.textBody, marginBottom: 6 }}>Model</div>
          <div style={{
            padding: '8px 12px', fontSize: 12.5,
            background: tok.surface, border: `1px solid ${tok.borderSoft}`,
            borderRadius: tok.r1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>{s.model}</span>
            {WIco.chevronDown(tok.textMuted, 12)}
          </div>
        </div>

        {/* Precision */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, color: tok.textBody, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span>Precision</span>
            <span style={{ fontSize: 10.5, color: tok.textFaint }}>Controls temperature across providers</span>
          </div>
          <div style={{ display: 'flex', gap: 0, background: tok.surface, border: `1px solid ${tok.borderSoft}`, borderRadius: tok.r1, padding: 2 }}>
            {s.precision.map((p, i) => (
              <div key={p} style={{
                flex: 1, padding: '5px 6px', textAlign: 'center', fontSize: 10.5,
                background: i === s.precisionSelected ? tok.accent : 'transparent',
                color: i === s.precisionSelected ? tok.accentFg : tok.textBody,
                borderRadius: 4, cursor: 'pointer', fontWeight: i === s.precisionSelected ? 500 : 400,
              }}>{p}</div>
            ))}
          </div>
        </div>

        {/* Writing style */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, color: tok.textBody, marginBottom: 6 }}>Writing style</div>
          <div style={{ display: 'flex', gap: 0, background: tok.surface, border: `1px solid ${tok.borderSoft}`, borderRadius: tok.r1, padding: 2, marginBottom: 6 }}>
            {s.writing.map((w, i) => (
              <div key={w} style={{
                flex: 1, padding: '6px 8px', textAlign: 'center', fontSize: 11.5,
                background: i === s.writingSelected ? tok.accent : 'transparent',
                color: i === s.writingSelected ? tok.accentFg : tok.textBody,
                borderRadius: 4, cursor: 'pointer', fontWeight: i === s.writingSelected ? 500 : 400,
              }}>{w}</div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: tok.textMuted, lineHeight: 1.3 }}>{s.writingDesc}</div>
        </div>

        {/* Collapsed sections */}
        {[
          { label: 'Persona', right: <WPill tok={tok} tone="neutral" mono>V5</WPill> },
          { label: 'Reasoning options' },
          { label: 'Multi-Agent Mode', toggle: false },
          { label: 'Deliberation Mode', toggle: false },
          { label: 'Output Controls' },
          { label: 'Approach Transparency' },
        ].map(row => (
          <div key={row.label} style={{
            padding: '9px 11px', background: tok.surface,
            border: `1px solid ${tok.borderSoft}`, borderRadius: tok.r1,
            marginBottom: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 12, fontWeight: 500, cursor: 'pointer',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {row.label}
              {row.right}
            </span>
            {row.toggle != null ? (
              <div style={{
                width: 26, height: 14, borderRadius: 7,
                background: row.toggle ? tok.accent : tok.surfaceMuted,
                position: 'relative', border: `1px solid ${tok.borderSoft}`,
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: '#fff', position: 'absolute',
                  top: 1, left: row.toggle ? 13 : 1,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }}/>
              </div>
            ) : WIco.chevronDown(tok.textMuted, 13)}
          </div>
        ))}
      </div>

      {/* CENTER: output */}
      <div style={{ overflow: 'auto', padding: '16px 24px 24px' }}>
        {/* Review required banner */}
        <div style={{
          background: tok.goldSoft, border: `1px solid ${tok.goldDim}`,
          borderRadius: tok.r2, padding: '10px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          {WIco.shield(tok.gold, 15)}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: tok.gold, marginBottom: 2 }}>Professional review required</div>
            <div style={{ fontSize: 11.5, color: tok.textBody, lineHeight: 1.4 }}>
              This AI analysis requires professional sign-off before use in compliance decisions. EU AI Act Art. 14.
            </div>
          </div>
          {WIco.chevronDown(tok.textMuted, 14)}
        </div>

        {/* Document */}
        <div style={{
          background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r3, padding: '22px 28px 18px',
          marginBottom: 14,
        }}>
          <div style={{ fontFamily: tok.fontMono, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: tok.textMuted, marginBottom: 6 }}>Document</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: '0 0 10px' }}>{s.output.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {s.output.meta.split(' · ').map(m => (
              <WPill key={m} tok={tok} tone="neutral">{m}</WPill>
            ))}
            <WPill tok={tok} tone="red">33% incomplete</WPill>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: tok.textBody, whiteSpace: 'pre-wrap' }}>
            {s.output.body}
          </div>
        </div>

        {/* Action bar */}
        <div style={{
          background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r2, padding: '10px 14px', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11.5, color: tok.textMuted, marginRight: 6 }}>Export:</span>
          {['DOCX', 'PDF', 'MD'].map(e => <WBtn key={e} tok={tok} variant="secondary" size="sm">{e}</WBtn>)}
          <WBtn tok={tok} variant="secondary" size="sm" icon={WIco.share(tok.textMuted, 12)}>Share</WBtn>
          <WBtn tok={tok} variant="secondary" size="sm">Explain differently</WBtn>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: tok.textMuted }}>Rate output quality:</span>
          <span style={{ fontSize: 12, color: tok.textFaint, letterSpacing: 2 }}>☆ ☆ ☆ ☆ ☆</span>
        </div>

        {/* Transform */}
        <div style={{
          background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r2, padding: '12px 14px', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <WSection tok={tok}>Transform</WSection>
              <span style={{ fontSize: 11.5, color: tok.textMuted }}>Adapt for audience</span>
            </div>
            <span style={{ fontSize: 11, color: tok.textMuted }}>4 available</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {s.transform.map(t => (
              <div key={t.id} style={{
                padding: '6px 12px', fontSize: 12, fontWeight: 500,
                background: tok.accent, color: tok.accentFg,
                borderRadius: tok.r1, display: 'inline-flex', gap: 5, alignItems: 'center',
              }}>
                {t.label}
                <span style={{ fontSize: 9, opacity: 0.7, fontFamily: tok.fontMono }}>{t.badge}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Review status + tools */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', background: tok.surface,
          border: `1px solid ${tok.border}`, borderRadius: tok.r2, marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11.5, color: tok.textMuted }}>Review status:</span>
            <WPill tok={tok} tone="neutral">Draft</WPill>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <WBtn tok={tok} variant="secondary" size="sm">Mark reviewed</WBtn>
            <WBtn tok={tok} variant="primary" size="sm">Approve</WBtn>
          </div>
        </div>

        {/* Tool row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
          padding: '10px 14px', background: tok.surface,
          border: `1px solid ${tok.border}`, borderRadius: tok.r2, marginBottom: 10,
        }}>
          {[
            ['Trust score', 'shield'], ['How ANTON thought', 'sparkles'],
            ['Citations', 'book'], ['Review', 'check'],
            ['Thinking', 'compass'], ['History', 'history'],
            ['Full prompt', 'terminal'], ['Feedback', 'message'], ['Save', 'download'],
          ].map(([label, icon]) => (
            <WBtn key={label} tok={tok} variant="ghost" size="sm" icon={WIco[icon] && WIco[icon](tok.textMuted, 12)}>{label}</WBtn>
          ))}
        </div>

        {/* Next steps hint */}
        <div style={{
          background: tok.accentSoft, border: `1px solid ${tok.accentDim}`,
          borderRadius: tok.r2, padding: '10px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {WIco.sparkles(tok.accent, 14)}
          <span style={{ flex: 1, fontSize: 12.5, color: tok.text }}>
            Generated at <b>Think Hard</b>. Re-run at Investigate for deeper analysis.
          </span>
          <WBtn tok={tok} variant="primary" size="sm" iconRight={WIco.chevronRight(tok.accentFg, 12)}>Switch to Investigate</WBtn>
        </div>

        {/* Suggested next */}
        <div>
          <div style={{ fontSize: 12, color: tok.textMuted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            {WIco.chevronRight(tok.textMuted, 13)} Suggested next steps
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {s.nextSteps.map(n => (
              <div key={n.title} style={{
                padding: '12px 14px', background: tok.surface,
                border: `1px solid ${tok.border}`, borderRadius: tok.r2, cursor: 'pointer',
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{n.title}</div>
                <div style={{ fontSize: 11.5, color: tok.textMuted }}>{n.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT: history / thinking rail */}
      <div style={{
        borderLeft: `1px solid ${tok.borderSoft}`,
        background: tok.rail, overflow: 'auto', padding: '14px 14px 24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <WSection tok={tok}>Run context</WSection>
          {WIco.moreV(tok.textMuted, 14)}
        </div>

        {/* Trust score card */}
        <div style={{
          background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r2, padding: '12px 13px', marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono, marginBottom: 4 }}>TRUST SCORE</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 600, color: tok.green, letterSpacing: -0.3 }}>87</span>
            <span style={{ fontSize: 11, color: tok.textMuted }}>/ 100</span>
          </div>
          <div style={{ fontSize: 11, color: tok.textBody, lineHeight: 1.4 }}>
            High. 3 primary regulatory sources. All citations verifiable. 1 section flagged for human review.
          </div>
        </div>

        {/* Citations */}
        <div style={{
          background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r2, padding: '12px 13px', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono }}>CITATIONS · 3</div>
            <span style={{ fontSize: 10.5, color: tok.textMuted, cursor: 'pointer' }}>View all →</span>
          </div>
          {[
            ['AMLR Art. 28(1)', 'Regulation (EU) 2024/1624'],
            ['EBA RTS on screening', 'Final Report · Dec 2025'],
            ['FATF Recommendation 6', 'Updated 2024'],
          ].map(([a, b]) => (
            <div key={a} style={{ padding: '6px 0', borderTop: `1px solid ${tok.borderSoft}` }}>
              <div style={{ fontSize: 12, color: tok.text, fontWeight: 500 }}>{a}</div>
              <div style={{ fontSize: 10.5, color: tok.textMuted, fontFamily: tok.fontMono }}>{b}</div>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div style={{
          background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r2, padding: '12px 13px', marginBottom: 10,
        }}>
          <div style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono, marginBottom: 10 }}>RUN TIMELINE</div>
          {[
            ['14:02', 'Prompt received', tok.textMuted],
            ['14:02', 'Searching knowledge base', tok.textMuted],
            ['14:03', 'Retrieved 17 sources', tok.green],
            ['14:04', 'Multi-agent reasoning', tok.accent],
            ['14:06', 'Document drafted', tok.green],
            ['14:06', 'Awaiting sign-off', tok.gold],
          ].map(([t, lbl, c], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
              <span style={{ fontSize: 10.5, fontFamily: tok.fontMono, color: tok.textMuted, minWidth: 32 }}>{t}</span>
              <WDot c={c} size={6} />
              <span style={{ fontSize: 11.5, color: tok.textBody }}>{lbl}</span>
            </div>
          ))}
        </div>

        <WBtn tok={tok} variant="secondary" size="sm" block iconRight={WIco.chevronRight(tok.text, 13)}>Explain for…</WBtn>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//   PATHFINDER — thinking search, 2-pane sources+answer
// ═══════════════════════════════════════════════════════════
function WPathfinder({ tok }) {
  const p = WEB_DATA.pathfinder;
  return (
    <div style={{ padding: '20px 28px 30px', maxWidth: 1300, margin: '0 auto', fontFamily: tok.font, color: tok.text }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          {WIco.compass(tok.accent, 18)}
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, margin: 0 }}>Pathfinder</h1>
          <WPill tok={tok} tone="neutral">+ Thread</WPill>
        </div>
        <div style={{ fontSize: 12.5, color: tok.textBody, marginBottom: 14 }}>
          Search that thinks before it answers. You're never the product.
        </div>

        {/* Search bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r2, padding: '10px 12px', marginBottom: 12,
        }}>
          {WIco.search(tok.textMuted, 16)}
          <span style={{ flex: 1, fontSize: 14, color: tok.text }}>{p.query}</span>
          <WBtn tok={tok} variant="subtle" size="sm" icon={WIco.sparkles(tok.accent, 12)}>Clarify</WBtn>
          <WBtn tok={tok} variant="primary" size="sm">Search</WBtn>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {['All', 'Knowledge', 'Shopping', 'Travel', 'Food', 'Fix', 'News', 'Local'].map((t, i) => (
              <div key={t} style={{
                padding: '4px 10px', fontSize: 11.5, fontWeight: i === 1 ? 500 : 400,
                background: i === 1 ? tok.accent : 'transparent',
                color: i === 1 ? tok.accentFg : tok.textBody,
                borderRadius: 5, cursor: 'pointer',
              }}>{t}</div>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 0, padding: 2, background: tok.surface, border: `1px solid ${tok.borderSoft}`, borderRadius: tok.r1 }}>
            {p.depth.map(d => (
              <div key={d.id} style={{
                padding: '4px 11px', fontSize: 11.5, borderRadius: 4,
                background: d.selected ? tok.accent : 'transparent',
                color: d.selected ? tok.accentFg : tok.textBody, cursor: 'pointer', fontWeight: d.selected ? 500 : 400,
              }}>{d.label}</div>
            ))}
          </div>
          <WBtn tok={tok} variant="ghost" size="sm">Add docs</WBtn>
        </div>
      </div>

      {/* Two-column: sources | answer */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 14 }}>
        {/* Sources */}
        <div style={{
          background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r2, padding: '14px 14px 10px',
          height: 620, overflow: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <WSection tok={tok}>Sources</WSection>
            <WPill tok={tok} tone="accent">{p.sources.length + 15}</WPill>
          </div>
          {p.sources.map((s, i) => (
            <div key={i} style={{
              padding: '9px 0', borderTop: i === 0 ? 'none' : `1px solid ${tok.borderSoft}`,
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 4, flex: '0 0 22px',
                  background: s.trust === 'high' ? tok.greenSoft : tok.goldSoft,
                  color: s.trust === 'high' ? tok.green : tok.gold,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, fontFamily: tok.fontMono,
                }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: tok.text, lineHeight: 1.3, marginBottom: 3 }}>
                    {s.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: tok.textMuted, fontFamily: tok.fontMono }}>
                    <span>{s.host}</span>
                    <WPill tok={tok} tone={s.trust === 'high' ? 'green' : 'gold'}>{s.type}</WPill>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ textAlign: 'center', padding: '10px 0 2px', fontSize: 11.5, color: tok.textMuted, cursor: 'pointer' }}>+15 more sources</div>
        </div>

        {/* Answer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            background: tok.surface, border: `1px solid ${tok.border}`,
            borderRadius: tok.r2, padding: '18px 22px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              {WIco.sparkles(tok.accent, 14)}
              <WSection tok={tok}>Answer</WSection>
            </div>
            <h2 style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.2, margin: '0 0 10px', lineHeight: 1.3 }}>
              {p.answer.title}
            </h2>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: tok.textBody, whiteSpace: 'pre-wrap' }}>
              {p.answer.body}
            </div>
          </div>

          <div style={{
            background: tok.goldSoft, border: `1px solid ${tok.goldDim}`,
            borderRadius: tok.r2, padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              {WIco.shield(tok.gold, 13)}
              <div style={{ fontSize: 11.5, color: tok.gold, fontWeight: 600, fontFamily: tok.fontMono, letterSpacing: 0.4, textTransform: 'uppercase' }}>Why these results</div>
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: tok.textBody }}>
              {p.why}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//   OPEN CHAT — center thread + right history
// ═══════════════════════════════════════════════════════════
function WOpenChat({ tok }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', height: '100%', fontFamily: tok.font, color: tok.text }}>
      {/* Main thread */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <div style={{ padding: '14px 28px 10px', borderBottom: `1px solid ${tok.borderSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono, marginBottom: 2 }}>Open Chat</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: -0.3, margin: 0 }}>Prompt</h1>
            <div style={{ fontSize: 11.5, color: tok.textMuted, marginTop: 3 }}>Direct conversation with Claude · no module constraints — ask anything.</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <WBtn tok={tok} variant="secondary" size="sm">Clear</WBtn>
            <WBtn tok={tok} variant="secondary" size="sm" icon={WIco.settings(tok.textMuted, 12)}>Settings</WBtn>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 28px' }}>
          <div style={{
            background: tok.surface, border: `1px solid ${tok.border}`,
            borderRadius: tok.r3, padding: '22px 28px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 6, background: tok.accent, color: tok.accentFg,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
              }}>A</div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>ANTON</div>
              <WPill tok={tok} tone="neutral">Claude Haiku 4.5</WPill>
              <span style={{ fontSize: 10.5, color: tok.textMuted, marginLeft: 'auto', fontFamily: tok.fontMono }}>18 Mar · 14:06</span>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: tok.textBody }}>
              <b style={{ color: tok.text }}>8. Next steps (if recommendation approved)</b>
              <div style={{ marginTop: 8 }}>
                <b>This week:</b> Board approves this assessment and authorises Phase 1 (Governance &amp; Appointments).<br/>
                <b>By end of March 2026:</b> Sanctions Compliance Officer appointed; revised governance framework documented.<br/>
                <b>By end of May 2026:</b> SREA completed and documented.<br/>
                <b>By end of August 2026:</b> All operational procedures designed, tested, and documented.<br/>
                <b>By end of September 2026:</b> Policy v4.0 approved by Board; staff training completed.<br/>
                <b>By end of December 2026:</b> Full compliance achieved; supervisory file prepared.<br/>
                <br/>
                <span style={{ fontFamily: tok.fontMono, fontSize: 12 }}>Document prepared: 27 March 2026 · Status: Ready for Board Submission</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${tok.borderSoft}` }}>
              {['3,523 words', '18 min read', '10 sections'].map(p => <WPill key={p} tok={tok} tone="neutral">{p}</WPill>)}
              <WPill tok={tok} tone="red">33% incomplete</WPill>
            </div>
          </div>

          {/* Action row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
            {[
              ['Trust score', 'shield'], ['How ANTON thought', 'sparkles'],
              ['Citations', 'book'], ['Review', 'check'],
              ['Thinking', 'compass'], ['History', 'history'],
              ['Full prompt', 'terminal'], ['Feedback', 'message'], ['Save', 'download'],
            ].map(([label, icon]) => (
              <WBtn key={label} tok={tok} variant="ghost" size="sm" icon={WIco[icon] && WIco[icon](tok.textMuted, 12)}>{label}</WBtn>
            ))}
          </div>

          <div style={{
            marginTop: 10, padding: '9px 14px',
            background: tok.accentSoft, border: `1px solid ${tok.accentDim}`,
            borderRadius: tok.r2, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {WIco.sparkles(tok.accent, 13)}
            <span style={{ flex: 1, fontSize: 12.5 }}>Generated at <b>Think Hard</b>. Re-run at Investigate for deeper analysis.</span>
            <WBtn tok={tok} variant="primary" size="sm" iconRight={WIco.chevronRight(tok.accentFg, 12)}>Switch to Investigate</WBtn>
          </div>
        </div>

        {/* Composer */}
        <div style={{
          padding: '12px 28px 16px', borderTop: `1px solid ${tok.borderSoft}`,
          background: tok.surfaceAlt,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: tok.textMuted, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ marginRight: 4 }}>Export:</span>
            {['MD', 'DOCX', 'XLSX', 'PDF'].map(e => <WBtn key={e} tok={tok} variant="secondary" size="sm">{e}</WBtn>)}
            <WBtn tok={tok} variant="secondary" size="sm" icon={WIco.share(tok.textMuted, 12)}>Share</WBtn>
            <div style={{ flex: 1 }} />
            <span>Rate output:</span>
            <span style={{ color: tok.textFaint, letterSpacing: 2 }}>☆ ☆ ☆ ☆ ☆</span>
          </div>
          <div style={{
            background: tok.surface, border: `1px solid ${tok.border}`,
            borderRadius: tok.r2, padding: '12px 14px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ fontSize: 13, color: tok.textFaint, minHeight: 22 }}>
              Ask a question, paste a document, or describe what you need…
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <WBtn tok={tok} variant="ghost" size="sm" icon={WIco.attach(tok.textMuted, 13)}>Attach</WBtn>
              <WBtn tok={tok} variant="ghost" size="sm" icon={WIco.sparkles(tok.accent, 13)}>Explain for…</WBtn>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: tok.textFaint, fontFamily: tok.fontMono }}>
                Ctrl+Enter to send · @ to attach · + to improve
              </span>
              <WBtn tok={tok} variant="primary" size="sm" icon={WIco.send(tok.accentFg, 12)}>Send</WBtn>
            </div>
          </div>
        </div>
      </div>

      {/* History rail */}
      <div style={{ borderLeft: `1px solid ${tok.borderSoft}`, background: tok.rail, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: `1px solid ${tok.borderSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <WSection tok={tok}>History</WSection>
          <WBtn tok={tok} variant="primary" size="sm" icon={WIco.plus(tok.accentFg, 12)}>New Chat</WBtn>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 6px 16px' }}>
          {WEB_DATA.chatHistory.map((c, i) => (
            <div key={c.id} style={{
              padding: '9px 12px', cursor: 'pointer',
              background: i === 0 ? tok.accentSoft : 'transparent',
              borderLeft: i === 0 ? `2px solid ${tok.accent}` : '2px solid transparent',
              margin: '1px 0',
            }}>
              <div style={{ fontSize: 12.5, fontWeight: i === 0 ? 500 : 400, color: i === 0 ? tok.accent : tok.text, lineHeight: 1.3, marginBottom: 2 }}>
                {c.title}
              </div>
              <div style={{ fontSize: 10.5, color: tok.textMuted, fontFamily: tok.fontMono }}>{c.when}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { WSanctions, WPathfinder, WOpenChat });
