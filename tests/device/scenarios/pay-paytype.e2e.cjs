/**
 * pay-paytype.e2e.cjs — the "what is this payment?" selector on Review (single
 * phone, no spend). Pastes a ref-less pay URI, advances to Review, and asserts
 * the structured-remittance TEMPLATE chips render with "Free text" selected by
 * default, then taps a different chip and asserts the selection moves. Spends
 * nothing (no PIN, no submit).
 *
 * NOTE: the old 4-button payment-type grid (Payment/Gift/Information/Contract)
 * was SUBSUMED by the RemittanceComposer's template chip row (src/pay/components/
 * RemittanceComposer.tsx) — see TEMPLATES in src/pay/services/remittance-templates.ts
 * [freetext, information, invoice, quote, agreement, receipt, donation]. The
 * chosen template now auto-derives the payment type (taxability + ISO code), so
 * there is no separate type grid. This test targets the chips STRUCTURALLY (the
 * rounded-full pill class) rather than by label, so it is locale-independent
 * (the device renders Swedish: Fritext/Information/Faktura/Offert/Avtal/Kvitto/
 * Donation). Selected chip = inline backgroundColor var(--color-accent).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');
const vectors = require('../fixtures/vectors.json');

const RECIPIENT = 'fc_VWRf68zwyKGA5FUPvTT7m4fhkTgKd12omx';
const URI = `futurechain:pay?to=${RECIPIENT}&amount=${vectors.amounts.smallSaleMicroFtc}`;

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
        // #83 made the structured form the default sub-tab; switch to Paste-link for the URI textarea
        const paste = byText(/Klistra in länk|Paste link/i); if (paste) { paste.click(); await __td.sleep(500); }
        const ta = document.querySelector('textarea');
        if (!ta) return { err: 'no manual-entry textarea' };
        __td.setVal(ta, ${JSON.stringify(URI)}); await __td.sleep(700);
        const cont = byText(/Forts/i); if (cont) cont.click(); await __td.sleep(2000);

        // The RemittanceComposer template chips are rounded-full pills with the
        // chip signature class (rounded-full + whitespace-nowrap + shrink-0).
        // Re-query each call (React re-renders the form when a chip is picked).
        const chips = () => [...document.querySelectorAll('button')].filter((b) =>
          /rounded-full/.test(b.className) && /whitespace-nowrap/.test(b.className) && /shrink-0/.test(b.className));
        const isSel = (b) => !!b && /accent/.test(b.style.backgroundColor || '');

        let cs = chips();
        const count = cs.length;
        const oneSelected = cs.filter(isSel).length === 1;
        const freetextDefault = cs.length > 0 && isSel(cs[0]); // 'freetext' is first + the default opt-out
        // Tap a different (non-selected) chip and confirm the selection moves to it.
        const target = cs.find((b) => !isSel(b));
        const targetLabel = target ? (target.innerText || '').trim() : null;
        if (target) target.click();
        await __td.sleep(600);
        cs = chips();
        const moved = cs.find((b) => (b.innerText || '').trim() === targetLabel);
        const selectionMoved = isSel(moved) && !isSel(cs[0]);
        return { count, oneSelected, freetextDefault, selectionMoved, targetLabel, body: __td.bodyText(300) };
      })()`);
      if (r.err) throw new Error(r.err);
      assert.ok(r.count >= 6, 'remittance-template chips render (got ' + r.count + ') — body: ' + r.body);
      assert.ok(r.oneSelected, 'exactly one template chip is selected — got ' + r.count + ' chips');
      assert.ok(r.freetextDefault, 'Free text is the default selected template');
      assert.ok(r.selectionMoved, 'tapping another chip ("' + r.targetLabel + '") moves the selection to it');
      log(r.count + ' template chips · Free text default · tap "' + r.targetLabel + '" → selected');
      // leave the app on a neutral screen for the next scenario
      await s.eval('(async () => { for (let i = 0; i < 4; i++) { await __td.clickText(/Tillbaka|Avbryt|Back/i, 300); } return 1; })()');
    } finally {
      s.close();
    }
  },
};
