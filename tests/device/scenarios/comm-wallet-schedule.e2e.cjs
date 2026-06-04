/**
 * comm-wallet-schedule.e2e.cjs — scheduled payments + camera-scanner
 * manual fallback (single phone, no spend, #79 Phase 6).
 *
 * Part A — create a scheduled payment through the UI (Wallet → Scheduled
 * → Add → fill → Create) and assert the `schedules` store gained the row.
 * Because the app itself writes the row (not an external inject), the
 * same-store readback is reliable on this WebView.
 *
 * Part B — open Send → Scan → "Enter code manually", paste a valid
 * futurechain:pay URI, Continue, and assert it routed to the Review
 * screen (the path a real cross-app payment uses). No signing.
 *
 * Cleanup deletes the fixture schedule so the test is idempotent.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const FIXTURE_ADDR = 'fc_TestSchedPayee0000000000000000000';
const PAY_URI = 'futurechain:pay?to=fc_ScanRecipient00000000000000000000&amount=250000&ref=scantest';

module.exports = {
  name: 'comm-wallet-schedule',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl);
    await install(s);
    try {
      // Deterministic setup — empty the schedules store so the readback
      // below counts exactly the one row this run creates.
      await s.eval(`(async () => { await __td.clearStore('anton-comm', 'schedules'); return 1; })()`);

      // ── Part A — create a scheduled payment ────────────────────────
      const a = await s.eval(`(async () => {
        for (let i = 0; i < 5; i++) { await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 120); }
        const wt = document.querySelector('[aria-controls=tabpanel-wallet]'); if (wt) wt.click(); await __td.sleep(900);
        const find = (re) => [...document.querySelectorAll('button,a,[role=button]')].find((x) => re.test(x.innerText || ''));
        const sched = find(/Schemalagt|Scheduled/i); if (!sched) return { err: 'no Scheduled button', sample: __td.bodyText(300) };
        sched.click(); await __td.sleep(700);
        const onList = /Schemalagda betalningar|Scheduled payments/i.test(__td.bodyText(400));
        const add = find(/Lägg till schemalagd|Add scheduled/i); if (!add) return { err: 'no Add button', onList, sample: __td.bodyText(300) };
        add.click(); await __td.sleep(700);
        const addr = document.querySelector('#sched-addr'); if (!addr) return { err: 'no addr input', sample: __td.bodyText(300) };
        __td.setVal(addr, ${JSON.stringify(FIXTURE_ADDR)});
        const amt = [...document.querySelectorAll('input[type=text]')].find((i) => i.id !== 'sched-addr' && i.id !== 'sched-label');
        if (!amt) return { err: 'no amount input' };
        // FiatAmountInput only commits onChangeMicroFtc once its async
        // quote-fetch flips initialised=true. Let that settle, then enter
        // the amount; re-fire with a distinct string so the commit effect
        // runs even if the first keystroke landed before init.
        await __td.sleep(1000);
        __td.setVal(amt, '0.25'); await __td.sleep(300);
        __td.setVal(amt, '0.2500'); await __td.sleep(400);
        const create = find(/Skapa påminnelse|Create reminder/i); if (!create) return { err: 'no Create button', sample: __td.bodyText(300) };
        create.click(); await __td.sleep(1000);
        const rows = await __td.readStore('anton-comm', 'schedules');
        const mine = rows.filter((r) => r && r.payeeAddress === ${JSON.stringify(FIXTURE_ADDR)});
        return { onList, total: rows.length, mineCount: mine.length, sample: mine[0] };
      })()`);
      if (a.err) throw new Error('Part A: ' + a.err + ' — ' + (a.sample || ''));
      assert.ok(a.onList, 'reached the Scheduled payments list');
      assert.equal(a.mineCount, 1, 'exactly one fixture schedule persisted');
      assert.equal(String(a.sample.amountMicroFtc), '250000', 'amount stored as µFTC string');
      assert.ok(a.sample.active === true, 'new schedule is active');
      assert.ok(a.sample.nextFireAt > 0, 'nextFireAt computed');
      log(`Schedule: created + persisted (${a.mineCount} row, ${a.sample.amountMicroFtc} µFTC, nextFireAt set)`);

      // ── Part B — scanner manual fallback → Review ──────────────────
      const b = await s.eval(`(async () => {
        for (let i = 0; i < 6; i++) { await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150); }
        const wt = document.querySelector('[aria-controls=tabpanel-wallet]'); if (wt) wt.click(); await __td.sleep(800);
        const find = (re) => [...document.querySelectorAll('button,a,[role=button]')].find((x) => re.test(x.innerText || ''));
        const send = find(/^\\s*Skicka\\s*$|^\\s*Send\\s*$/i); if (!send) return { err: 'no Send button', sample: __td.bodyText(300) };
        send.click(); await __td.sleep(700);
        // #93 — Send now opens the recipient picker first; take "Pay a new address" to reach the compose (with the Scan button)
        const newAddr = find(/Betala en ny adress|Pay a new address/i); if (newAddr) { newAddr.click(); await __td.sleep(800); }
        const scan = find(/Skanna för att betala|Scan to pay/i); if (!scan) return { err: 'no Scan button', sample: __td.bodyText(300) };
        scan.click(); await __td.sleep(900);
        const manual = find(/Ange kod manuellt|Enter code manually/i); if (!manual) return { err: 'no manual-entry button', sample: __td.bodyText(300) };
        manual.click(); await __td.sleep(500);
        const ta = document.querySelector('textarea'); if (!ta) return { err: 'no manual textarea' };
        __td.setVal(ta, ${JSON.stringify(PAY_URI)}); await __td.sleep(300);
        const cont = find(/^\\s*Fortsätt\\s*$|^\\s*Continue\\s*$/i); if (!cont) return { err: 'no Continue button', sample: __td.bodyText(300) };
        cont.click(); await __td.sleep(900);
        const body = __td.bodyText(600);
        const onReview = /Granska betalning|Review payment|Nätverksavgift|Network fee/i.test(body);
        const hasRecipient = /fc_ScanRecipient/.test(body);
        return { onReview, hasRecipient, sample: onReview ? '' : body.slice(0, 300) };
      })()`);
      if (b.err) throw new Error('Part B: ' + b.err + ' — ' + (b.sample || ''));
      assert.ok(b.onReview, 'scanner manual paste routed to the Review screen');
      assert.ok(b.hasRecipient, 'review shows the scanned recipient address');
      log('Scanner: manual-paste fallback → Review (recipient + fee shown)');

      // ── Teardown — empty the schedules store (deterministic) ───────
      const after = await s.eval(`(async () => {
        await __td.clearStore('anton-comm', 'schedules');
        const rows = await __td.readStore('anton-comm', 'schedules');
        return rows.length;
      })()`);
      assert.equal(after, 0, 'schedules store cleared after the test');
      log('Cleanup: schedules store cleared');
    } finally {
      s.close();
    }
  },
};
