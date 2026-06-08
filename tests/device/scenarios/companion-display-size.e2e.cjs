/**
 * companion-display-size.e2e.cjs — Companion app screen-size adaptation on-device.
 *
 * Verifies the display-size CSS mechanism in the companion's shell: setting
 * <html data-display> scales BOTH the root font-size (→ rem text + the
 * inline-fontSize→rem conversions) AND the body base font (14px pro / 16px
 * standard, multiplied by --app-scale), and sets the #app column max-width.
 * Clearing it falls back to the responsive default. Also confirms the Settings
 * "Display size" picker renders.
 *
 * Requires ANTON_COMPANION_SERIAL = the funded phone.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const near = (a, b, eps = 0.6) => Math.abs(a - b) <= eps;

module.exports = {
  name: 'companion-display-size',
  apps: ['companion'],
  async run({ log }) {
    const c = await forwardApp('companion', 0);
    const s = new CdpSession(c.wsUrl); await install(s);
    const apply = async (val) => s.eval(`(async () => {
      const html = document.documentElement;
      if (${JSON.stringify(val)}) html.setAttribute('data-display', ${JSON.stringify(val)});
      else html.removeAttribute('data-display');
      await __td.sleep(120);
      const appEl = document.getElementById('app');
      return {
        htmlPx: parseFloat(getComputedStyle(html).fontSize),
        bodyPx: parseFloat(getComputedStyle(document.body).fontSize),
        appMaxWidth: getComputedStyle(appEl).maxWidth,
      };
    })()`);
    try {
      const base = await apply('');
      assert.ok(near(base.htmlPx, 16), `base root font 16px (${base.htmlPx})`);
      assert.equal(base.appMaxWidth, '560px', 'auto uses the 560px column cap');
      const baseBody = base.bodyPx; // 14 (pro) or 16 (standard)
      log(`base: html=${base.htmlPx} body=${baseBody} maxW=${base.appMaxWidth}`);

      const large = await apply('large');
      assert.ok(near(large.htmlPx, 16 * 1.12), `Large scales the root font (${large.htmlPx}px ≈ 17.9)`);
      assert.ok(near(large.bodyPx, baseBody * 1.12, 0.7), `Large scales the body base too (${large.bodyPx} ≈ ${(baseBody * 1.12).toFixed(1)})`);

      const compact = await apply('compact');
      assert.ok(near(compact.htmlPx, 16 * 0.92), `Compact shrinks the root font (${compact.htmlPx}px ≈ 14.7)`);
      assert.ok(near(compact.bodyPx, baseBody * 0.92, 0.7), `Compact shrinks the body base (${compact.bodyPx} ≈ ${(baseBody * 0.92).toFixed(1)})`);

      const tablet = await apply('tablet');
      assert.ok(near(tablet.htmlPx, 16 * 1.05), `Tablet scale (${tablet.htmlPx}px ≈ 16.8)`);
      assert.equal(tablet.appMaxWidth, '820px', 'Tablet widens the #app column to 820px');

      const auto = await apply('');
      assert.equal(auto.appMaxWidth, '560px', 'cleared → 560px responsive cap');
      assert.ok(near(auto.htmlPx, 16), 'cleared → 16px root font');
      log(`Companion display CSS: large html=${large.htmlPx}/body=${large.bodyPx}, tablet ${tablet.htmlPx}/${tablet.appMaxWidth}`);

      // Confirm the Settings "Display size" picker renders (Pro or Standard).
      const ui = await s.eval(`(async () => {
        for (let j = 0; j < 4; j++) await __td.clickText(/Back|Tillbaka|Close|Cancel/i, 120);
        const settings = [...document.querySelectorAll('button,a,[role=button]')].find((b) => /Settings|Inställningar/i.test((b.innerText||'') + (b.getAttribute('aria-label')||'')));
        if (settings) { settings.click(); await __td.sleep(700); }
        return { hasPicker: /Display size/i.test(document.body.innerText) };
      })()`);
      log(`Companion settings picker visible: ${ui.hasPicker}`);
    } finally {
      s.close();
    }
  },
};
