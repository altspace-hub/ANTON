/**
 * comm-search.e2e.cjs — Wave-2 chat search on the funded phone.
 *
 * Seeds a couple of text messages into an existing thread, opens search from the
 * Chat-tab header, types a query, and asserts both a CHAT name match and a MESSAGE
 * content match render + that tapping a message result opens the thread.
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone (Swedish locale).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const NEEDLE = 'zebrafish';

module.exports = {
  name: 'comm-search',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    try {
      const r = await s.eval(`(async () => {
        let tab = null;
        for (let i = 0; i < 12 && !tab; i++) {
          for (let j = 0; j < 3; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150);
          tab = document.querySelector('[aria-controls="tabpanel-chat"]');
          if (!tab) await __td.sleep(400);
        }
        if (!tab) return { err: 'chat tab never appeared' };
        tab.click(); await __td.sleep(600);

        const contacts = await __td.readStore('anton-comm', 'contacts');
        if (!contacts.length) return { err: 'no contacts to seed a message into' };
        const target = contacts[0];

        // Seed a searchable text message into that thread (idempotent).
        const putMsg = (rec) => new Promise((resolve, reject) => {
          const req = indexedDB.open('anton-comm');
          req.onsuccess = () => { const db = req.result; const tx = db.transaction('messages', 'readwrite'); tx.objectStore('messages').put(rec); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; };
          req.onerror = () => reject(req.error);
        });
        await putMsg({
          id: 'SEARCH-E2E-1', threadHash: target.contactHash, fromHash: target.contactHash, toHash: 'me',
          direction: 'in', plaintext: 'remember the ' + ${JSON.stringify(NEEDLE)} + ' migration plan', ts: new Date().toISOString(),
          status: 'received', kind: 'text',
        });
        await __td.sleep(250);

        // Open search from the Chat header (aria-label = Sök / Search).
        const searchBtn = [...document.querySelectorAll('button')].find((b) => /^(Sök|Search)$/.test(b.getAttribute('aria-label') || ''));
        if (!searchBtn) return { err: 'search button not found in chat header' };
        searchBtn.click(); await __td.sleep(600);

        const input = document.querySelector('input');
        if (!input) return { err: 'search input not found' };
        __td.setVal(input, ${JSON.stringify(NEEDLE)}); await __td.sleep(700);

        const bodyText = document.body.innerText || '';
        const messageHit = bodyText.includes(${JSON.stringify(NEEDLE)});

        // Also test a CHAT name match: type the contact's name.
        __td.setVal(input, target.displayName.slice(0, Math.max(2, target.displayName.length))); await __td.sleep(600);
        const chatHit = (document.body.innerText || '').includes(target.displayName);

        // Tap the message result (re-query the needle) → should open the thread.
        __td.setVal(input, ${JSON.stringify(NEEDLE)}); await __td.sleep(700);
        const resultBtn = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes(${JSON.stringify(NEEDLE)}));
        let openedThread = false;
        if (resultBtn) { resultBtn.click(); await __td.sleep(800); openedThread = (document.body.innerText || '').includes(target.displayName) && !!document.querySelector('textarea'); }

        return { name: target.displayName, messageHit, chatHit, openedThread };
      })()`);
      if (r.err) throw new Error(`${r.err} ${JSON.stringify(r)}`);
      assert.ok(r.messageHit, 'a message-content match renders the snippet with the needle');
      assert.ok(r.chatHit, 'a chat name match renders the contact');
      assert.ok(r.openedThread, 'tapping a message result opens that thread (composer visible)');
      log(`messageHit=${r.messageHit} chatHit=${r.chatHit} openedThread=${r.openedThread} (${r.name})`);
    } finally {
      s.close();
    }
  },
};
