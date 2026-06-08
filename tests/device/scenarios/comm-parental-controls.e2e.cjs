/**
 * comm-parental-controls.e2e.cjs — parental controls on-device (v17).
 *
 * SAFE / non-destructive: it does NOT arm controls (that would PIN-lock the
 * funded phone's escape hatches). It verifies the two things only the real
 * device can prove:
 *   1. the v17 schema upgrade ran on the existing data — the three additive
 *      stores (parental_config / guardian_link / approval_pending) exist;
 *   2. Settings → Parental controls renders the NATIVE setup form (guardian
 *      picker + Set-a-PIN), i.e. canArmParentalControls() === true on the
 *      native build (it shows the "open the installed app" message off-native).
 *
 * The gate logic itself is covered by the 29 vitest cases. Swedish locale.
 * Requires ANTON_COMM_SERIAL = the funded phone.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-parental-controls',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    try {
      // 1) v17 migration ran — the additive parental stores exist on the real DB.
      const stores = await s.eval(`(async () => new Promise((resolve) => {
        const req = indexedDB.open('anton-comm');
        req.onsuccess = () => { const db = req.result; const names = Array.from(db.objectStoreNames); db.close(); resolve(names); };
        req.onerror = () => resolve([]);
      }))()`);
      log(`anton-comm stores: ${stores.length}`);
      for (const st of ['parental_config', 'guardian_link', 'approval_pending']) {
        assert.ok(stores.includes(st), `v17 store '${st}' exists (migration ran)`);
      }

      // 2) Open Settings → Parental controls; assert the NATIVE setup path.
      const r = await s.eval(`(async () => {
        for (let j = 0; j < 4; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 120);
        const prof = [...document.querySelectorAll('button')].find((b) => /Öppna profil|Open profile/i.test(b.getAttribute('aria-label') || ''));
        if (!prof) return { err: 'no profile button' };
        prof.click(); await __td.sleep(700);
        const row = [...document.querySelectorAll('button')].find((b) => /Föräldrakontroll|Parental controls/i.test(b.innerText || ''));
        if (!row) return { err: 'no parental-controls row in Settings' };
        row.scrollIntoView(); await __td.sleep(150); row.click(); await __td.sleep(800);
        const body = document.body.innerText;
        return {
          hasGuardianSection: /Förälder \\/ vårdnadshavare|Parent \\/ guardian/i.test(body),
          hasSetPin: /Ange en föräldra-PIN|Set a parent PIN/i.test(body),
          hasBrowserOnly: /installerade ANTON-appen|installed ANTON app/i.test(body),
          hasTurnOn: /Aktivera föräldrakontroll|Turn on parental controls/i.test(body),
        };
      })()`);
      if (r.err) throw new Error(r.err);
      assert.ok(!r.hasBrowserOnly, 'native build shows the setup form, not the browser-only message');
      assert.ok(r.hasGuardianSection, 'setup form renders the guardian picker (native path)');
      assert.ok(r.hasSetPin, 'setup form renders the Set-a-PIN section');
      assert.ok(r.hasTurnOn, 'setup form renders the Turn-on action');
      log('Parental controls: v17 stores present + native setup form renders (guardian + PIN + turn-on).');
    } finally {
      s.close();
    }
  },
};
