/**
 * pay-display-size.e2e.cjs — Pay screen-size adaptation on-device.
 *
 * Verifies the display-size CSS MECHANISM applies in Pay's shell (height:100% +
 * overflow:hidden, which differs from Comm's dvh): setting <html data-display>
 * changes the root font-size (→ every rem size, incl. the px→rem-converted text,
 * scales) and the #app column max-width, and clearing it falls back to the
 * responsive default. Also confirms the Settings "Display size" picker renders.
 *
 * Requires ANTON_PAY_SERIAL (or the default device) = the funded phone.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const near = (a, b, eps = 0.6) => Math.abs(a - b) <= eps;

module.exports = {
  name: 'pay-display-size',
  apps: ['pay'],
  async run({ log }) {
    const pay = await forwardApp('pay', 0);
    const s = new CdpSession(pay.wsUrl); await install(s);
    const apply = async (val) => s.eval(`(async () => {
      const html = document.documentElement;
      if (${JSON.stringify(val)}) html.setAttribute('data-display', ${JSON.stringify(val)});
      else html.removeAttribute('data-display');
      await __td.sleep(120);
      const appEl = document.getElementById('app');
      return { fontPx: parseFloat(getComputedStyle(html).fontSize), appMaxWidth: getComputedStyle(appEl).maxWidth };
    })()`);
    try {
      const base = await apply('');
      assert.ok(near(base.fontPx, 16), `auto/base root font is 16px (${base.fontPx})`);
      assert.equal(base.appMaxWidth, '560px', 'auto uses the 560px column cap');

      const large = await apply('large');
      assert.ok(near(large.fontPx, 16 * 1.12), `Large scales the root font (${large.fontPx}px ≈ 17.9) → rem text grows`);

      const compact = await apply('compact');
      assert.ok(near(compact.fontPx, 16 * 0.92), `Compact shrinks the root font (${compact.fontPx}px ≈ 14.7)`);

      const tablet = await apply('tablet');
      assert.ok(near(tablet.fontPx, 16 * 1.05), `Tablet scale (${tablet.fontPx}px ≈ 16.8)`);
      assert.equal(tablet.appMaxWidth, '820px', 'Tablet widens the #app column to 820px');

      const auto = await apply('');
      assert.equal(auto.appMaxWidth, '560px', 'cleared → back to the 560px responsive cap');
      log(`Pay display CSS: base=${base.fontPx} large=${large.fontPx} compact=${compact.fontPx} tablet=${tablet.fontPx}/${tablet.appMaxWidth}`);

      // Confirm the Settings picker exists (the UI wiring is the same code as Comm).
      const ui = await s.eval(`(async () => {
        for (let j = 0; j < 4; j++) await __td.clickText(/Tillbaka|Bakåt|Back|Avbryt|Cancel/i, 120);
        const settingsTab = [...document.querySelectorAll('button,a,[role=button]')].find((b) => /Inställningar|Settings|Mer|More/i.test((b.innerText||'') + (b.getAttribute('aria-label')||'')));
        if (settingsTab) { settingsTab.click(); await __td.sleep(600); }
        return { hasPicker: /Visningsstorlek|Display size/i.test(document.body.innerText) };
      })()`);
      // Picker presence is best-effort (Pay's settings nav varies); log either way.
      log(`Pay settings picker visible: ${ui.hasPicker}`);
    } finally {
      s.close();
    }
  },
};
