// screens-auth.jsx — Pair flow + Home + Approvals inbox + Approval detail
// Every screen component takes a `tok` (direction tokens) and renders
// the mobile-viewport inside whatever device frame wraps it.

// ─── Small helpers used across screens ────────────────────────
function PhoneBG({ tok, children, style = {} }) {
  return (
    <div style={{
      background: tok.bg, color: tok.text, fontFamily: tok.font,
      height: '100%', display: 'flex', flexDirection: 'column',
      fontSize: 14, ...style,
    }}>{children}</div>
  );
}

function TopBar({ tok, left, center, right, border = true }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 16px', background: tok.surfaceAlt,
      borderBottom: border ? `1px solid ${tok.borderSoft}` : 'none',
      minHeight: 44, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{left}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{center}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{right}</div>
    </div>
  );
}

function BottomTabs({ tok, active = 'inbox', badge = 3 }) {
  const tabs = [
    { id: 'home', icon: Ico.home, label: 'Home' },
    { id: 'chat', icon: Ico.message, label: 'Chat' },
    { id: 'inbox', icon: Ico.inbox, label: 'Approvals', badge },
    { id: 'capture', icon: Ico.camera, label: 'Capture' },
    { id: 'more', icon: Ico.more, label: 'More' },
  ];
  return (
    <div style={{
      display: 'flex', background: tok.surface, borderTop: `1px solid ${tok.borderSoft}`,
      padding: '6px 4px 10px', flexShrink: 0,
    }}>
      {tabs.map(t => {
        const isActive = t.id === active;
        const color = isActive ? tok.text : tok.textMuted;
        return (
          <div key={t.id} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 3, padding: '6px 0', position: 'relative',
          }}>
            <div style={{ position: 'relative' }}>
              {t.icon(color, 22)}
              {t.badge && (
                <span style={{
                  position: 'absolute', top: -3, right: -8,
                  background: tok.red, color: '#fff',
                  fontSize: 9, fontWeight: 700, borderRadius: 999,
                  minWidth: 16, height: 16, padding: '0 4px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${tok.surface}`,
                }}>{t.badge}</span>
              )}
            </div>
            <div style={{
              fontSize: 10, fontWeight: isActive ? 600 : 500, color,
              letterSpacing: -0.1,
            }}>{t.label}</div>
            {isActive && (
              <div style={{
                position: 'absolute', top: 0, width: 28, height: 2,
                background: tok.text, borderRadius: 2,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
//  PAIR FLOW — variant per direction reads on both frames
// ────────────────────────────────────────────────────────────
function PairScreen({ tok, online = 'online' }) {
  const dot = { online: tok.green, lan: tok.gold, offline: tok.red, pairing: tok.accent }[online];
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<>{Ico.chevronLeft(tok.textMuted, 20)}<span style={{ fontSize: 14, fontWeight: 600, color: tok.text }}>Connect</span></>}
        right={<Pill tok={tok} tone="neutral" mono>STEP 2 / 4</Pill>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 24px' }}>
        <div style={{
          fontSize: tok.id === 'editorial' ? 26 : 22,
          fontFamily: tok.fontDisplay || tok.font,
          fontWeight: tok.id === 'editorial' ? 500 : 700,
          letterSpacing: -0.6, color: tok.text, lineHeight: 1.15,
          marginBottom: 6,
        }}>Pair with your ANTON</div>
        <div style={{ fontSize: 13, color: tok.textMuted, lineHeight: 1.5, marginBottom: 20 }}>
          Scan the QR your admin showed you. We’ll mint a fresh Ed25519 key on this device and confirm with a 6-digit code.
        </div>

        {/* QR viewport */}
        <div style={{
          borderRadius: tok.r3, background: tok.surface, border: `1px solid ${tok.border}`,
          padding: 18, marginBottom: 14, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            aspectRatio: '1 / 1', background: tok.bg, borderRadius: tok.r2,
            position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* corner brackets */}
            {['tl','tr','bl','br'].map(p => {
              const pos = {
                tl: { top: 10, left: 10, br: 'none', bl: 'none', rot: 0 },
                tr: { top: 10, right: 10, bl: 'none', bb: 'none', rot: 90 },
                bl: { bottom: 10, left: 10, tr: 'none', tb: 'none', rot: 270 },
                br: { bottom: 10, right: 10, tl: 'none', tt: 'none', rot: 180 },
              }[p];
              return (
                <div key={p} style={{
                  position: 'absolute', width: 26, height: 26,
                  borderTop: `3px solid ${tok.accent}`, borderLeft: `3px solid ${tok.accent}`,
                  borderRadius: 6, transform: `rotate(${pos.rot}deg)`, top: pos.top, left: pos.left, right: pos.right, bottom: pos.bottom,
                }} />
              );
            })}
            {/* scan line */}
            <div style={{
              position: 'absolute', left: 30, right: 30, height: 2,
              background: `linear-gradient(90deg, transparent, ${tok.accent}, transparent)`,
              top: '50%', boxShadow: `0 0 14px ${tok.accent}`,
            }} />
            {/* simulated QR */}
            <div style={{
              width: '62%', aspectRatio: '1 / 1', background: tok.text,
              borderRadius: 4, opacity: 0.08,
              backgroundImage: `repeating-conic-gradient(${tok.text} 0% 25%, transparent 0% 50%)`,
              backgroundSize: '12px 12px',
            }} />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            marginTop: 14, padding: '10px 12px',
            background: tok.accentSoft, borderRadius: tok.r1,
            fontSize: 12, color: tok.accent, fontWeight: 600,
          }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: tok.accent, boxShadow: `0 0 0 3px ${tok.accent}22` }} />
            Camera ready — align QR in frame
          </div>
        </div>

        {/* confirmation code */}
        <Card tok={tok} style={{ marginBottom: 14, padding: '14px 16px' }}>
          <SectionLabel tok={tok} style={{ marginBottom: 8 }}>Confirmation code</SectionLabel>
          <div style={{
            display: 'flex', gap: 6, justifyContent: 'space-between',
            fontFamily: tok.fontMono, fontSize: 22, fontWeight: 700,
            color: tok.text, letterSpacing: 4,
          }}>
            {['4','7','2','9','3','1'].map((d, i) => (
              <div key={i} style={{
                flex: 1, textAlign: 'center',
                padding: '10px 0', background: tok.surfaceAlt,
                border: `1px solid ${tok.border}`, borderRadius: tok.r1,
              }}>{d}</div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: tok.textMuted, marginTop: 8 }}>
            Admin reads this code aloud to confirm.
          </div>
        </Card>

        {/* legacy option */}
        <button style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: 14, background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r2, textAlign: 'left', cursor: 'pointer',
          fontFamily: tok.font,
        }}>
          {Ico.key(tok.textMuted, 18)}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tok.text }}>Have an invitation code?</div>
            <div style={{ fontSize: 11, color: tok.textMuted }}>Enter 16 characters manually</div>
          </div>
          {Ico.chevronRight(tok.textFaint, 16)}
        </button>

        <div style={{
          marginTop: 16, display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, color: tok.textMuted,
        }}>
          <StatusDot tok={tok} tone={online === 'online' ? 'green' : online === 'lan' ? 'gold' : online === 'offline' ? 'red' : 'green'} pulse />
          <span>{online === 'online' ? 'Internet · awaiting scan' : online === 'lan' ? 'LAN · mDNS discovery' : online === 'offline' ? 'No server reachable' : 'Pairing…'}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: tok.fontMono, color: tok.textFaint }}>TTL 54s</span>
        </div>
      </div>
    </PhoneBG>
  );
}

// ────────────────────────────────────────────────────────────
//  HOME — org dashboard
// ────────────────────────────────────────────────────────────
function HomeScreen_D({ tok, online = 'online' }) {
  const dotTone = { online: 'green', lan: 'gold', offline: 'red' }[online];
  return (
    <PhoneBG tok={tok}>
      {/* instance top bar */}
      <TopBar tok={tok}
        left={
          <>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: tok.id === 'instrument' ? tok.text : tok.accent,
              color: tok.id === 'instrument' ? '#fff' : tok.accentFg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: tok.fontMono, fontSize: 12, fontWeight: 700,
            }}>FC</div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: tok.text }}>FutureChain AB</div>
              <div style={{ fontSize: 10, color: tok.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
                <StatusDot tok={tok} tone={dotTone} size={6} />
                {online === 'online' ? 'Connected · internet' : online === 'lan' ? 'LAN · school-srv' : 'Offline'}
              </div>
            </div>
            {Ico.chevronDown(tok.textMuted, 14)}
          </>
        }
        right={<>{Ico.bell(tok.textMuted, 18)}</>}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 16px 20px' }}>
        {/* greeting */}
        <div style={{
          fontFamily: tok.fontDisplay || tok.font,
          fontSize: tok.id === 'editorial' ? 30 : 24,
          fontWeight: tok.id === 'editorial' ? 500 : 700,
          color: tok.text, letterSpacing: -0.6, lineHeight: 1.1,
        }}>Good morning, Daniel.</div>
        <div style={{ fontSize: 13, color: tok.textMuted, marginTop: 4 }}>
          3 things need a look before your 09:30.
        </div>

        {/* priority card */}
        <div style={{
          marginTop: 18, background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r3, overflow: 'hidden',
        }}>
          <div style={{
            padding: '12px 16px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
            background: tok.id === 'instrument' ? tok.text : tok.accentSoft,
            color: tok.id === 'instrument' ? tok.surface : tok.accent,
            borderBottom: `1px solid ${tok.id === 'instrument' ? tok.text : tok.accentDim}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {Ico.shield('currentColor', 15)}
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: tok.fontMono }}>
                3 approvals waiting
              </span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600 }}>Review →</span>
          </div>
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: tok.text, marginBottom: 2 }}>Sanctions policy v4.0 — sign-off</div>
            <div style={{ fontSize: 12, color: tok.textMuted, lineHeight: 1.45 }}>
              ANTON drafted Phase 1 controls. Legal + Compliance already signed. You're last.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Pill tok={tok} tone="red">HIGH</Pill>
              <Pill tok={tok} tone="neutral" mono>REQ-8741</Pill>
              <Pill tok={tok} tone="neutral">Biometric</Pill>
            </div>
          </div>
        </div>

        {/* quick actions */}
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { icon: Ico.mic, label: 'Voice', desc: 'Hold to talk' },
            { icon: Ico.camera, label: 'Capture', desc: 'Photo or share' },
            { icon: Ico.message, label: 'Ask', desc: 'Text chat' },
            { icon: Ico.sparkles, label: 'Missions', desc: '5 in flight' },
          ].map((a, i) => (
            <div key={i} style={{
              background: tok.surface, border: `1px solid ${tok.border}`,
              borderRadius: tok.r2, padding: 14,
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: tok.r1,
                background: tok.surfaceAlt, color: tok.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{a.icon(tok.text, 17)}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: tok.text, marginTop: 10 }}>{a.label}</div>
              <div style={{ fontSize: 11, color: tok.textMuted, marginTop: 2 }}>{a.desc}</div>
            </div>
          ))}
        </div>

        {/* recent activity */}
        <div style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <SectionLabel tok={tok}>Today</SectionLabel>
            <span style={{ fontSize: 11, color: tok.accent, fontWeight: 600 }}>See all</span>
          </div>
          {[
            { t: '09:04', title: 'Sanctions Advisory — Swedish bank case', meta: '6.3k tokens · Think Hard · Balanced', tone: 'teal', label: 'COMPLETED' },
            { t: '08:48', title: 'EBA de-risking guidelines — plain language', meta: 'Pipeline → Plain CEFR B1', tone: 'blue', label: 'TRANSFORM' },
            { t: '08:22', title: 'Candy trend optimizer — kids market .anton', meta: 'Opened · 3,117 bytes', tone: 'gold', label: 'OPENED' },
          ].map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 4px', borderBottom: i < 2 ? `1px solid ${tok.borderSoft}` : 'none',
            }}>
              <div style={{
                fontFamily: tok.fontMono, fontSize: 11, color: tok.textMuted,
                paddingTop: 1, minWidth: 38,
              }}>{r.t}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: tok.text, lineHeight: 1.3 }}>{r.title}</div>
                <div style={{ fontSize: 11, color: tok.textMuted, marginTop: 2 }}>{r.meta}</div>
              </div>
              <Pill tok={tok} tone={r.tone}>{r.label}</Pill>
            </div>
          ))}
        </div>
      </div>

      <BottomTabs tok={tok} active="home" badge={3} />
    </PhoneBG>
  );
}

// ────────────────────────────────────────────────────────────
//  APPROVALS INBOX
// ────────────────────────────────────────────────────────────
function ApprovalsScreen_D({ tok }) {
  const items = [
    { sev: 'CRITICAL', tone: 'red', bio: true, title: 'Wire €180,000 — Orion Holdings', sub: 'ANTON Task Agent · wants to execute SEPA transfer', due: 'Expires in 14m', mono: 'REQ-8909' },
    { sev: 'HIGH', tone: 'red', bio: true, title: 'Publish policy v4.0 to firm-wide Knowledge', sub: 'Sanctions Advisory · visibility: 840 users', due: 'Today 17:00', mono: 'REQ-8907' },
    { sev: 'HIGH', tone: 'red', bio: true, title: 'Share EBA draft with client (external)', sub: 'Counsel’s Desk · adds 1 external viewer', due: 'Today 12:00', mono: 'REQ-8905' },
    { sev: 'NORMAL', tone: 'gold', bio: false, title: 'Append 3 new atoms to Markets KB', sub: 'Markets Intelligence · "US yield curve inversion"', due: 'Today', mono: 'REQ-8901' },
    { sev: 'NORMAL', tone: 'gold', bio: false, title: 'Create 12 Kanban tasks in Project "Orion"', sub: 'Orchestrator · auto-plan result', due: 'Tomorrow', mono: 'REQ-8898' },
    { sev: 'LOW', tone: 'neutral', bio: false, title: 'Rename session: "Chat 2026-04-17"', sub: 'Open Chat · metadata only', due: '', mono: 'REQ-8890' },
  ];
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={
          <>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: tok.fontDisplay || tok.font, color: tok.text, letterSpacing: -0.4 }}>Approvals</div>
            <Pill tok={tok} tone="red">6</Pill>
          </>
        }
        right={<>{Ico.search(tok.textMuted, 18)}</>}
        border={false}
      />
      {/* severity filter chips */}
      <div style={{
        display: 'flex', gap: 6, padding: '6px 16px 12px', overflowX: 'auto',
        borderBottom: `1px solid ${tok.borderSoft}`,
      }}>
        {[{ l: 'All', n: 6, a: true }, { l: 'Critical', n: 1 }, { l: 'High', n: 2 }, { l: 'Normal', n: 2 }, { l: 'Low', n: 1 }].map((c, i) => (
          <div key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 10px', borderRadius: 999,
            background: c.a ? tok.text : tok.surface,
            color: c.a ? tok.surface : tok.textBody,
            border: `1px solid ${c.a ? tok.text : tok.border}`,
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            {c.l} <span style={{ fontFamily: tok.fontMono, fontSize: 10, opacity: 0.7 }}>{c.n}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {items.map((it, i) => (
          <div key={i} style={{
            padding: '14px 16px',
            borderBottom: i < items.length - 1 ? `1px solid ${tok.borderSoft}` : 'none',
            background: i === 0 && tok.id === 'instrument' ? tok.surfaceAlt : 'transparent',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <Pill tok={tok} tone={it.tone} mono>{it.sev}</Pill>
              {it.bio && (
                <Pill tok={tok} tone="neutral">
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    {Ico.fingerprint('currentColor', 11)}biometric
                  </span>
                </Pill>
              )}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, fontFamily: tok.fontMono, color: tok.textFaint }}>{it.mono}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: tok.text, lineHeight: 1.3 }}>{it.title}</div>
            <div style={{ fontSize: 12, color: tok.textMuted, marginTop: 3, lineHeight: 1.4 }}>{it.sub}</div>
            {it.due && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                marginTop: 8, fontSize: 11, fontWeight: 600,
                color: it.sev === 'CRITICAL' ? tok.red : tok.textMuted,
              }}>
                {it.sev === 'CRITICAL' && Ico.alert('currentColor', 12)}
                {it.due}
              </div>
            )}
          </div>
        ))}
      </div>

      <BottomTabs tok={tok} active="inbox" badge={6} />
    </PhoneBG>
  );
}

// ────────────────────────────────────────────────────────────
//  APPROVAL DETAIL (bottom-sheet style)
// ────────────────────────────────────────────────────────────
function ApprovalDetail_D({ tok, severity = 'HIGH' }) {
  const tone = severity === 'CRITICAL' ? 'red' : severity === 'HIGH' ? 'red' : severity === 'NORMAL' ? 'gold' : 'neutral';
  const isBio = severity === 'CRITICAL' || severity === 'HIGH';
  return (
    <PhoneBG tok={tok}>
      {/* backdrop */}
      <div style={{ flex: 1, background: `${tok.text}66`, position: 'relative' }}>
        {/* peek behind */}
        <div style={{ position: 'absolute', inset: 0, background: tok.bg, opacity: 0.15 }} />
      </div>

      {/* sheet */}
      <div style={{
        background: tok.surface, borderTopLeftRadius: tok.r4, borderTopRightRadius: tok.r4,
        boxShadow: '0 -8px 30px rgba(0,0,0,0.12)',
        paddingBottom: 14, position: 'relative',
      }}>
        <div style={{
          width: 40, height: 4, borderRadius: 4,
          background: tok.border, margin: '10px auto 0',
        }} />

        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <Pill tok={tok} tone={tone} mono>{severity}</Pill>
            {isBio && <Pill tok={tok} tone="neutral"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{Ico.fingerprint('currentColor', 11)}Face ID required</span></Pill>}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, fontFamily: tok.fontMono, color: tok.textFaint }}>REQ-8907 · v2</span>
          </div>

          <div style={{
            fontSize: tok.id === 'editorial' ? 22 : 18,
            fontWeight: tok.id === 'editorial' ? 500 : 700,
            fontFamily: tok.fontDisplay || tok.font,
            color: tok.text, letterSpacing: -0.3, lineHeight: 1.2,
          }}>
            Publish Sanctions Policy v4.0 to firm-wide Knowledge
          </div>
          <div style={{ fontSize: 12, color: tok.textMuted, marginTop: 4 }}>
            Requested by <span style={{ color: tok.text, fontWeight: 600 }}>Sanctions Advisory</span> · 09:04
          </div>

          {/* what ANTON will do */}
          <div style={{
            marginTop: 16, padding: 14,
            background: tok.surfaceAlt, borderRadius: tok.r2,
            border: `1px solid ${tok.borderSoft}`,
          }}>
            <SectionLabel tok={tok} style={{ marginBottom: 8 }}>What ANTON will do</SectionLabel>
            {[
              'Publish document “Sanctions Policy v4.0” (11 pages)',
              'Grant read access to 840 users in firm-wide KB',
              'Append 14 supporting atoms · regulatory monitor',
              'Send notification email to Compliance channel',
            ].map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 13, color: tok.textBody, padding: '4px 0' }}>
                <span style={{ color: tok.accent, fontWeight: 700 }}>•</span> {l}
              </div>
            ))}
          </div>

          {/* trust score */}
          <div style={{
            marginTop: 12, display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', background: tok.greenDim, borderRadius: tok.r2,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 999,
              background: tok.green, color: '#fff', fontWeight: 700, fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>94</div>
            <div style={{ flex: 1, fontSize: 12, color: tok.text, lineHeight: 1.4 }}>
              <div style={{ fontWeight: 600 }}>Trust score 94 / 100</div>
              <div style={{ color: tok.textMuted }}>Quality Ratchet passed · 3 citations · 0 integrity findings</div>
            </div>
          </div>

          {/* signed envelope hint */}
          <div style={{
            marginTop: 12, display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono,
          }}>
            {Ico.shieldCheck(tok.textMuted, 13)}
            Ed25519 signed envelope · nonce 0x7af…c91
          </div>
        </div>

        {/* actions */}
        <div style={{ display: 'flex', gap: 10, padding: '16px 20px 4px' }}>
          <Btn tok={tok} variant="ghost" block style={{ color: tok.red, borderColor: tok.red }}>
            Reject
          </Btn>
          <Btn tok={tok} variant="primary" block icon={Ico.fingerprint('currentColor', 16)}>
            Approve with Face ID
          </Btn>
        </div>
        <div style={{ fontSize: 10, color: tok.textFaint, textAlign: 'center', marginTop: 4, fontFamily: tok.fontMono }}>
          Hold Face ID · response signed + sent over TLS
        </div>
      </div>
    </PhoneBG>
  );
}

Object.assign(window, {
  PhoneBG, TopBar, BottomTabs,
  PairScreen, HomeScreen_D, ApprovalsScreen_D, ApprovalDetail_D,
});
