// screens-finance.jsx — Payments (send / receive / ANTON request) + Verification (KYC/EDD)

// ─────────────── PAYMENTS — home ───────────────
function PaymentsHomeScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<div style={{ fontSize: 20, fontWeight: 700, color: tok.text, letterSpacing: -0.4 }}>Wallet</div>}
        right={<>{Ico.more(tok.textMuted, 18)}</>}
        border={false}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px 16px' }}>
        {/* balance card */}
        <div style={{
          padding: 18, borderRadius: tok.r3,
          background: `linear-gradient(135deg, ${tok.accent}, ${tok.accentDark})`,
          color: '#fff', marginBottom: 14, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ fontSize: 10, fontFamily: tok.fontMono, opacity: 0.8, letterSpacing: 0.6 }}>FUTURECHAIN · EUR</div>
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: -1, marginTop: 4, lineHeight: 1 }}>
            €12,480<span style={{ opacity: 0.7, fontSize: 20 }}>.34</span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4, fontFamily: tok.fontMono }}>0xA7f…c91 · verified</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button style={{ flex: 1, padding: '9px 0', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: tok.r1, color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {Ico.arrowUp('#fff', 14)} Send
            </button>
            <button style={{ flex: 1, padding: '9px 0', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: tok.r1, color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {Ico.qr('#fff', 14)} Receive
            </button>
          </div>
        </div>

        {/* ANTON request alert */}
        <div style={{
          padding: 14, background: tok.goldDim, border: `1px solid ${tok.gold}`,
          borderRadius: tok.r2, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            {Ico.alert(tok.gold, 14)}
            <span style={{ fontSize: 11, fontFamily: tok.fontMono, fontWeight: 700, color: tok.gold, letterSpacing: 0.5 }}>ANTON PAYMENT REQUEST</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: tok.text, marginBottom: 4 }}>Pay €180,000 to Orion Holdings</div>
          <div style={{ fontSize: 11, color: tok.textBody, marginBottom: 10 }}>Task Agent · scheduled invoice · expires 14m</div>
          <Btn tok={tok} variant="primary" size="sm" block>Review + approve</Btn>
        </div>

        <SectionLabel tok={tok} style={{ marginBottom: 8 }}>Recent</SectionLabel>
        {[
          { dir: 'out', who: 'NorthBound AB', sub: 'Invoice · INV-3187', amt: '−€2,400.00', t: '09:02', st: 'Settled' },
          { dir: 'in',  who: 'Klarna', sub: 'Refund · ORD-88a', amt: '+€79.00', t: '08:44', st: 'Settled' },
          { dir: 'out', who: 'ANTON · OpenAI compute', sub: 'Monthly', amt: '−€120.00', t: 'Yst', st: 'Approved by you' },
          { dir: 'hold', who: 'Unknown wallet', sub: 'Inbound · pending KYC', amt: '+€5,000.00', t: 'Yst', st: 'Held — verification' },
        ].map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
            borderBottom: i < 3 ? `1px solid ${tok.borderSoft}` : 'none',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: r.dir === 'out' ? tok.redDim : r.dir === 'in' ? tok.greenDim : tok.goldDim,
              color: r.dir === 'out' ? tok.red : r.dir === 'in' ? tok.green : tok.gold,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700,
            }}>{r.dir === 'out' ? '↑' : r.dir === 'in' ? '↓' : '⏸'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: tok.text }}>{r.who}</div>
              <div style={{ fontSize: 11, color: tok.textMuted }}>{r.sub} · {r.st}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: r.dir === 'in' ? tok.green : tok.text, fontFamily: tok.fontMono }}>{r.amt}</div>
              <div style={{ fontSize: 10, color: tok.textFaint, fontFamily: tok.fontMono }}>{r.t}</div>
            </div>
          </div>
        ))}
      </div>
    </PhoneBG>
  );
}

// ─────────────── PAYMENTS — send ───────────────
function PaymentSendScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<>{Ico.chevronLeft(tok.textMuted, 20)}<span style={{ fontSize: 14, fontWeight: 600, color: tok.text }}>Send</span></>}
        right={<>{Ico.qr(tok.text, 20)}</>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 10px', display: 'flex', flexDirection: 'column' }}>
        {/* amount */}
        <div style={{ textAlign: 'center', padding: '14px 0 18px' }}>
          <div style={{ fontSize: 11, fontFamily: tok.fontMono, color: tok.textMuted, letterSpacing: 0.6 }}>EUR · FutureChain</div>
          <div style={{ fontSize: 48, fontWeight: 700, color: tok.text, letterSpacing: -1.5, lineHeight: 1, marginTop: 8, fontFamily: tok.fontMono }}>
            €1,200<span style={{ color: tok.textFaint }}>.00</span>
          </div>
          <div style={{ fontSize: 11, color: tok.textMuted, marginTop: 6 }}>≈ 13,480 SEK</div>
        </div>

        {/* to */}
        <div style={{ padding: 14, background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.r2, marginBottom: 10 }}>
          <SectionLabel tok={tok} style={{ marginBottom: 8 }}>To</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar tok={tok} initials="MH" size={36} color={tok.gold} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: tok.text }}>Maria Hansson</div>
              <div style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono }}>0xE4b…812f · verified</div>
            </div>
            <Pill tok={tok} tone="green"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>{Ico.shieldCheck('currentColor', 10)}KYC</span></Pill>
          </div>
        </div>

        {/* memo */}
        <div style={{ padding: 14, background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.r2, marginBottom: 10 }}>
          <SectionLabel tok={tok} style={{ marginBottom: 8 }}>Memo</SectionLabel>
          <div style={{ fontSize: 13, color: tok.text }}>Coffee budget · Q2 team off-site</div>
        </div>

        {/* compliance check */}
        <div style={{ padding: 12, background: tok.greenDim, borderRadius: tok.r2, marginBottom: 10, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {Ico.shieldCheck(tok.green, 16)}
          <div style={{ flex: 1, fontSize: 11, color: tok.text, lineHeight: 1.4 }}>
            <b>Sanctions screen passed.</b> Recipient + memo checked against OFAC, EU, UK lists · 0.2s ago.
          </div>
        </div>

        {/* fee */}
        <div style={{ fontSize: 11, color: tok.textMuted, fontFamily: tok.fontMono, textAlign: 'center', marginTop: 'auto', marginBottom: 10 }}>
          Fee €0.08 · arrives instantly · signed over TLS
        </div>

        <Btn tok={tok} variant="primary" block icon={Ico.fingerprint('currentColor', 15)}>Hold Face ID to send</Btn>
      </div>
    </PhoneBG>
  );
}

// ─────────────── PAYMENTS — receive (QR) ───────────────
function PaymentReceiveScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<>{Ico.chevronLeft(tok.textMuted, 20)}<span style={{ fontSize: 14, fontWeight: 600, color: tok.text }}>Receive</span></>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px', textAlign: 'center' }}>
        <div style={{
          width: 38, height: 38, margin: '0 auto 10px', borderRadius: 12,
          background: tok.accent, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 17, fontWeight: 700, fontFamily: tok.fontMono,
        }}>DB</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: tok.text, letterSpacing: -0.3 }}>Daniel Berg</div>
        <div style={{ fontSize: 12, color: tok.textMuted, marginBottom: 18 }}>FutureChain AB · EUR</div>

        {/* QR */}
        <div style={{
          padding: 18, background: tok.surface, border: `1px solid ${tok.border}`,
          borderRadius: tok.r3, margin: '0 auto 16px', maxWidth: 260,
        }}>
          <div style={{
            aspectRatio: '1/1', background: tok.text, borderRadius: tok.r2,
            position: 'relative', backgroundImage: `repeating-conic-gradient(${tok.text} 0% 25%, ${tok.surface} 0% 50%)`,
            backgroundSize: '14px 14px',
          }}>
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              width: 56, height: 56, background: tok.surface, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: tok.accent, fontSize: 22, fontWeight: 700, fontFamily: tok.fontMono,
              border: `3px solid ${tok.accent}`,
            }}>●</div>
          </div>
        </div>

        {/* wallet string */}
        <div style={{
          padding: '10px 14px', background: tok.surfaceAlt, borderRadius: tok.r1,
          fontFamily: tok.fontMono, fontSize: 12, color: tok.textBody,
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
        }}>
          <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>0xA7f4c89b…e91c4d2</span>
          <span style={{ fontSize: 10, color: tok.accent, fontWeight: 700 }}>COPY</span>
        </div>

        {/* amount request */}
        <div style={{ padding: 12, background: tok.surface, border: `1px solid ${tok.border}`, borderRadius: tok.r2, marginBottom: 12 }}>
          <SectionLabel tok={tok} style={{ marginBottom: 4 }}>Request amount</SectionLabel>
          <div style={{ fontSize: 22, fontWeight: 700, color: tok.text, fontFamily: tok.fontMono }}>€ 0.00</div>
          <div style={{ fontSize: 11, color: tok.textMuted, marginTop: 4 }}>Optional · leave blank for open request</div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Btn tok={tok} variant="secondary" block>Share link</Btn>
          <Btn tok={tok} variant="primary" block>Set amount</Btn>
        </div>
      </div>
    </PhoneBG>
  );
}

// ─────────────── PAYMENTS — ANTON request approval ───────────────
function ANTONPaymentApprovalScreen({ tok }) {
  return (
    <PhoneBG tok={tok}>
      <div style={{ flex: 1, background: `${tok.text}66` }} />
      <div style={{ background: tok.surface, borderTopLeftRadius: tok.r4, borderTopRightRadius: tok.r4, boxShadow: '0 -8px 30px rgba(0,0,0,0.15)', paddingBottom: 14 }}>
        <div style={{ width: 40, height: 4, borderRadius: 4, background: tok.border, margin: '10px auto 0' }} />
        <div style={{ padding: '12px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Pill tok={tok} tone="red" mono>CRITICAL</Pill>
            <Pill tok={tok} tone="neutral"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{Ico.fingerprint('currentColor', 11)}Face ID</span></Pill>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, fontFamily: tok.fontMono, color: tok.textFaint }}>REQ-8909 · 14m</span>
          </div>

          <div style={{ fontSize: 11, fontFamily: tok.fontMono, color: tok.textMuted, letterSpacing: 0.5, marginBottom: 2 }}>ANTON REQUESTS PAYMENT</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: tok.text, letterSpacing: -1, fontFamily: tok.fontMono, lineHeight: 1 }}>
            −€180,000<span style={{ color: tok.textFaint, fontSize: 20 }}>.00</span>
          </div>
          <div style={{ fontSize: 13, color: tok.textMuted, marginTop: 4 }}>
            to <span style={{ color: tok.text, fontWeight: 600 }}>Orion Holdings AB</span> · 0xE4…f21
          </div>

          {/* why */}
          <div style={{ marginTop: 16, padding: 14, background: tok.surfaceAlt, borderRadius: tok.r2, border: `1px solid ${tok.borderSoft}` }}>
            <SectionLabel tok={tok} style={{ marginBottom: 8 }}>Why ANTON wants this</SectionLabel>
            <div style={{ fontSize: 12, color: tok.textBody, lineHeight: 1.5, marginBottom: 8 }}>
              Invoice INV-3192 is due today. Vendor Orion Holdings passed KYC in March, same bank details as 11 previous invoices.
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Pill tok={tok} tone="blue">Task: Finance Autopilot</Pill>
              <Pill tok={tok} tone="green">Budget OK</Pill>
            </div>
          </div>

          {/* risk checks */}
          <div style={{ marginTop: 10, padding: 12, background: tok.greenDim, borderRadius: tok.r2 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: tok.green, fontFamily: tok.fontMono, letterSpacing: 0.4, marginBottom: 6 }}>PRE-FLIGHT · ALL PASSED</div>
            {[
              'Sanctions screen · OFAC, EU, UK · clear',
              'Amount within Finance Autopilot budget (€250k/mo)',
              'Vendor fingerprint matches prior 11 invoices',
              'Invoice OCR verified against PO-2188',
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, fontSize: 11, color: tok.textBody, padding: '2px 0' }}>
                {Ico.check(tok.green, 12)} {t}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '16px 20px 4px' }}>
          <Btn tok={tok} variant="ghost" block style={{ color: tok.red, borderColor: tok.red }}>Reject</Btn>
          <Btn tok={tok} variant="primary" block icon={Ico.fingerprint('currentColor', 15)}>Pay with Face ID</Btn>
        </div>
        <div style={{ fontSize: 10, color: tok.textFaint, textAlign: 'center', marginTop: 4, fontFamily: tok.fontMono }}>
          Signed Ed25519 · response returned to ANTON over TLS
        </div>
      </div>
    </PhoneBG>
  );
}

// ─────────────── VERIFICATION — KYC/EDD flow ───────────────
function VerificationScreen({ tok }) {
  const steps = [
    { t: 'Legal name + DoB', st: 'done' },
    { t: 'Government ID · passport', st: 'done' },
    { t: 'Selfie liveness check', st: 'done' },
    { t: 'Source of funds', st: 'current' },
    { t: 'PEP / sanctions screening', st: 'pending' },
    { t: 'Enhanced due diligence (EDD)', st: 'pending', edd: true },
  ];
  return (
    <PhoneBG tok={tok}>
      <TopBar tok={tok}
        left={<>{Ico.chevronLeft(tok.textMuted, 20)}<span style={{ fontSize: 14, fontWeight: 600, color: tok.text }}>Verify identity</span></>}
        right={<Pill tok={tok} tone="neutral" mono>4 / 6</Pill>}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px 20px' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: tok.text, letterSpacing: -0.5, lineHeight: 1.2, marginBottom: 4 }}>
          Source of funds
        </div>
        <div style={{ fontSize: 12, color: tok.textMuted, lineHeight: 1.5, marginBottom: 16 }}>
          Required under 4AMLD. ANTON will screen this against sanctions + adverse media in 0.3s.
        </div>

        {/* progress */}
        <div style={{ marginBottom: 20 }}>
          {steps.map((s, i) => {
            const color = s.st === 'done' ? tok.green : s.st === 'current' ? tok.accent : tok.textFaint;
            return (
              <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: i < steps.length - 1 ? 10 : 0, position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: s.st === 'done' ? tok.green : s.st === 'current' ? tok.accent : tok.surfaceAlt,
                    color: s.st === 'pending' ? tok.textFaint : '#fff',
                    border: s.st === 'current' ? `2px solid ${tok.text}` : `1px solid ${s.st === 'pending' ? tok.border : 'transparent'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, fontFamily: tok.fontMono,
                  }}>{s.st === 'done' ? '✓' : i + 1}</div>
                  {i < steps.length - 1 && <div style={{ flex: 1, width: 2, background: s.st === 'done' ? tok.green : tok.borderSoft, marginTop: 2, minHeight: 18 }} />}
                </div>
                <div style={{ flex: 1, paddingTop: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: s.st === 'current' ? 700 : 500, color: s.st === 'pending' ? tok.textFaint : tok.text }}>
                    {s.t} {s.edd && <Pill tok={tok} tone="gold" style={{ fontSize: 9, marginLeft: 4 }}>EDD</Pill>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* source of funds form */}
        <SectionLabel tok={tok} style={{ marginBottom: 8 }}>Primary source</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {[
            { t: 'Salary / employment', s: 'FutureChain AB · confirmed via payroll', a: true },
            { t: 'Business income', s: 'Self-employed / director' },
            { t: 'Investments / dividends', s: 'Listed shares, funds' },
            { t: 'Sale of property or assets', s: 'Deeds required' },
            { t: 'Inheritance / gift', s: 'Documentation required' },
          ].map((o, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 12,
              background: o.a ? tok.accentSoft : tok.surface,
              border: `${o.a ? 2 : 1}px solid ${o.a ? tok.accent : tok.border}`,
              borderRadius: tok.r2,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: o.a ? tok.accent : 'transparent',
                border: `2px solid ${o.a ? tok.accent : tok.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{o.a && <span style={{ width: 6, height: 6, background: '#fff', borderRadius: '50%' }} />}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: tok.text }}>{o.t}</div>
                <div style={{ fontSize: 11, color: tok.textMuted }}>{o.s}</div>
              </div>
            </div>
          ))}
        </div>

        {/* trust footer */}
        <div style={{ padding: 12, background: tok.surfaceAlt, borderRadius: tok.r2, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {Ico.shieldCheck(tok.accent, 16)}
          <div style={{ flex: 1, fontSize: 11, color: tok.textBody, lineHeight: 1.45 }}>
            Data encrypted to your ANTON instance only. <b>FutureChain never sees raw docs.</b> Shared as cryptographic attestations.
          </div>
        </div>

        <Btn tok={tok} variant="primary" block>Continue · screening step</Btn>
      </div>
    </PhoneBG>
  );
}

Object.assign(window, {
  PaymentsHomeScreen, PaymentSendScreen, PaymentReceiveScreen, ANTONPaymentApprovalScreen,
  VerificationScreen,
});
