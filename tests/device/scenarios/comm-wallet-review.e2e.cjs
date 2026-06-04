/**
 * comm-wallet-review.e2e.cjs — Comm wallet send → Review step (single phone, no spend).
 * Opens the wallet, taps Send, pastes a ref-less pay URI, taps "Continue to
 * review", and asserts the new Review screen shows the amount + the 0.1% network
 * fee + the total (#79 Phase 1). Does NOT confirm (no spend, no biometric).
 * Needs the #79 Phase-1 build installed.
 *
 * Labels render Swedish on this phone (Comm ships sv.json) — matchers cover both.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const RECIPIENT = 'fc_VWRf68zwyKGA5FUPvTT7m4fhkTgKd12omx';
const URI = `futurechain:pay?to=${RECIPIENT}&amount=200000`;

module.exports = {
  name: 'comm-wallet-review',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl);
    await install(s);
    try {
      const r = await s.eval(`(async () => {
        const byText = (re) => [...document.querySelectorAll('button,a,[role=button]')].find((x) => re.test(x.innerText || x.getAttribute('aria-label') || ''));
        for (let i = 0; i < 5; i++) { await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150); }
        // wallet tab → balance
        const wt = document.querySelector('[aria-controls=tabpanel-wallet]'); if (wt) wt.click();
        await __td.sleep(1000);
        // open Send (compose)
        const send = byText(/^\\s*Skicka\\s*$|^\\s*Send\\s*$/i); if (!send) return { err: 'no Send button', sample: __td.bodyText(200) };
        send.click(); await __td.sleep(900);
        // #83 made the structured form the default; switch to the Paste-link sub-tab for the URI textarea
        const paste = byText(/Klistra in länk|Paste link/i); if (paste) { paste.click(); await __td.sleep(500); }
        const ta = document.querySelector('textarea'); if (!ta) return { err: 'no send textarea' };
        __td.setVal(ta, ${JSON.stringify(URI)}); await __td.sleep(700);
        // continue to review
        const cont = byText(/Fortsätt till granskning|Continue to review/i); if (!cont) return { err: 'no continue-to-review button', sample: __td.bodyText(300) };
        cont.click(); await __td.sleep(1500);
        const t = __td.bodyText(1500);
        return {
          onReview: /Granska betalning|Review payment|Du betalar|You pay/i.test(t),
          has02: /0\\.2 FTC/.test(t),
          hasFee: /0\\.0002 FTC/.test(t),
          hasTotal: /0\\.2002 FTC/.test(t),
          body: t.slice(0, 320),
        };
      })()`);
      if (r.err) throw new Error(r.err + ' — ' + (r.sample || ''));
      assert.ok(r.onReview, 'reached the Comm review screen — got: ' + r.body);
      assert.ok(r.has02, 'amount 0.2 FTC shown');
      assert.ok(r.hasFee, 'network fee 0.0002 FTC (0.1%) shown');
      assert.ok(r.hasTotal, 'total 0.2002 FTC shown');
      log('compose → review + 0.1% fee + total OK');
      await s.eval('(async () => { for (let i = 0; i < 4; i++) { await __td.clickText(/Tillbaka|Avbryt|Back/i, 250); } return 1; })()');
    } finally {
      s.close();
    }
  },
};
