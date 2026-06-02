/**
 * pay-tax-residency.e2e.cjs — Settings → Tax residency (single phone, idempotent).
 * Opens Settings, taps the Tax residency row, picks a country in the shared
 * picker, and asserts the Settings card subtitle now reflects the choice.
 *
 * Why a DOM readback (not an IDB assert): on a real device the residency is
 * stored in the native Keystore tier, NOT the web `anton-pay-secure` IDB store,
 * so `__td.readStore` can't see it. The Settings subtitle is the device-correct
 * oracle. Re-runs just re-pick the same country — idempotent. No spend.
 *
 * Requires the build that ships task #75 (the Tax residency row). Against an
 * older installed APK this fails at "opened Settings → Tax residency" — expected
 * until the new Pay build is installed.
 *
 * Strings: the new tax.* / settings.taxResidency keys are English-only so far,
 * so they render in English even on the Swedish phone (i18next fallback); the
 * picker's country names are hardcoded English. Hence the English matchers.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const COUNTRY = 'Sweden';

module.exports = {
  name: 'pay-tax-residency',
  apps: ['pay'],
  async run({ log }) {
    const pay = await forwardApp('pay');
    const s = new CdpSession(pay.wsUrl);
    await install(s);
    try {
      const r = await s.eval(`(async () => {
        const byText = (re) => [...document.querySelectorAll('button,a,[role=button]')].find((x) => re.test(x.innerText || x.getAttribute('aria-label') || ''));
        const findGear = () => [...document.querySelectorAll('[aria-label]')].find((e) => /Inställningar|Settings/i.test(e.getAttribute('aria-label') || ''));
        // resume-robust: get to home, open Settings, find + open the Tax residency row
        let gear = null;
        for (let i = 0; i < 12 && !gear; i++) {
          for (let j = 0; j < 3; j++) { await __td.clickText(/Tillbaka|Avbryt|Back/i, 150); }
          gear = findGear();
          if (!gear) await __td.sleep(500);
        }
        if (!gear) return { err: 'home settings gear never appeared' };

        let onPicker = false;
        for (let attempt = 0; attempt < 4 && !onPicker; attempt++) {
          (findGear() || gear).click(); await __td.sleep(900);
          const row = byText(/Tax residency|Skatteh/i); if (row) { row.click(); await __td.sleep(1000); }
          // the picker carries its declared-residency disclaimer + a search box
          onPicker = /declared, not inferred|Refer to adviser|Supported/i.test(__td.bodyText(800));
          if (!onPicker) { for (let j = 0; j < 3; j++) { await __td.clickText(/Tillbaka|Avbryt|Back/i, 150); } }
        }
        if (!onPicker) return { err: 'could not open the Tax residency picker' };

        // pick the country, then we land back on Settings
        const pick = byText(new RegExp('^\\\\s*' + ${JSON.stringify(COUNTRY)} + '\\\\s*$', 'i'))
                  || [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes(${JSON.stringify(COUNTRY)}));
        if (!pick) return { err: 'country row not found: ' + ${JSON.stringify(COUNTRY)} };
        pick.click(); await __td.sleep(1300);

        // back on Settings — the Tax residency card subtitle now shows the country
        const settingsBody = __td.bodyText(2000);
        const backOnSettings = /Tax residency|Skatteh/i.test(settingsBody);
        const reflectsChoice = settingsBody.includes(${JSON.stringify(COUNTRY)});
        return { backOnSettings, reflectsChoice, sample: settingsBody.slice(0, 400) };
      })()`);
      if (r.err) throw new Error(r.err);
      assert.ok(r.backOnSettings, 'returned to Settings after declaring — got: ' + r.sample);
      assert.ok(r.reflectsChoice, `Settings Tax residency card reflects "${COUNTRY}" — got: ` + r.sample);
      log(`declared + reflected on Settings: ${COUNTRY}`);
      // leave the app on a neutral screen for the next scenario
      await s.eval('(async () => { for (let i = 0; i < 4; i++) { await __td.clickText(/Tillbaka|Avbryt|Back/i, 250); } return 1; })()');
    } finally {
      s.close();
    }
  },
};
