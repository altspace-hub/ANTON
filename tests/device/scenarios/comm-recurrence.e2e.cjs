/**
 * comm-recurrence.e2e.cjs — Wave-2 recurring events on the funded phone.
 *
 * Injects a PAST weekly event created by me, opens the Events tab (which rolls my
 * passed recurring events forward), and asserts the event's startAt advanced to the
 * future and "Repeats weekly" renders on the detail.
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone (Swedish locale).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const TITLE = 'E2E Weekly Training';

module.exports = {
  name: 'comm-recurrence',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    try {
      const r = await s.eval(`(async () => {
        const me = (() => { try { return JSON.parse(localStorage.getItem('anton-comm-identity')); } catch { return null; } })();
        if (!me) return { err: 'no identity' };

        // Inject a PAST weekly event I created.
        const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
        const putEvent = (rec) => new Promise((resolve, reject) => {
          const req = indexedDB.open('anton-comm');
          req.onsuccess = () => { const db = req.result; const tx = db.transaction('events', 'readwrite'); tx.objectStore('events').put(rec); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; };
          req.onerror = () => reject(req.error);
        });
        await putEvent({
          id: 'E2E-RECUR-1', createdBy: me.contactHash, title: ${JSON.stringify(TITLE)}, eventType: 'concert',
          startAt: past, allDay: false, invitees: [], rsvps: { [me.contactHash]: 'going' }, myStatus: 'going',
          createdAt: past, updatedAt: past, canceled: false, recurrence: 'weekly',
        });
        await __td.sleep(250);

        // Open the Events tab → triggers rollRecurringEvents on mount.
        let tab = null;
        for (let i = 0; i < 12 && !tab; i++) {
          for (let j = 0; j < 3; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150);
          tab = document.querySelector('[aria-controls="tabpanel-events"]');
          if (!tab) await __td.sleep(400);
        }
        if (!tab) return { err: 'events tab never appeared' };
        tab.click(); await __td.sleep(1200);

        // Re-read the event — startAt should now be in the future.
        const events = await __td.readStore('anton-comm', 'events');
        const rolled = events.find((e) => e.id === 'E2E-RECUR-1');
        if (!rolled) return { err: 'event vanished' };
        const isFuture = new Date(rolled.startAt).getTime() > Date.now();

        // Open its detail → "Repeats weekly" should render.
        const card = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes(${JSON.stringify(TITLE)}));
        let repeatsShown = null;
        if (card) { card.click(); await __td.sleep(700); repeatsShown = /Upprepas varje vecka|Repeats weekly/i.test(document.body.innerText || ''); }

        return { isFuture, startAt: rolled.startAt, recurrence: rolled.recurrence, rsvpKeys: Object.keys(rolled.rsvps || {}), repeatsShown };
      })()`);
      if (r.err) throw new Error(`${r.err} ${JSON.stringify(r)}`);
      assert.ok(r.isFuture, 'the passed weekly event rolled forward to a FUTURE occurrence');
      assert.equal(r.recurrence, 'weekly', 'recurrence preserved through the roll');
      if (r.repeatsShown !== null) assert.ok(r.repeatsShown, '"Repeats weekly" renders on the detail');
      log(`rolled→future=${r.isFuture} recurrence=${r.recurrence} rsvps=[${r.rsvpKeys.join(',')}] repeatsShown=${r.repeatsShown}`);
    } finally {
      s.close();
    }
  },
};
