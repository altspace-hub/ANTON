// screens-standard.jsx — Standard mode variants.
// For non-technical users (think: a parent, a 60-year-old, a first-time smart-device user).
// Design rules:
//   • 17–18px body, 28–32px titles, 44+px tap targets
//   • No hashes, no trust scores, no mono labels, no acronyms
//   • Plain language: "Waiting for you" not "Approvals · 3 pending"
//   • One thing per card. Actions primary-only.
//   • Fewer tabs: Home · Messages · Ask · You

// ─── Simpler primitives (Standard-only) ───────────────────────
function STopBar({ tok, title, sub, left, right }) {
  return (
    <div style={{
      padding: '12px 18px', background: tok.bg, flexShrink: 0,
      display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      {left && <div style={{ paddingTop: 2 }}>{left}</div>}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: tok.text, letterSpacing: -0.4, lineHeight: 1.1 }}>{title}</div>
        {sub && <div style={{ fontSize: 14, color: tok.textMuted, marginTop: 3 }}>{sub}</div>}
      </div>
      {right && <div style={{ paddingTop: 4, display: 'flex', gap: 10 }}>{right}</div>}
    </div>
  );
}

function SBottomTabs({ tok, active = 'home', n = 2 }) {
  const tabs = [
    { id: 'home', icon: Ico.home, label: 'Home' },
    { id: 'msg', icon: Ico.message, label: 'Messages', n },
    { id: 'ask', icon: Ico.sparkles, label: 'Ask' },
    { id: 'you', icon: Ico.shield, label: 'You' },
  ];
  return (
    <div style={{
      display: 'flex', background: tok.surface, borderTop: `1px solid ${tok.border}`,
      padding: '8px 6px 14px', flexShrink: 0,
    }}>
      {tabs.map(t => {
        const isActive = t.id === active;
        const color = isActive ? tok.accent : tok.textMuted;
        return (
          <div key={t.id} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, padding: '6px 0', position: 'relative',
          }}>
            <div style={{ position: 'relative' }}>
              {t.icon(color, 26)}
              {t.n > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -10,
                  background: tok.red, color: '#fff',
                  fontSize: 11, fontWeight: 700, borderRadius: 999,
                  minWidth: 20, height: 20, padding: '0 6px',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${tok.surface}`,
                }}>{t.n}</span>
              )}
            </div>
            <div style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color }}>{t.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// STANDARD · HOME
// ══════════════════════════════════════════════════════════════
function StdHomeScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <STopBar tok={tok}
        title="Good morning, Daniel"
        sub="Thursday, 17 April"
        right={<>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: tok.accent, color: '#fff', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>DB</div>
        </>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 20px' }}>

        {/* waiting for you — primary action */}
        <div style={{
          padding: 20, background: tok.surface, border: `1px solid ${tok.accent}`,
          borderRadius: tok.r3, marginBottom: 14,
          boxShadow: `0 1px 0 ${tok.borderSoft}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: tok.accent }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: tok.accent }}>Waiting for you</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: tok.text, letterSpacing: -0.4, lineHeight: 1.2, marginBottom: 4, textWrap: 'pretty' }}>
            ANTON wants to pay an invoice.
          </div>
          <div style={{ fontSize: 15, color: tok.textBody, lineHeight: 1.45, marginBottom: 14 }}>
            €180,000 to <b>Orion Holdings</b>, a supplier you've paid 11 times before. ANTON checked everything looks normal.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button style={{
              padding: '14px 0', background: tok.accent, color: '#fff', border: 'none',
              borderRadius: tok.r2, fontSize: 16, fontWeight: 700, letterSpacing: -0.2,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>{Ico.fingerprint('#fff', 18)} Review and approve</button>
            <button style={{
              padding: '12px 0', background: 'transparent', color: tok.textBody,
              border: `1px solid ${tok.border}`, borderRadius: tok.r2,
              fontSize: 15, fontWeight: 600,
            }}>Not now</button>
          </div>
        </div>

        {/* second waiting item — quieter */}
        <div style={{
          padding: 16, background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r3, marginBottom: 22,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: tok.gold, marginBottom: 4 }}>Also waiting</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: tok.text, lineHeight: 1.25, letterSpacing: -0.2 }}>
            Reply to the regulator
          </div>
          <div style={{ fontSize: 14, color: tok.textMuted, marginTop: 2 }}>
            ANTON wrote a draft. Takes 1 minute.
          </div>
        </div>

        {/* today */}
        <div style={{ fontSize: 13, fontWeight: 700, color: tok.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
          Today
        </div>
        {[
          { t: '9:30', e: 'Risk committee', d: 'Room A · ANTON prepped notes' },
          { t: '11:00', e: 'Counsel call · Elin', d: 'Video' },
          { t: '12:30', e: 'Lunch with Sofia', d: 'Kvarnen' },
        ].map((x, i) => (
          <div key={i} style={{
            display: 'flex', gap: 14, padding: '12px 4px',
            borderBottom: i < 2 ? `1px solid ${tok.borderSoft}` : 'none',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: tok.text, minWidth: 56 }}>{x.t}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: tok.text }}>{x.e}</div>
              <div style={{ fontSize: 14, color: tok.textMuted, marginTop: 2 }}>{x.d}</div>
            </div>
          </div>
        ))}

        {/* ask shortcut */}
        <div style={{
          marginTop: 22, padding: 16, background: tok.accentSoft, borderRadius: tok.r3,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          {Ico.mic(tok.accent, 26)}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: tok.text }}>Ask ANTON anything</div>
            <div style={{ fontSize: 13, color: tok.textMuted }}>Tap and talk, or type</div>
          </div>
          {Ico.chevronRight(tok.accent, 20)}
        </div>
      </div>
      <SBottomTabs tok={tok} active="home" n={2} />
    </PhoneBG>
  );
}

// ══════════════════════════════════════════════════════════════
// STANDARD · MAIL (unified, but simpler — no source chips)
// ══════════════════════════════════════════════════════════════
function StdMailScreen({ tok }) {
  const mail = [
    {
      f: 'ANTON', s: 'Your work is finished', p: 'The sanctions scan is done. Tap to see what ANTON found.',
      t: 'Just now', unread: true, ai: true,
    },
    {
      f: 'The regulator', s: 'Needs a reply today', p: 'ANTON wrote a draft. Takes one minute.',
      t: '9:00', unread: true, flag: true,
    },
    {
      f: 'Maria', s: 'Tehran case', p: 'Forwarded the memo. Please look when you can.',
      t: '8:41', unread: true,
    },
    {
      f: 'Daniel (your son)', s: 'Bought the groceries', p: 'Heading home now 🙂',
      t: 'Yesterday',
    },
    {
      f: 'Sofia', s: 'Lunch tomorrow?', p: 'Kvarnen at 12:30 if you\'re free.',
      t: 'Monday',
    },
  ];
  return (
    <PhoneBG tok={tok}>
      <STopBar tok={tok} title="Messages" sub="You have 3 new" right={<>{Ico.search(tok.textMuted, 22)}</>} />
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {mail.map((m, i) => (
          <div key={i} style={{
            display: 'flex', gap: 14, padding: '16px 18px',
            borderBottom: i < mail.length - 1 ? `1px solid ${tok.borderSoft}` : 'none',
            background: m.unread ? tok.surface : 'transparent',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: m.ai ? tok.accent : m.flag ? tok.gold : tok.surfaceAlt,
              color: m.ai || m.flag ? '#fff' : tok.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17, fontWeight: 700,
            }}>{m.ai ? '●' : m.f.split(' ')[0][0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 16, fontWeight: m.unread ? 700 : 500, color: tok.text }}>{m.f}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 13, color: tok.textMuted }}>{m.t}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: m.unread ? 600 : 400, color: tok.text, marginTop: 2, letterSpacing: -0.1 }}>{m.s}</div>
              <div style={{ fontSize: 14, color: tok.textMuted, lineHeight: 1.4, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.p}</div>
            </div>
          </div>
        ))}
      </div>
      <SBottomTabs tok={tok} active="msg" n={3} />
    </PhoneBG>
  );
}

// ══════════════════════════════════════════════════════════════
// STANDARD · MESSAGES THREAD (chat with ANTON or a person)
// ══════════════════════════════════════════════════════════════
function StdThreadScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <STopBar tok={tok} title="ANTON"
        sub="Here to help"
        left={Ico.chevronLeft(tok.text, 26)}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* ANTON */}
        <div style={{ maxWidth: '86%' }}>
          <div style={{
            background: tok.surface, border: `1px solid ${tok.border}`,
            padding: '14px 16px', borderRadius: `${tok.r3}px ${tok.r3}px ${tok.r3}px 4px`,
            fontSize: 16, color: tok.text, lineHeight: 1.45,
          }}>
            Good morning, Daniel. An invoice needs your approval. Want me to show it?
          </div>
        </div>
        {/* user */}
        <div style={{ alignSelf: 'flex-end', maxWidth: '86%' }}>
          <div style={{
            background: tok.accent, color: '#fff',
            padding: '14px 16px', borderRadius: `${tok.r3}px ${tok.r3}px 4px ${tok.r3}px`,
            fontSize: 16, lineHeight: 1.45,
          }}>Yes, show me.</div>
        </div>
        {/* ANTON card */}
        <div style={{ maxWidth: '88%' }}>
          <div style={{
            background: tok.surface, border: `1px solid ${tok.border}`,
            padding: 16, borderRadius: tok.r3,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: tok.textMuted, marginBottom: 6 }}>Invoice from</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: tok.text, letterSpacing: -0.3 }}>Orion Holdings</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: tok.text, marginTop: 10, letterSpacing: -0.5 }}>€180,000</div>
            <div style={{ fontSize: 14, color: tok.textMuted, marginTop: 4 }}>Looks normal — 11 previous invoices all paid.</div>
            <button style={{
              width: '100%', marginTop: 14, padding: '13px 0',
              background: tok.accent, color: '#fff', border: 'none', borderRadius: tok.r2,
              fontSize: 16, fontWeight: 700, letterSpacing: -0.1,
            }}>Review and approve</button>
          </div>
        </div>
      </div>
      {/* composer */}
      <div style={{ padding: 14, background: tok.surface, borderTop: `1px solid ${tok.border}`, flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: tok.surfaceAlt, border: `1px solid ${tok.border}`,
          borderRadius: 999, padding: '10px 10px 10px 18px',
        }}>
          <div style={{ flex: 1, fontSize: 16, color: tok.textMuted }}>Type or hold to speak…</div>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: tok.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {Ico.mic('#fff', 22)}
          </div>
        </div>
      </div>
    </PhoneBG>
  );
}

// ══════════════════════════════════════════════════════════════
// STANDARD · CALENDAR (one day at a time, huge type)
// ══════════════════════════════════════════════════════════════
function StdCalendarScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <STopBar tok={tok} title="Today" sub="Thursday, 17 April" right={<>{Ico.plus(tok.text, 24)}</>} />

      {/* simple weekday strip */}
      <div style={{ display: 'flex', padding: '0 14px 14px', gap: 6 }}>
        {[{ d: 'Mon', n: 14 }, { d: 'Tue', n: 15 }, { d: 'Wed', n: 16 }, { d: 'Thu', n: 17, a: true }, { d: 'Fri', n: 18 }, { d: 'Sat', n: 19 }, { d: 'Sun', n: 20 }].map((x, i) => (
          <div key={i} style={{
            flex: 1, padding: '8px 0', textAlign: 'center', borderRadius: 12,
            background: x.a ? tok.accent : 'transparent',
            color: x.a ? '#fff' : tok.textBody,
          }}>
            <div style={{ fontSize: 11, opacity: 0.8 }}>{x.d}</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{x.n}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 16px' }}>
        {[
          { t: '9:30', e: 'Risk committee', d: 'Room A, HQ', note: 'ANTON prepared notes for you', c: tok.accent },
          { t: '11:00', e: 'Counsel call with Elin', d: 'Video call', c: tok.blue },
          { t: '12:30', e: 'Lunch with Sofia', d: 'Kvarnen', c: tok.gold },
          { t: '16:30', e: 'Pickup Leo from school', d: 'Östra real', c: '#6A3E8F', family: true },
        ].map((x, i) => (
          <div key={i} style={{
            padding: 16, marginBottom: 10, background: tok.surface,
            border: `1px solid ${tok.border}`, borderLeft: `5px solid ${x.c}`,
            borderRadius: tok.r3,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: x.c, marginBottom: 4 }}>{x.t}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: tok.text, letterSpacing: -0.3, lineHeight: 1.2 }}>{x.e}</div>
            <div style={{ fontSize: 14, color: tok.textMuted, marginTop: 3 }}>{x.d}</div>
            {x.note && (
              <div style={{ marginTop: 10, padding: '9px 12px', background: tok.accentSoft, borderRadius: tok.r2, fontSize: 13, color: tok.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                {Ico.sparkles(tok.accent, 14)} {x.note}
              </div>
            )}
          </div>
        ))}
      </div>
      <SBottomTabs tok={tok} active="home" n={2} />
    </PhoneBG>
  );
}

// ══════════════════════════════════════════════════════════════
// STANDARD · WALLET (no hashes, no crypto addresses)
// ══════════════════════════════════════════════════════════════
function StdWalletScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <STopBar tok={tok} title="Money" sub="Your FutureChain account" />
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 18px' }}>
        {/* balance */}
        <div style={{
          padding: 22, borderRadius: tok.r3,
          background: tok.accent, color: '#fff',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 14, opacity: 0.9 }}>Available balance</div>
          <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.5, marginTop: 6, lineHeight: 1 }}>
            €12,480
          </div>
          <div style={{ fontSize: 13, opacity: 0.85, marginTop: 4 }}>FutureChain · euro</div>
        </div>

        {/* primary actions — big, two-up */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
          <button style={{
            flex: 1, padding: '18px 0', background: tok.surface,
            border: `1px solid ${tok.border}`, borderRadius: tok.r2,
            fontSize: 16, fontWeight: 700, color: tok.text,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>{Ico.arrowUp(tok.text, 22)} Send</button>
          <button style={{
            flex: 1, padding: '18px 0', background: tok.surface,
            border: `1px solid ${tok.border}`, borderRadius: tok.r2,
            fontSize: 16, fontWeight: 700, color: tok.text,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          }}>{Ico.qr(tok.text, 22)} Receive</button>
        </div>

        {/* recent */}
        <div style={{ fontSize: 13, fontWeight: 700, color: tok.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
          Recent
        </div>
        {[
          { who: 'NorthBound AB', sub: 'Invoice paid', amt: '−€2,400', t: '9:02 today', out: true },
          { who: 'Klarna', sub: 'Refund', amt: '+€79', t: '8:44 today', in: true },
          { who: 'ANTON', sub: 'Monthly OpenAI cost · you approved', amt: '−€120', t: 'Yesterday' },
        ].map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 4px',
            borderBottom: i < 2 ? `1px solid ${tok.borderSoft}` : 'none',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: r.in ? tok.greenDim : tok.surfaceAlt,
              color: r.in ? tok.green : tok.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 700,
            }}>{r.in ? '↓' : '↑'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: tok.text }}>{r.who}</div>
              <div style={{ fontSize: 13, color: tok.textMuted }}>{r.sub} · {r.t}</div>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: r.in ? tok.green : tok.text, letterSpacing: -0.2 }}>{r.amt}</div>
          </div>
        ))}
      </div>
      <SBottomTabs tok={tok} active="home" n={2} />
    </PhoneBG>
  );
}

// ══════════════════════════════════════════════════════════════
// STANDARD · VOICE (one big button, plain caption)
// ══════════════════════════════════════════════════════════════
function StdVoiceScreen({ tok }) {
  return (
    <PhoneBG tok={tok} style={{ background: tok.text }}>
      {/* dismiss */}
      <div style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', color: '#fff' }}>
        <span style={{ fontSize: 15, opacity: 0.75 }}>Cancel</span>
        <span style={{ fontSize: 15, opacity: 0.75 }}>History</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px', color: '#fff' }}>
        <div style={{ fontSize: 16, opacity: 0.7, letterSpacing: 0.3, marginBottom: 8 }}>ANTON is listening</div>
        <div style={{ fontSize: 30, fontWeight: 600, textAlign: 'center', letterSpacing: -0.5, lineHeight: 1.25, marginBottom: 50, textWrap: 'pretty' }}>
          "Who do I have meetings with today?"
        </div>

        {/* orb */}
        <div style={{ position: 'relative', width: 220, height: 220, marginBottom: 50 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              position: 'absolute', inset: `${i * 18}px`,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 35%, ${tok.accent}, ${tok.accentDark})`,
              opacity: 1 - i * 0.25,
              filter: `blur(${i * 4}px)`,
            }} />
          ))}
        </div>

        <div style={{ fontSize: 14, opacity: 0.55, textAlign: 'center', lineHeight: 1.5 }}>
          Speak naturally.<br />Tap when you're done.
        </div>
      </div>
    </PhoneBG>
  );
}

// ══════════════════════════════════════════════════════════════
// STANDARD · SETTINGS (where the mode toggle lives)
// ══════════════════════════════════════════════════════════════
function StdSettingsScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <STopBar tok={tok} title="You" sub="Daniel Berg · FutureChain" />
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 16px' }}>

        {/* the mode toggle — hero */}
        <div style={{
          padding: 18, background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r3, marginBottom: 20,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: tok.textMuted, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 10 }}>App mode</div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{
              flex: 1, padding: 14, borderRadius: tok.r2,
              background: tok.accentSoft, border: `2px solid ${tok.accent}`,
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: tok.accent, letterSpacing: -0.2 }}>Standard</div>
              <div style={{ fontSize: 13, color: tok.textBody, marginTop: 4, lineHeight: 1.4 }}>
                Simple. One thing at a time. For daily life.
              </div>
              <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: tok.accent }}>✓ In use</div>
            </div>
            <div style={{
              flex: 1, padding: 14, borderRadius: tok.r2,
              background: tok.surface, border: `1px solid ${tok.border}`,
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: tok.text, letterSpacing: -0.2 }}>Pro</div>
              <div style={{ fontSize: 13, color: tok.textMuted, marginTop: 4, lineHeight: 1.4 }}>
                All modules, more detail, advanced tools.
              </div>
              <div style={{ marginTop: 10, fontSize: 13, color: tok.textMuted }}>Switch</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: tok.textMuted, marginTop: 12, lineHeight: 1.5 }}>
            You can switch any time. Your data and connections stay the same.
          </div>
        </div>

        {/* plain settings list */}
        {[
          { t: 'Your accent color', s: 'Emerald', c: tok.accent, sw: true },
          { t: 'Text size', s: 'Large' },
          { t: 'Connected accounts', s: 'Work email, personal email, calendar' },
          { t: 'Face ID', s: 'On · required for money' },
          { t: 'Privacy', s: 'Your data stays on your ANTON' },
          { t: 'Help & support', s: 'Chat, video call, or a person' },
        ].map((r, i, a) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '16px 4px',
            borderBottom: i < a.length - 1 ? `1px solid ${tok.borderSoft}` : 'none',
          }}>
            {r.sw && <span style={{ width: 24, height: 24, borderRadius: '50%', background: r.c, flexShrink: 0 }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: tok.text }}>{r.t}</div>
              <div style={{ fontSize: 14, color: tok.textMuted, marginTop: 2 }}>{r.s}</div>
            </div>
            {Ico.chevronRight(tok.textFaint, 20)}
          </div>
        ))}
      </div>
      <SBottomTabs tok={tok} active="you" n={2} />
    </PhoneBG>
  );
}

Object.assign(window, {
  StdHomeScreen, StdMailScreen, StdThreadScreen,
  StdCalendarScreen, StdWalletScreen, StdVoiceScreen,
  StdSettingsScreen,
});
