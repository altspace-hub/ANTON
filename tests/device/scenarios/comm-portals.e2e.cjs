/**
 * comm-portals.e2e.cjs — Portals tab renders + is interactive (single Comm
 * phone, no network, idempotent pure-read).
 *
 * Portals is NOT a chat wire — discovery/visit/invoke are plain HTTPS to a
 * relay + publisher origin, so the only robustly-offline assertion is that the
 * surface MOUNTS: the title, the search input, and the primary verb-filter
 * chips all render before any fetch resolves (the offline-error branch and a
 * legitimate empty result render the same empty card). Visiting/invoking a
 * portal needs a live relay and is intentionally out of scope here.
 *
 * GOTCHA: there is NO id="tabpanel-portals" element — App.tsx never sets it.
 * The tab is located ONLY via the tab BUTTON's aria-controls attribute. The
 * screen is React.lazy, so we sleep after the click before asserting.
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-portals',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    try {
      const r = await s.eval(`(async () => {
        let tab = null;
        for (let i = 0; i < 12 && !tab; i++) {
          for (let j = 0; j < 3; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150);
          tab = document.querySelector('[aria-controls="tabpanel-portals"]');
          if (!tab) await __td.sleep(400);
        }
        if (!tab) return { err: 'portals tab never appeared (app not resumed?)' };
        tab.click(); await __td.sleep(1300); // React.lazy Suspense + 250ms debounced search + offline fetch reject

        const hasSearch = [...document.querySelectorAll('input')].some((el) => /Search by name, tag or area|Sök efter namn, tagg eller område/.test(el.getAttribute('placeholder') || ''));
        const verbRe = /^(Contact|Kontakta|Book|Boka|Order|Beställ|Inquire|Fråga|Request|Begär|Pay|Betala)$/;
        const chipCount = [...document.querySelectorAll('button')].filter((b) => verbRe.test((b.innerText || '').trim())).length;
        const body = document.body.innerText;
        const hasTitle = /Portals|Portaler/.test(body);
        const emptyState = /No portals found|Inga portaler hittades/.test(body);
        return { hasSearch, chipCount, hasTitle, emptyState };
      })()`);
      if (r.err) throw new Error(r.err);
      assert.ok(r.hasTitle, 'Portals title rendered');
      assert.ok(r.hasSearch, 'Portals search input rendered (screen mounted, not just a spinner)');
      assert.ok(r.chipCount >= 6, `>=6 primary verb-filter chips rendered (got ${r.chipCount})`);
      log(`portals tab mounted: search=${r.hasSearch} verbChips=${r.chipCount} state=${r.emptyState ? 'empty' : 'results/loading'}`);
    } finally {
      s.close();
    }
  },
};
