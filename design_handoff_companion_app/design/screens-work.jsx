// screens-work.jsx — Chat + reasoning drawer, Voice mode, Capture + intent, Instance switcher

// ────────────────────────────────────────────────────────────
//  CHAT + REASONING DRAWER
// ────────────────────────────────────────────────────────────
function ChatScreen_D({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<>{Ico.chevronLeft(tok.textMuted, 20)}
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: tok.text }}>Sanctions Advisory</div>
            <div style={{ fontSize: 10, color: tok.textMuted, fontFamily: tok.fontMono }}>THINK HARD · balanced</div>
          </div>
        </>}
        right={<>{Ico.sparkles(tok.textMuted, 16)}{Ico.more(tok.textMuted, 18)}</>}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 14px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* system marker */}
        <div style={{
          alignSelf: 'center', fontSize: 10, fontFamily: tok.fontMono,
          color: tok.textFaint, padding: '4px 10px',
          background: tok.surfaceAlt, borderRadius: 999, letterSpacing: 0.4,
        }}>SESSION · 09:04 · airgap: off</div>

        {/* user bubble */}
        <div style={{
          alignSelf: 'flex-end', maxWidth: '82%',
          background: tok.id === 'instrument' ? tok.text : tok.accent,
          color: '#fff', padding: '10px 14px',
          borderRadius: `${tok.r2}px ${tok.r2}px 4px ${tok.r2}px`,
          fontSize: 14, lineHeight: 1.4,
        }}>
          Swedish bank case: a customer in Iran keeps requesting USD. What’s our exposure under the current sanctions regime?
        </div>

        {/* assistant — reasoning collapsed */}
        <div style={{
          alignSelf: 'flex-start', maxWidth: '92%',
          background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: `${tok.r2}px ${tok.r2}px ${tok.r2}px 4px`,
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', background: tok.surfaceAlt,
            borderBottom: `1px solid ${tok.borderSoft}`,
          }}>
            <StatusDot tok={tok} tone="green" size={6} pulse />
            <span style={{ fontSize: 11, fontFamily: tok.fontMono, color: tok.textMuted }}>
              Reasoned 8.4s · 3 tools · 6 citations
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: tok.accent, fontWeight: 600 }}>Trace</span>
          </div>
          <div style={{ padding: '12px 14px', fontSize: 14, color: tok.textBody, lineHeight: 1.5 }}>
            <div style={{ color: tok.text, fontWeight: 600, marginBottom: 6 }}>Short answer</div>
            Continuing USD-denominated services for an Iran-resident customer is almost certainly <em style={{ color: tok.red, fontStyle: 'normal', fontWeight: 600 }}>secondary-sanctions-exposing</em> under EO 13902. Freeze outbound USD and escalate to Compliance today.
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <Pill tok={tok} tone="blue" mono>EO-13902 §1(a)</Pill>
              <Pill tok={tok} tone="blue" mono>OFSI 2024/07</Pill>
              <Pill tok={tok} tone="blue" mono>Internal SOP-14</Pill>
            </div>
          </div>
        </div>

        {/* assistant — follow-ups */}
        <div style={{ alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '92%' }}>
          <SectionLabel tok={tok}>Follow-ups</SectionLabel>
          {['Draft customer letter (EN + SV)', 'Generate compliance memo for Risk Committee', 'Run screening on other USD customers'].map((f, i) => (
            <div key={i} style={{
              padding: '10px 12px', background: tok.surface,
              border: `1px solid ${tok.border}`, borderRadius: tok.r2,
              fontSize: 13, color: tok.text, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              {Ico.sparkles(tok.accent, 13)}{f}
            </div>
          ))}
        </div>
      </div>

      {/* composer */}
      <div style={{
        padding: 10, background: tok.surface,
        borderTop: `1px solid ${tok.borderSoft}`, flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: tok.surfaceAlt, border: `1px solid ${tok.border}`,
          borderRadius: 999, padding: '6px 6px 6px 14px',
        }}>
          {Ico.plus(tok.textMuted, 18)}
          <div style={{ flex: 1, fontSize: 13, color: tok.textMuted }}>Ask ANTON…</div>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: tok.surface, border: `1px solid ${tok.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{Ico.mic(tok.text, 16)}</div>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: tok.id === 'instrument' ? tok.text : tok.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{Ico.arrowUp('#fff', 16)}</div>
        </div>
      </div>
    </PhoneBG>
  );
}

// ────────────────────────────────────────────────────────────
//  VOICE MODE — always-listening sheet
// ────────────────────────────────────────────────────────────
function VoiceScreen_D({ tok }) {
  return (
    <PhoneBG tok={tok} style={{ background: tok.id === 'instrument' ? '#0A0A0A' : tok.bg, color: tok.id === 'instrument' ? '#fff' : tok.text }}>
      {/* top bar */}
      <div style={{
        padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        color: tok.id === 'instrument' ? '#fff' : tok.text,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {Ico.chevronDown(tok.id === 'instrument' ? '#fff' : tok.textMuted, 22)}
          <div style={{ fontSize: 13, fontWeight: 600 }}>Voice</div>
        </div>
        <Pill tok={tok} tone="teal" style={{
          background: tok.id === 'instrument' ? '#0A8F5F22' : tok.accentSoft,
          color: tok.id === 'instrument' ? '#4ADE80' : tok.accent,
          borderColor: 'transparent',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <StatusDot tok={tok} tone="green" size={6} pulse />LIVE
          </span>
        </Pill>
      </div>

      {/* orb */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ position: 'relative', width: 180, height: 180, marginBottom: 32 }}>
          {/* radial rings */}
          {[0.5, 0.75, 1].map((s, i) => (
            <div key={i} style={{
              position: 'absolute', inset: `${(1 - s) * 50}%`,
              borderRadius: '50%',
              background: tok.id === 'instrument'
                ? `radial-gradient(circle, #0A8F5F${i === 0 ? '66' : i === 1 ? '33' : '11'} 0%, transparent 70%)`
                : `radial-gradient(circle, ${tok.accent}${i === 0 ? '66' : i === 1 ? '33' : '11'} 0%, transparent 70%)`,
            }} />
          ))}
          {/* core */}
          <div style={{
            position: 'absolute', inset: '30%', borderRadius: '50%',
            background: tok.id === 'instrument' ? '#0A8F5F' : tok.accent,
            boxShadow: `0 0 50px ${tok.id === 'instrument' ? '#0A8F5F' : tok.accent}aa`,
          }} />
          {/* waveform inside */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: 4,
          }}>
            {[18, 36, 28, 52, 22, 44, 30].map((h, i) => (
              <div key={i} style={{
                width: 4, height: h, borderRadius: 2,
                background: '#fff', opacity: 0.85,
              }} />
            ))}
          </div>
        </div>

        {/* live transcript */}
        <div style={{
          fontSize: 22, fontWeight: 500, letterSpacing: -0.4,
          textAlign: 'center', maxWidth: 280, lineHeight: 1.3,
          color: tok.id === 'instrument' ? '#fff' : tok.text,
          fontFamily: tok.fontDisplay || tok.font,
        }}>
          "Pull the USD exposure list and<br/>
          <span style={{ opacity: 0.55 }}>file a SAR for the Tehran case…"</span>
        </div>

        {/* action queue */}
        <div style={{ marginTop: 28, width: '100%', maxWidth: 320 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            background: tok.id === 'instrument' ? '#1A1A1A' : tok.surface,
            border: `1px solid ${tok.id === 'instrument' ? '#2A2A2A' : tok.border}`,
            borderRadius: tok.r2, marginBottom: 8,
          }}>
            {Ico.shield(tok.id === 'instrument' ? '#C8842B' : tok.gold, 15)}
            <div style={{ flex: 1, fontSize: 12, color: tok.id === 'instrument' ? '#fff' : tok.text }}>
              <b>Approval queued</b> — file SAR (HIGH)
            </div>
            <Pill tok={tok} tone="gold">HOLD</Pill>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            background: tok.id === 'instrument' ? '#1A1A1A' : tok.surface,
            border: `1px solid ${tok.id === 'instrument' ? '#2A2A2A' : tok.border}`,
            borderRadius: tok.r2,
          }}>
            {Ico.check(tok.id === 'instrument' ? '#4ADE80' : tok.green, 15)}
            <div style={{ flex: 1, fontSize: 12, color: tok.id === 'instrument' ? '#fff' : tok.text }}>
              <b>Pulled list</b> — 14 USD exposures · 0.3s
            </div>
            <span style={{ fontSize: 10, fontFamily: tok.fontMono, opacity: 0.6 }}>DONE</span>
          </div>
        </div>
      </div>

      {/* bottom controls */}
      <div style={{
        padding: '18px 28px 24px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: tok.id === 'instrument' ? '#1A1A1A' : tok.surface,
          border: `1px solid ${tok.id === 'instrument' ? '#2A2A2A' : tok.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{Ico.x(tok.id === 'instrument' ? '#fff' : tok.text, 20)}</div>

        <div style={{ fontSize: 11, fontFamily: tok.fontMono, color: tok.id === 'instrument' ? '#888' : tok.textMuted, letterSpacing: 0.5 }}>
          HOLD TO INTERRUPT
        </div>

        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: tok.id === 'instrument' ? '#1A1A1A' : tok.surface,
          border: `1px solid ${tok.id === 'instrument' ? '#2A2A2A' : tok.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{Ico.mic(tok.id === 'instrument' ? '#fff' : tok.text, 20)}</div>
      </div>
    </PhoneBG>
  );
}

// ────────────────────────────────────────────────────────────
//  CAPTURE + INTENT PICKER
// ────────────────────────────────────────────────────────────
function CaptureScreen_D({ tok }) {
  return (
    <PhoneBG tok={tok}>
      {/* camera pane */}
      <div style={{ flex: 1, background: '#111', position: 'relative', overflow: 'hidden' }}>
        {/* fake captured image placeholder */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(135deg, #2a2a2a, #555), repeating-linear-gradient(0deg, transparent 0, transparent 18px, #0004 18px, #0004 19px)`,
          backgroundBlendMode: 'overlay',
        }} />
        {/* document outline */}
        <div style={{
          position: 'absolute', left: '10%', right: '10%', top: '12%', bottom: '30%',
          border: `2px solid ${tok.accent}`, borderRadius: 6,
          background: 'rgba(255,255,255,0.05)',
        }}>
          <div style={{
            position: 'absolute', top: -22, left: 0,
            fontSize: 10, fontFamily: tok.fontMono, color: tok.accent,
            background: '#000a', padding: '3px 8px', borderRadius: 4,
          }}>DOCUMENT · 96%</div>
          <div style={{
            position: 'absolute', top: 18, left: 16, right: 16, bottom: 18,
            display: 'flex', flexDirection: 'column', gap: 4, opacity: 0.5,
          }}>
            {[100, 90, 85, 70, 95, 60, 80, 40].map((w, i) => (
              <div key={i} style={{ width: `${w}%`, height: 3, background: '#fff' }} />
            ))}
          </div>
        </div>
        {/* top status bar overlay */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
          color: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#000a', borderRadius: 999, fontSize: 11, fontFamily: tok.fontMono }}>
            <StatusDot tok={tok} tone="green" size={6} pulse /> FutureChain · Sanctions
          </div>
          {Ico.x('#fff', 22)}
        </div>
      </div>

      {/* intent sheet */}
      <div style={{
        background: tok.surface, borderTopLeftRadius: tok.r4, borderTopRightRadius: tok.r4,
        padding: '14px 16px 18px', boxShadow: '0 -8px 30px rgba(0,0,0,0.25)',
        marginTop: -20, position: 'relative',
      }}>
        <div style={{
          width: 40, height: 4, borderRadius: 4,
          background: tok.border, margin: '0 auto 12px',
        }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: tok.text, marginBottom: 2 }}>What should ANTON do with this?</div>
        <div style={{ fontSize: 11, color: tok.textMuted, marginBottom: 12 }}>Detected: screenshot · 1 page · Swedish text</div>

        {[
          { icon: Ico.sparkles, title: 'Explain it', sub: 'Plain summary + key flags' },
          { icon: Ico.search, title: 'Match to Knowledge', sub: 'Find related atoms in Sanctions KB' },
          { icon: Ico.inbox, title: 'File as evidence', sub: 'Attach to REQ-8907 · Tehran case' },
          { icon: Ico.shield, title: 'Screen for PII / secrets', sub: 'Redact before upload' },
        ].map((o, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 4px',
            borderBottom: i < 3 ? `1px solid ${tok.borderSoft}` : 'none',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: tok.r1,
              background: tok.surfaceAlt,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{o.icon(tok.text, 17)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: tok.text }}>{o.title}</div>
              <div style={{ fontSize: 11, color: tok.textMuted, marginTop: 1 }}>{o.sub}</div>
            </div>
            {Ico.chevronRight(tok.textFaint, 16)}
          </div>
        ))}
      </div>
    </PhoneBG>
  );
}

// ────────────────────────────────────────────────────────────
//  INSTANCE SWITCHER — wallet stack
// ────────────────────────────────────────────────────────────
function InstanceSwitcher_D({ tok }) {
  const instances = [
    { name: 'FutureChain AB', role: 'Owner · Admin', status: 'online', badge: 6, color: tok.accent, initials: 'FC', meta: '840 users · 12 modules' },
    { name: 'openEXPERT NGO', role: 'Expert Advisor', status: 'lan', badge: 1, color: tok.gold, initials: 'oE', meta: 'LAN · kitchen-srv' },
    { name: 'Advisense Family', role: 'Admin · Home', status: 'online', badge: 0, color: tok.blue, initials: 'AF', meta: '5 members' },
    { name: 'Personal', role: 'Owner', status: 'offline', badge: 0, color: tok.textMuted, initials: 'P', meta: 'Last sync 4h ago' },
  ];
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<div style={{ fontSize: 20, fontWeight: 700, fontFamily: tok.fontDisplay || tok.font, color: tok.text, letterSpacing: -0.4 }}>Instances</div>}
        right={<>{Ico.plus(tok.text, 20)}</>}
        border={false}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 20px' }}>
        <div style={{ fontSize: 12, color: tok.textMuted, marginBottom: 14, lineHeight: 1.4 }}>
          Each instance is a separate ANTON server — its own Knowledge, Missions, and keys. Your phone holds a signed identity for each.
        </div>

        {/* wallet-style stack */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {instances.map((inst, i) => {
            const dotTone = { online: 'green', lan: 'gold', offline: 'red' }[inst.status];
            const active = i === 0;
            return (
              <div key={i} style={{
                background: tok.surface, border: `1px solid ${active ? tok.text : tok.border}`,
                borderRadius: tok.r3, padding: 16,
                boxShadow: active ? `0 8px 20px ${tok.text}15` : 'none',
                position: 'relative',
              }}>
                {active && (
                  <div style={{
                    position: 'absolute', top: 10, right: 12,
                    fontSize: 10, fontFamily: tok.fontMono, fontWeight: 700,
                    color: tok.text, letterSpacing: 0.6,
                  }}>ACTIVE</div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: inst.color, color: '#fff',
                    fontFamily: tok.fontMono, fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{inst.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: tok.text, lineHeight: 1.2 }}>{inst.name}</div>
                    <div style={{ fontSize: 11, color: tok.textMuted, marginTop: 2 }}>{inst.role}</div>
                  </div>
                  {inst.badge > 0 && (
                    <div style={{
                      minWidth: 20, height: 20, padding: '0 6px',
                      background: tok.red, color: '#fff',
                      fontSize: 11, fontWeight: 700,
                      borderRadius: 999,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{inst.badge}</div>
                  )}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  paddingTop: 10, borderTop: `1px dashed ${tok.borderSoft}`,
                  fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono,
                }}>
                  <StatusDot tok={tok} tone={dotTone} size={6} pulse={dotTone === 'green'} />
                  <span>{inst.status === 'online' ? 'ONLINE' : inst.status === 'lan' ? 'LAN ONLY' : 'OFFLINE'}</span>
                  <span style={{ color: tok.border }}>·</span>
                  <span>{inst.meta}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* add instance */}
        <button style={{
          marginTop: 14, width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: 14, borderRadius: tok.r2,
          background: 'transparent', border: `1.5px dashed ${tok.border}`,
          color: tok.textMuted, fontSize: 13, fontWeight: 600,
          fontFamily: tok.font, cursor: 'pointer',
        }}>
          {Ico.plus(tok.textMuted, 16)} Add instance · scan QR
        </button>

        {/* key envelope footer */}
        <div style={{
          marginTop: 22, padding: 14,
          background: tok.surfaceAlt, borderRadius: tok.r2,
          border: `1px solid ${tok.borderSoft}`,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          {Ico.shieldCheck(tok.accent, 18)}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: tok.text, marginBottom: 2 }}>
              Device keys secured in Keychain
            </div>
            <div style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono, lineHeight: 1.5 }}>
              Ed25519 · hardware-backed · unlock via Face ID
            </div>
          </div>
        </div>
      </div>
    </PhoneBG>
  );
}

Object.assign(window, {
  ChatScreen_D, VoiceScreen_D, CaptureScreen_D, InstanceSwitcher_D,
});
