/**
 * comm-backup.e2e.cjs — Wave-3 encrypted device migration: prove the REAL export
 * path runs on-device against real data.
 *
 * Tapping "Back up my data" runs the shipped exportBackup() (getAll over every
 * durable store → AES-256-GCM with the identity-derived key) and then opens the
 * native share sheet. We dismiss the sheet with BACK; shareFile() then resolves
 * and the success toast renders "Backup ready — N messages, M contacts, P
 * payment records". We assert that toast appears and that N matches the live
 * `messages` store count read straight from IndexedDB — i.e. the export crypto +
 * the real-data read + the share completion all worked on the actual WebView.
 *
 * The decrypt/merge half (insert-if-absent, identity-binding) is covered by the
 * 7 unit tests in src/comm/__tests__/backup.test.ts (Node WebCrypto + IDB = the
 * same primitives/semantics as the WebView). A full two-phone restore needs an
 * operator (file transfer + a fresh install on phone B, which is stale here).
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone (Swedish locale).
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-backup',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    const back = () => { try { execFileSync('adb', ['-s', comm.serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK']); } catch { /* ignore */ } };
    try {
      // ── 1. Ground truth: live store counts ──────────────────────────────
      const counts = await s.eval(`(async () => {
        for (let j = 0; j < 3; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 120);
        const msgs = await __td.readStore('anton-comm', 'messages');
        const contacts = await __td.readStore('anton-comm', 'contacts');
        return { messages: msgs.length, contacts: contacts.length };
      })()`);
      log(`live stores: messages=${counts.messages} contacts=${counts.contacts}`);

      // ── 2. Open Settings (TopBar profile button) + assert Backup UI ─────
      const ui = await s.eval(`(async () => {
        const prof = [...document.querySelectorAll('button')].find((b) => /Öppna profil|Open profile/i.test(b.getAttribute('aria-label') || ''));
        if (!prof) return { err: 'no profile button' };
        prof.click(); await __td.sleep(700);
        // scroll the Backup card into view
        const has = (re) => [...document.querySelectorAll('*')].some((n) => re.test(n.textContent || ''));
        const section = has(/Säkerhetskopiering & ny telefon|Backup & new phone/);
        const exportBtn = [...document.querySelectorAll('button')].find((b) => /Säkerhetskopiera mina data|Back up my data/i.test(b.innerText || ''));
        const restoreBtn = [...document.querySelectorAll('button')].some((b) => /Återställ från en säkerhetskopia|Restore from a backup/i.test(b.innerText || ''));
        if (exportBtn) exportBtn.scrollIntoView();
        return { section, hasExport: !!exportBtn, hasRestore: restoreBtn };
      })()`);
      if (ui.err) throw new Error(ui.err);
      assert.ok(ui.section, 'Backup section header renders');
      assert.ok(ui.hasExport, 'Back up my data button renders');
      assert.ok(ui.hasRestore, 'Restore from a backup button renders');
      log(`backup UI: section=${ui.section} export=${ui.hasExport} restore=${ui.hasRestore}`);

      // ── 3. Tap export → exportBackup() runs → native share sheet opens ──
      await s.eval(`(async () => {
        const btn = [...document.querySelectorAll('button')].find((b) => /Säkerhetskopiera mina data|Back up my data/i.test(b.innerText || ''));
        if (btn) btn.click();
      })()`);

      // exportBackup + share-sheet open; then dismiss the sheet so shareFile resolves.
      await s.eval('__td.sleep(2500)');
      let toast = '';
      for (let i = 0; i < 8 && !toast; i++) {
        back();
        await s.eval('__td.sleep(800)');
        toast = await s.eval(`(() => {
          const txt = document.body.innerText || '';
          const m = txt.match(/(Säkerhetskopia klar|Backup ready)[^\\n]*/);
          return m ? m[0] : '';
        })()`);
      }
      assert.ok(toast, 'export produced a "Backup ready" toast (exportBackup ran + shareFile resolved on-device)');
      log(`export toast: ${toast}`);

      // ── 4. The toast's message count matches the live store ─────────────
      const mToast = toast.match(/(\d+)\s+(meddelanden|messages)/);
      assert.ok(mToast, 'toast reports a message count');
      assert.equal(Number(mToast[1]), counts.messages, 'toast message count == live messages store count');
      // not an error toast
      assert.ok(!/misslyckades|failed/i.test(toast), 'export did not fail');
      log(`export verified: ${mToast[1]} messages == live ${counts.messages}`);
    } finally {
      s.close();
    }
  },
};
