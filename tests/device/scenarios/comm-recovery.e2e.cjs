/**
 * comm-recovery.e2e.cjs — Wave-3 identity backup REVEAL on the funded phone.
 *
 * READ-ONLY by design: we only reveal the recovery phrase (Settings → Recovery phrase
 * → Reveal). We do NOT exercise restore on this phone — restore overwrites the identity
 * and would clobber the funded wallet's identity. The phrase↔key round-trip is unit-
 * proven (identity-recovery.test.ts). The phones have no biometric enrolled, so
 * requireBiometric returns 'unavailable' and the reveal proceeds without a prompt.
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone (Swedish locale).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-recovery',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    try {
      const r = await s.eval(`(async () => {
        for (let j = 0; j < 4; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel|Klar|Done/i, 150);
        await __td.sleep(300);
        // Open Settings (profile).
        const settingsBtn = [...document.querySelectorAll('button,[role=button]')].find((b) => /Inställningar|Settings|Profil|Profile/i.test(b.getAttribute('aria-label') || b.innerText || ''));
        if (!settingsBtn) return { err: 'settings entry not found' };
        settingsBtn.click(); await __td.sleep(800);

        // Find + tap the "Reveal recovery phrase" button (scroll it into view first).
        let reveal = [...document.querySelectorAll('button')].find((b) => /Visa återställningsfras|Reveal recovery phrase/i.test((b.innerText || '').trim()));
        if (!reveal) {
          // scroll the settings scroller to the bottom and retry
          const sc = document.querySelector('section');
          for (let i = 0; i < 6 && !reveal; i++) { window.scrollBy(0, 600); if (sc) sc.scrollTop += 600; await __td.sleep(200); reveal = [...document.querySelectorAll('button')].find((b) => /Visa återställningsfras|Reveal recovery phrase/i.test((b.innerText || '').trim())); }
        }
        if (!reveal) return { err: 'reveal button not found' };
        reveal.click(); await __td.sleep(1200);

        // The words start blurred behind a "Tap to reveal" — tap it.
        const tap = [...document.querySelectorAll('button')].find((b) => /Tryck för att visa|Tap to reveal/i.test((b.innerText || '').trim()));
        if (!tap) return { err: 'tap-to-reveal not found (overlay did not open?)' };
        tap.click(); await __td.sleep(500);

        const body = document.body.innerText || '';
        // The overlay lists 24 numbered words. Count list items with a word.
        const items = [...document.querySelectorAll('ol li')];
        const wordCount = items.length;
        const hasWarning = /Skriv ner|Write these|kan inte återställa|cannot recover/i.test(body);
        // sanity: each item has a non-empty lowercase word
        const allWords = items.every((li) => /[a-zåäö]{2,}/i.test(li.innerText || ''));

        return { wordCount, hasWarning, allWords };
      })()`);
      if (r.err) throw new Error(`${r.err} ${JSON.stringify(r)}`);
      assert.equal(r.wordCount, 24, 'the recovery overlay shows exactly 24 words');
      assert.ok(r.allWords, 'every slot holds a real word');
      assert.ok(r.hasWarning, 'the keep-it-secret warning is shown');
      log(`words=${r.wordCount} warning=${r.hasWarning} allWords=${r.allWords}`);
    } finally {
      s.close();
    }
  },
};
