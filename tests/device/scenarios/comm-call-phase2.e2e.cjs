/**
 * comm-call-phase2.e2e.cjs — Calling Phase-2 on-device: TURN config + call history.
 *
 * 1) TURN config: drive the Settings "Calling" form — save a TURN server (persists
 *    to localStorage with credentials), clear it (empty save removes it), and reject
 *    a malformed address (validation message, not persisted).
 * 2) Call history: place a real outgoing voice call to a contact and end it; assert a
 *    `call` history row is written into that contact's thread (outcome = cancelled if
 *    the call rang and we hung up, or failed if media capture was unavailable — either
 *    proves the endLocal→logCall path on the real WebView).
 *
 * Mic/camera are pre-granted by the operator (adb pm grant) so getUserMedia doesn't
 * raise a native permission dialog. Requires ANTON_COMM_SERIAL = the funded phone.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-call-phase2',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    try {
      // ── 1. TURN config: save → persist → clear → reject malformed ──────
      const turn = await s.eval(`(async () => {
        for (let j = 0; j < 4; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 120);
        const prof = [...document.querySelectorAll('button')].find((b) => /Öppna profil|Open profile/i.test(b.getAttribute('aria-label') || ''));
        if (prof) prof.click(); await __td.sleep(700);
        const urlInput = () => [...document.querySelectorAll('input')].find((i) => /turn:turn\\.example/i.test(i.placeholder || ''));
        if (!urlInput()) return { err: 'no TURN url input' };
        __td.setVal(urlInput(), 'turn:turn.example.com:3478'); await __td.sleep(150);
        const u = [...document.querySelectorAll('input')].find((i) => /Användarnamn|Username/i.test(i.placeholder || '')); if (u) __td.setVal(u, 'u');
        const c = [...document.querySelectorAll('input')].find((i) => /Lösenord|Credential/i.test(i.placeholder || '')); if (c) __td.setVal(c, 'p'); await __td.sleep(150);
        await __td.clickText(/Spara samtalsserver|Save calling server/i, 400);
        const saved = __td.ls('anton-comm-turn');
        __td.setVal(urlInput(), ''); await __td.sleep(150);                 // clear
        await __td.clickText(/Spara samtalsserver|Save calling server/i, 400);
        const cleared = __td.ls('anton-comm-turn');
        __td.setVal(urlInput(), 'garbage'); await __td.sleep(150);          // malformed
        await __td.clickText(/Spara samtalsserver|Save calling server/i, 400);
        const afterBad = __td.ls('anton-comm-turn');
        const rejectedMsg = /måste börja med turn|must start with turn/i.test(document.body.innerText);
        __td.setVal(urlInput(), ''); await __td.clickText(/Spara samtalsserver|Save calling server/i, 300); // leave clean
        return { saved, cleared, afterBad, rejectedMsg };
      })()`);
      if (turn.err) throw new Error(turn.err);
      assert.ok(turn.saved && /turn:turn\.example\.com/.test(turn.saved), 'TURN config persisted to localStorage');
      const savedObj = JSON.parse(turn.saved);
      assert.equal(savedObj.username, 'u', 'TURN username persisted');
      assert.equal(savedObj.credential, 'p', 'TURN credential persisted');
      assert.equal(turn.cleared, null, 'empty save cleared the TURN config');
      assert.equal(turn.afterBad, null, 'a malformed TURN url was NOT persisted');
      assert.ok(turn.rejectedMsg, 'a validation message was shown for the malformed url');
      log('TURN config: save✓ creds✓ clear✓ reject-malformed✓');

      // ── 2. Call history: place a call, end it, a `call` row appears ────
      const hist = await s.eval(`(async () => {
        for (let j = 0; j < 5; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150);
        const contacts = await __td.readStore('anton-comm', 'contacts');
        const peer = contacts.find((c) => c.publicKeyHex);
        if (!peer) return { err: 'no callable contact' };
        const tab = document.querySelector('[aria-controls="tabpanel-chat"]'); if (tab) { tab.click(); await __td.sleep(500); }
        const row = [...document.querySelectorAll('button')].find((b) => (b.innerText || '').includes(peer.displayName));
        if (!row) return { err: 'no contact row' };
        row.click(); await __td.sleep(700);
        const callRows = async () => (await __td.readStore('anton-comm', 'messages')).filter((m) => m.kind === 'call' && m.threadHash === peer.contactHash);
        const before = (await callRows()).length;
        const vc = [...document.querySelectorAll('button')].find((b) => /Röstsamtal|Voice call/i.test(b.getAttribute('aria-label') || ''));
        if (!vc) return { err: 'no voice-call button' };
        vc.click(); await __td.sleep(1800);
        await __td.clickText(/Avsluta|^End$/i, 600);   // end from the CallScreen overlay (no-op if it already failed)
        await __td.sleep(2400);                          // let endLocal + the async call-log write settle
        const rows = await callRows();
        const last = rows[rows.length - 1];
        let outcome = ''; try { outcome = JSON.parse(last.plaintext).outcome; } catch { /* ignore */ }
        return { peer: peer.displayName, before, after: rows.length, outcome, dir: last && last.direction };
      })()`);
      if (hist.err) throw new Error(hist.err);
      assert.ok(hist.after > hist.before, 'a call-history entry was written after the call ended');
      assert.equal(hist.dir, 'out', 'the call-history entry is outgoing');
      assert.ok(['cancelled', 'completed', 'failed', 'missed'].includes(hist.outcome), `call outcome is valid (${hist.outcome})`);
      log(`call history: ${hist.peer} +${hist.after - hist.before} entry, outcome=${hist.outcome} dir=${hist.dir}`);
    } finally {
      s.close();
    }
  },
};
