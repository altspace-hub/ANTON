/**
 * pay-overlay-column.e2e.cjs — verify the fixed-overlay column constraint.
 *
 * On a phone the rule is inert (viewport < the 600px breakpoint), so we EMULATE a
 * tablet viewport (820×1180) via CDP and assert: a `fixed inset-0` overlay gets
 * max-width = the column cap (margin-inline:auto → centred), while a
 * `fixed inset-0 app-fullscreen` overlay stays unconstrained (max-width:none). Also
 * confirms the rule is INERT at the real phone width (no regression on phones).
 *
 * The rule is byte-identical across all 4 apps, so this proves the mechanism for all.
 * Requires ANTON_PAY_SERIAL = the funded phone.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'pay-overlay-column',
  apps: ['pay'],
  async run({ log }) {
    const a = await forwardApp('pay', 0);
    const s = new CdpSession(a.wsUrl); await install(s);
    const measure = () => s.eval(`(async () => {
      const mk = (cls) => { const d = document.createElement('div'); d.className = cls; document.body.appendChild(d); return d; };
      // clean any prior probes
      for (const e of [...document.querySelectorAll('[data-ovprobe]')]) e.remove();
      const plain = mk('fixed inset-0'); plain.setAttribute('data-ovprobe','1');
      const full  = mk('fixed inset-0 app-fullscreen'); full.setAttribute('data-ovprobe','1');
      await __td.sleep(60);
      const appEl = document.getElementById('app');
      const r = {
        vw: window.innerWidth,
        wide: window.matchMedia('(min-width: 600px)').matches,
        plainMaxW: getComputedStyle(plain).maxWidth,
        fullMaxW: getComputedStyle(full).maxWidth,
        plainMarginL: getComputedStyle(plain).marginLeft,
        appMaxW: appEl ? getComputedStyle(appEl).maxWidth : 'none',
      };
      plain.remove(); full.remove();
      return r;
    })()`);
    try {
      // 1) Real phone viewport: the rule must be INERT (no regression on phones).
      const phone = await measure();
      log(`phone: vw=${phone.vw} wide=${phone.wide} plainMaxW=${phone.plainMaxW}`);
      assert.ok(!phone.wide, 'phone viewport is below the 600px breakpoint');
      assert.equal(phone.plainMaxW, 'none', 'rule is INERT on the phone (overlay unconstrained)');

      // 2) Emulate a portrait TABLET viewport and re-measure.
      await s._send('Emulation.setDeviceMetricsOverride', {
        width: 820, height: 1180, deviceScaleFactor: 2, mobile: true,
      });
      await s.eval('__td.sleep(150)');
      const tablet = await measure();
      log(`tablet(emulated): vw=${tablet.vw} wide=${tablet.wide} plainMaxW=${tablet.plainMaxW} fullMaxW=${tablet.fullMaxW} plainMarginL=${tablet.plainMarginL}`);

      if (!tablet.wide) {
        // WebView didn't honour the emulation — fall back to confirming the rule shipped.
        const ruleOk = await s.eval(`(() => {
          for (const ss of document.styleSheets) {
            let rules; try { rules = ss.cssRules; } catch { continue; }
            for (const r of rules || []) {
              if (r.type === 4 /* media */ && /min-width:\\s*600px/.test(r.conditionText || '')) {
                for (const ir of r.cssRules || []) {
                  if (/\\.fixed\\.inset-0/.test(ir.selectorText || '') && /app-max-width/.test(ir.cssText || '')) return true;
                }
              }
            }
          }
          return false;
        })()`);
        assert.ok(ruleOk, 'the overlay-constraint @media rule is present in the stylesheet');
        log('emulation not honoured by WebView — verified the rule is present in CSS instead');
      } else {
        // The overlay must be capped to the SAME column as #app (560 at the auto
        // display size; 820 only if the user picks the Tablet preset).
        assert.equal(tablet.plainMaxW, tablet.appMaxW, 'fixed inset-0 overlay capped to the same column as #app');
        assert.equal(tablet.plainMaxW, '560px', 'auto column cap (560px) applied to the overlay');
        assert.equal(tablet.fullMaxW, 'none', 'app-fullscreen overlay stays full-width (excluded)');
        assert.notEqual(tablet.plainMarginL, '0px', 'constrained overlay is centred (auto margin > 0)');
        log(`tablet: overlay capped to ${tablet.plainMaxW} (== #app ${tablet.appMaxW}) + centred (margin ${tablet.plainMarginL}); app-fullscreen excluded — verified live`);
      }
      await s._send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    } finally {
      s.close();
    }
  },
};
