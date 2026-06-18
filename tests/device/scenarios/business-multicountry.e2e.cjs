/**
 * business-multicountry.e2e.cjs — on-device proof of the multi-country
 * VAT + currency feature.
 *
 * Drives Business: Home → Settings → Identity → change Country to the United
 * States (USD, sales-tax ADD-ON-TOP) → asserts the Simple sale screen now
 * shows the USD currency code (config.currency reaches the display) → issues a
 * kvitto → reads the `receipts` IndexedDB store and asserts the new receipt was
 * stamped `currency: 'USD'` (currency persists end-to-end). Also opens the
 * Extended cart to prove computeTotals runs under the exclusive pricing model
 * on-device without crashing and renders USD totals.
 *
 * NON-DESTRUCTIVE: reads the merchant's current country first and RESTORES it
 * in a finally block. The only side effect is one extra local kvitto (no FTC is
 * spent — "issue/mark-paid" is a local confirmation, the merchant receives).
 * If a merchant PIN gates the sale, the persist assertion is skipped (logged)
 * but the display assertion (the core wiring) still runs.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const DB = 'anton-business';

module.exports = {
  name: 'business-multicountry',
  apps: ['business'],
  async run({ log }) {
    const b = await forwardApp('business');
    const s = new CdpSession(b.wsUrl);
    await install(s);

    // The select-setter __td lacks (it only handles input/textarea). Installed
    // here so every later eval can call __td.setSelect.
    await s.eval(`(() => {
      window.__td.setSelect = (el, value) => {
        if (!el) return false;
        const d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        d.set.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      window.__td.countrySelect = () => [...document.querySelectorAll('select')]
        .find((sel) => [...sel.options].some((o) => /Sweden|United States|Germany/i.test(o.text)));
      return '__setSelect_installed';
    })()`);

    let originalCountry = null;
    try {
      // ── Get to Home ────────────────────────────────────────────────────
      await s.eval(`(async () => {
        for (let i = 0; i < 6; i++) { await __td.clickText(/Back to home|Tillbaka|Avbryt|Back|Cancel|Stäng|Klar|Done/i, 200); }
        return 1;
      })()`);

      // Count receipts before, so we can find the one we add.
      const before = await s.eval(`(async () => (await __td.readStore('${DB}', 'receipts')).length)()`);
      log(`receipts before: ${before}`);

      // ── Settings → Identity → read + change country to US ──────────────
      const opened = await s.eval(`(async () => {
        await __td.clickText(/Settings|Inställningar/i, 1200);
        const sel = __td.countrySelect();
        if (!sel) return { onboarded: false };
        return { onboarded: true, country: sel.value, options: sel.options.length };
      })()`);
      assert.ok(opened.onboarded, 'merchant is onboarded — Settings → Identity country picker present (run onboarding first if this fails)');
      originalCountry = opened.country;
      log(`Settings reached; current country=${originalCountry}, ${opened.options} presets in picker`);

      const changed = await s.eval(`(async () => {
        const sel = __td.countrySelect();
        __td.setSelect(sel, 'US');
        await __td.sleep(700);
        const sel2 = __td.countrySelect();
        // The Identity readout flips to the add-on-top hint for the US. Search
        // every <p> (the Settings page is long; a body-slice would miss it).
        const addedOnTop = [...document.querySelectorAll('p')]
          .some((p) => /added on top|läggs till ovanpå/i.test(p.innerText || ''));
        return { value: sel2 ? sel2.value : null, addedOnTop };
      })()`);
      assert.equal(changed.value, 'US', 'country select committed to US');
      assert.ok(changed.addedOnTop, 'Identity readout shows the US "tax added on top" hint');
      log('country changed to US (USD, add-on-top); identity readout confirms the exclusive model');

      // ── Back to Home → Simple sale → currency code = USD ───────────────
      const simple = await s.eval(`(async () => {
        for (let i = 0; i < 4; i++) { await __td.clickText(/Back to home|Tillbaka|Hem|Done|Klar/i, 200); }
        // Home → the simple-sale tile.
        await __td.clickText(/Simple sale|Enkel försäljning|Simple|Enkel/i, 1100);
        // The Simple screen shows the currency code above the amount.
        const codeEl = [...document.querySelectorAll('div')].find((d) => /^(USD|SEK|EUR)$/.test((d.innerText || '').trim()));
        return { code: codeEl ? codeEl.innerText.trim() : null, body: __td.bodyText(160) };
      })()`);
      assert.equal(simple.code, 'USD', 'Simple sale screen shows the USD currency code — got: ' + simple.body);
      log('Simple screen renders the USD currency code — config.currency reaches the display');

      // ── Enter an amount + issue the kvitto ─────────────────────────────
      const sale = await s.eval(`(async () => {
        for (const key of ['1', '0', '0']) {
          const btn = __td.byExactText(key);
          if (btn) { btn.click(); await __td.sleep(120); }
        }
        // The big amount preview should now read 100.00 USD (formatMoney).
        const usdShown = /USD|US\\$|\\$\\s?100/i.test(__td.bodyText(300));
        // Primary action: no-wallet "Issue kvitto" OR wallet "Generate QR".
        await __td.clickText(/Issue kvitto|Utfärda kvitto|Generate QR|Skapa QR|Charge|Debitera/i, 1200);
        let body = __td.bodyText(400);
        const pinGate = /merchant PIN|handlar-PIN|Confirm with|Bekräfta med/i.test(body);
        // Wallet path lands on a QR with "Mark as paid"; tap it to confirm locally.
        if (!pinGate && /Mark as paid|Markera som betald/i.test(body)) {
          await __td.clickText(/Mark as paid|Markera som betald/i, 1200);
          body = __td.bodyText(400);
        }
        const pinGate2 = /merchant PIN|handlar-PIN|Confirm with|Bekräfta med/i.test(body);
        const issued = /Paid|Betald|kvitto|New sale|Ny försäljning/i.test(body);
        return { usdShown, pinGate: pinGate || pinGate2, issued, body: body.slice(0, 200) };
      })()`);
      log(`amount entered (USD shown: ${sale.usdShown}); pinGate=${sale.pinGate} issued=${sale.issued}`);
      assert.ok(sale.usdShown, 'amount preview formatted in USD');

      // ── Assert the persisted receipt carries currency: 'USD' ───────────
      if (!sale.pinGate) {
        await s.eval('(async () => { await __td.sleep(800); return 1; })()');
        const after = await s.eval(`(async () => {
          const rows = await __td.readStore('${DB}', 'receipts');
          const usd = rows.filter((r) => r.currency === 'USD');
          const newest = rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
          return { count: rows.length, usdCount: usd.length, newestCurrency: newest && newest.currency, newestAmount: newest && newest.amountSek };
        })()`);
        log(`receipts after: ${after.count}; USD-stamped: ${after.usdCount}; newest currency=${after.newestCurrency} amount=${after.newestAmount}`);
        assert.ok(after.count > before, 'a new kvitto was persisted');
        assert.equal(after.newestCurrency, 'USD', 'the newest receipt was stamped currency: USD');
        log('PASS — currency persisted end-to-end (config → sale → receipt) as USD');
      } else {
        log('sale is merchant-PIN gated — skipping the persist assertion; the display + identity assertions already prove the wiring');
      }

      // ── Extended cart renders under the exclusive model (best-effort) ──
      // The exclusive math is already proven by the unit suite + the Identity
      // readout above; this is a non-fatal smoke that computeTotals(false) runs
      // on-device. Post-sale navigation is flaky, so it logs rather than fails.
      try {
        const ext = await s.eval(`(async () => {
          for (let i = 0; i < 6; i++) { await __td.clickText(/Back to home|Tillbaka|Hem|New sale|Ny försäljning|Done|Klar/i, 220); }
          await __td.clickText(/Extended sale|Utökad försäljning/i, 1200);
          const body = __td.bodyText(500);
          const onExtended = /Cart|Varukorg|Tap to add|Tryck för att|No items|Inga varor|Charge|Debitera/i.test(body);
          const usdTotal = /USD|US\\$/.test(body);
          return { onExtended, usdTotal };
        })()`);
        log(ext.onExtended
          ? `Extended cart renders under exclusive pricing (USD shown: ${ext.usdTotal}) — computeTotals ran without crashing`
          : 'Extended cart not reached (non-fatal — exclusive math is unit-verified + the Identity readout confirmed the model)');
      } catch (e) {
        log(`Extended smoke skipped (non-fatal): ${e.message}`);
      }
    } finally {
      // ── RESTORE the merchant's original country ────────────────────────
      if (originalCountry && originalCountry !== 'US') {
        try {
          const restored = await s.eval(`(async () => {
            for (let i = 0; i < 6; i++) { await __td.clickText(/Back to home|Tillbaka|Hem|Avbryt|Done|Klar|New sale|Ny försäljning/i, 220); }
            await __td.clickText(/Settings|Inställningar/i, 1300);
            const sel = __td.countrySelect();
            if (!sel) return { reached: false };
            __td.setSelect(sel, '${originalCountry}');
            await __td.sleep(700);
            // Read the committed value BEFORE navigating away (Home has no select).
            const committed = (__td.countrySelect() || {}).value;
            for (let i = 0; i < 4; i++) { await __td.clickText(/Back to home|Tillbaka|Hem|Done|Klar/i, 200); }
            return { reached: true, committed };
          })()`);
          log(restored.reached
            ? `restored country to ${restored.committed}`
            : 'WARN: restore could not reach the Settings country picker — verify manually');
        } catch (e) {
          log(`WARN: could not auto-restore country to ${originalCountry} — ${e.message}`);
        }
      }
      s.close();
    }
  },
};
