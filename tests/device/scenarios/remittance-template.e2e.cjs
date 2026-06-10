/**
 * remittance-template.e2e.cjs — structured PACS.008 remittance template,
 * Pay → Comm, Invoice (Faktura) template. Single phone is enough (Pay and
 * Comm on the same device); works unchanged with two phones via the
 * ANTON_PAY_SERIAL / ANTON_COMM_SERIAL pins.
 *
 * Flow (device-verified 2026-06-10):
 *   1. Read the Comm wallet's fc_ address (wallet_txs.walletAddress, with a
 *      wallet-screen DOM fallback).
 *   2. Pay: Home → Skicka → "Betala en ny adress" → fill address/0.01 FTC →
 *      review → pick the **Faktura** chip → invoice fields + one line item →
 *      Bekräfta & betala (arming second tap if the fraud engine warns) →
 *      in-app payment PIN.
 *   3. Comm: wallet tab → Synka nu, poll wallet_txs until the inbound row
 *      with the new txId arrives, assert the FULL structured remittance
 *      round-tripped (meta.tpl=invoice + tplv, unique ref, line item,
 *      amountSek/vatSek, dates in meta).
 *   4. Comm UI: Historik → row → detail; assert RemittanceView renders the
 *      Swedish template name FAKTURA + the invoice ref + Totalt.
 *
 * ⚠️ SPENDS REAL FTC (0.01 + 0.001% fee per run, on-chain via the live hub).
 * Unlike the rest of the suite this is NOT free to re-run, so it requires an
 * EXTRA gate on top of ANTON_DEVICE_E2E=1:
 *
 *   ANTON_DEVICE_E2E=1 ANTON_DEVICE_E2E_SPEND=1 \
 *     node tests/device/run-e2e.cjs remittance
 *
 * Without ANTON_DEVICE_E2E_SPEND=1 the scenario logs + passes as skipped, so
 * `pnpm test:e2e:device` stays spend-free.
 *
 * Re-runnable: the invoice ref is unique per run (Date.now-based), and every
 * assertion targets IndexedDB rows keyed by the fresh txId — never balances.
 * The in-app payment PIN comes from ANTON_PAY_PIN (default 8606 — phone A).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const AMOUNT_FTC = '0.01';
const PIN = process.env.ANTON_PAY_PIN || '8606';

module.exports = {
  name: 'remittance-template',
  apps: ['pay', 'comm'],
  async run({ log }) {
    if (process.env.ANTON_DEVICE_E2E_SPEND !== '1') {
      log('SKIPPED — spends real FTC; re-run with ANTON_DEVICE_E2E_SPEND=1');
      return;
    }
    const invoiceRef = `INV-E2E-${Date.now().toString(36).toUpperCase()}`;

    // ── 1. Comm wallet address (store first, wallet-screen DOM fallback) ──
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
          // fallback: read it off the wallet screen
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
    assert.ok(commAddr && commAddr.startsWith('fc_'), 'resolved the Comm wallet address');
    log(`Comm wallet: ${commAddr}`);

    // ── 2. Pay: send 0.01 FTC with the Faktura template ──
    const pay = await forwardApp('pay');
    const sp = new CdpSession(pay.wsUrl);
    let txId;
    try {
      await install(sp);
      const t0 = Date.now();

      // home → Skicka → new address → fill → review
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
        const nm = byPh(/Anna|name/i); if (nm) __td.setVal(nm, 'Remit E2E');
        const cc = byPh(/^SE$/); if (cc) __td.setVal(cc, 'SE');
        await __td.sleep(400);
        await __td.clickText(/Fortsätt till granskning|Continue/, 2200);
        return { onReview: /Granska betalning|DU BETALAR|Review payment/i.test(__td.bodyText(300)) };
      })()`);
      if (toReview.err) throw new Error(toReview.err);
      assert.ok(toReview.onReview, 'reached the review screen');

      // Faktura template + fields + one line item
      const composed = await sp.eval(`(async () => {
        const chip = [...document.querySelectorAll('button')].find((b) => /^(Faktura|Invoice)$/.test((b.innerText || '').trim()));
        if (!chip) return { err: 'no Faktura chip (template feature missing in this build?)' };
        const chipLabel = (chip.innerText || '').trim();
        chip.click(); await __td.sleep(800);
        const vis = () => [...document.querySelectorAll('input,textarea')].filter((i) => i.offsetParent !== null);
        let ins = vis();
        const byPh = (re) => ins.find((i) => re.test(i.getAttribute('placeholder') || ''));
        __td.setVal(byPh(/Invoice number|Fakturanummer/), ${JSON.stringify(invoiceRef)});
        const d1 = byPh(/Fakturadatum|Invoice date/); if (d1) __td.setVal(d1, '2026-06-10');
        const d2 = byPh(/Förfallodatum|Due date/); if (d2) __td.setVal(d2, '2026-06-24');
        const notes = byPh(/Notes|Anteckningar/); if (notes) __td.setVal(notes, 'E2E remittance-template scenario.');
        await __td.clickText(/Lägg till artikel|Add item/, 500);
        ins = vis();
        const nm = ins.find((i) => /^(Artikel|Item)$/.test(i.getAttribute('placeholder') || ''));
        const qty = ins.find((i) => i.getAttribute('aria-label') === 'qty');
        const pr = ins.find((i) => i.getAttribute('aria-label') === 'price');
        if (!nm || !qty || !pr) return { err: 'item editor inputs missing' };
        __td.setVal(nm, 'E2E-artikel'); __td.setVal(qty, '2'); __td.setVal(pr, '50');
        await __td.sleep(600);
        return { chipLabel, body: __td.bodyText(900) };
      })()`);
      if (composed.err) throw new Error(composed.err);
      assert.equal(composed.chipLabel, 'Faktura', 'Swedish template chip label (Faktura)');
      assert.match(composed.body, /Totalt|Total/, 'items total rendered in the composer');
      log(`composed Faktura ${invoiceRef} (2× E2E-artikel à 50 kr)`);

      // confirm (+ optional fraud arm) + PIN, then wait for the success screen
      const confirmRes = await sp.eval(`(async () => {
        if (!(await __td.clickText(/Bekräfta & betala|Bekräfta.*betala|Confirm.*pay/, 1500))) return { err: 'no confirm button' };
        await __td.clickText(/Betala ändå|Pay anyway/, 1700); // only present when the fraud engine warns
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
        const m = (document.body.textContent || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        return { pinFilled, txId: m ? m[0] : null, body: __td.bodyText(300) };
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
      assert.equal(sent.paymentType, 'payment', 'Invoice template auto-selected the taxable payment type');
      txId = sent.txId;
      log(`paid 0.01 FTC → ${commAddr.slice(0, 14)}… tx ${txId} (status ${sent.status})`);

      // leave Pay on home for the next scenario
      await sp.eval(`__td.clickText(/Tillbaka till start|Back to start/, 1000)`);
    } finally { sp.close(); }

    // ── 3. Comm: sync + assert the structured remittance round-tripped ──
    const comm = await forwardApp('comm');
    const sc = new CdpSession(comm.wsUrl);
    try {
      await install(sc);
      const rx = await sc.eval(`(async () => {
        // Reach the wallet BALANCE screen ("Synka nu" lives there). The tab bar
        // is visible on wallet sub-screens too (history/detail), so back out
        // until Synka nu itself appears — not merely until the tabs show.
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
      assert.ok(rx, `inbound tx ${txId} arrived in Comm wallet_txs (within ~2 min)`);
      assert.equal(rx.kind, 'receive', 'recorded as a receive');
      assert.equal(rx.amt, '10000', 'inbound amount matches');
      const st = rx.structured;
      assert.ok(st, 'structured remittance present on the received WalletTx');
      assert.equal(st.kind, 'invoice', 'AntonRemittance.kind = invoice');
      assert.equal(st.meta && st.meta.tpl, 'invoice', 'meta.tpl = invoice');
      assert.equal(st.meta && st.meta.tplv, '1', 'meta.tplv = 1');
      assert.equal(st.ref, invoiceRef, 'unique invoice ref round-tripped');
      assert.equal((st.items || []).length, 1, 'one line item');
      assert.equal(st.items[0].name, 'E2E-artikel', 'item name round-tripped');
      assert.equal(st.amountSek, 100, 'items total 100 kr');
      assert.equal(st.vatSek, 20, 'VAT 20 kr (25% incl.)');
      assert.equal(st.meta.dueDate, '2026-06-24', 'meta.dueDate round-tripped');
      log('store assertion OK — full invoice template round-tripped via /iso_received');

      // ── 4. UI render: Historik → row → detail (RemittanceView) ──
      const ui = await sc.eval(`(async () => {
        await __td.clickText(/^Historik$|^History$/, 1500);
        // most-recent-first list — the first inbound 0.0100 row is this run's
        const li = [...document.querySelectorAll('li')].find((el) => {
          const t = (el.innerText || '').replace(/\\s+/g, ' ');
          return /Ta emot|Receive/.test(t) && t.includes('0.0100');
        });
        if (!li) return { err: 'no history row' };
        const row = li.querySelector('div'); // onClick lives on the inner div
        if (!row) return { err: 'no clickable row div' };
        row.click();
        await __td.sleep(1600);
        const body = __td.bodyText(1600);
        // back out: detail → history → wallet
        await __td.clickText(/Back|Tillbaka/i, 700);
        await __td.clickText(/Back|Tillbaka/i, 700);
        return { body };
      })()`);
      if (ui.err) throw new Error(ui.err);
      assert.match(ui.body, /FAKTURA/i, 'RemittanceView shows the Swedish template name (Faktura)');
      assert.ok(ui.body.includes(invoiceRef), 'detail shows the invoice ref');
      assert.match(ui.body, /Totalt/, 'detail shows the itemised total (Totalt)');
      log('UI assertion OK — FAKTURA block rendered in the Comm tx detail');
    } finally { sc.close(); }
  },
};
