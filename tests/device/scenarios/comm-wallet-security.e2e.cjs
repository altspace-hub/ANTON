/**
 * comm-wallet-security.e2e.cjs — wallet → Security → set a payment PIN
 * (single phone, idempotent, no spend). Drives the new Security screen, opens
 * the PIN create modal, sets a PIN, and asserts the "Remove PIN" affordance
 * appears (#79 Phase 3). The PIN is a separate envelope — it does NOT touch the
 * wallet key, so this is safe on the funded wallet. Re-runs overwrite the PIN.
 *
 * Note: the passphrase enable/change/remove flow is NOT exercised on-device —
 * it re-encrypts the wallet key and would be reckless to automate on a funded
 * wallet; it's covered by typecheck + the byte-identical port from Pay.
 *
 * New strings fall back to English (no sv yet), so matchers are English-only.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-wallet-security',
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
        const sec = byText(/^\\s*Security\\s*$|^\\s*Säkerhet\\s*$/i); if (!sec) return { err: 'no Security button', sample: __td.bodyText(300) };
        sec.click(); await __td.sleep(900);
        const onSecurity = /Payment PIN|Wallet passphrase/i.test(__td.bodyText(600));
        // open the PIN create modal
        const setBtn = byText(/Set PIN|Change PIN/i); if (!setBtn) return { err: 'no Set/Change PIN button' };
        setBtn.click(); await __td.sleep(800);
        // scope to the modal dialog — the security screen also has passphrase password fields
        const dlg = document.querySelector('[role=dialog]'); if (!dlg) return { err: 'PIN modal did not open' };
        const pws = [...dlg.querySelectorAll('input[type=password]')];
        if (pws.length < 2) return { err: 'PIN modal needs 2 fields, got ' + pws.length };
        __td.setVal(pws[0], '1234'); __td.setVal(pws[1], '1234'); await __td.sleep(400);
        const submit = [...dlg.querySelectorAll('button')].find((b) => !b.disabled && /Set PIN|Ange PIN|& pay|och betala/i.test(b.innerText || ''));
        if (!submit) return { err: 'no enabled PIN submit button in modal' };
        submit.click(); await __td.sleep(1300);
        const removed = !!byText(/Remove PIN/i);
        const okMsg = /Payment PIN set/i.test(__td.bodyText(800));
        return { onSecurity, removeShown: removed, okMsg, body: __td.bodyText(260) };
      })()`);
      if (r.err) throw new Error(r.err + ' — ' + (r.sample || ''));
      assert.ok(r.onSecurity, 'reached the Security screen — got: ' + r.body);
      assert.ok(r.removeShown || r.okMsg, 'PIN set (Remove-PIN affordance or confirmation shown) — got: ' + r.body);
      log('Security: payment PIN set on-device');
      await s.eval('(async () => { for (let i = 0; i < 5; i++) { await __td.clickText(/Tillbaka|Avbryt|Back/i, 200); } return 1; })()');
    } finally {
      s.close();
    }
  },
};
