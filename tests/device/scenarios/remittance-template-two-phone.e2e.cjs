/**
 * remittance-template-two-phone.e2e.cjs — structured PACS.008 remittance
 * template ACROSS TWO PHONES, Pay (phone A) → Comm (phone B), with the
 * **Quote (Offert)** template — a different template than the single-phone
 * smoke (`remittance-template.e2e.cjs`, Faktura) to broaden coverage:
 * different field set (validUntil instead of invoiced/due dates) and a
 * different payment classification (quote ⇒ `information`, not `payment`).
 *
 * Pin the roles to different phones (this is what makes it two-phone):
 *   ANTON_PAY_SERIAL=<phone A>  ANTON_COMM_SERIAL=<phone B>
 *
 * Flow (device-verified 2026-06-10, A=QV7202N48K → B=QV7101L31T):
 *   1. Read the receiver Comm wallet's fc_ address (wallet_txs store, with a
 *      wallet-screen DOM fallback).
 *   2. Pay (A): Home → Skicka → "Betala en ny adress" → fill address/0.01 FTC
 *      → review → pick the **Offert** chip → quote ref + valid-until + notes +
 *      two line items → Bekräfta & betala (arming second tap if the fraud
 *      engine warns) → in-app payment PIN.
 *   3. Comm (B): wallet tab → Synka nu, poll wallet_txs until the inbound row
 *      with the new txId arrives over the REAL chain, assert the full
 *      structured remittance round-tripped (meta.tpl=quote + tplv, unique ref,
 *      items, amountSek/vatSek, meta.validUntil).
 *   4. Comm (B) UI: Historik → row → detail; assert RemittanceView renders the
 *      template name (Offert) + the quote ref + the itemised total.
 *
 * ⚠️ SPENDS REAL FTC (0.01 + 0.1% fee per run, on-chain via the live hub).
 * Extra gate on top of ANTON_DEVICE_E2E=1:
 *
 *   ANTON_DEVICE_E2E=1 ANTON_DEVICE_E2E_SPEND=1 \
 *     ANTON_PAY_SERIAL=… ANTON_COMM_SERIAL=… \
 *     node tests/device/run-e2e.cjs remittance-template-two-phone
 *
 * Without ANTON_DEVICE_E2E_SPEND=1 the scenario logs + passes as skipped.
 *
 * Re-runnable: the quote ref is unique per run (Date.now-based) and every
 * assertion targets IndexedDB rows keyed by the fresh txId — never balances.
 * Selectors are sv/en tolerant (phone B may run a different UI language).
 * Sender PIN comes from ANTON_PAY_PIN (default 8606 — phone A).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const AMOUNT_FTC = '0.01';
const PIN = process.env.ANTON_PAY_PIN || '8606';

module.exports = {
  name: 'remittance-template-two-phone',
  apps: ['pay', 'comm'],
  async run({ log }) {
    if (process.env.ANTON_DEVICE_E2E_SPEND !== '1') {
      log('SKIPPED — spends real FTC; re-run with ANTON_DEVICE_E2E_SPEND=1');
      return;
    }
    const quoteRef = `Q-E2E-${Date.now().toString(36).toUpperCase()}`;

    // ── 1. Receiver (Comm) wallet address ──
    const comm0 = await forwardApp('comm');
    let commAddr;
    {
      const s = new CdpSession(comm0.wsUrl);
      await install(s);
      try {
        commAddr = await s.eval(`(async () => {
          const txs = await __td.readStore('anton-comm', 'wallet_txs');
          const addrs = [...new Set(txs.map((t) => t.walletAddress).filter(Boolean))];
          if (addrs.length === 1) return addrs[0];
          for (let i = 0; i < 4; i++) {
            const tabs = [...document.querySelectorAll('button')].map((x) => (x.innerText || '').trim());
            if (tabs.some((t) => /Plånbok|Wallet/.test(t))) break;
            await __td.clickText(/Tillbaka|Back/i, 600);
          }
          await __td.clickText(/Plånbok|Wallet/, 1400);
          const m = (document.body.textContent || '').match(/fc_[A-Za-z0-9]{20,}/);
          return m ? m[0] : null;
        })()`);
      } finally { s.close(); }
    }
    assert.ok(commAddr && commAddr.startsWith('fc_'), 'resolved the receiver Comm wallet address');
    log(`receiver Comm wallet (${comm0.serial}): ${commAddr}`);

    // ── 2. Pay (sender phone): 0.01 FTC with the Offert template ──
    const pay = await forwardApp('pay');
    assert.notEqual(pay.serial, undefined);
    log(`sender Pay phone: ${pay.serial}${pay.serial === comm0.serial ? ' (WARNING: same phone — pin ANTON_PAY_SERIAL/ANTON_COMM_SERIAL for the two-phone run)' : ''}`);
    const sp = new CdpSession(pay.wsUrl);
    let txId;
    try {
      await install(sp);
      const t0 = Date.now();

      const toReview = await sp.eval(`(async () => {
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
        __td.setVal(addr, ${JSON.stringify(commAddr)});
        __td.setVal(amt, '${AMOUNT_FTC}');
        const nm = byPh(/Anna|name/i); if (nm) __td.setVal(nm, 'Remit E2E 2P');
        const cc = byPh(/^SE$/); if (cc) __td.setVal(cc, 'SE');
        await __td.sleep(400);
        await __td.clickText(/Fortsätt till granskning|Continue/, 2200);
        return { onReview: /Granska betalning|DU BETALAR|Review payment/i.test(__td.bodyText(300)) };
      })()`);
      if (toReview.err) throw new Error(toReview.err);
      assert.ok(toReview.onReview, 'reached the review screen');

      // Offert template + fields + two line items
      const composed = await sp.eval(`(async () => {
        const chip = [...document.querySelectorAll('button')].find((b) => /^(Offert|Quote)$/.test((b.innerText || '').trim()));
        if (!chip) return { err: 'no Offert chip (template feature missing in this build?)' };
        const chipLabel = (chip.innerText || '').trim();
        chip.click(); await __td.sleep(800);
        const vis = () => [...document.querySelectorAll('input,textarea')].filter((i) => i.offsetParent !== null);
        let ins = vis();
        const byPh = (re) => ins.find((i) => re.test(i.getAttribute('placeholder') || ''));
        // quote ref keeps the catalog fallback placeholder "Q-001"
        const ref = byPh(/^Q-001$|Quote number|Offertnummer/);
        if (!ref) return { err: 'no quote-ref input' };
        __td.setVal(ref, ${JSON.stringify(quoteRef)});
        const vu = ins.find((i) => i.type === 'date'); if (vu) __td.setVal(vu, '2026-07-10');
        const notes = byPh(/Conditions|Notes|Anteckningar|Villkor/i);
        if (notes) __td.setVal(notes, 'E2E two-phone quote scenario.');
        // two items
        await __td.clickText(/Lägg till artikel|Add item/, 500);
        await __td.clickText(/Lägg till artikel|Add item/, 500);
        ins = vis();
        const nms = ins.filter((i) => /^(Artikel|Item)$/.test(i.getAttribute('placeholder') || ''));
        const qtys = ins.filter((i) => i.getAttribute('aria-label') === 'qty');
        const prs = ins.filter((i) => i.getAttribute('aria-label') === 'price');
        if (nms.length < 2 || qtys.length < 2 || prs.length < 2) return { err: 'item editor inputs missing' };
        __td.setVal(nms[0], 'E2E-offert-A'); __td.setVal(qtys[0], '2'); __td.setVal(prs[0], '30');
        __td.setVal(nms[1], 'E2E-offert-B'); __td.setVal(qtys[1], '1'); __td.setVal(prs[1], '20');
        await __td.sleep(600);
        return { chipLabel, body: __td.bodyText(900) };
      })()`);
      if (composed.err) throw new Error(composed.err);
      assert.match(composed.chipLabel, /^(Offert|Quote)$/, 'Quote template chip selected');
      assert.match(composed.body, /Totalt|Total/, 'items total rendered in the composer');
      log(`composed ${composed.chipLabel} ${quoteRef} (2× E2E-offert-A à 30 + 1× E2E-offert-B à 20 = 80 kr)`);

      // confirm (+ optional fraud arm) + PIN
      const confirmRes = await sp.eval(`(async () => {
        if (!(await __td.clickText(/Bekräfta & betala|Bekräfta.*betala|Confirm.*pay/, 1500))) return { err: 'no confirm button' };
        await __td.clickText(/Betala ändå|Pay anyway/, 1700); // only when the fraud engine warns
        let pinFilled = 0;
        for (let i = 0; i < 10; i++) {
          const dlg = document.querySelector('[role=dialog]');
          if (dlg) {
            const pwd = [...dlg.querySelectorAll('input[type=password]')].filter((x) => x.offsetParent !== null);
            if (pwd.length) {
              pwd.forEach((x) => __td.setVal(x, '${PIN}'));
              pinFilled = pwd.length;
              await __td.sleep(400);
              const btn = [...dlg.querySelectorAll('button')].find((b) => /betala|pay|Bekräfta|Confirm/i.test(b.innerText) && !b.disabled);
              if (btn) btn.click();
            }
          }
          await __td.sleep(1200);
          if (/Awaiting confirmation|Betalning registrerad|Inväntar bekräftelse|TX-ID/i.test(document.body.textContent || '')) break;
        }
        await __td.sleep(2500);
        return { pinFilled };
      })()`);
      if (confirmRes.err) throw new Error(confirmRes.err);

      // sender-side oracle: the persisted payment row
      const sent = await sp.eval(`(async () => {
        for (let i = 0; i < 10; i++) {
          const rows = await __td.readStore('anton-pay', 'payments');
          const row = rows.find((r) => r.paidAt >= ${t0} && r.toAddress === ${JSON.stringify(commAddr)});
          if (row && row.txId) return { txId: row.txId, amt: row.amountMicroFtc, paymentType: row.paymentType, status: row.status };
          await __td.sleep(1500);
        }
        return null;
      })()`);
      assert.ok(sent && sent.txId, 'sent payment row persisted with a txId');
      assert.equal(sent.amt, '10000', 'amount is 0.01 FTC (10000 µFTC)');
      assert.equal(sent.paymentType, 'information', 'Quote template auto-selected the information payment type');
      txId = sent.txId;
      log(`paid 0.01 FTC → ${commAddr.slice(0, 14)}… tx ${txId} (status ${sent.status})`);

      await sp.eval(`__td.clickText(/Tillbaka till start|Back to start/, 1000)`);
    } finally { sp.close(); }

    // ── 3. Comm (receiver phone): sync + assert the structured remittance ──
    const comm = await forwardApp('comm');
    const sc = new CdpSession(comm.wsUrl);
    try {
      await install(sc);
      const rx = await sc.eval(`(async () => {
        for (let i = 0; i < 6; i++) {
          await __td.clickText(/Plånbok|Wallet/, 1100);
          if ([...document.querySelectorAll('button')].some((b) => /Synka nu|Sync now/.test(b.innerText || ''))) break;
          await __td.clickText(/Tillbaka|Back/i, 800);
        }
        for (let i = 0; i < 24; i++) {
          await __td.clickText(/Synka nu|Sync now/, 900);
          await __td.sleep(5000);
          const txs = await __td.readStore('anton-comm', 'wallet_txs');
          const row = txs.find((t) => t.txHash === ${JSON.stringify(txId)});
          if (row) return { kind: row.kind, amt: row.amountMicroFtc, structured: row.structured ?? null };
        }
        return null;
      })()`);
      assert.ok(rx, `inbound tx ${txId} arrived in the receiver's Comm wallet_txs (within ~2 min)`);
      assert.equal(rx.kind, 'receive', 'recorded as a receive');
      assert.equal(rx.amt, '10000', 'inbound amount matches');
      const st = rx.structured;
      assert.ok(st, 'structured remittance present on the received WalletTx');
      assert.equal(st.kind, 'order', 'AntonRemittance.kind = order (quote)');
      assert.equal(st.meta && st.meta.tpl, 'quote', 'meta.tpl = quote');
      assert.equal(st.meta && st.meta.tplv, '1', 'meta.tplv = 1');
      assert.equal(st.ref, quoteRef, 'unique quote ref round-tripped');
      assert.equal((st.items || []).length, 2, 'two line items');
      assert.deepEqual(st.items.map((i) => i.name), ['E2E-offert-A', 'E2E-offert-B'], 'item names round-tripped');
      assert.equal(st.amountSek, 80, 'items total 80 kr');
      assert.equal(st.vatSek, 16, 'VAT 16 kr (25% incl.)');
      assert.equal(st.meta.validUntil, '2026-07-10', 'meta.validUntil round-tripped');
      log('store assertion OK — full quote template round-tripped phone-to-phone via the chain');

      // ── 4. UI render: Historik → row → detail (RemittanceView) ──
      const ui = await sc.eval(`(async () => {
        await __td.clickText(/^Historik$|^History$/, 1500);
        const li = [...document.querySelectorAll('li')].find((el) => {
          const t = (el.innerText || '').replace(/\\s+/g, ' ');
          return /Ta emot|Receive/.test(t) && t.includes('0.0100');
        });
        if (!li) return { err: 'no history row' };
        const row = li.querySelector('div');
        if (!row) return { err: 'no clickable row div' };
        row.click();
        await __td.sleep(1600);
        const body = __td.bodyText(1600);
        await __td.clickText(/Back|Tillbaka/i, 700);
        await __td.clickText(/Back|Tillbaka/i, 700);
        return { body };
      })()`);
      if (ui.err) throw new Error(ui.err);
      assert.match(ui.body, /OFFERT|QUOTE/i, 'RemittanceView shows the quote template name');
      assert.ok(ui.body.includes(quoteRef), 'detail shows the quote ref');
      assert.match(ui.body, /Totalt|Total/, 'detail shows the itemised total');
      log('UI assertion OK — Offert block rendered in the receiver Comm tx detail');
    } finally { sc.close(); }
  },
};
