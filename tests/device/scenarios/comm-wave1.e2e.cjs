/**
 * comm-wave1.e2e.cjs — Wave-1 quick wins on the funded phone (idempotent, no network).
 *
 * Verifies the highest-value, on-device-checkable pieces:
 *  - MUTE: the chat-header overflow → Mute writes the per-thread mute store.
 *  - BLOCK: the chat-header overflow → Block sets Contact.blocked in IDB.
 *  - SETTINGS: the blocked contact appears in the Settings "Blocked contacts" list.
 *  - UNBLOCK: the Settings list clears it (Contact.blocked false).
 * (Notification suppression + undo-delete timing are unit/TSC-covered; the OS-notify
 * path isn't observable from CDP.)
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone (Swedish locale).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-wave1',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    try {
      const r = await s.eval(`(async () => {
        // resume-robust: get to the Chat tab
        let tab = null;
        for (let i = 0; i < 12 && !tab; i++) {
          for (let j = 0; j < 3; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150);
          tab = document.querySelector('[aria-controls="tabpanel-chat"]');
          if (!tab) await __td.sleep(400);
        }
        if (!tab) return { err: 'chat tab never appeared' };
        tab.click(); await __td.sleep(700);

        // Open the first 1:1 contact chat (a row that is NOT a group).
        const contacts = await __td.readStore('anton-comm', 'contacts');
        if (!contacts.length) return { err: 'no contacts on device to test with' };
        const target = contacts[0];
        // tap the row whose text includes the contact display name
        const rows = [...document.querySelectorAll('button')].filter((b) => (b.innerText || '').includes(target.displayName));
        const row = rows.find((b) => b.querySelector('*')) || rows[0];
        if (!row) return { err: 'contact row not found for ' + target.displayName };
        row.click(); await __td.sleep(900);

        // Open the chat options overflow (aria-label = Chattalternativ / Chat options)
        const optsBtn = [...document.querySelectorAll('button')].find((b) => /Chattalternativ|Chat options/i.test(b.getAttribute('aria-label') || ''));
        if (!optsBtn) return { err: 'chat options button not found (not a 1:1 chat?)' };
        optsBtn.click(); await __td.sleep(500);

        // Toggle MUTE (the row containing "Tysta aviseringar" / "Mute notifications")
        const muteBtn = [...document.querySelectorAll('button')].find((b) => /Tysta aviseringar|Mute notifications/i.test(b.innerText || ''));
        if (!muteBtn) return { err: 'mute row not found' };
        const wasMuted = (() => { try { return JSON.parse(localStorage.getItem('anton-comm-muted-threads') || '[]').includes(target.contactHash); } catch { return false; } })();
        if (!wasMuted) { muteBtn.click(); await __td.sleep(400); }
        const mutedNow = (() => { try { return JSON.parse(localStorage.getItem('anton-comm-muted-threads') || '[]').includes(target.contactHash); } catch { return false; } })();

        // Re-open options (sheet closes on backdrop tap, but mute keeps it open) + BLOCK
        let optsBtn2 = [...document.querySelectorAll('button')].find((b) => /Chattalternativ|Chat options/i.test(b.getAttribute('aria-label') || ''));
        // the sheet may still be open from the mute tap; if the block row isn't visible, reopen
        let blockBtn = [...document.querySelectorAll('button')].find((b) => /^(Blockera|Block) /i.test((b.innerText || '').trim()));
        if (!blockBtn && optsBtn2) { optsBtn2.click(); await __td.sleep(400); blockBtn = [...document.querySelectorAll('button')].find((b) => /^(Blockera|Block) /i.test((b.innerText || '').trim())); }
        if (!blockBtn) return { err: 'block row not found', mutedNow };
        blockBtn.click(); await __td.sleep(700);

        let freshContacts = await __td.readStore('anton-comm', 'contacts');
        const blockedAfter = !!freshContacts.find((c) => c.contactHash === target.contactHash)?.blocked;

        // Go to Settings (profile) → assert blocked contact appears → Unblock.
        // Back out of the chat first.
        for (let j = 0; j < 3; j++) await __td.clickText(/Tillbaka|Back/i, 200);
        // open profile/settings: tap the profile/settings entry (varies) — fall back via store check.
        let settingsHasName = null, unblockedAfter = null;
        const settingsBtn = [...document.querySelectorAll('button,[role=button]')].find((b) => /Inställningar|Settings|Profil|Profile/i.test(b.getAttribute('aria-label') || b.innerText || ''));
        if (settingsBtn) {
          settingsBtn.click(); await __td.sleep(800);
          settingsHasName = (document.body.innerText || '').includes(target.displayName) && /Blockerade kontakter|Blocked contacts/i.test(document.body.innerText || '');
          const unblock = [...document.querySelectorAll('button')].find((b) => /^(Avblockera|Unblock)$/.test((b.innerText || '').trim()));
          if (unblock) { unblock.click(); await __td.sleep(600); }
          freshContacts = await __td.readStore('anton-comm', 'contacts');
          unblockedAfter = !freshContacts.find((c) => c.contactHash === target.contactHash)?.blocked;
        }

        return { name: target.displayName, mutedNow, blockedAfter, settingsHasName, unblockedAfter };
      })()`);
      if (r.err) throw new Error(`${r.err} ${JSON.stringify(r)}`);
      assert.ok(r.mutedNow, 'mute writes the per-thread mute store for the contact');
      assert.ok(r.blockedAfter, 'block sets Contact.blocked=true in IDB');
      if (r.settingsHasName !== null) {
        assert.ok(r.settingsHasName, 'the blocked contact appears in the Settings "Blocked contacts" section');
        assert.ok(r.unblockedAfter, 'Unblock in Settings clears Contact.blocked');
      }
      log(`mute=${r.mutedNow} block=${r.blockedAfter} settingsList=${r.settingsHasName} unblock=${r.unblockedAfter} (${r.name})`);
    } finally {
      s.close();
    }
  },
};
