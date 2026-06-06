/**
 * comm-payreq.e2e.cjs — Wave-2 payment requests on the funded phone (no money moves).
 *
 *  1. RECEIVE/RENDER: inject a received payment_request bubble from a contact → open
 *     the chat → assert the amount + note + a "Pay" button render.
 *  2. PAY HANDOFF: tap Pay → assert it switches to the Wallet tab (the wallet's own
 *     review/PIN flow then guards the actual send — we never confirm a payment).
 *  3. INVALID: inject a malformed-amount request → assert "Invalid payment request" +
 *     NO Pay button.
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone (Swedish locale).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-payreq',
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
        if (!contacts.length) return { err: 'no contacts' };
        const target = contacts[0];

        const putMsg = (rec) => new Promise((resolve, reject) => {
          const req = indexedDB.open('anton-comm');
          req.onsuccess = () => { const db = req.result; const tx = db.transaction('messages', 'readwrite'); tx.objectStore('messages').put(rec); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; };
          req.onerror = () => reject(req.error);
        });
        // A valid received request (2.5 FTC) + an invalid one (garbage amount).
        await putMsg({ id: 'PR-OK', threadHash: target.contactHash, fromHash: target.contactHash, toHash: 'me', direction: 'in', status: 'received', kind: 'payment_request', ts: new Date(Date.now() - 1000).toISOString(), plaintext: JSON.stringify({ requestId: 'q1', amountMicroFtc: '2500000', note: 'dinner split', requesterAddress: 'fc_TESTADDR123456' }) });
        await putMsg({ id: 'PR-BAD', threadHash: target.contactHash, fromHash: target.contactHash, toHash: 'me', direction: 'in', status: 'received', kind: 'payment_request', ts: new Date().toISOString(), plaintext: JSON.stringify({ requestId: 'q2', amountMicroFtc: 'not-a-number', requesterAddress: 'fc_TESTADDR123456' }) });
        await __td.sleep(250);

        // Open the contact chat.
        const rows = [...document.querySelectorAll('button')].filter((b) => (b.innerText || '').includes(target.displayName));
        const row = rows.find((b) => b.querySelector('*')) || rows[0];
        if (!row) return { err: 'contact row not found' };
        row.click(); await __td.sleep(900);

        const body = document.body.innerText || '';
        const showsAmount = /2\\.5\\s*FTC/.test(body);
        const showsNote = body.includes('dinner split');
        const showsInvalid = /Ogiltig betalningsbegäran|Invalid payment request/i.test(body);
        const payBtns = [...document.querySelectorAll('button')].filter((b) => /^(Betala|Pay) /i.test((b.innerText || '').trim()));
        const payBtnCount = payBtns.length; // should be exactly 1 (valid req only)

        // Tap Pay → should switch to the Wallet tab.
        let walletActive = null;
        if (payBtns[0]) {
          payBtns[0].click(); await __td.sleep(1200);
          const walletTab = document.querySelector('[aria-controls="tabpanel-wallet"]');
          walletActive = walletTab ? walletTab.getAttribute('aria-selected') === 'true' : null;
        }

        return { showsAmount, showsNote, showsInvalid, payBtnCount, walletActive };
      })()`);
      if (r.err) throw new Error(`${r.err} ${JSON.stringify(r)}`);
      assert.ok(r.showsAmount, 'valid request renders the amount (2.5 FTC)');
      assert.ok(r.showsNote, 'request note renders');
      assert.ok(r.showsInvalid, 'a malformed-amount request renders "Invalid payment request"');
      assert.equal(r.payBtnCount, 1, 'exactly ONE Pay button (valid request only; invalid has none)');
      if (r.walletActive !== null) assert.ok(r.walletActive, 'tapping Pay switches to the Wallet tab (review/PIN guards the real send)');
      log(`amount=${r.showsAmount} note=${r.showsNote} invalidShown=${r.showsInvalid} payButtons=${r.payBtnCount} walletActive=${r.walletActive}`);
    } finally {
      s.close();
    }
  },
};
