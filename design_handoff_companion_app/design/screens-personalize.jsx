// screens-personalize.jsx — Accent picker (personalization flow)

function AccentPickerScreen({ tok, selected, setSelected, accents }) {
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<>{Ico.chevronLeft(tok.textMuted, 20)}<span style={{ fontSize: 14, fontWeight: 600, color: tok.text }}>Personalize</span></>}
        right={<Pill tok={tok} tone="neutral" mono>STEP 4 / 4</Pill>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 24px' }}>
        <div style={{
          fontSize: 24, fontWeight: 700, color: tok.text,
          letterSpacing: -0.6, lineHeight: 1.15, marginBottom: 6,
        }}>Pick your ANTON color</div>
        <div style={{ fontSize: 13, color: tok.textMuted, lineHeight: 1.5, marginBottom: 20 }}>
          Your companion shows this color on approvals, live states, and accents. Change it any time in Settings — it only affects your device.
        </div>

        {/* preview chip */}
        <div style={{
          padding: 16, background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r3, marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: tok.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontFamily: tok.fontMono, fontWeight: 700, fontSize: 15,
              boxShadow: `0 4px 14px ${tok.accent}55`,
            }}>DB</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: tok.text }}>Daniel Berg</div>
              <div style={{ fontSize: 11, color: tok.textMuted }}>FutureChain AB · {accents[selected]?.label}</div>
            </div>
            <Pill tok={tok} tone="teal"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><StatusDot tok={tok} tone="green" size={6} pulse />LIVE</span></Pill>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <Btn tok={tok} variant="primary" size="sm">Approve</Btn>
            <Btn tok={tok} variant="secondary" size="sm">Details</Btn>
          </div>
        </div>

        <SectionLabel tok={tok} style={{ marginBottom: 10 }}>Your color</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {Object.keys(accents).map(k => {
            const a = accents[k];
            const active = k === selected;
            return (
              <button key={k} onClick={() => setSelected(k)} style={{
                aspectRatio: '1 / 1',
                background: a.accent, border: active ? `3px solid ${tok.text}` : '3px solid transparent',
                borderRadius: 16, position: 'relative', padding: 0, cursor: 'pointer',
                boxShadow: active ? `0 6px 18px ${a.accent}66` : `0 2px 6px rgba(0,0,0,0.08)`,
              }}>
                {active && (
                  <div style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 20, height: 20, borderRadius: '50%',
                    background: '#fff', color: a.accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 12,
                  }}>✓</div>
                )}
                <div style={{
                  position: 'absolute', bottom: 6, left: 8, right: 8,
                  fontSize: 11, fontWeight: 600, color: '#fff',
                  textAlign: 'left', textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}>{a.label}</div>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 14, fontSize: 11, color: tok.textMuted, lineHeight: 1.5 }}>
          {accents[selected]?.sub && <><span style={{ fontWeight: 600, color: tok.text }}>{accents[selected].label}</span> — {accents[selected].sub}</>}
        </div>

        <Btn tok={tok} variant="primary" block style={{ marginTop: 20 }}>Continue</Btn>
        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: tok.textMuted, fontWeight: 500 }}>
          Use organization default
        </div>
      </div>
    </PhoneBG>
  );
}

Object.assign(window, { AccentPickerScreen });
