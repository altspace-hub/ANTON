/**
 * comm-events.e2e.cjs — create a local event (single Comm phone, idempotent).
 * Opens the Events tab and, if the fixture event isn't already there, creates
 * one (only the title needs filling — the type defaults to "dinner" and the
 * date is pre-filled), then asserts the persisted `events` row. Re-runs are
 * no-ops (event already present). No network, no spend.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const EVENT_TITLE = 'E2E Fixture Dinner';

module.exports = {
  name: 'comm-events',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0); // funded Comm phone (ANTON_COMM_SERIAL)
    const s = new CdpSession(comm.wsUrl);
    await install(s);
    try {
      const r = await s.eval(`(async () => {
        const byAria = (re) => [...document.querySelectorAll('button,[role=button]')].find((b) => re.test(b.getAttribute('aria-label') || ''));
        // Resume-robust: reset to a known screen, then open the Events tab.
        let eventsTab = null;
        for (let i = 0; i < 12 && !eventsTab; i++) {
          for (let j = 0; j < 3; j++) { await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150); }
          eventsTab = document.querySelector('[aria-controls="tabpanel-events"]');
          if (!eventsTab) await __td.sleep(500);
        }
        if (!eventsTab) return { err: 'events tab never appeared (app not resumed?)' };
        eventsTab.click(); await __td.sleep(900);

        const had = (await __td.readStore('anton-comm', 'events')).some((e) => (e.title || '') === ${JSON.stringify(EVENT_TITLE)});
        if (!had) {
          const add = byAria(/Create event|Skapa händelse/i);
          if (!add) return { err: 'create-event (+) button not found' };
          add.click(); await __td.sleep(900);
          const ta = [...document.querySelectorAll('input,textarea')].find((el) => /Vad är tillfället|occasion/i.test(el.getAttribute('placeholder') || ''))
                  || document.querySelector('input[type=text]');
          if (!ta) return { err: 'event title input not found' };
          __td.setVal(ta, ${JSON.stringify(EVENT_TITLE)}); await __td.sleep(400);
          // submit — "Create"/"Skapa" exactly (not the "+" tab button, not a type chip)
          const create = [...document.querySelectorAll('button')].find((b) => /^(Create|Skapa)$/i.test((b.innerText || '').trim()) && !b.disabled);
          if (!create) return { err: 'create submit button not found' };
          create.click(); await __td.sleep(1700);
        }
        const rows = await __td.readStore('anton-comm', 'events');
        const row = rows.find((e) => (e.title || '') === ${JSON.stringify(EVENT_TITLE)});
        return { alreadyExisted: had, found: !!row, type: row ? row.eventType : null, count: rows.length };
      })()`);
      if (r.err) throw new Error(r.err);
      assert.ok(r.found, 'fixture event persisted to the events store');
      assert.equal(r.type, 'dinner', 'event saved with the default type');
      log(`event ${r.alreadyExisted ? 'present' : 'created'} (type ${r.type}, ${r.count} events)`);
    } finally {
      s.close();
    }
  },
};
