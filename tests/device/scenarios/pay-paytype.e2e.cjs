/**
 * pay-paytype.e2e.cjs — payment-type selector on Review (single phone, no spend).
 * Pastes a ref-less pay URI, advances to Review, and asserts the 4 type buttons
 * (Payment / Gift / Information / Contract) render with Payment selected by
 * default + the tax helper text, then taps "Gift" and asserts the selection
 * moves. Spends nothing (no PIN, no submit). Needs the #76 build installed.
 *
 * Selected detection: the selected button's inline backgroundColor is
 * var(--color-accent); unselected is var(--color-surface) — so the bg string
 * containing "accent" marks the selected one. Labels are English (the
 * paymentType.* keys are English-only so far → i18next fallback).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');
const vectors = require('../fixtures/vectors.json');

const RECIPIENT = 'fc_VWRf68zwyKGA5FUPvTT7m4fhkTgKd12omx';
const URI = `futurechain:pay?to=${RECIPIENT}&amount=${vectors.amounts.smallSaleMicroFtc}`;
const LABELS = ['Payment', 'Gift', 'Information', 'Contract'];

module.exports = {
  name: 'pay-paytype',
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
        const ta = document.querySelector('textarea');
        if (!ta) return { err: 'no manual-entry textarea' };
        __td.setVal(ta, ${JSON.stringify(URI)}); await __td.sleep(700);
        const cont = byText(/Forts/i); if (cont) cont.click(); await __td.sleep(2000);

        const labels = ${JSON.stringify(LABELS)};
        const typeButtons = () => {
          const out = {};
          for (const b of document.querySelectorAll('button')) {
            const txt = (b.innerText || '').trim();
            if (labels.includes(txt)) out[txt] = b;
          }
          return out;
        };
        const isSel = (b) => !!b && /accent/.test(b.style.backgroundColor || '');

        let btns = typeButtons();
        const haveAll = labels.every((l) => btns[l]);
        const helper = /counts toward tax|Gift, Information/i.test(__td.bodyText(1500));
        const defaultPayment = isSel(btns['Payment']) && !isSel(btns['Gift']);
        if (btns['Gift']) btns['Gift'].click();
        await __td.sleep(500);
        btns = typeButtons();
        const giftSelected = isSel(btns['Gift']) && !isSel(btns['Payment']);
        return { haveAll, helper, defaultPayment, giftSelected, body: __td.bodyText(300) };
      })()`);
      if (r.err) throw new Error(r.err);
      assert.ok(r.haveAll, 'all four payment-type buttons render — got: ' + r.body);
      assert.ok(r.helper, 'tax helper text shown');
      assert.ok(r.defaultPayment, 'Payment is selected by default');
      assert.ok(r.giftSelected, 'tapping Gift moves the selection to Gift');
      log('4 types render · Payment default · tap Gift → selected');
      // leave the app on a neutral screen for the next scenario
      await s.eval('(async () => { for (let i = 0; i < 4; i++) { await __td.clickText(/Tillbaka|Avbryt|Back/i, 300); } return 1; })()');
    } finally {
      s.close();
    }
  },
};
