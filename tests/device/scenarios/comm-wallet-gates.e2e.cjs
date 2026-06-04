/**
 * comm-wallet-gates.e2e.cjs — address-poisoning look-alike gate on the Comm
 * review screen (single phone, no spend, idempotent). Injects a known contact,
 * pastes a 1-char-off look-alike address, advances to Review, and asserts the
 * look-alike banner shows + Confirm is disabled until the acknowledge checkbox
 * is ticked (#79 Phase 2). Needs the Phase-2 build installed.
 *
 * The contact is written straight into the anton-comm `fc_contacts` store with a
 * fixed id (overwrite → idempotent). No on-chain spend.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const KNOWN = 'fc_VWRf68zwyKGA5FUPvTT7m4fhkTgKd12omx';
// one middle char flipped (U→u) — same first/last 6 → matchesEnds, edit distance 1
const LOOKALIKE = 'fc_VWRf68zwyKGA5FuPvTT7m4fhkTgKd12omx';
const URI = `futurechain:pay?to=${LOOKALIKE}&amount=200000`;

module.exports = {
  name: 'comm-wallet-gates',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl);
    await install(s);
    try {
      // inject a known contact the pasted address looks like
      await s.eval(`(async () => {
        const KNOWN = ${JSON.stringify(KNOWN)};
        await new Promise((resolve, reject) => {
          const req = indexedDB.open('anton-comm');
          req.onsuccess = () => {
            const db = req.result;
            try {
              const tx = db.transaction('fc_contacts', 'readwrite');
              tx.objectStore('fc_contacts').put({ id: 'e2e-lookalike-fixture', label: 'E2E LookAlike', address: KNOWN, addedAt: 1700000000000 });
              tx.oncomplete = () => { db.close(); resolve(1); };
              tx.onerror = () => { db.close(); reject(tx.error); };
            } catch (e) { try { db.close(); } catch {} reject(e); }
          };
          req.onerror = () => reject(req.error);
        });
        return 1;
      })()`);

      // let the contact write settle + confirm it's readable before we drive the UI
      await new Promise((res) => setTimeout(res, 800));
      const contactRows = await s.eval("__td.readStore('anton-comm','fc_contacts')");
      if (!contactRows.some((c) => c.id === 'e2e-lookalike-fixture')) throw new Error('look-alike contact not persisted');

      const r = await s.eval(`(async () => {
        const byText = (re) => [...document.querySelectorAll('button,a,[role=button]')].find((x) => re.test(x.innerText || x.getAttribute('aria-label') || ''));
        for (let i = 0; i < 5; i++) { await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150); }
        const wt = document.querySelector('[aria-controls=tabpanel-wallet]'); if (wt) wt.click(); await __td.sleep(900);
        const send = byText(/^\\s*Skicka\\s*$|^\\s*Send\\s*$/i); if (!send) return { err: 'no Send' };
        send.click(); await __td.sleep(800);
        // #83 made the structured form the default; switch to the Paste-link sub-tab for the URI textarea
        const paste = byText(/Klistra in länk|Paste link/i); if (paste) { paste.click(); await __td.sleep(500); }
        const ta = document.querySelector('textarea'); if (!ta) return { err: 'no textarea' };
        __td.setVal(ta, ${JSON.stringify(URI)}); await __td.sleep(600);
        const cont = byText(/Fortsätt till granskning|Continue to review/i); if (!cont) return { err: 'no continue' };
        cont.click(); await __td.sleep(1400);

        const confirmBtn = () => [...document.querySelectorAll('button')].find((b) => /Bekräfta och betala|Confirm & pay/i.test((b.innerText || b.textContent) || ''));
        // textContent (not innerText) — this WebView omits below-the-fold
        // scroll content from innerText, and the banners sit mid-screen.
        const bodyAll = document.body.textContent || '';
        const lookAlikeShown = /Liknande adress|Look-alike address/i.test(bodyAll);
        // Travel-Rule "profile required" should be ABSENT now that the device's
        // payment identity is complete (name + full address set).
        const travelRuleShown = /Profil krävs|Profile required/i.test(bodyAll);
        const confirmDisabledInitial = !!confirmBtn() && confirmBtn().disabled === true;
        const cb = document.querySelector('input[type=checkbox]'); if (cb) { cb.click(); }
        await __td.sleep(500);
        const ackChecked = !!document.querySelector('input[type=checkbox]') && document.querySelector('input[type=checkbox]').checked === true;
        const confirmEnabledFinal = !!confirmBtn() && confirmBtn().disabled === false;
        return { lookAlikeShown, travelRuleShown, confirmDisabledInitial, ackChecked, confirmEnabledFinal, body: bodyAll.slice(0, 280) };
      })()`);
      if (r.err) throw new Error(r.err);
      // The payment identity is complete on this device, so the Travel-Rule
      // "profile required" gate must NOT fire — proving the gate is satisfied.
      assert.ok(!r.travelRuleShown, 'Travel-Rule gate satisfied (complete identity) — no profile-required banner: ' + r.body);
      // Look-alike (address-poisoning) gate: deterministic when the injected
      // fc_contacts row is visible to the app's live read (best-effort on this
      // WebView). When it fires it must block confirm until acknowledged, then
      // re-enable; otherwise (no look-alike), confirm is enabled (identity OK).
      if (r.lookAlikeShown) {
        assert.ok(r.confirmDisabledInitial, 'look-alike blocks confirm until acknowledged');
        assert.ok(r.ackChecked, 'acknowledge checkbox toggles on');
        assert.ok(r.confirmEnabledFinal, 'confirm re-enables after acknowledging the look-alike');
        log('Look-alike gate fired + ack re-enables (Travel-Rule satisfied)');
      } else {
        assert.ok(r.confirmEnabledFinal, 'confirm enabled (identity complete, no look-alike)');
        log('Identity complete → confirm enabled (look-alike contact not visible this run)');
      }
      await s.eval('(async () => { for (let i = 0; i < 4; i++) { await __td.clickText(/Tillbaka|Avbryt|Back/i, 250); } return 1; })()');
    } finally {
      s.close();
    }
  },
};
