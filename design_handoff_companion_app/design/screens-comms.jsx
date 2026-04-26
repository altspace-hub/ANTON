// screens-comms.jsx — Messaging (P2P + AI), Email setup & inbox, Events (calendar + booking)

// ─────────────── MESSAGES — chat list ───────────────
function MessagesListScreen({ tok }) {
  const threads = [
    { who: 'Sanctions team', sub: '@maria · "Re: Tehran customer case — see REQ-8907"', time: '09:12', n: 3, pinned: true, type: 'group' },
    { who: 'ANTON · Mission', sub: 'USD exposure scan finished — 14 matches, draft ready', time: '09:06', n: 1, ai: true },
    { who: 'Counsel — Elin Håkansson', sub: 'External · "Can you review the EBA redline tonight?"', time: '08:48', n: 0, ext: true },
    { who: 'openEXPERT volunteers', sub: 'Abebe: "Kitchen server back online, 412 atoms synced"', time: 'Yst', n: 0, type: 'group' },
    { who: 'Daniel (Family)', sub: 'You: "Bought the groceries, heading home"', time: 'Yst', n: 0 },
    { who: 'Markets watch', sub: 'ANTON: 3 new regulatory alerts this morning', time: 'Mon', n: 0, ai: true },
  ];
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<div style={{ fontSize: 20, fontWeight: 700, color: tok.text, letterSpacing: -0.4 }}>Messages</div>}
        right={<>{Ico.search(tok.textMuted, 18)}{Ico.plus(tok.text, 20)}</>}
        border={false}
      />
      {/* filter chips */}
      <div style={{ display: 'flex', gap: 6, padding: '4px 16px 10px', borderBottom: `1px solid ${tok.borderSoft}` }}>
        {[{ l: 'All', a: true }, { l: 'People' }, { l: 'ANTON', dot: true }, { l: 'External' }].map((c, i) => (
          <div key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 999,
            background: c.a ? tok.text : tok.surface,
            color: c.a ? tok.surface : tok.textBody,
            border: `1px solid ${c.a ? tok.text : tok.border}`,
            fontSize: 12, fontWeight: 600,
          }}>{c.dot && <StatusDot tok={tok} tone="green" size={5} />}{c.l}</div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {threads.map((t, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            borderBottom: i < threads.length - 1 ? `1px solid ${tok.borderSoft}` : 'none',
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: t.ai ? tok.accent : t.ext ? tok.gold : t.type === 'group' ? tok.surfaceAlt : tok.blueDim,
              color: t.ai ? '#fff' : t.ext ? '#fff' : t.type === 'group' ? tok.text : tok.blue,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: tok.fontMono, fontSize: 14, fontWeight: 700, flexShrink: 0,
              position: 'relative',
            }}>
              {t.ai ? '●' : t.who.split(' ').map(w => w[0]).slice(0, 2).join('')}
              {t.pinned && <span style={{ position: 'absolute', top: -3, right: -3, width: 12, height: 12, background: tok.text, borderRadius: '50%', color: '#fff', fontSize: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📌</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 14, fontWeight: t.n ? 700 : 600, color: tok.text }}>{t.who}</span>
                {t.ext && <Pill tok={tok} tone="gold" style={{ padding: '1px 6px', fontSize: 9 }}>EXT</Pill>}
                {t.ai && <Pill tok={tok} tone="teal" style={{ padding: '1px 6px', fontSize: 9 }}>AI</Pill>}
              </div>
              <div style={{ fontSize: 12, color: tok.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.sub}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: tok.textFaint, fontFamily: tok.fontMono }}>{t.time}</div>
              {t.n > 0 && (
                <div style={{
                  display: 'inline-block', minWidth: 18, height: 18, padding: '0 5px', marginTop: 4,
                  background: tok.accent, color: '#fff', fontSize: 10, fontWeight: 700,
                  borderRadius: 999, lineHeight: '18px',
                }}>{t.n}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <BottomTabs tok={tok} active="chat" badge={3} />
    </PhoneBG>
  );
}

// ─────────────── MESSAGES — P2P thread ───────────────
function MessageThreadScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<>{Ico.chevronLeft(tok.textMuted, 20)}
          <div style={{
            width: 32, height: 32, borderRadius: 10, background: tok.blueDim,
            color: tok.blue, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: tok.fontMono, fontSize: 12, fontWeight: 700,
          }}>ST</div>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tok.text }}>Sanctions team</div>
            <div style={{ fontSize: 10, color: tok.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
              <StatusDot tok={tok} tone="green" size={5} pulse /> 4 online · E2E
            </div>
          </div>
        </>}
        right={<>{Ico.more(tok.textMuted, 18)}</>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{
          alignSelf: 'center', fontSize: 10, fontFamily: tok.fontMono,
          color: tok.textFaint, padding: '4px 10px',
          background: tok.surfaceAlt, borderRadius: 999, letterSpacing: 0.4,
        }}>TODAY · E2E · keys rotated 2h ago</div>

        {/* maria */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <Avatar tok={tok} initials="MH" size={26} color={tok.gold} />
          <div style={{ maxWidth: '75%' }}>
            <div style={{ fontSize: 10, color: tok.textMuted, marginBottom: 2, marginLeft: 4 }}>Maria · 09:06</div>
            <div style={{
              background: tok.surface, border: `1px solid ${tok.border}`,
              padding: '8px 12px', borderRadius: `${tok.r2}px ${tok.r2}px ${tok.r2}px 4px`,
              fontSize: 13, color: tok.textBody, lineHeight: 1.4,
            }}>
              Tehran case — I'm thinking we freeze USD + escalate today. Can you pull the full exposure list?
            </div>
          </div>
        </div>

        {/* user */}
        <div style={{ alignSelf: 'flex-end', maxWidth: '78%' }}>
          <div style={{
            background: tok.accent, color: '#fff',
            padding: '9px 13px', borderRadius: `${tok.r2}px ${tok.r2}px 4px ${tok.r2}px`,
            fontSize: 13, lineHeight: 1.4,
          }}>On it. ANTON is scanning now.</div>
          <div style={{ fontSize: 9, color: tok.textFaint, marginTop: 2, textAlign: 'right', fontFamily: tok.fontMono }}>09:07 ·
            <span style={{ color: tok.green }}> ✓✓ seen</span>
          </div>
        </div>

        {/* ANTON inline card */}
        <div style={{
          alignSelf: 'center', width: '92%', marginTop: 4,
          background: tok.accentSoft, border: `1px solid ${tok.accentDim}`,
          borderRadius: tok.r2, padding: '10px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: tok.accent, color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>●</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: tok.accent, fontFamily: tok.fontMono, letterSpacing: 0.4 }}>ANTON · SHARED</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: tok.accent, opacity: 0.7 }}>09:08</span>
          </div>
          <div style={{ fontSize: 13, color: tok.text, fontWeight: 600, marginBottom: 2 }}>USD exposure · 14 customers</div>
          <div style={{ fontSize: 11, color: tok.textBody, lineHeight: 1.4 }}>Scanned 840 KYC profiles in 0.3s. 14 match Iran-nexus rules. Draft SAR letter attached.</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Pill tok={tok} tone="blue" mono>14 matches</Pill>
            <Pill tok={tok} tone="red">HIGH risk: 3</Pill>
          </div>
        </div>

        {/* typing */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', opacity: 0.7 }}>
          <Avatar tok={tok} initials="ER" size={26} color={tok.red} />
          <div style={{
            background: tok.surface, border: `1px solid ${tok.border}`,
            padding: '10px 14px', borderRadius: tok.r2, fontSize: 13,
            display: 'flex', gap: 4,
          }}>
            {[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: tok.textMuted, opacity: 0.5 }} />)}
          </div>
        </div>
      </div>
      {/* composer */}
      <div style={{ padding: 10, background: tok.surface, borderTop: `1px solid ${tok.borderSoft}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: tok.surfaceAlt, border: `1px solid ${tok.border}`, borderRadius: 999, padding: '6px 6px 6px 14px' }}>
          {Ico.plus(tok.textMuted, 18)}
          <div style={{ flex: 1, fontSize: 13, color: tok.textMuted }}>Message the team…</div>
          {Ico.sparkles(tok.accent, 16)}
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: tok.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Ico.arrowUp('#fff', 16)}</div>
        </div>
      </div>
    </PhoneBG>
  );
}

// ─────────────── EMAIL — setup ───────────────
function EmailSetupScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<>{Ico.chevronLeft(tok.textMuted, 20)}<span style={{ fontSize: 14, fontWeight: 600, color: tok.text }}>Connect Email</span></>}
        right={<Pill tok={tok} tone="neutral" mono>1 / 2</Pill>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: tok.text, letterSpacing: -0.5, lineHeight: 1.2, marginBottom: 6 }}>
          Let ANTON read your inbox
        </div>
        <div style={{ fontSize: 13, color: tok.textMuted, lineHeight: 1.5, marginBottom: 22 }}>
          Connect read-only. ANTON summarizes, drafts replies, and flags regulated content — it never sends unless you approve.
        </div>

        <SectionLabel tok={tok} style={{ marginBottom: 8 }}>Choose provider</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { n: 'Microsoft 365', m: 'OAuth · recommended for FutureChain AB', r: true },
            { n: 'Google Workspace', m: 'OAuth' },
            { n: 'IMAP / SMTP', m: 'Advanced · app-password required' },
            { n: 'Exchange Server', m: 'On-prem · certificate pinning' },
          ].map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 14,
              background: tok.surface, border: `1px solid ${p.r ? tok.accent : tok.border}`,
              borderRadius: tok.r2, position: 'relative',
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: tok.r1, background: tok.surfaceAlt,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: tok.fontMono, fontSize: 12, fontWeight: 700, color: tok.text,
              }}>{p.n.split(' ').map(w => w[0]).join('').slice(0, 2)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: tok.text }}>{p.n}</div>
                <div style={{ fontSize: 11, color: tok.textMuted }}>{p.m}</div>
              </div>
              {p.r && <Pill tok={tok} tone="teal">SUGGESTED</Pill>}
              {Ico.chevronRight(tok.textFaint, 16)}
            </div>
          ))}
        </div>

        {/* permissions preview */}
        <div style={{ marginTop: 22, padding: 14, background: tok.surfaceAlt, border: `1px solid ${tok.borderSoft}`, borderRadius: tok.r2 }}>
          <SectionLabel tok={tok} style={{ marginBottom: 8 }}>ANTON will be able to</SectionLabel>
          {[
            { c: true, t: 'Read your inbox + archived mail' },
            { c: true, t: 'Draft replies (never sends without approval)' },
            { c: true, t: 'Attach drafts to Missions / Knowledge' },
            { c: false, t: 'Move, delete, or forward mail' },
            { c: false, t: 'Access other calendars / contacts' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12, color: r.c ? tok.textBody : tok.textFaint }}>
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: r.c ? tok.green : tok.surfaceMuted, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{r.c ? '✓' : '✕'}</span>
              {r.t}
            </div>
          ))}
        </div>

        <Btn tok={tok} variant="primary" block icon={Ico.shield('currentColor', 15)} style={{ marginTop: 18 }}>Continue with Microsoft 365</Btn>
      </div>
    </PhoneBG>
  );
}

// ─────────────── EMAIL — inbox with ANTON triage ───────────────
function EmailInboxScreen({ tok }) {
  const mails = [
    { f: 'Finansinspektionen', s: 'Re: Q2 sanctions reporting — clarification needed', p: 'ANTON: Regulator request · needs reply by EoD. Draft ready.', t: '08:58', unread: true, ai: 'DRAFTED', tone: 'red' },
    { f: 'Maria Hansson', s: 'Tehran case handover', p: 'Forwarded the compliance memo + SAR draft. Please review…', t: '08:41', unread: true, ai: 'SUMMARIZED', tone: 'teal' },
    { f: 'DNB Bank · newsletter', s: 'Weekly markets outlook — US yield curve', p: 'ANTON: Low priority. 3 similar this month. Archive?', t: '07:12', ai: 'ARCHIVE?', tone: 'neutral' },
    { f: 'Elin Håkansson (EXT)', s: 'EBA redline — final version', p: 'Sharing the latest. A couple of open comments…', t: 'Yst', ext: true },
    { f: 'Compliance-all', s: 'Policy v4.0 published', p: 'ANTON published the draft you approved.', t: 'Yst', ai: 'YOUR ACTION', tone: 'teal' },
    { f: 'Sofia Alm', s: 'Lunch tomorrow?', p: 'Kvarnen at 12:30 if you\'re free', t: 'Mon', personal: true },
  ];
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<div style={{ fontSize: 20, fontWeight: 700, color: tok.text, letterSpacing: -0.4 }}>Email</div>}
        right={<>{Ico.sparkles(tok.accent, 16)}{Ico.search(tok.textMuted, 18)}</>}
        border={false}
      />
      {/* ANTON daily digest */}
      <div style={{ margin: '8px 14px', padding: 12, background: tok.accentSoft, border: `1px solid ${tok.accentDim}`, borderRadius: tok.r2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          {Ico.sparkles(tok.accent, 13)}
          <span style={{ fontSize: 10, fontFamily: tok.fontMono, fontWeight: 700, color: tok.accent, letterSpacing: 0.5 }}>ANTON DIGEST · 09:10</span>
        </div>
        <div style={{ fontSize: 12, color: tok.text, lineHeight: 1.4 }}>
          <b>1 regulator</b> needs a reply today · <b>2 drafts</b> waiting for you · <b>8 low-priority</b> ready to archive
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {mails.map((m, i) => (
          <div key={i} style={{
            display: 'flex', gap: 12, padding: '12px 14px',
            borderBottom: i < mails.length - 1 ? `1px solid ${tok.borderSoft}` : 'none',
            background: m.unread ? tok.surface : 'transparent',
          }}>
            <div style={{
              width: 4, alignSelf: 'stretch', background: m.unread ? tok.accent : 'transparent',
              borderRadius: 2, flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: m.unread ? 700 : 500, color: tok.text }}>{m.f}</span>
                {m.ext && <Pill tok={tok} tone="gold" style={{ padding: '1px 5px', fontSize: 9 }}>EXT</Pill>}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: tok.textFaint, fontFamily: tok.fontMono }}>{m.t}</span>
              </div>
              <div style={{ fontSize: 13, color: tok.text, fontWeight: m.unread ? 600 : 400, lineHeight: 1.3, marginBottom: 4 }}>{m.s}</div>
              <div style={{ fontSize: 11, color: tok.textMuted, lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.ai && <span style={{ color: tok.accent, fontWeight: 700 }}>ANTON · </span>}{m.p}
              </div>
              {m.ai && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <Pill tok={tok} tone={m.tone}>{m.ai}</Pill>
                  {m.ai === 'DRAFTED' && <button style={{ padding: '3px 10px', fontSize: 11, fontWeight: 600, background: tok.accent, color: '#fff', border: 'none', borderRadius: 999 }}>Review draft</button>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <BottomTabs tok={tok} active="more" badge={3} />
    </PhoneBG>
  );
}

// ─────────────── EVENTS — calendar ───────────────
function EventsScreen({ tok }) {
  const events = [
    { t: '09:30', d: 45, title: 'Risk committee — v4.0 sign-off', loc: 'Room A · Stockholm', bg: 'teal', people: 6, anton: true },
    { t: '11:00', d: 30, title: 'Counsel call · Elin', loc: 'Video', bg: 'gold', ext: true },
    { t: '12:30', d: 60, title: 'Lunch · Sofia', loc: 'Kvarnen', bg: 'neutral' },
    { t: '14:00', d: 90, title: 'Sanctions deep-dive with ANTON', loc: 'Focus block · prep', bg: 'teal', anton: true },
    { t: '16:30', d: 30, title: 'Pickup — Leo', loc: 'School', bg: 'neutral', personal: true },
  ];
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<div>
          <div style={{ fontSize: 20, fontWeight: 700, color: tok.text, letterSpacing: -0.4, lineHeight: 1.1 }}>Events</div>
          <div style={{ fontSize: 11, color: tok.textMuted }}>Thu · 17 April</div>
        </div>}
        right={<>{Ico.search(tok.textMuted, 18)}{Ico.plus(tok.text, 20)}</>}
        border={false}
      />
      {/* week strip */}
      <div style={{ display: 'flex', padding: '6px 8px 12px', gap: 4, borderBottom: `1px solid ${tok.borderSoft}` }}>
        {['Mon 14', 'Tue 15', 'Wed 16', 'Thu 17', 'Fri 18', 'Sat 19', 'Sun 20'].map((d, i) => {
          const active = i === 3;
          const hasE = [1, 3, 4].includes(i);
          return (
            <div key={i} style={{
              flex: 1, padding: '6px 2px', textAlign: 'center', borderRadius: 10,
              background: active ? tok.text : 'transparent',
              color: active ? tok.surface : tok.textBody,
            }}>
              <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 500 }}>{d.split(' ')[0]}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{d.split(' ')[1]}</div>
              {hasE && <div style={{ width: 4, height: 4, borderRadius: 2, background: active ? tok.surface : tok.accent, margin: '2px auto 0' }} />}
            </div>
          );
        })}
      </div>

      {/* ANTON prep banner */}
      <div style={{ margin: '10px 14px', padding: 10, background: tok.accentSoft, borderRadius: tok.r2, display: 'flex', gap: 8, alignItems: 'center' }}>
        {Ico.sparkles(tok.accent, 14)}
        <div style={{ flex: 1, fontSize: 12, color: tok.text, lineHeight: 1.3 }}>
          <b>ANTON prepped</b> Risk committee — 3-slide brief + 6 citations · 09:15
        </div>
        <Pill tok={tok} tone="teal" style={{ fontSize: 10 }}>READY</Pill>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 14px 16px' }}>
        {events.map((e, i) => {
          const tones = { teal: { bd: tok.accent, bg: tok.accentSoft }, gold: { bd: tok.gold, bg: tok.goldDim }, neutral: { bd: tok.border, bg: tok.surface } };
          const t = tones[e.bg];
          return (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 44, textAlign: 'right', flexShrink: 0, paddingTop: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: tok.text, fontFamily: tok.fontMono }}>{e.t}</div>
                <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono }}>{e.d}m</div>
              </div>
              <div style={{
                flex: 1, padding: '10px 14px', background: t.bg, borderLeft: `4px solid ${t.bd}`,
                borderRadius: `4px ${tok.r2}px ${tok.r2}px 4px`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: tok.text }}>{e.title}</span>
                  {e.anton && <Pill tok={tok} tone="teal" style={{ fontSize: 9 }}>ANTON</Pill>}
                  {e.ext && <Pill tok={tok} tone="gold" style={{ fontSize: 9 }}>EXT</Pill>}
                  {e.personal && <Pill tok={tok} tone="neutral" style={{ fontSize: 9 }}>PERSONAL</Pill>}
                </div>
                <div style={{ fontSize: 11, color: tok.textMuted }}>{e.loc}{e.people ? ` · ${e.people} attendees` : ''}</div>
              </div>
            </div>
          );
        })}
      </div>
      <BottomTabs tok={tok} active="more" badge={3} />
    </PhoneBG>
  );
}

// ─────────────── EVENTS — booking detail ───────────────
function EventDetailScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<>{Ico.chevronLeft(tok.textMuted, 20)}<span style={{ fontSize: 14, fontWeight: 600, color: tok.text }}>Event</span></>}
        right={<>{Ico.more(tok.textMuted, 18)}</>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 24px' }}>
        <Pill tok={tok} tone="teal" mono>RISK COMMITTEE · RECURRING</Pill>
        <div style={{ fontSize: 22, fontWeight: 700, color: tok.text, letterSpacing: -0.4, lineHeight: 1.2, marginTop: 10, marginBottom: 6 }}>
          Sanctions Policy v4.0 — sign-off
        </div>
        <div style={{ fontSize: 13, color: tok.textMuted, marginBottom: 20 }}>
          Thursday 17 April · 09:30 – 10:15 · Room A, Stockholm HQ
        </div>

        {/* ANTON prep */}
        <div style={{ padding: 14, background: tok.accentSoft, border: `1px solid ${tok.accentDim}`, borderRadius: tok.r3, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            {Ico.sparkles(tok.accent, 15)}
            <span style={{ fontSize: 11, fontFamily: tok.fontMono, fontWeight: 700, color: tok.accent, letterSpacing: 0.5 }}>ANTON · PREPPED</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: tok.accent, opacity: 0.7 }}>15m ago</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: tok.text, marginBottom: 6 }}>3-slide brief + SAR draft attached</div>
          <div style={{ fontSize: 12, color: tok.textBody, lineHeight: 1.45, marginBottom: 8 }}>
            Summary of policy deltas, Tehran case as example, open questions for committee. 6 citations · trust 94.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Pill tok={tok} tone="neutral">3 slides</Pill>
            <Pill tok={tok} tone="neutral">6 citations</Pill>
            <Pill tok={tok} tone="teal">Trust 94</Pill>
          </div>
        </div>

        {/* attendees */}
        <SectionLabel tok={tok} style={{ marginBottom: 8 }}>Attendees · 6</SectionLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {['DB','MH','ER','KA','SF','LN'].map((i, idx) => {
            const colors = [tok.accent, tok.gold, tok.red, tok.blue, tok.green, '#6A3E8F'];
            return <Avatar key={idx} tok={tok} initials={i} size={32} color={colors[idx]} />;
          })}
        </div>

        {/* location */}
        <div style={{ padding: 12, background: tok.surfaceAlt, borderRadius: tok.r2, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          {Ico.home(tok.text, 18)}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tok.text }}>Room A · HQ · 3F</div>
            <div style={{ fontSize: 11, color: tok.textMuted }}>Hybrid · Teams link available</div>
          </div>
        </div>

        {/* join / decline */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn tok={tok} variant="secondary" block>Decline</Btn>
          <Btn tok={tok} variant="primary" block>Join · 09:30</Btn>
        </div>
      </div>
    </PhoneBG>
  );
}

Object.assign(window, {
  MessagesListScreen, MessageThreadScreen,
  EmailSetupScreen, EmailInboxScreen,
  EventsScreen, EventDetailScreen,
});
