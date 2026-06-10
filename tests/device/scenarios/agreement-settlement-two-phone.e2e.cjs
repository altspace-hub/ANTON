/**
 * agreement-settlement-two-phone.e2e.cjs — Agreement v1 SETTLEMENT tier
 * (public, on-chain, unsigned) across two phones. Two legs:
 *
 *   Leg 1 (Pay → Pay):  phone A's Pay sends 0.01 FTC with the **Avtal**
 *     (agreement) template → `stampOutgoingAgreement` mints agreementId +
 *     proposalHash into the PACS.008 meta (ReviewScreen.tsx:210-228) and the
 *     proposer row persists as status 'settled' (the payment IS the settlement
 *     act). Phone B's Pay syncs, `reconcileInboundAgreement` binds an acceptor
 *     row by the on-chain-echoed meta.agreementId (NEVER amount+address), and
 *     B's PaymentDetailScreen renders the 'Settled · public, unsigned' badge
 *     (sv: 'Avvecklat · publikt, osignerat') + the AVTAL RemittanceView block.
 *
 *   Leg 2 (Pay → Business):  phone A's Business opens a Simple sale QR
 *     (auto-arms the 10-min active-sync — this also live-verifies the
 *     2026-06-10 credentialed `/iso_received` fix, since the poll now carries
 *     the per-install X-API-Key). Phone B's Pay pays the sale amount with the
 *     Avtal template, typing the kvitto's full ADR-004 ref into the template's
 *     "Contract / case no." field — the SDK's Ustrd human summary includes
 *     `Ref <ref>`, which is what `confirmReceiptByMatch` (receipts.ts:198)
 *     needs to bind the payment to the pending kvitto. The kvitto flips
 *     pending → confirmed WITH the customer agreement attached, and the
 *     merchant's kvitto view renders 'Settled · public, unsigned'.
 *     (#26, fixed 2026-06-10: typing the ref into the template is no longer
 *     REQUIRED — executePayment now always preserves the sale QR's `v1:` ref
 *     as its own Ustrd line alongside any template. This scenario keeps the
 *     typed ref because the Avtal flow here uses manual address entry, which
 *     never decodes the QR ref in the first place.)
 *
 * ⚠️ Design note (device-discovered 2026-06-10): the v1 settlement tier has
 * NO reciprocal-echo UI. `stampOutgoingAgreement` always mints a FRESH
 * agreementId (src/pay/services/agreements.ts:244-260), the Avtal composer has
 * no agreementId field, `reconcileInboundAgreement` is idempotent (an echoed
 * id would return the existing row unchanged, agreements.ts:292-293), and the
 * SENT-side PaymentDetailScreen (SentSections, PaymentDetailScreen.tsx:108)
 * renders no agreement badge — only ReceivedSections does (line 203). So this
 * scenario asserts the flow that EXISTS: one-shot settlement, cross-phone
 * binding by the echoed id, badge on the receiving side.
 *
 * ⚠️ SPENDS REAL FTC: 0.02 + fees per run (0.01 from phone A's Pay,
 * 0.01 from phone B's Pay). Extra gate on top of ANTON_DEVICE_E2E=1:
 *
 *   ANTON_DEVICE_E2E=1 ANTON_DEVICE_E2E_SPEND=1 \
 *     ANTON_PAY_SERIAL=<A> ANTON_PAY_SERIAL_B=<B> ANTON_BUSINESS_SERIAL=<A> \
 *     node tests/device/run-e2e.cjs agreement-settlement-two-phone
 *
 * Re-runnable: agreement decisions carry a unique run tag; all assertions
 * target IndexedDB rows keyed by the fresh agreementId / kvitto ref.
 * Selectors are sv/en tolerant. PINs: ANTON_PAY_PIN (A, default 8606),
 * ANTON_PAY_PIN_B (B, default 8606).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const AMOUNT_FTC = '0.01';
const PIN_A = process.env.ANTON_PAY_PIN || '8606';
const PIN_B = process.env.ANTON_PAY_PIN_B || '8606';

/** Drive a Pay app from home → new-address compose → review → Avtal template
 *  → confirm + PIN. Returns { txId, agreementId, proposalHash } read from the
 *  sender's stores. Runs inside an existing CdpSession. */
async function sendAvtal(s, { toAddr, decision, terms, refField, pin, t0 }) {
  const toReview = await s.eval(`(async () => {
    for (let i = 0; i < 5; i++) {
      if (/Skanna för att betala|Scan to pay/.test(document.body.textContent || '')) break;
      await __td.clickText(/Avbryt|Tillbaka|Back|Cancel/i, 600);
    }
    if (!(await __td.clickText(/^Skicka$|^Send$/, 1500))) return { err: 'no Send button on home' };
    if (!(await __td.clickText(/Betala en ny adress|Pay a new address/, 1500))) return { err: 'no new-address entry' };
    const ins = [...document.querySelectorAll('input')].filter((i) => i.offsetParent !== null);
    const byPh = (re) => ins.find((i) => re.test(i.getAttribute('placeholder') || ''));
    const addr = byPh(/fc_/); const amt = ins.find((i) => (i.getAttribute('inputmode') || '') === 'decimal');
    if (!addr || !amt) return { err: 'compose inputs missing' };
    __td.setVal(addr, ${JSON.stringify(toAddr)});
    __td.setVal(amt, '${AMOUNT_FTC}');
    const nm = byPh(/Anna|name/i); if (nm) __td.setVal(nm, 'Avtal E2E');
    const cc = byPh(/^SE$/); if (cc) __td.setVal(cc, 'SE');
    await __td.sleep(400);
    await __td.clickText(/Fortsätt till granskning|Continue/, 2200);
    return { onReview: /Granska betalning|DU BETALAR|Review payment/i.test(__td.bodyText(300)) };
  })()`);
  if (toReview.err) throw new Error(toReview.err);
  assert.ok(toReview.onReview, 'reached the review screen');

  const composed = await s.eval(`(async () => {
    // The template composer mounts only after the review screen's async
    // loadWallet() resolves — poll instead of failing on a cold mount.
    let chip = null;
    for (let i = 0; i < 10 && !chip; i++) {
      chip = [...document.querySelectorAll('button')].find((b) => /^(Avtal|Contract)$/.test((b.innerText || '').trim()));
      if (!chip) await __td.sleep(900);
    }
    if (!chip) return { err: 'no Avtal chip (template feature missing in this build?)' };
    const chipLabel = (chip.innerText || '').trim();
    chip.click(); await __td.sleep(800);
    const ins = [...document.querySelectorAll('input,textarea')].filter((i) => i.offsetParent !== null);
    const byPh = (re) => ins.find((i) => re.test(i.getAttribute('placeholder') || ''));
    const refIn = byPh(/Contract \\/ case|case no|Avtals|Ärende|Optional/i);
    const dec = byPh(/What was agreed|avtalats|The agreement|Avtalet/i);
    const trm = byPh(/Clauses|klausuler|Villkor|Terms/i);
    if (!dec) return { err: 'no decision textarea' };
    ${refField ? `if (refIn) __td.setVal(refIn, ${JSON.stringify(refField)}); else return { err: 'no ref input for the kvitto ref' };` : ''}
    __td.setVal(dec, ${JSON.stringify(decision)});
    if (trm) __td.setVal(trm, ${JSON.stringify(terms)});
    await __td.sleep(600);
    return { chipLabel };
  })()`);
  if (composed.err) throw new Error(composed.err);
  assert.match(composed.chipLabel, /^(Avtal|Contract)$/, 'Agreement template chip selected');

  const confirmRes = await s.eval(`(async () => {
    if (!(await __td.clickText(/Bekräfta & betala|Bekräfta.*betala|Confirm.*pay/, 1500))) return { err: 'no confirm button' };
    await __td.clickText(/Betala ändå|Pay anyway/, 1700); // only when the fraud engine warns
    for (let i = 0; i < 10; i++) {
      const dlg = document.querySelector('[role=dialog]');
      if (dlg) {
        const pwd = [...dlg.querySelectorAll('input[type=password]')].filter((x) => x.offsetParent !== null);
        if (pwd.length) {
          pwd.forEach((x) => __td.setVal(x, '${pin}'));
          await __td.sleep(400);
          const btn = [...dlg.querySelectorAll('button')].find((b) => /betala|pay|Bekräfta|Confirm/i.test(b.innerText) && !b.disabled);
          if (btn) btn.click();
        }
      }
      await __td.sleep(1200);
      if (/Awaiting confirmation|Betalning registrerad|Inväntar bekräftelse|TX-ID/i.test(document.body.textContent || '')) break;
    }
    await __td.sleep(2500);
    return { ok: true };
  })()`);
  if (confirmRes.err) throw new Error(confirmRes.err);

  // Sender-side oracles: payment row + the settled proposer agreement row.
  const sent = await s.eval(`(async () => {
    for (let i = 0; i < 10; i++) {
      const rows = await __td.readStore('anton-pay', 'payments');
      const row = rows.find((r) => r.paidAt >= ${t0} && r.toAddress === ${JSON.stringify(toAddr)});
      if (row && row.txId) {
        const ags = await __td.readStore('anton-pay', 'agreements');
        const ag = ags.find((a) => a && a.decision === ${JSON.stringify(decision)});
        return {
          txId: row.txId, amt: row.amountMicroFtc, paymentType: row.paymentType,
          ag: ag ? { id: ag.id, status: ag.status, role: ag.role, tier: ag.trustTier, proposalHash: ag.proposalHash, linkedTxHash: ag.linkedTxHash } : null,
        };
      }
      await __td.sleep(1500);
    }
    return null;
  })()`);
  assert.ok(sent && sent.txId, 'sent payment row persisted with a txId');
  assert.equal(sent.amt, '10000', 'amount is 0.01 FTC');
  assert.equal(sent.paymentType, 'contract', 'Avtal template auto-selected the contract payment type');
  assert.ok(sent.ag, 'proposer agreement row persisted');
  assert.equal(sent.ag.role, 'proposer', 'sender holds the proposer row');
  assert.equal(sent.ag.tier, 'settlement', 'settlement trust tier');
  assert.equal(sent.ag.status, 'settled', "proposer row is 'settled' at submit (the payment IS the settlement act)");
  assert.equal(sent.ag.linkedTxHash, sent.txId, 'proposer row linked to the carrying tx');
  await s.eval(`__td.clickText(/Tillbaka till start|Back to start/, 1000)`);
  return { txId: sent.txId, agreementId: sent.ag.id, proposalHash: sent.ag.proposalHash };
}

module.exports = {
  name: 'agreement-settlement-two-phone',
  apps: ['pay', 'business'],
  async run({ log }) {
    if (process.env.ANTON_DEVICE_E2E_SPEND !== '1') {
      log('SKIPPED — spends real FTC; re-run with ANTON_DEVICE_E2E_SPEND=1');
      return;
    }
    const tag = Date.now().toString(36).toUpperCase();
    // Resume knob for spend discipline: each leg costs real FTC, so when leg 1
    // already passed and only leg 2 failed, re-run with
    // ANTON_AGRSETTLE_SKIP_LEG1=1 to avoid re-paying the verified leg.
    const skipLeg1 = process.env.ANTON_AGRSETTLE_SKIP_LEG1 === '1';

    // ════ Leg 1: Pay (A) → Pay (B) ════
    if (skipLeg1) { log('leg 1 SKIPPED (ANTON_AGRSETTLE_SKIP_LEG1=1 — already verified in a prior run)'); }
    else {
    const payB0 = await forwardApp('pay', 1);
    let bAddr;
    {
      const s = new CdpSession(payB0.wsUrl);
      await install(s);
      try {
        bAddr = await s.eval(`(async () => {
          const rec = await __td.readStore('anton-pay', 'received');
          const addrs = [...new Set(rec.map((r) => r.toAddress).filter(Boolean))];
          if (addrs.length === 1) return addrs[0];
          const m = (document.body.textContent || '').match(/fc_[A-Za-z0-9]{20,}/);
          return m ? m[0] : null;
        })()`);
      } finally { s.close(); }
    }
    assert.ok(bAddr && bAddr.startsWith('fc_'), "resolved phone B's Pay wallet address");
    log(`leg 1: B-Pay (${payB0.serial}) = ${bAddr}`);

    const payA = await forwardApp('pay', 0);
    assert.notEqual(payA.serial, payB0.serial, 'pin ANTON_PAY_SERIAL and ANTON_PAY_SERIAL_B to DIFFERENT phones');
    const decision1 = `AGRSETTLE-${tag}: måla staketet, betalning vid start`;
    let leg1;
    {
      const s = new CdpSession(payA.wsUrl);
      try {
        await install(s);
        leg1 = await sendAvtal(s, {
          toAddr: bAddr, decision: decision1, terms: 'Netto 0 — förskott. E2E settlement leg 1.',
          pin: PIN_A, t0: Date.now(),
        });
      } finally { s.close(); }
    }
    log(`leg 1: A paid 0.01 FTC with Avtal → tx ${leg1.txId}, agreement ${leg1.agreementId.slice(0, 18)}…`);

    // B: sync until the acceptor row appears, bound by the echoed agreementId.
    const payB = await forwardApp('pay', 1);
    {
      const s = new CdpSession(payB.wsUrl);
      try {
        await install(s);
        const got = await s.eval(`(async () => {
          for (let i = 0; i < 24; i++) {
            // The Synka button lives on HOME — unwind first (the app may have
            // been left on history/detail by a previous step or run).
            for (let j = 0; j < 4; j++) {
              if (/Skanna för att betala|Scan to pay/.test(document.body.textContent || '')) break;
              await __td.clickText(/Avbryt|Tillbaka|Back|Cancel/i, 600);
            }
            await __td.clickText(/Synka nu|Sync now/, 900);
            await __td.sleep(5000);
            const ags = await __td.readStore('anton-pay', 'agreements');
            const ag = ags.find((a) => a && a.id === ${JSON.stringify(leg1.agreementId)});
            if (ag) {
              const rec = await __td.readStore('anton-pay', 'received');
              const rx = rec.find((r) => r.txId === ${JSON.stringify(leg1.txId)});
              return {
                status: ag.status, role: ag.role, tier: ag.trustTier, proposalHash: ag.proposalHash,
                decision: ag.decision, linkedTxHash: ag.linkedTxHash,
                rxKind: rx && rx.structured && rx.structured.kind, rxType: rx && rx.paymentType,
              };
            }
          }
          return null;
        })()`);
        assert.ok(got, `B reconciled agreement ${leg1.agreementId} from the chain (within ~2 min)`);
        assert.equal(got.role, 'acceptor', 'B holds the acceptor row');
        assert.equal(got.status, 'settled', "B's row is 'settled' (settlement tier is one-shot)");
        assert.equal(got.tier, 'settlement', 'settlement trust tier');
        assert.equal(got.proposalHash, leg1.proposalHash, 'proposalHash binds terms identically on both phones');
        assert.equal(got.decision, decision1, 'decision text round-tripped on-chain');
        assert.equal(got.linkedTxHash, leg1.txId, 'bound to the carrying tx by the ECHOED id, not amount+address');
        assert.equal(got.rxKind, 'agreement', 'received record carries the structured agreement');
        log('leg 1: B store assertions OK — acceptor row settled, hash + tx binding verified');

        // UI: history → the received agreement → badge + AVTAL block.
        const ui = await s.eval(`(async () => {
          for (let i = 0; i < 5; i++) {
            if (/Skanna för att betala|Scan to pay/.test(document.body.textContent || '')) break;
            await __td.clickText(/Avbryt|Tillbaka|Back|Cancel/i, 600);
          }
          await __td.clickText(/Visa alla|View all/, 1600);
          // History rows are <button>s shaped "Name · TypeBadge · time · +0.01 FTC"
          // (the bare type-filter chips have no amount, so requiring +0.01 skips them).
          const row = [...document.querySelectorAll('button')].find((el) => {
            const t = (el.innerText || '').replace(/\\s+/g, ' ');
            return /(Avtal|Contract)/i.test(t) && /\\+0\\.01/.test(t) && t.length < 220;
          }) || [...document.querySelectorAll('button')].find((el) => {
            const t = (el.innerText || '').replace(/\\s+/g, ' ');
            return /\\+0\\.01/.test(t) && t.length < 220;
          });
          if (!row) return { err: 'no received row in history' };
          row.click(); await __td.sleep(1600);
          const body = __td.bodyText(1600);
          await __td.clickText(/Tillbaka|Back/i, 700);
          await __td.clickText(/Tillbaka|Back/i, 700);
          return { body };
        })()`);
        if (ui.err) throw new Error(ui.err);
        assert.match(ui.body, /Avvecklat · publikt, osignerat|Settled · public, unsigned/,
          "B's PaymentDetailScreen shows the settlement-tier badge");
        assert.match(ui.body, /AVTAL|CONTRACT/i, 'RemittanceView renders the agreement block');
        assert.ok(ui.body.includes(`AGRSETTLE-${tag}`), 'detail shows the agreed decision');
        log('leg 1: B UI assertion OK — settlement badge + AVTAL block rendered');
      } finally { s.close(); }
    }
    } // end leg 1 (skipLeg1)

    // ════ Leg 2: Business (A) sale paid with the Avtal template from Pay (B) ════
    const biz = await forwardApp('business', 0);
    const sb = new CdpSession(biz.wsUrl);
    let kvitto;
    try {
      await install(sb);
      const t0 = Date.now();
      const armed = await sb.eval(`(async () => {
        const key = (label) => { const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').trim() === label); if (b) { b.click(); return true; } return false; };
        const onEntry = () => [...document.querySelectorAll('button')].some((b) => (b.innerText || '').trim() === '⌫');
        const onHomeTiles = () => !onEntry() && /Extended sale|Utökad försäljning/.test(document.body.textContent || '');
        // Unwind ALL the way to home so SimpleScreen gets a FRESH mount:
        // its pendingReceiptIdRef persists for the mount lifetime, so a QR
        // armed in a previous run blocks re-arming until the component
        // unmounts (or its Cancel/reset runs). On a leftover QR screen the
        // Cancel button is the correct exit (it runs reset()); elsewhere Back.
        for (let i = 0; i < 8 && !onHomeTiles(); i++) {
          if (/Mark as paid|Markera som betald/.test(document.body.textContent || '')) {
            await __td.clickText(/^Cancel$|^Avbryt$/, 900); // QR screen → reset()
          }
          if (onHomeTiles()) break;
          await __td.clickText(/Back|Tillbaka|Cancel|Avbryt/i, 700);
        }
        if (!onHomeTiles()) return { err: 'could not unwind to the Business home tiles' };
        if (!(await __td.clickText(/Simple sale|Enkel försäljning/, 1500))) return { err: 'no Simple sale tile' };
        if (!onEntry()) return { err: 'no keypad' };
        // key in 0.10 SEK, verifying the live display before generating
        let keyed = false;
        for (let a = 0; a < 3 && !keyed; a++) {
          for (let i = 0; i < 6; i++) key('⌫');
          await __td.sleep(250);
          key('.'); await __td.sleep(150); key('1');
          await __td.sleep(400);
          keyed = /0\\.0100\\s*FTC|0,0100\\s*FTC/.test(document.body.textContent || '');
        }
        if (!keyed) return { err: 'could not key 0.10 SEK (display never showed 0.0100 FTC)' };
        if (!(await __td.clickText(/Generate QR|Generera QR|Skapa QR/, 2000))) return { err: 'no Generate QR' };
        await __td.sleep(1500);
        const onQr = /Mark as paid|Markera som betald/.test(document.body.textContent || '');
        return { onQr };
      })()`);
      if (armed.err) throw new Error('leg2(arm sale): ' + armed.err);
      assert.ok(armed.onQr, 'Simple-sale QR screen reached (active-sync auto-armed)');

      kvitto = await sb.eval(`(async () => {
        for (let i = 0; i < 8; i++) {
          const rows = await __td.readStore('anton-business', 'receipts');
          const row = rows.find((r) => r.createdAt >= ${t0} && r.status === 'pending');
          if (row) return { no: row.kvittoNumber, ref: row.ref, recvAddr: row.receivingAddress, amt: String(row.amountMicroFtc) };
          await __td.sleep(1000);
        }
        return null;
      })()`);
      assert.ok(kvitto && kvitto.ref, 'pending kvitto persisted with an ADR-004 ref');
      assert.equal(kvitto.amt, '10000', 'sale is 0.10 SEK = 0.01 FTC');
      log(`leg 2: kvitto #${kvitto.no} armed (${kvitto.ref}) → ${kvitto.recvAddr.slice(0, 14)}…`);
    } finally { /* keep sb open — the QR screen must stay up for active-sync */ }

    // Pay the sale with the Avtal template, kvitto ref in the ref field.
    // Payer = phone A's Pay. (#27, fixed 2026-06-10: phone B's composer used
    // to never render on the new-address path — ReviewScreen read the wallet
    // via loadWallet(), whose raw priv hex the Wave-7 native-signer migration
    // deletes; it now reads getActiveWalletMeta() like executePayment does,
    // so either phone can play the customer role.)
    const payA2 = await forwardApp('pay', 0);
    const decision2 = `AGRSALE-${tag}: leverans enligt avtal, betalning vid leverans`;
    let leg2;
    {
      const s = new CdpSession(payA2.wsUrl);
      try {
        await install(s);
        leg2 = await sendAvtal(s, {
          toAddr: kvitto.recvAddr, decision: decision2, terms: 'E2E settlement leg 2 (merchant).',
          refField: kvitto.ref, pin: PIN_A, t0: Date.now(),
        });
      } finally { s.close(); }
    }
    log(`leg 2: customer paid the sale with Avtal → tx ${leg2.txId}, agreement ${leg2.agreementId.slice(0, 18)}…`);

    // Business: active-sync flips the kvitto with the agreement attached.
    try {
      const done = await sb.eval(`(async () => {
        for (let i = 0; i < 36; i++) {
          await __td.sleep(5000);
          const rows = await __td.readStore('anton-business', 'receipts');
          const row = rows.find((r) => r.kvittoNumber === ${kvitto.no});
          if (row && row.status === 'confirmed') {
            return {
              status: row.status, txHash: row.txHash,
              remKind: row.customerRemittance && row.customerRemittance.kind,
              agId: row.customerRemittance && row.customerRemittance.meta && row.customerRemittance.meta.agreementId,
              customerAddress: row.customerAddress,
              body: __td.bodyText(900),
            };
          }
        }
        return null;
      })()`);
      assert.ok(done, `kvitto #${kvitto.no} flipped pending → confirmed via the credentialed poll (within ~3 min)`);
      assert.equal(done.txHash, leg2.txId, 'kvitto bound to the paying tx');
      assert.equal(done.remKind, 'agreement', 'customer agreement attached to the kvitto');
      assert.equal(done.agId, leg2.agreementId, "the kvitto carries the customer's agreementId");
      assert.match(done.body, /Confirmed|Bekräftad|Settled|Avvecklat/i, 'merchant UI auto-transitioned on confirm');
      log('leg 2: kvitto confirmed with the agreement attached — store + UI OK');

      // Merchant agreements store: acceptor row reconciled by the echoed id.
      const ag = await sb.eval(`(async () => {
        const ags = await __td.readStore('anton-business', 'agreements');
        const a = ags.find((x) => x && x.id === ${JSON.stringify(leg2.agreementId)});
        return a ? { status: a.status, role: a.role, tier: a.trustTier } : null;
      })()`);
      assert.ok(ag, "merchant reconciled the agreement onto a SEPARATE row (outside the receipt hash chain)");
      assert.equal(ag.status, 'settled', "merchant row is 'settled'");
      assert.equal(ag.role, 'acceptor', 'merchant holds the acceptor row');

      // Kvitto view badge (ReceiptIssuedView shows KvittoView on 'done').
      const badge = await sb.eval(`(() => /Settled · public, unsigned|Avvecklat/i.test(document.body.textContent || ''))()`);
      assert.ok(badge, "merchant kvitto view renders 'Settled · public, unsigned'");
      log('leg 2: merchant agreement row + KvittoView badge OK');

      // Leave the Business app on home for the next scenario.
      await sb.eval(`(async()=>{ await __td.clickText(/New sale|Ny försäljning|Back|Tillbaka|Klar|Done/i, 900); for(let i=0;i<4;i++){ if(/Simple sale|Enkel försäljning/.test(document.body.textContent||'')) break; await __td.clickText(/Back|Tillbaka/i, 700);} })()`);
    } finally { sb.close(); }
  },
};
