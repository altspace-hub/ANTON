/**
 * comm-wallet-receive.e2e.cjs — Receive screen amount input + QR (single phone,
 * no spend, #79 Phase 5). Opens Receive, enters a request amount, and asserts the
 * amount field + a rendered QR + the address. The animated/rich QR needs a saved
 * payment-identity name (the funded identity is empty), so this verifies the
 * static path on-device; the animated path is unit-tested (receive-uri) + the
 * bc-ur encoder bundles via the new node polyfill (build) — same path Pay's #70
 * verified.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-wallet-receive',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl);
    await install(s);
    try {
      const r = await s.eval(`(async () => {
        const byText = (re) => [...document.querySelectorAll('button,a,[role=button]')].find((x) => re.test(x.innerText || x.getAttribute('aria-label') || ''));
        for (let i = 0; i < 5; i++) { await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150); }
        const wt = document.querySelector('[aria-controls=tabpanel-wallet]'); if (wt) wt.click(); await __td.sleep(900);
        const recv = byText(/^\\s*Ta emot\\s*$|^\\s*Receive\\s*$/i); if (!recv) return { err: 'no Receive button', sample: __td.bodyText(250) };
        recv.click(); await __td.sleep(900);
        const onReceive = /Ta emot|Receive/i.test(__td.bodyText(400));
        const amt = document.querySelector('input[type=number]'); if (!amt) return { err: 'no amount input' };
        __td.setVal(amt, '0.5'); await __td.sleep(500);
        const hasQr = !!document.querySelector('svg, canvas');
        const hasAddr = /fc_[A-Za-z0-9]{6,}/.test(__td.bodyText(1500));
        return { onReceive, amountAccepted: amt.value === '0.5', hasQr, hasAddr };
      })()`);
      if (r.err) throw new Error(r.err + ' — ' + (r.sample || ''));
      assert.ok(r.onReceive, 'reached the Receive screen');
      assert.ok(r.amountAccepted, 'request-amount field accepts input');
      assert.ok(r.hasQr, 'a QR renders');
      assert.ok(r.hasAddr, 'the receive address is shown');
      log('Receive: amount field + QR + address render');
      await s.eval('(async () => { for (let i = 0; i < 4; i++) { await __td.clickText(/Tillbaka|Avbryt|Back/i, 250); } return 1; })()');
    } finally {
      s.close();
    }
  },
};
