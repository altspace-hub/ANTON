/**
 * comm-reactions.e2e.cjs — emoji reaction on a chat message (single Comm phone,
 * idempotent, no network).
 *
 * Injects a fresh outbound text bubble, opens the thread, long-presses it, and
 * picks a quick-row emoji. applyReaction mutates the TARGET message's reactions
 * map locally BEFORE the 'react' wire is sent, so a self-reaction is fully
 * assertable on one phone (peer propagation needs a 2nd phone + relay — out of
 * scope). Reacts exactly once (the picker toggles), fresh id per run, cleans up.
 *
 * GOTCHAS encoded here:
 *  - The bubble's long-press uses POINTER events + onContextMenu (useLongPress),
 *    NOT touch — so __td.longPress (TouchEvent) does nothing. We dispatch a
 *    synthetic `contextmenu` MouseEvent (bubbles to React's delegated listener).
 *  - sendReaction THROWS NO_PEER_KEY unless the thread's contact has a
 *    publicKeyHex, so we react in a QR-paired thread (same picker as comm-message).
 *  - MessageActionSheet quick-row aria-labels are hard-coded English
 *    ("React with <emoji>"); ❤️/👍/etc. — no SV variant.
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone + a QR-paired contact.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const EMOJI = '👍';

module.exports = {
  name: 'comm-reactions',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    const FID = 'e2e-react-' + Date.now();
    const MARKER = 'react-fixture ' + FID;
    const put = (store, rec) => `(()=>new Promise((res,rej)=>{const r=indexedDB.open('anton-comm');r.onsuccess=()=>{const db=r.result;const tx=db.transaction(${JSON.stringify(store)},'readwrite');tx.objectStore(${JSON.stringify(store)}).put(${JSON.stringify(rec)});tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>{db.close();rej(''+tx.error)}};r.onerror=()=>rej('open')}))()`;
    const del = (store, key) => `(()=>new Promise((res)=>{const r=indexedDB.open('anton-comm');r.onsuccess=()=>{const db=r.result;const tx=db.transaction(${JSON.stringify(store)},'readwrite');tx.objectStore(${JSON.stringify(store)}).delete(${JSON.stringify(key)});tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>{db.close();res(false)}};r.onerror=()=>res(false)}))()`;

    try {
      const setup = await s.eval(`(async () => {
        const me = (() => { try { return JSON.parse(localStorage.getItem('anton-comm-identity')); } catch { return null; } })();
        const cs = await __td.readStore('anton-comm', 'contacts');
        const c = cs.find((x) => x.publicKeyHex);
        if (!c) return { err: 'no QR-paired contact (need a peer pubkey to react) — pair the two Comm phones first' };
        return { myHash: me && me.contactHash, peerHash: c.contactHash, peerName: c.displayName };
      })()`);
      if (setup.err) throw new Error(setup.err);
      if (!setup.myHash) throw new Error('could not read my own contactHash from identity');
      log('peer: ' + setup.peerName);

      const msg = { id: FID, threadHash: setup.peerHash, fromHash: setup.myHash, toHash: setup.peerHash, direction: 'out', plaintext: MARKER, status: 'sent', kind: 'text', ts: new Date().toISOString() };
      await s.eval(put('messages', msg));

      const reacted = await s.eval(`(async () => {
        for (let i = 0; i < 6; i++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150);
        const tab = document.querySelector('[aria-controls="tabpanel-chat"]'); if (tab) tab.click();
        await __td.sleep(900);
        const row = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes(${JSON.stringify(setup.peerName)}));
        if (!row) return { err: 'contact row not found in chat list' };
        row.click(); await __td.sleep(1500);
        // innermost element directly containing the marker text (the bubble text node's host)
        const node = [...document.querySelectorAll('*')].find((el) => (el.textContent || '').includes(${JSON.stringify(MARKER)}) && ![...el.children].some((ch) => (ch.textContent || '').includes(${JSON.stringify(MARKER)})));
        if (!node) return { err: 'fixture bubble did not render in the thread' };
        // long-press == contextmenu (useLongPress binds onContextMenu); bubbles to React's root listener
        node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        await __td.sleep(600);
        const rb = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === ${JSON.stringify('React with ' + EMOJI)});
        if (!rb) return { err: 'reaction quick-row not open (no "React with" button)' };
        rb.click(); await __td.sleep(900);
        return { ok: true };
      })()`);
      if (reacted.err) throw new Error(reacted.err);

      let ok = false;
      for (let i = 0; i < 6 && !ok; i++) {
        const rows = await s.eval(`__td.readStore('anton-comm', 'messages')`);
        const target = (rows || []).find((m) => m.id === FID);
        ok = !!(target && target.reactions && Array.isArray(target.reactions[EMOJI]) && target.reactions[EMOJI].includes(setup.myHash));
        if (!ok) await new Promise((r) => setTimeout(r, 500));
      }
      assert.ok(ok, `self-reaction added my contactHash to the target message reactions[${EMOJI}]`);
      log('reaction persisted to messages.reactions');
    } finally {
      await s.eval(del('messages', FID));
      s.close();
    }
  },
};
