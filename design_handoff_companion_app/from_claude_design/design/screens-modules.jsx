// screens-modules.jsx — Pro-mode deep features:
// Unified Mail, Unified Calendar, Work modules, School, Markets, Pathfinder.
// Each screen takes a `tok` (direction+accent) and assumes PhoneBG/TopBar/BottomTabs
// are available globally (defined in screens-auth.jsx).

// ══════════════════════════════════════════════════════════════
// UNIFIED ANTON MAIL — default inbox. Native ANTON address +
// optional connected providers, all in one stream.
// ══════════════════════════════════════════════════════════════
function UnifiedMailScreen({ tok }) {
  const sources = [
    { id: 'all',    l: 'All',         c: null, a: true },
    { id: 'anton',  l: 'ANTON',       c: tok.accent, dot: true },
    { id: 'team',   l: 'Team',        c: tok.blue },
    { id: 'ext',    l: 'External',    c: tok.gold },
    { id: '365',    l: 'M365',        c: tok.textMuted },
  ];
  const mail = [
    {
      f: 'ANTON · Mission report', s: 'USD exposure scan finished — 14 matches, draft SAR ready',
      p: 'Finished 0.3s ago. 3 HIGH risk, 11 medium. Draft attached.',
      t: '09:10', unread: true, ai: 'ANTON', tone: 'teal', src: 'native',
    },
    {
      f: 'Finansinspektionen', s: 'Re: Q2 sanctions reporting — clarification needed',
      p: 'ANTON: Regulator · reply by EoD. Draft ready.',
      t: '08:58', unread: true, ai: 'DRAFTED', tone: 'red', src: '365', ext: true,
    },
    {
      f: 'Sanctions team (chat)', s: 'Maria: "Tehran case — freeze USD + escalate"',
      p: '3 new messages · replied to by you 09:07',
      t: '09:06', unread: true, chat: true, n: 3, src: 'chat',
    },
    {
      f: 'Maria Hansson', s: 'Tehran case handover',
      p: 'ANTON: Summary + SAR attached. Please review by 11:00.',
      t: '08:41', unread: true, ai: 'SUMMARIZED', tone: 'teal', src: '365',
    },
    {
      f: 'DNB Bank · newsletter', s: 'Weekly markets outlook — US yield curve',
      p: 'ANTON: Low priority · 3 similar this month · Archive?',
      t: '07:12', ai: 'ARCHIVE?', tone: 'neutral', src: 'gmail',
    },
    {
      f: 'Elin Håkansson (EXT)', s: 'EBA redline — final version',
      p: 'Sharing the latest. A couple of open comments…',
      t: 'Yst', ext: true, src: '365',
    },
    {
      f: 'Sofia Alm', s: 'Lunch tomorrow?',
      p: 'Kvarnen at 12:30 if you\'re free',
      t: 'Mon', personal: true, src: 'gmail',
    },
  ];
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<div>
          <div style={{ fontSize: 20, fontWeight: 700, color: tok.text, letterSpacing: -0.4, lineHeight: 1.05 }}>Mail</div>
          <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono, letterSpacing: 0.3 }}>daniel@anton.fc · +2 connected</div>
        </div>}
        right={<>{Ico.sparkles(tok.accent, 16)}{Ico.search(tok.textMuted, 18)}</>}
        border={false}
      />

      {/* source filter chips */}
      <div style={{ display: 'flex', gap: 5, padding: '4px 14px 10px', borderBottom: `1px solid ${tok.borderSoft}`, overflowX: 'auto' }}>
        {sources.map(s => (
          <div key={s.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 999, flexShrink: 0,
            background: s.a ? tok.text : tok.surface,
            color: s.a ? tok.surface : tok.textBody,
            border: `1px solid ${s.a ? tok.text : tok.border}`,
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            {s.c && <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.c }} />}
            {s.l}
          </div>
        ))}
      </div>

      {/* ANTON daily digest */}
      <div style={{ margin: '8px 14px 6px', padding: 11, background: tok.accentSoft, border: `1px solid ${tok.accentDim}`, borderRadius: tok.r2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          {Ico.sparkles(tok.accent, 13)}
          <span style={{ fontSize: 10, fontFamily: tok.fontMono, fontWeight: 700, color: tok.accent, letterSpacing: 0.5 }}>ANTON DIGEST · 09:10</span>
        </div>
        <div style={{ fontSize: 12, color: tok.text, lineHeight: 1.4 }}>
          <b>1 regulator</b> needs reply today · <b>2 drafts</b> waiting · <b>8 newsletters</b> ready to archive
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {mail.map((m, i) => {
          const srcColor = { native: tok.accent, '365': tok.blue, gmail: tok.red, chat: tok.blue }[m.src] || tok.textMuted;
          return (
            <div key={i} style={{
              display: 'flex', gap: 10, padding: '11px 14px',
              borderBottom: i < mail.length - 1 ? `1px solid ${tok.borderSoft}` : 'none',
              background: m.unread ? tok.surface : 'transparent',
            }}>
              {/* source stripe */}
              <div style={{ width: 3, alignSelf: 'stretch', background: m.unread ? srcColor : 'transparent', borderRadius: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <span style={{
                    fontSize: 9, fontFamily: tok.fontMono, fontWeight: 700, letterSpacing: 0.4,
                    color: srcColor, textTransform: 'uppercase',
                  }}>{m.src === 'native' ? 'ANTON' : m.src === 'chat' ? 'CHAT' : m.src === '365' ? 'M365' : 'GMAIL'}</span>
                  <span style={{ fontSize: 13, fontWeight: m.unread ? 700 : 500, color: tok.text }}>· {m.f}</span>
                  {m.ext && <Pill tok={tok} tone="gold" style={{ padding: '1px 5px', fontSize: 9 }}>EXT</Pill>}
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 10, color: tok.textFaint, fontFamily: tok.fontMono }}>{m.t}</span>
                </div>
                <div style={{ fontSize: 13, color: tok.text, fontWeight: m.unread ? 600 : 400, lineHeight: 1.3, marginBottom: 3 }}>{m.s}</div>
                <div style={{ fontSize: 11, color: tok.textMuted, lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.ai && <span style={{ color: tok.accent, fontWeight: 700 }}>ANTON · </span>}{m.p}
                </div>
                {m.ai && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                    <Pill tok={tok} tone={m.tone}>{m.ai}</Pill>
                    {m.ai === 'DRAFTED' && <button style={{ padding: '3px 10px', fontSize: 11, fontWeight: 600, background: tok.accent, color: '#fff', border: 'none', borderRadius: 999 }}>Review draft</button>}
                  </div>
                )}
                {m.chat && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                    <Pill tok={tok} tone="blue">{m.n} new in thread</Pill>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <BottomTabs tok={tok} active="more" badge={3} />
    </PhoneBG>
  );
}

// ══════════════════════════════════════════════════════════════
// UNIFIED CALENDAR — ANTON events + connected calendars, one timeline
// ══════════════════════════════════════════════════════════════
function UnifiedCalendarScreen({ tok }) {
  const sources = [
    { id: 'anton', l: 'ANTON', c: tok.accent, n: 2 },
    { id: 'work',  l: 'Work · M365', c: tok.blue, n: 3 },
    { id: 'pers',  l: 'Personal · iCloud', c: tok.gold, n: 1 },
    { id: 'fam',   l: 'Family', c: '#6A3E8F', n: 1 },
  ];
  const events = [
    { t: '09:30', d: 45, title: 'Risk committee — v4.0 sign-off', loc: 'Room A · HQ', src: 'work', anton: true, antonPrep: '3-slide brief ready' },
    { t: '11:00', d: 30, title: 'Counsel call · Elin', loc: 'Video', src: 'work', ext: true },
    { t: '11:45', d: 15, title: 'ANTON-scheduled focus block', loc: 'Inbox triage · auto-created', src: 'anton' },
    { t: '12:30', d: 60, title: 'Lunch · Sofia', loc: 'Kvarnen', src: 'pers' },
    { t: '14:00', d: 90, title: 'Sanctions deep-dive with ANTON', loc: 'Focus block', src: 'anton', anton: true },
    { t: '16:30', d: 30, title: 'Pickup — Leo', loc: 'School', src: 'fam' },
  ];
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<div>
          <div style={{ fontSize: 20, fontWeight: 700, color: tok.text, letterSpacing: -0.4, lineHeight: 1.05 }}>Calendar</div>
          <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono, letterSpacing: 0.3 }}>Thu · 17 April · 4 sources</div>
        </div>}
        right={<>{Ico.search(tok.textMuted, 18)}{Ico.plus(tok.text, 20)}</>}
        border={false}
      />

      {/* source legend */}
      <div style={{ display: 'flex', gap: 5, padding: '4px 14px 8px', overflowX: 'auto' }}>
        {sources.map(s => (
          <div key={s.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '4px 9px', borderRadius: 999, flexShrink: 0,
            background: tok.surface, border: `1px solid ${tok.border}`,
            fontSize: 11, fontWeight: 600, color: tok.textBody,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.c }} />
            {s.l}
            <span style={{ color: tok.textFaint, fontFamily: tok.fontMono, fontSize: 10 }}>{s.n}</span>
          </div>
        ))}
      </div>

      {/* week strip */}
      <div style={{ display: 'flex', padding: '2px 8px 10px', gap: 3, borderBottom: `1px solid ${tok.borderSoft}` }}>
        {['M 14','T 15','W 16','T 17','F 18','S 19','S 20'].map((d, i) => {
          const active = i === 3;
          const dots = [[],[tok.blue],[tok.blue,tok.accent],[tok.accent,tok.blue,tok.gold,'#6A3E8F'],[tok.blue,tok.accent],[tok.gold],[]][i];
          return (
            <div key={i} style={{
              flex: 1, padding: '5px 2px 4px', textAlign: 'center', borderRadius: 9,
              background: active ? tok.text : 'transparent',
              color: active ? tok.surface : tok.textBody,
            }}>
              <div style={{ fontSize: 9, opacity: 0.7, fontWeight: 500 }}>{d.split(' ')[0]}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{d.split(' ')[1]}</div>
              <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 2, height: 3 }}>
                {dots.map((c, j) => <span key={j} style={{ width: 3, height: 3, borderRadius: 1, background: active ? tok.surface : c, opacity: active ? 0.8 : 1 }} />)}
              </div>
            </div>
          );
        })}
      </div>

      {/* ANTON prep banner */}
      <div style={{ margin: '9px 14px 4px', padding: 10, background: tok.accentSoft, borderRadius: tok.r2, display: 'flex', gap: 8, alignItems: 'center' }}>
        {Ico.sparkles(tok.accent, 14)}
        <div style={{ flex: 1, fontSize: 12, color: tok.text, lineHeight: 1.3 }}>
          <b>ANTON prepped</b> Risk committee — 3-slide brief + 6 citations
        </div>
        <Pill tok={tok} tone="teal" style={{ fontSize: 10 }}>READY</Pill>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 14px 16px' }}>
        {events.map((e, i) => {
          const srcColor = { anton: tok.accent, work: tok.blue, pers: tok.gold, fam: '#6A3E8F' }[e.src];
          const srcBg = e.src === 'anton' ? tok.accentSoft : e.src === 'work' ? tok.blueDim : e.src === 'pers' ? tok.goldDim : '#EEE3F5';
          return (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 44, textAlign: 'right', flexShrink: 0, paddingTop: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: tok.text, fontFamily: tok.fontMono }}>{e.t}</div>
                <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono }}>{e.d}m</div>
              </div>
              <div style={{
                flex: 1, padding: '10px 12px', background: srcBg, borderLeft: `4px solid ${srcColor}`,
                borderRadius: `4px ${tok.r2}px ${tok.r2}px 4px`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: tok.text, lineHeight: 1.25 }}>{e.title}</span>
                  {e.anton && <Pill tok={tok} tone="teal" style={{ fontSize: 9 }}>ANTON</Pill>}
                  {e.ext && <Pill tok={tok} tone="gold" style={{ fontSize: 9 }}>EXT</Pill>}
                </div>
                <div style={{ fontSize: 11, color: tok.textMuted }}>{e.loc}</div>
                {e.antonPrep && (
                  <div style={{ fontSize: 11, color: tok.accent, fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {Ico.sparkles(tok.accent, 11)} {e.antonPrep}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <BottomTabs tok={tok} active="more" badge={3} />
    </PhoneBG>
  );
}

// ══════════════════════════════════════════════════════════════
// WORK — modules grid + "Find the right module" helper
// ══════════════════════════════════════════════════════════════
function WorkModulesScreen({ tok }) {
  const pinned = [
    { n: 'Sanctions Advisory', d: 'Screen · advise · SAR', c: tok.red, busy: true, m: '2 running' },
    { n: 'Counsel\'s Desk', d: 'Draft · redline · cite', c: tok.blue, m: '1 draft' },
    { n: 'Gap Assessment', d: 'Policy ↔ control', c: tok.accent },
    { n: 'Finance Autopilot', d: 'AP · payments · approvals', c: tok.gold, m: '1 pending' },
  ];
  const browse = [
    { n: 'Markets Intelligence', d: 'Tape · briefs · scenarios' },
    { n: 'Orchestrator', d: 'Run, monitor missions' },
    { n: 'Knowledge Base', d: 'Docs · atoms · search' },
    { n: 'Presentation Builder', d: 'Deck from brief' },
    { n: 'Task Agent', d: 'Long-running jobs' },
    { n: 'Civic', d: 'Public affairs · NGO' },
    { n: 'Talent', d: 'Hiring · onboarding' },
    { n: 'Travel', d: 'Itineraries · expense' },
  ];
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<div style={{ fontSize: 20, fontWeight: 700, color: tok.text, letterSpacing: -0.4 }}>Work</div>}
        right={<>{Ico.search(tok.textMuted, 18)}{Ico.grid(tok.text, 18)}</>}
        border={false}
      />

      {/* Find-the-right-module helper */}
      <div style={{ margin: '8px 14px 10px', padding: 14, background: tok.accent, color: '#fff', borderRadius: tok.r3, position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, opacity: 0.9 }}>
          {Ico.sparkles('#fff', 13)}
          <span style={{ fontSize: 10, fontFamily: tok.fontMono, fontWeight: 700, letterSpacing: 0.5 }}>FIND THE RIGHT MODULE</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: -0.2, lineHeight: 1.3, marginBottom: 10 }}>
          What are you trying to do?
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 999, padding: '8px 14px', marginBottom: 8,
        }}>
          {Ico.search('#fff', 14)}
          <span style={{ flex: 1, fontSize: 12, color: '#fff', opacity: 0.8 }}>"Review a vendor I've never seen before"</span>
          {Ico.mic('#fff', 14)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['Draft something', 'Review a contract', 'Explain a regulation', 'Run a scan'].map((s, i) => (
            <div key={i} style={{
              fontSize: 11, fontWeight: 500, padding: '5px 10px',
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 999, color: '#fff',
            }}>{s}</div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 14px 14px' }}>
        <SectionLabel tok={tok} style={{ padding: '4px 0 8px' }}>Pinned · 4</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {pinned.map((m, i) => (
            <div key={i} style={{
              padding: 12, background: tok.surface, border: `1px solid ${tok.border}`,
              borderRadius: tok.r2, position: 'relative',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: m.c }} />
                {m.busy && <StatusDot tok={tok} tone="green" size={6} pulse />}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: tok.text, lineHeight: 1.2, marginBottom: 3 }}>{m.n}</div>
              <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono, textTransform: 'uppercase', letterSpacing: 0.3 }}>{m.d}</div>
              {m.m && (
                <div style={{ fontSize: 10, color: m.c, fontWeight: 700, marginTop: 8, fontFamily: tok.fontMono }}>{m.m}</div>
              )}
            </div>
          ))}
        </div>

        <SectionLabel tok={tok} style={{ padding: '0 0 8px' }}>Browse all · 12+</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {browse.map((m, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '11px 8px',
              borderBottom: i < browse.length - 1 ? `1px solid ${tok.borderSoft}` : 'none',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: tok.surfaceAlt,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: tok.fontMono, fontSize: 12, fontWeight: 700, color: tok.text, flexShrink: 0,
              }}>{m.n.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: tok.text }}>{m.n}</div>
                <div style={{ fontSize: 11, color: tok.textMuted }}>{m.d}</div>
              </div>
              {Ico.chevronRight(tok.textFaint, 16)}
            </div>
          ))}
        </div>
      </div>
      <BottomTabs tok={tok} active="more" badge={3} />
    </PhoneBG>
  );
}

// ══════════════════════════════════════════════════════════════
// SCHOOL — daily lesson feed (Duolingo meets Khan-mobile)
// ══════════════════════════════════════════════════════════════
function SchoolFeedScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<div>
          <div style={{ fontSize: 20, fontWeight: 700, color: tok.text, letterSpacing: -0.4, lineHeight: 1.05 }}>School</div>
          <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono }}>Day 42 · Grade 8 · Mathematics</div>
        </div>}
        right={<>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: tok.goldDim, borderRadius: 999 }}>
            <span style={{ color: tok.gold, fontSize: 13 }}>🔥</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: tok.gold }}>12</span>
          </div>
        </>}
        border={false}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '6px 16px 16px' }}>
        {/* today's goal */}
        <div style={{ padding: 14, background: tok.accent, borderRadius: tok.r3, color: '#fff', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, opacity: 0.85 }}>
            <span style={{ fontSize: 11, fontFamily: tok.fontMono, fontWeight: 700, letterSpacing: 0.5 }}>TODAY · 15 MIN</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1.25, marginBottom: 10 }}>
            Linear equations — Part 2 of 4
          </div>
          {/* progress dots */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {[1, 1, 1, 0, 0, 0, 0, 0].map((done, i) => (
              <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: done ? '#fff' : 'rgba(255,255,255,0.3)' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <Pill tok={tok} tone="neutral" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>📶 Offline-ready</Pill>
            <Pill tok={tok} tone="neutral" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>🎧 Audio</Pill>
          </div>
          <button style={{
            width: '100%', padding: '11px 0', background: '#fff', color: tok.accent,
            border: 'none', borderRadius: tok.r2, fontSize: 14, fontWeight: 700, letterSpacing: -0.1,
          }}>Continue lesson →</button>
        </div>

        {/* next up */}
        <SectionLabel tok={tok} style={{ marginBottom: 8 }}>Up next</SectionLabel>
        {[
          { t: 'Watch · Slope in the real world', d: '3 min · video', icon: '▶', c: tok.red },
          { t: 'Practice · 8 problems', d: '10 min · adaptive', icon: '✎', c: tok.accent },
          { t: 'Homework · Mrs. Okonkwo', d: 'Due Friday · 5 problems', icon: '📘', c: tok.gold, due: true },
          { t: 'Ask ANTON anything', d: 'Stuck? Voice or text.', icon: '🎤', c: tok.blue, ai: true },
        ].map((c, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 12, marginBottom: 8,
            background: tok.surface, border: `1px solid ${c.due ? tok.gold : tok.border}`,
            borderRadius: tok.r2,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: c.c, color: '#fff', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>{c.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: tok.text, letterSpacing: -0.1 }}>{c.t}</div>
              <div style={{ fontSize: 11, color: c.due ? tok.gold : tok.textMuted, fontWeight: c.due ? 600 : 400 }}>{c.d}</div>
            </div>
            {c.ai && <Pill tok={tok} tone="teal">AI</Pill>}
            {Ico.chevronRight(tok.textFaint, 16)}
          </div>
        ))}

        {/* homework capture shortcut */}
        <div style={{
          marginTop: 6, padding: 12, background: tok.surfaceAlt,
          border: `1px dashed ${tok.border}`, borderRadius: tok.r2,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {Ico.camera(tok.accent, 20)}
          <div style={{ flex: 1, fontSize: 12, color: tok.textBody, lineHeight: 1.35 }}>
            <b>Stuck on homework?</b> Snap a photo — ANTON shows you the steps, doesn't just give the answer.
          </div>
        </div>
      </div>
      <BottomTabs tok={tok} active="more" badge={3} />
    </PhoneBG>
  );
}

// ══════════════════════════════════════════════════════════════
// MARKETS — morning briefing + local ANTON analytics tape
// ══════════════════════════════════════════════════════════════
function MarketsScreen({ tok }) {
  const movers = [
    { s: 'OMX30', p: '2,487.1', ch: '+0.42%', up: true, v: '842K' },
    { s: 'SEK/EUR', p: '0.0871', ch: '−0.18%', up: false, v: '—' },
    { s: 'Brent', p: '$87.24', ch: '+1.1%', up: true, v: '112K' },
    { s: 'US 10Y', p: '4.28%', ch: '+6 bps', up: true, v: '—' },
    { s: 'ERIC-B', p: 'kr 64.22', ch: '−2.3%', up: false, v: '3.4M', watch: true },
    { s: 'HMSL', p: '$182.4', ch: '+0.9%', up: true, v: '1.1M', watch: true },
  ];
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<div>
          <div style={{ fontSize: 20, fontWeight: 700, color: tok.text, letterSpacing: -0.4, lineHeight: 1.05 }}>Markets</div>
          <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono }}>
            <span style={{ color: tok.green }}>● LIVE</span> · Europe open · 09:12 CET
          </div>
        </div>}
        right={<>{Ico.search(tok.textMuted, 18)}{Ico.sparkles(tok.accent, 16)}</>}
        border={false}
      />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* morning briefing hero */}
        <div style={{ margin: '8px 14px 12px', padding: 16, background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.r3, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            {Ico.sparkles(tok.accent, 14)}
            <span style={{ fontSize: 10, fontFamily: tok.fontMono, fontWeight: 700, color: tok.accent, letterSpacing: 0.5 }}>MORNING BRIEFING · 07:00 · BY YOUR ANTON</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: tok.text, letterSpacing: -0.4, lineHeight: 1.2, marginBottom: 6, textWrap: 'pretty' }}>
            Yields are the story. Your Ericsson position still looks fine — but watch Tuesday's ECB print.
          </div>
          <div style={{ fontSize: 12, color: tok.textBody, lineHeight: 1.45, marginBottom: 10 }}>
            US 10Y +6bps overnight on sticky CPI. Euro periphery widening 3–5 bps. Tech bid, banks flat.
            ANTON cross-checked your holdings — <b>2 tickers need your attention</b>.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Pill tok={tok} tone="teal">3 citations</Pill>
            <Pill tok={tok} tone="blue">Your portfolio · 14 positions</Pill>
            <Pill tok={tok} tone="gold">2 flags</Pill>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Btn tok={tok} variant="primary" size="sm" block icon={Ico.arrowUp('currentColor', 13)} style={{ transform: 'rotate(0)' }}>Read full brief</Btn>
            <Btn tok={tok} variant="secondary" size="sm" block icon={Ico.mic('currentColor', 13)}>Play audio · 2m</Btn>
          </div>
        </div>

        {/* tape */}
        <SectionLabel tok={tok} style={{ padding: '0 18px 6px' }}>Tape · your watchlist</SectionLabel>
        <div style={{ margin: '0 14px 14px', background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.r2, overflow: 'hidden' }}>
          {movers.map((r, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderBottom: i < movers.length - 1 ? `1px solid ${tok.borderSoft}` : 'none',
              background: r.watch ? tok.accentSoft : 'transparent',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: tok.fontMono, fontSize: 12, fontWeight: 700, color: tok.text, letterSpacing: -0.1 }}>{r.s}</span>
                  {r.watch && <Pill tok={tok} tone="teal" style={{ fontSize: 9 }}>WATCH</Pill>}
                </div>
                <div style={{ fontSize: 10, color: tok.textFaint, fontFamily: tok.fontMono, marginTop: 2 }}>vol {r.v}</div>
              </div>
              {/* sparkline placeholder */}
              <svg width="50" height="20" viewBox="0 0 50 20" style={{ flexShrink: 0 }}>
                <polyline fill="none" stroke={r.up ? tok.green : tok.red} strokeWidth="1.5"
                  points={r.up ? "0,15 8,12 15,13 23,8 30,10 38,5 50,3" : "0,5 8,8 15,6 23,10 30,9 38,14 50,16"} />
              </svg>
              <div style={{ textAlign: 'right', minWidth: 80 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: tok.text, fontFamily: tok.fontMono, letterSpacing: -0.1 }}>{r.p}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: r.up ? tok.green : tok.red, fontFamily: tok.fontMono }}>{r.ch}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ANTON prediction card */}
        <div style={{ margin: '0 14px 18px', padding: 13, background: tok.accentSoft, border: `1px solid ${tok.accentDim}`, borderRadius: tok.r2 }}>
          <div style={{ fontSize: 10, fontFamily: tok.fontMono, fontWeight: 700, color: tok.accent, letterSpacing: 0.5, marginBottom: 4 }}>
            LOCAL PREDICTION · MONTE CARLO · 10,000 RUNS
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: tok.text, lineHeight: 1.3, marginBottom: 8 }}>
            ECB Tuesday · hold vs 25bp cut
          </div>
          <div style={{ display: 'flex', gap: 4, height: 18, borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ flex: 62, background: tok.accent }} />
            <div style={{ flex: 28, background: tok.gold }} />
            <div style={{ flex: 10, background: tok.red }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontFamily: tok.fontMono, color: tok.textMuted }}>
            <span><b style={{ color: tok.accent }}>62%</b> hold</span>
            <span><b style={{ color: tok.gold }}>28%</b> 25bp cut</span>
            <span><b style={{ color: tok.red }}>10%</b> hike</span>
          </div>
        </div>
      </div>
      <BottomTabs tok={tok} active="more" badge={3} />
    </PhoneBG>
  );
}

// ══════════════════════════════════════════════════════════════
// PATHFINDER — "Search that thinks before it answers"
// ══════════════════════════════════════════════════════════════
function PathfinderScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<>{Ico.chevronLeft(tok.textMuted, 20)}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: tok.text, letterSpacing: -0.3 }}>Pathfinder</div>
            <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono, letterSpacing: 0.3 }}>Search that thinks</div>
          </div>
        </>}
        right={<>{Ico.more(tok.textMuted, 18)}</>}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>
        {/* query */}
        <div style={{
          padding: '12px 14px', background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r2, marginBottom: 14,
        }}>
          <div style={{ fontSize: 10, fontFamily: tok.fontMono, color: tok.textMuted, letterSpacing: 0.5, marginBottom: 3 }}>YOUR QUESTION</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: tok.text, lineHeight: 1.35, letterSpacing: -0.1 }}>
            Is the new EU AI Act going to affect how we deploy ANTON at the bank?
          </div>
        </div>

        {/* thinking trace */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            {Ico.sparkles(tok.accent, 13)}
            <span style={{ fontSize: 10, fontFamily: tok.fontMono, fontWeight: 700, color: tok.accent, letterSpacing: 0.5 }}>ANTON THOUGHT FOR 4.2S · 7 STEPS</span>
          </div>
          {[
            { t: 'Clarifying what you mean by "deploy" — inference, training, or downstream use?', st: 'done' },
            { t: 'Fetching EU AI Act · Annex III (high-risk systems) & Article 6', st: 'done' },
            { t: 'Cross-ref: your bank\'s classification (SI-FI) · your ANTON use-cases', st: 'done' },
            { t: 'Flagging 2 obligations you\'re already covered on, 1 gap', st: 'done' },
            { t: 'Drafting answer with citations to official texts', st: 'done' },
          ].map((s, i, arr) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 4, position: 'relative' }}>
              <div style={{ width: 16, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: tok.accent, color: '#fff', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
                {i < arr.length - 1 && <div style={{ flex: 1, width: 1, background: tok.accentDim, minHeight: 10 }} />}
              </div>
              <div style={{ flex: 1, fontSize: 12, color: tok.textBody, lineHeight: 1.4, paddingBottom: 4 }}>{s.t}</div>
            </div>
          ))}
        </div>

        {/* the answer */}
        <div style={{ padding: 14, background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.r3, marginBottom: 12 }}>
          <div style={{ fontSize: 14, color: tok.text, lineHeight: 1.55, textWrap: 'pretty' }}>
            <b>Short answer: yes, but mostly reassuringly.</b> Because you run ANTON locally and use it internally for advisory and drafting (not credit scoring or biometric ID), you fall outside <sup style={{ color: tok.accent, fontSize: 10 }}>[1]</sup> Annex III high-risk. You still owe <sup style={{ color: tok.accent, fontSize: 10 }}>[2]</sup> transparency + logging under Art. 52. Your current audit trail covers this — <b>1 small gap</b>: automated decision disclosures to customers <sup style={{ color: tok.accent, fontSize: 10 }}>[3]</sup>.
          </div>
        </div>

        {/* sources */}
        <SectionLabel tok={tok} style={{ marginBottom: 8 }}>Sources · 3</SectionLabel>
        {[
          { n: 1, t: 'EU AI Act · Official Journal · 12 July 2024', dom: 'eur-lex.europa.eu', type: 'official' },
          { n: 2, t: 'Article 52 — Transparency obligations for certain AI systems', dom: 'eur-lex.europa.eu', type: 'official' },
          { n: 3, t: 'Your instance · Policy v4.0 · Section 7 (Automated disclosures)', dom: 'anton.fc · private', type: 'private' },
        ].map(s => (
          <div key={s.n} style={{
            display: 'flex', gap: 10, padding: 10, marginBottom: 6,
            background: s.type === 'private' ? tok.accentSoft : tok.surfaceAlt,
            border: `1px solid ${s.type === 'private' ? tok.accentDim : tok.borderSoft}`,
            borderRadius: tok.r2,
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', background: tok.text, color: '#fff',
              fontSize: 11, fontWeight: 700, fontFamily: tok.fontMono, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{s.n}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: tok.text, lineHeight: 1.35 }}>{s.t}</div>
              <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono, marginTop: 2 }}>{s.dom}</div>
            </div>
            {s.type === 'private' && <Pill tok={tok} tone="teal" style={{ fontSize: 9, alignSelf: 'flex-start' }}>YOURS</Pill>}
          </div>
        ))}

        <div style={{ fontSize: 11, color: tok.textFaint, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
          You're never the product. No tracking. Your question stays on your instance.
        </div>
      </div>
    </PhoneBG>
  );
}

// ══════════════════════════════════════════════════════════════
// HORIZON RADAR — you teach it what to watch; it scans, scores, pings
// ══════════════════════════════════════════════════════════════
function HorizonRadarScreen({ tok }) {
  const cats = [
    { l: 'All', n: 42, active: true },
    { l: 'Regulatory', n: 11 },
    { l: 'Competitors', n: 7 },
    { l: 'Products', n: 9 },
    { l: 'Threats', n: 4 },
    { l: 'Trends', n: 11 },
  ];

  const items = [
    {
      cat: 'Regulatory', src: 'EUR-LEX · Official', type: 'official',
      title: 'ECB issues draft guidance on AI in credit decisioning',
      blurb: 'Consultation window opens 14 Mar, closes 28 Apr. Applies to SI-FIs using automated decisioning.',
      rel: 94, tone: 'red', tag: 'HIGH RELEVANCE',
      meta: 'Matches 3 of your watch-terms · 2h ago',
    },
    {
      cat: 'Competitors', src: 'Press · Handelsblatt', type: 'news',
      title: 'Nordea pilots internal LLM assistant with partner bank',
      blurb: 'Named "Nora" · limited to treasury desk · rollout plan for H2. No local-first claim.',
      rel: 71, tone: 'gold', tag: 'WATCHLIST',
      meta: 'Matches competitor: Nordea · 6h ago',
    },
    {
      cat: 'Regulatory', src: 'Finansinspektionen', type: 'official',
      title: 'FI clarifies Art. 52 disclosure wording for customer-facing AI',
      blurb: 'New template text recommended; your current policy v4.0 Section 7 covers 80% — 1 line needs update.',
      rel: 88, tone: 'red', tag: 'ACTION SUGGESTED',
      meta: 'Matches: AI Act · Art. 52 · 1d ago',
    },
    {
      cat: 'Trends', src: 'arXiv · 2603.15142', type: 'paper',
      title: 'Local-first retrieval outperforms cloud RAG on private-doc recall',
      blurb: 'Useful citation for your Pathfinder positioning paper. Not urgent.',
      rel: 52, tone: 'neutral', tag: 'FYI',
      meta: 'Matches: Pathfinder · local-first · 3d ago',
    },
  ];

  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<>{Ico.chevronLeft(tok.textMuted, 20)}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: tok.text, letterSpacing: -0.3 }}>Horizon Radar</span>
              {/* radar glyph */}
              <svg width="13" height="13" viewBox="0 0 20 20" style={{ display: 'block' }}>
                <circle cx="10" cy="10" r="8.5" fill="none" stroke={tok.accent} strokeWidth="1.25" opacity="0.4"/>
                <circle cx="10" cy="10" r="5" fill="none" stroke={tok.accent} strokeWidth="1.25" opacity="0.6"/>
                <circle cx="10" cy="10" r="1.5" fill={tok.accent}/>
                <path d="M10 10 L10 1.5" stroke={tok.accent} strokeWidth="1.25" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono, letterSpacing: 0.3 }}>
              <span style={{ color: tok.green }}>● SCANNING</span> · 8 sources · 774 scanned today
            </div>
          </div>
        </>}
        right={<>{Ico.sparkles(tok.accent, 16)}{Ico.more(tok.textMuted, 18)}</>}
      />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* summary strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0,
          background: tok.surface, borderBottom: `1px solid ${tok.border}`,
        }}>
          {[
            { n: '42', l: 'new today', c: tok.text },
            { n: '3', l: 'high relevance', c: tok.red },
            { n: '1', l: 'action suggested', c: tok.gold },
          ].map((s, i) => (
            <div key={i} style={{
              padding: '11px 12px', textAlign: 'center',
              borderRight: i < 2 ? `1px solid ${tok.borderSoft}` : 'none',
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.c, fontFamily: tok.fontMono, letterSpacing: -0.5, lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono, letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 3 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* category chips */}
        <div style={{
          display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 14px 8px',
          background: tok.surface, borderBottom: `1px solid ${tok.borderSoft}`,
        }}>
          {cats.map((c, i) => (
            <div key={i} style={{
              padding: '5px 11px', borderRadius: 999, flexShrink: 0,
              fontSize: 11, fontWeight: 600, fontFamily: tok.font,
              background: c.active ? tok.text : tok.surfaceAlt,
              color: c.active ? tok.surface : tok.textBody,
              border: `1px solid ${c.active ? tok.text : tok.border}`,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              {c.l}
              <span style={{ fontFamily: tok.fontMono, fontSize: 10, opacity: 0.7 }}>{c.n}</span>
            </div>
          ))}
        </div>

        {/* briefing hero */}
        <div style={{ margin: '12px 14px 14px', padding: 14, background: tok.accentSoft, border: `1px solid ${tok.accentDim}`, borderRadius: tok.r3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            {Ico.sparkles(tok.accent, 13)}
            <span style={{ fontSize: 10, fontFamily: tok.fontMono, fontWeight: 700, color: tok.accent, letterSpacing: 0.5 }}>YOUR HORIZON · 08:00 · BY YOUR ANTON</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: tok.text, lineHeight: 1.3, letterSpacing: -0.2, marginBottom: 6, textWrap: 'pretty' }}>
            Two regulatory moves touch you this week — and Nordea just announced something worth reading.
          </div>
          <div style={{ fontSize: 12, color: tok.textBody, lineHeight: 1.45, marginBottom: 10 }}>
            ECB consults on AI in credit · FI tightens Art. 52 wording (1 line in your policy) · Nordea's "Nora" pilot is cloud-based, not local-first.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn tok={tok} variant="primary" size="sm" block icon={Ico.sparkles('currentColor', 13)}>Read brief</Btn>
            <Btn tok={tok} variant="secondary" size="sm" block icon={Ico.mic('currentColor', 13)}>Play · 90s</Btn>
          </div>
        </div>

        {/* items */}
        <SectionLabel tok={tok} style={{ padding: '0 18px 8px' }}>Latest signals</SectionLabel>
        <div style={{ padding: '0 14px 16px' }}>
          {items.map((it, i) => (
            <div key={i} style={{
              padding: 13, background: tok.surface, border: `1px solid ${tok.border}`,
              borderRadius: tok.r2, marginBottom: 8, position: 'relative',
            }}>
              {/* source row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <Pill tok={tok} tone={it.tone === 'red' ? 'red' : it.tone === 'gold' ? 'gold' : it.tone === 'neutral' ? 'neutral' : 'teal'} mono style={{ fontSize: 9 }}>
                  {it.tag}
                </Pill>
                <span style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono, letterSpacing: 0.3 }}>
                  {it.cat.toUpperCase()} · {it.src}
                </span>
              </div>
              {/* title */}
              <div style={{ fontSize: 14, fontWeight: 600, color: tok.text, lineHeight: 1.3, letterSpacing: -0.2, marginBottom: 4, textWrap: 'pretty' }}>
                {it.title}
              </div>
              {/* blurb */}
              <div style={{ fontSize: 12, color: tok.textBody, lineHeight: 1.45, marginBottom: 9 }}>
                {it.blurb}
              </div>
              {/* relevance bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 9, fontFamily: tok.fontMono, color: tok.textMuted, letterSpacing: 0.3, width: 54 }}>RELEVANCE</span>
                <div style={{ flex: 1, height: 4, background: tok.surfaceAlt, borderRadius: 2, overflow: 'hidden', border: `1px solid ${tok.borderSoft}` }}>
                  <div style={{
                    width: `${it.rel}%`, height: '100%',
                    background: it.rel >= 85 ? tok.red : it.rel >= 65 ? tok.gold : tok.accent,
                  }} />
                </div>
                <span style={{ fontSize: 11, fontFamily: tok.fontMono, fontWeight: 700, color: tok.text, letterSpacing: -0.2, width: 26, textAlign: 'right' }}>{it.rel}</span>
              </div>
              {/* meta */}
              <div style={{ fontSize: 10, color: tok.textFaint, fontFamily: tok.fontMono, letterSpacing: 0.2 }}>{it.meta}</div>
            </div>
          ))}
        </div>

        {/* sources footer */}
        <div style={{ margin: '0 14px 18px', padding: 12, background: tok.surfaceAlt, border: `1px dashed ${tok.border}`, borderRadius: tok.r2 }}>
          <div style={{ fontSize: 10, fontFamily: tok.fontMono, color: tok.textMuted, letterSpacing: 0.5, marginBottom: 6 }}>8 SOURCES ACTIVE · YOU OWN THE LIST</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {['EUR-Lex', 'FI.se', 'ECB', 'arXiv', 'Handelsblatt', 'Bloomberg', 'Your instance', '+ 1'].map((s, i) => (
              <span key={i} style={{
                fontSize: 10, fontFamily: tok.fontMono, padding: '2px 7px',
                background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: 999,
                color: tok.textBody,
              }}>{s}</span>
            ))}
          </div>
          <div style={{ fontSize: 10, color: tok.textFaint, marginTop: 8, lineHeight: 1.4 }}>
            Nothing is scraped without your say-so. No source sells your queries back to you.
          </div>
        </div>
      </div>
      <BottomTabs tok={tok} active="more" badge={3} />
    </PhoneBG>
  );
}

Object.assign(window, {
  UnifiedMailScreen, UnifiedCalendarScreen,
  WorkModulesScreen, SchoolFeedScreen,
  MarketsScreen, PathfinderScreen,
  HorizonRadarScreen,
});
