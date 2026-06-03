/**
 * comm-events-collab.e2e.cjs — event collaboration UI on-device (#81).
 * Single phone, no peer. Seeds an event I created (unique per-run title so
 * it can't collide with leftovers), opens EventDetailScreen, and asserts:
 *   (1) the creator action chips render (Edit / Add people),
 *   (2) the planning-notes composer persists a note to the event_notes store,
 *   (3) the Edit modal amends the event (title persists to the events store).
 *
 * Cross-device wire sync (proposals/updates from peers) is unit-tested in
 * events-collab.test.ts; this verifies the on-device UI + local persistence.
 *
 * NOTE: this WebView's innerText omits below-the-fold scroll content, so
 * assertions use textContent + element queries, never __td.bodyText.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-events-collab',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl);
    await install(s);
    const tag = 'CT' + Date.now();          // unique title for THIS run
    const evId = 'EVT' + tag;
    try {
      // Pre-clean stale test events/notes from earlier (possibly failed) runs.
      await s.eval(`(async () => {
        await new Promise((res) => {
          const req = indexedDB.open('anton-comm');
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(['events', 'event_notes'], 'readwrite');
            const evReq = tx.objectStore('events').getAll();
            evReq.onsuccess = () => {
              for (const e of (evReq.result || [])) {
                if (e && typeof e.title === 'string' && /^(CT\\d|Collab|DBG|Note DBG)/.test(e.title)) {
                  tx.objectStore('events').delete(e.id);
                }
              }
            };
            const nReq = tx.objectStore('event_notes').getAll();
            nReq.onsuccess = () => {
              for (const n of (nReq.result || [])) {
                if (n && typeof n.eventId === 'string' && /^EVT(CT\\d|COLLAB|NOTE|DBG)/i.test(n.eventId)) {
                  tx.objectStore('event_notes').delete(n.id);
                }
              }
            };
            tx.oncomplete = () => { db.close(); res(); };
            tx.onerror = () => { db.close(); res(); };
          };
          req.onerror = () => res();
        });
        return 1;
      })()`);

      // Seed an event I created, then open it via the Events list.
      const open = await s.eval(`(async () => {
        const idRaw = localStorage.getItem('anton-comm-identity');
        if (!idRaw) return { err: 'no identity on device' };
        const me = JSON.parse(idRaw).contactHash;
        await new Promise((res, rej) => {
          const req = indexedDB.open('anton-comm');
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('events', 'readwrite');
            tx.objectStore('events').put({
              id: ${JSON.stringify(evId)}, createdBy: me, title: ${JSON.stringify(tag)}, eventType: 'dinner',
              startAt: new Date(Date.now() + 86400000).toISOString(), allDay: false,
              location: 'Old Place', description: 'plan it', invitees: [me],
              rsvps: { [me]: 'going' }, myStatus: 'going',
              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), canceled: false,
            });
            tx.oncomplete = () => { db.close(); res(); };
            tx.onerror = () => { db.close(); rej(tx.error); };
          };
          req.onerror = () => rej(req.error);
        });
        for (let i = 0; i < 5; i++) { await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 120); }
        const et = document.querySelector('[aria-controls=tabpanel-events]'); if (et) et.click(); await __td.sleep(1200);
        if ((document.body.textContent || '').indexOf(${JSON.stringify(tag)}) < 0) return { err: 'seeded event not in list' };
        await __td.clickText(new RegExp(${JSON.stringify(tag)}), 1000);
        const txt = document.body.textContent || '';
        const btn = (re) => [...document.querySelectorAll('button')].some((b) => re.test(((b.innerText || b.textContent) || '').trim()));
        return {
          onDetail: txt.indexOf(${JSON.stringify(tag)}) >= 0,
          hasEdit: btn(/Redigera|Edit/),
          hasAddPeople: btn(/Lägg till personer|Add people/),
          hasNotes: !!document.querySelector('textarea[placeholder*="anteckning"],textarea[placeholder*="note"]'),
        };
      })()`);
      if (open.err) throw new Error(open.err);
      assert.ok(open.onDetail, 'opened the event detail screen');
      assert.ok(open.hasEdit, 'creator Edit chip renders');
      assert.ok(open.hasAddPeople, 'creator Add-people chip renders');
      assert.ok(open.hasNotes, 'planning-notes section renders');
      log('Detail: creator chips (Edit/Add people) + notes composer render');

      // Add a planning note → persists to event_notes under THIS event id.
      const note = await s.eval(`(async () => {
        const ta = document.querySelector('textarea[placeholder*="anteckning"],textarea[placeholder*="note"]');
        if (!ta) return { err: 'no note composer' };
        __td.setVal(ta, 'Bring the cake'); await __td.sleep(550);
        const send = [...document.querySelectorAll('button')].find((b) => /^\\s*Skicka\\s*$|^\\s*Send\\s*$/i.test(((b.innerText || b.textContent) || '').trim()));
        if (!send) return { err: 'no note send button' };
        if (send.disabled) return { err: 'note send disabled (draft not committed)' };
        send.click(); await __td.sleep(1000);
        const rows = await __td.readStore('anton-comm', 'event_notes');
        const mine = rows.filter((r) => r && r.eventId === ${JSON.stringify(evId)});
        return { count: mine.length, text: mine[0] && mine[0].text, onScreen: (document.body.textContent || '').indexOf('Bring the cake') >= 0 };
      })()`);
      if (note.err) throw new Error('note: ' + note.err);
      assert.equal(note.count, 1, 'note persisted to event_notes');
      assert.equal(note.text, 'Bring the cake', 'note text stored');
      assert.ok(note.onScreen, 'note shows in the thread');
      log('Notes: composer persists + renders a note');

      // Edit the event → title persists to the events store.
      const edit = await s.eval(`(async () => {
        const chip = [...document.querySelectorAll('button')].find((b) => /Redigera|Edit/i.test(((b.innerText || b.textContent) || '').trim()));
        if (!chip) return { err: 'no Edit chip' };
        chip.click(); await __td.sleep(700);
        const titleInput = [...document.querySelectorAll('input')].find((i) => i.value === ${JSON.stringify(tag)});
        if (!titleInput) return { err: 'no title input in edit modal' };
        __td.setVal(titleInput, ${JSON.stringify(tag + '_ed')}); await __td.sleep(400);
        const save = [...document.querySelectorAll('button')].find((b) => /^\\s*Spara\\s*$|^\\s*Save\\s*$/i.test(((b.innerText || b.textContent) || '').trim()));
        if (!save) return { err: 'no Save button' };
        save.click(); await __td.sleep(1000);
        const rows = await __td.readStore('anton-comm', 'events');
        const ev = rows.find((r) => r && r.id === ${JSON.stringify(evId)});
        return { title: ev && ev.title, onScreen: (document.body.textContent || '').indexOf(${JSON.stringify(tag + '_ed')}) >= 0 };
      })()`);
      if (edit.err) throw new Error('edit: ' + edit.err);
      assert.equal(edit.title, tag + '_ed', 'amended title persisted to events store');
      assert.ok(edit.onScreen, 'amended title shows on screen');
      log('Amend: Edit modal saves a new title');

      // Cleanup — remove the seeded event + its notes.
      await s.eval(`(async () => {
        await new Promise((res) => {
          const req = indexedDB.open('anton-comm');
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(['events', 'event_notes'], 'readwrite');
            tx.objectStore('events').delete(${JSON.stringify(evId)});
            const ix = tx.objectStore('event_notes').index('by_event').getAllKeys(${JSON.stringify(evId)});
            ix.onsuccess = () => { for (const k of ix.result) tx.objectStore('event_notes').delete(k); };
            tx.oncomplete = () => { db.close(); res(); };
            tx.onerror = () => { db.close(); res(); };
          };
          req.onerror = () => res();
        });
        for (let i = 0; i < 4; i++) { await __td.clickText(/Tillbaka|Back/i, 200); }
        return 1;
      })()`);
      log('Cleanup: seeded event + notes removed');
    } finally {
      s.close();
    }
  },
};
