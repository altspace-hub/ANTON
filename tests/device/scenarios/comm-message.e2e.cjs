/**
 * comm-message.e2e.cjs — two-phone E2E chat round-trip. Alice opens her first
 * messageable contact (one with a public key, i.e. QR-paired), sends a message
 * with a unique marker, and we poll Bob's IndexedDB `messages` store until the
 * inbound row arrives. Rerunnable (fresh marker each run). Requires the two
 * Comm phones to already be paired (ANTON_COMM_SERIAL + _B).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-message',
  apps: ['comm'],
  async run({ log }) {
    const marker = 'e2e-' + Date.now();
    const alice = await forwardApp('comm', 0);
    const bob = await forwardApp('comm', 1);
    const as = new CdpSession(alice.wsUrl); await install(as);
    const bs = new CdpSession(bob.wsUrl); await install(bs);
    try {
      const peer = await as.eval(`(async () => {
        const cs = await __td.readStore('anton-comm', 'contacts');
        const c = cs.find((x) => x.publicKeyHex);
        return c ? { hash: c.contactHash, name: c.displayName } : null;
      })()`);
      if (!peer) throw new Error('Alice has no messageable (QR-paired) contact — pair the two Comm phones first');
      log('peer: ' + peer.name);

      const sent = await as.eval(`(async () => {
        for (let i = 0; i < 4; i++) { await __td.clickText(/Tillbaka|Back/i, 250); }
        await __td.clickText(/Chatt|Chats?/i, 800);
        const btn = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes(${JSON.stringify(peer.name)}));
        if (!btn) return { err: 'contact row not found for ' + ${JSON.stringify(peer.name)} };
        btn.click(); await __td.sleep(1500);
        const ta = document.querySelector('textarea'); if (!ta) return { err: 'no composer textarea' };
        __td.setVal(ta, 'hello ' + ${JSON.stringify(marker)}); await __td.sleep(400);
        const send = [...document.querySelectorAll('button,[role=button]')].find((b) => /skicka|send/i.test((b.innerText || b.getAttribute('aria-label') || '')));
        if (send) send.click(); else ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        await __td.sleep(1500);
        return { ok: true };
      })()`);
      if (sent.err) throw new Error('Alice send: ' + sent.err);

      let got = null;
      for (let i = 0; i < 10 && !got; i++) {
        const rows = await bs.eval("__td.readStore('anton-comm', 'messages')");
        got = rows.find((m) => (m.plaintext || '').includes(marker) && m.direction === 'in');
        if (!got) await new Promise((r) => setTimeout(r, 1500));
      }
      assert.ok(got, `Bob received the message (marker ${marker}) within ~15s`);
      log('delivered E2E to Bob: "' + String(got.plaintext).slice(0, 40) + '"');
    } finally {
      as.close(); bs.close();
    }
  },
};
