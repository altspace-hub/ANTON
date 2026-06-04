/**
 * comm-reaction-relay.e2e.cjs — TWO-PHONE: an emoji reaction propagates across
 * the relay and lands on the SAME message on the peer's device.
 *
 * Alice sends a marked message to Bob (round-trip), Bob receives it (same id —
 * appendMessage stores under the wire messageId), Alice reacts 👍 to that
 * bubble, and we poll Bob's `messages` store until his copy of that message
 * carries reactions['👍'] including Alice's contact-hash. This proves the
 * 'react' wire + cross-device id-matching that the single-phone comm-reactions
 * scenario can't (it reacts to a locally-injected message).
 *
 * Requires the two Comm phones paired (ANTON_COMM_SERIAL + _B).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const EMOJI = '👍';

module.exports = {
  name: 'comm-reaction-relay',
  apps: ['comm'],
  async run({ log }) {
    const marker = 'react-relay-' + Date.now();
    const alice = await forwardApp('comm', 0);
    const bob = await forwardApp('comm', 1);
    const as = new CdpSession(alice.wsUrl); await install(as);
    const bs = new CdpSession(bob.wsUrl); await install(bs);
    try {
      const peer = await as.eval(`(async () => {
        const cs = await __td.readStore('anton-comm', 'contacts');
        const c = cs.find((x) => x.publicKeyHex);
        return c ? { name: c.displayName } : null;
      })()`);
      if (!peer) throw new Error('Alice has no QR-paired contact — pair the two Comm phones first');
      log('peer: ' + peer.name);

      // Alice opens the thread + sends the marked message
      const sent = await as.eval(`(async () => {
        for (let i = 0; i < 4; i++) await __td.clickText(/Tillbaka|Back/i, 250);
        await __td.clickText(/Chatt|Chats?/i, 800);
        const btn = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes(${JSON.stringify(peer.name)}));
        if (!btn) return { err: 'contact row not found' };
        btn.click(); await __td.sleep(1500);
        const ta = document.querySelector('textarea'); if (!ta) return { err: 'no composer' };
        __td.setVal(ta, ${JSON.stringify(marker)}); await __td.sleep(400);
        const send = [...document.querySelectorAll('button,[role=button]')].find((b) => /skicka|send/i.test(b.innerText || b.getAttribute('aria-label') || ''));
        if (send) send.click(); else ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        await __td.sleep(1500);
        return { ok: true };
      })()`);
      if (sent.err) throw new Error('Alice send: ' + sent.err);

      // Bob receives it — capture the shared message id + Alice's hash (its fromHash)
      let got = null;
      for (let i = 0; i < 12 && !got; i++) {
        const rows = await bs.eval("__td.readStore('anton-comm', 'messages')");
        got = (rows || []).find((m) => (m.plaintext || '').includes(marker) && m.direction === 'in');
        if (!got) await new Promise((r) => setTimeout(r, 1500));
      }
      assert.ok(got, 'Bob received the message');
      log('Bob has message ' + got.id.slice(0, 8) + '… (from ' + got.fromHash.slice(0, 8) + '…)');

      // Alice reacts 👍 to her sent bubble (long-press == synthetic contextmenu)
      const reacted = await as.eval(`(async () => {
        const node = [...document.querySelectorAll('*')].find((el) => (el.textContent || '').includes(${JSON.stringify(marker)}) && ![...el.children].some((c) => (c.textContent || '').includes(${JSON.stringify(marker)})));
        if (!node) return { err: 'sent bubble not found on Alice' };
        node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        await __td.sleep(600);
        const rb = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === ${JSON.stringify('React with ' + EMOJI)});
        if (!rb) return { err: 'reaction quick-row not open' };
        rb.click(); await __td.sleep(900);
        return { ok: true };
      })()`);
      if (reacted.err) throw new Error('Alice react: ' + reacted.err);

      // Bob's copy of that message gains the reaction (Alice's hash)
      let propagated = false;
      for (let i = 0; i < 12 && !propagated; i++) {
        const rows = await bs.eval("__td.readStore('anton-comm', 'messages')");
        const m = (rows || []).find((x) => x.id === got.id);
        propagated = !!(m && m.reactions && Array.isArray(m.reactions[EMOJI]) && m.reactions[EMOJI].includes(got.fromHash));
        if (!propagated) await new Promise((r) => setTimeout(r, 1500));
      }
      assert.ok(propagated, `reaction ${EMOJI} propagated to Bob's copy of the message (within ~18s)`);
      log('reaction propagated across the relay to Bob');
    } finally {
      as.close(); bs.close();
    }
  },
};
