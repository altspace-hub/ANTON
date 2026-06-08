/**
 * comm-display-size.e2e.cjs — screen-size adaptation on-device.
 *
 * Drives the Settings "Display size" picker and asserts each preset applies its
 * scale + column on the real WebView: the <html> root font-size changes (which is
 * what scales every rem-based size — incl. the chat text now converted to rem),
 * the data-display attribute + localStorage persist, the #app max-width reflects
 * the column cap, and 'Auto' clears back to the responsive default.
 *
 * Requires ANTON_COMM_SERIAL = the funded phone (Swedish locale).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const near = (a, b, eps = 0.6) => Math.abs(a - b) <= eps;

module.exports = {
  name: 'comm-display-size',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    // Tap the display-size row by its exact first-line label (Swedish device), then probe.
    const probe = async (label) => s.eval(`(async () => {
      ${label ? `{ const b = __td.byExactText(${JSON.stringify(label)}); if (b) b.click(); await __td.sleep(600); }` : ''}
      const html = document.documentElement;
      const appEl = document.getElementById('app');
      return {
        attr: html.getAttribute('data-display'),
        fontPx: parseFloat(getComputedStyle(html).fontSize),
        appMaxWidth: getComputedStyle(appEl).maxWidth,
        stored: __td.ls('anton-comm-display'),
      };
    })()`);
    try {
      // Open Settings → Appearance (the display picker lives there).
      const open = await s.eval(`(async () => {
        for (let j = 0; j < 4; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 120);
        const prof = [...document.querySelectorAll('button')].find((b) => /Öppna profil|Open profile/i.test(b.getAttribute('aria-label') || ''));
        if (!prof) return { err: 'no profile button' };
        prof.click(); await __td.sleep(700);
        return { hasPicker: /Visningsstorlek|Display size/i.test(document.body.innerText) };
      })()`);
      if (open.err) throw new Error(open.err);
      assert.ok(open.hasPicker, 'the Display size picker is in Settings');

      const base = await probe('');
      log(`baseline: font=${base.fontPx}px attr=${base.attr}`);

      // Large → scale 1.12 → ~17.9px root font; rem text (incl. chat) grows with it.
      const large = await probe('Stor');
      assert.ok(near(large.fontPx, 16 * 1.12), `Large scales the root font (${large.fontPx}px ≈ 17.9)`);
      assert.equal(large.attr, 'large', 'data-display=large applied');
      assert.equal(large.stored, 'large', 'persisted to localStorage');

      // Compact → scale 0.92 → ~14.7px.
      const compact = await probe('Kompakt');
      assert.ok(near(compact.fontPx, 16 * 0.92), `Compact shrinks the root font (${compact.fontPx}px ≈ 14.7)`);
      assert.equal(compact.attr, 'compact', 'data-display=compact applied');

      // Tablet → scale 1.05 + a wider 820px column cap.
      const tablet = await probe('Surfplatta');
      assert.ok(near(tablet.fontPx, 16 * 1.05), `Tablet scale (${tablet.fontPx}px ≈ 16.8)`);
      assert.equal(tablet.appMaxWidth, '820px', 'Tablet widens the #app column cap to 820px');

      // Auto → clears the attribute, back to 16px + the 560px responsive cap.
      const auto = await probe('Automatisk');
      assert.equal(auto.attr, null, 'Auto removes the data-display attribute');
      assert.ok(near(auto.fontPx, 16), `Auto restores the base font (${auto.fontPx}px)`);
      assert.equal(auto.appMaxWidth, '560px', 'Auto uses the 560px responsive column cap');

      log(`display size: Large=${large.fontPx} Compact=${compact.fontPx} Tablet=${tablet.fontPx}/${tablet.appMaxWidth} Auto=${auto.fontPx}/${auto.appMaxWidth}`);
    } finally {
      s.close();
    }
  },
};
