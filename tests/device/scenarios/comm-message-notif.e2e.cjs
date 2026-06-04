/**
 * comm-message-notif.e2e.cjs — two-phone E2E proof that an inbound message now
 * raises a LOCAL NOTIFICATION on the receiver (the gap fixed in Phase 1).
 *
 * Alice (phone 0) sends a uniquely-marked text to her QR-paired peer; Bob
 * (phone 1) is parked on the chat-list root so the message is NOT for the
 * thread he's viewing → a banner must fire. We confirm delivery via Bob's IDB,
 * then confirm the notification via `dumpsys notification` — a text message's
 * notification BODY is the text itself, so the unique marker appears there only
 * if `notifyIncomingMessage` actually fired on the `fc-comm-messages` channel.
 *
 * Requires the two Comm phones paired (ANTON_COMM_SERIAL + _B).
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { forwardApp, resolveSerial, PKG } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

function dumpNotifications(serial) {
  try {
    return execFileSync('adb', ['-s', serial, 'shell', 'dumpsys', 'notification', '--noredact'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch {
    return '';
  }
}

module.exports = {
  name: 'comm-message-notif',
  apps: ['comm'],
  async run({ log }) {
    const marker = 'notif-' + Date.now();
    // Cold-launch Bob so he lands on the chat-list root (foreground, NOT inside
    // Alice's thread) — a notification then fires because the message isn't for
    // the conversation he's viewing, and the JS→native bridge isn't throttled.
    const bobSerial = resolveSerial('comm', 1);
    try { execFileSync('adb', ['-s', bobSerial, 'shell', 'am', 'force-stop', PKG.comm]); } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));

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

      // 1) delivery — Bob's IDB has the inbound row
      let got = null;
      for (let i = 0; i < 10 && !got; i++) {
        const rows = await bs.eval("__td.readStore('anton-comm', 'messages')");
        got = rows.find((m) => (m.plaintext || '').includes(marker) && m.direction === 'in');
        if (!got) await new Promise((r) => setTimeout(r, 1500));
      }
      assert.ok(got, `Bob received the message (marker ${marker}) within ~15s`);
      log('delivered E2E to Bob');

      // 2) notification — the marker shows up in Bob's posted notifications
      let dump = '';
      let posted = false;
      for (let i = 0; i < 8 && !posted; i++) {
        dump = dumpNotifications(bob.serial);
        posted = dump.includes(marker);
        if (!posted) await new Promise((r) => setTimeout(r, 1000));
      }
      assert.ok(posted, `Bob raised a notification whose body contains "${marker}"`);
      const onChannel = dump.includes('fc-comm-messages');
      log('notification posted on Bob' + (onChannel ? ' (channel fc-comm-messages)' : ''));
    } finally {
      as.close(); bs.close();
    }
  },
};
