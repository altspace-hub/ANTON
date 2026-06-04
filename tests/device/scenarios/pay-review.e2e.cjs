/**
 * pay-review.e2e.cjs — Pay decode + review + fee (single phone, idempotent).
 * Pastes a ref-less pay-to-pay URI (accepted since the animated-QR A3 fix),
 * advances to the Review screen, and asserts the amount, the 0.1% network fee,
 * and the total render correctly. Spends nothing, needs no PIN.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');
const vectors = require('../fixtures/vectors.json');

const RECIPIENT = 'fc_VWRf68zwyKGA5FUPvTT7m4fhkTgKd12omx';
// ref-less pay-to-pay URI; amount is in micro-FTC (200000 = 0.2 FTC).
const URI = `futurechain:pay?to=${RECIPIENT}&amount=${vectors.amounts.smallSaleMicroFtc}`;

module.exports = {
  name: 'pay-review',
  apps: ['pay'],
  async run({ log }) {
    const pay = await forwardApp('pay');
    const s = new CdpSession(pay.wsUrl);
    await install(s);
    try {
      const r = await s.eval(`(async () => {
        const byText = (re) => [...document.querySelectorAll('button,a')].find((x) => re.test(x.innerText || ''));
        for (let i = 0; i < 4; i++) { await __td.clickText(/Tillbaka|Avbryt|Back/i, 300); }
        if (!document.querySelector('textarea')) {
          const sc = byText(/Skanna f/i); if (sc) sc.click(); await __td.sleep(900);
          const mn = byText(/Ange kod manuellt/i); if (mn) mn.click(); await __td.sleep(900);
        }
        // #83 made the structured form the default sub-tab; switch to Paste-link for the URI textarea
        const paste = byText(/Klistra in länk|Paste link/i); if (paste) { paste.click(); await __td.sleep(500); }
        const ta = document.querySelector('textarea');
        if (!ta) return { err: 'no manual-entry textarea' };
        __td.setVal(ta, ${JSON.stringify(URI)}); await __td.sleep(700);
        const cont = byText(/Forts/i); if (cont) cont.click(); await __td.sleep(2000);
        const t = __td.bodyText(700);
        return {
          onReview: /Granska|Review|DU BETALAR|YOU PAID/i.test(t),
          has02: /0\\.2 FTC/.test(t),
          hasFee: /0\\.0002 FTC/.test(t),
          hasTotal: /0\\.2002 FTC/.test(t),
          body: t.slice(0, 300),
        };
      })()`);
      if (r.err) throw new Error(r.err);
      assert.ok(r.onReview, 'reached the review screen — got: ' + r.body);
      assert.ok(r.has02, 'amount 0.2 FTC shown');
      assert.ok(r.hasFee, 'network fee 0.0002 FTC (0.1%) shown');
      assert.ok(r.hasTotal, 'total 0.2002 FTC shown');
      log('decode (ref-less) + review + 0.1% fee + total OK');
      // leave the app on a neutral screen for the next scenario
      await s.eval('(async () => { for (let i = 0; i < 4; i++) { await __td.clickText(/Tillbaka|Avbryt|Back/i, 300); } return 1; })()');
    } finally {
      s.close();
    }
  },
};
