/**
 * comm-pass-along.e2e.cjs — Pulse Pass-Along on the funded phone (idempotent, no network).
 *
 * The A→B→C relay + the verify ladder are covered by unit tests. Here we verify the
 * two things that can only be checked on-device:
 *  1. CONSENT SIGNING — composing with "Allow sharing" on runs the real signMessage +
 *     contentHash path and stamps a well-formed passAlong bundle on the pulse_posts row.
 *  2. COPY RENDER + READ-ONLY + HOP GATING — a hop-1 reshare copy (injected into
 *     pulse_posts) renders the "passed along by" attribution, shows NO reaction bar, and
 *     offers a Pass-along (share) button; a hop-2 copy is terminal (no share button).
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone (Swedish locale).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const MARKER = 'E2E PassAlong consent';

module.exports = {
  name: 'comm-pass-along',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    try {
      const r = await s.eval(`(async () => {
        let tab = null;
        for (let i = 0; i < 12 && !tab; i++) {
          for (let j = 0; j < 3; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150);
          tab = document.querySelector('[aria-controls="tabpanel-pulse"]');
          if (!tab) await __td.sleep(400);
        }
        if (!tab) return { err: 'pulse tab never appeared' };
        tab.click(); await __td.sleep(700);

        // ── 1. CONSENT SIGNING — compose with "Allow sharing" on ──────────────
        let posts = await __td.readStore('anton-comm', 'pulse_posts');
        let consentPost = posts.find((p) => (p.text || '').includes(${JSON.stringify(MARKER)}));
        const hadConsent = !!consentPost;
        if (!consentPost) {
          const add = [...document.querySelectorAll('button,[role=button]')].find((b) => /New post|Nytt inlägg/i.test(b.getAttribute('aria-label') || ''));
          if (!add) return { err: 'new-post (+) not found' };
          add.click(); await __td.sleep(800);
          const ta = document.querySelector('textarea');
          if (!ta) return { err: 'compose textarea not found' };
          __td.setVal(ta, ${JSON.stringify(MARKER)}); await __td.sleep(300);
          // Toggle the "Allow sharing" chip (aria-pressed flips true)
          const allow = [...document.querySelectorAll('button')].find((b) => /Tillåt delning|Allow sharing|Delning på|Sharing on/i.test((b.innerText || '')));
          if (!allow) return { err: 'allow-sharing chip not found' };
          allow.click(); await __td.sleep(250);
          const post = [...document.querySelectorAll('button')].find((b) => /^(Post|Publicera)$/.test((b.innerText || '').trim()) && !b.disabled);
          if (!post) return { err: 'post submit not found' };
          post.click(); await __td.sleep(1700);
          posts = await __td.readStore('anton-comm', 'pulse_posts');
          consentPost = posts.find((p) => (p.text || '').includes(${JSON.stringify(MARKER)}));
        }
        if (!consentPost) return { err: 'consent post not persisted' };
        const pa = consentPost.passAlong;

        // ── 2 + 3. inject a hop-1 and a hop-2 copy, assert render + gating ─────
        const putPost = (rec) => new Promise((resolve, reject) => {
          const req = indexedDB.open('anton-comm');
          req.onsuccess = () => { const db = req.result; const tx = db.transaction('pulse_posts', 'readwrite'); tx.objectStore('pulse_posts').put(rec); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; };
          req.onerror = () => reject(req.error);
        });
        const mkCopy = (id, hops) => ({
          id, authorHash: 'ANTON-AUTH-AUTH-AUTH-AUTH', authorName: 'Original Annie',
          text: 'passed-along body ' + id, createdAt: new Date().toISOString(), expiresAt: null,
          seen: false, likeCount: 0, commentCount: 0,
          passAlongCopy: {
            originalPostId: 'ORIG' + id, originalAuthorHash: 'ANTON-AUTH-AUTH-AUTH-AUTH', originalAuthorName: 'Original Annie',
            originalCreatedAt: new Date().toISOString(), authorPubkey: 'ab'.repeat(32), contentHash: 'h', maxHops: 2, consentSig: 's', hops,
          },
        });
        const hop1 = mkCopy('PA-E2E-1', [
          { hopCount: 1, resharerHash: 'ANTON-BOBB-BOBB-BOBB-BOBB', resharerName: 'Bob', resharerPubkey: 'bb'.repeat(32), reshareTs: new Date().toISOString(), note: 'worth a look', prevHopSig: '', hopSig: 'sigB-e2e-1' },
        ]);
        const hop2 = mkCopy('PA-E2E-2', [
          { hopCount: 1, resharerHash: 'ANTON-BOBB-BOBB-BOBB-BOBB', resharerName: 'Bob', resharerPubkey: 'bb'.repeat(32), reshareTs: new Date().toISOString(), note: '', prevHopSig: '', hopSig: 'sigB-e2e-2' },
          { hopCount: 2, resharerHash: 'ANTON-CARO-CARO-CARO-CARO', resharerName: 'Carol', resharerPubkey: 'cc'.repeat(32), reshareTs: new Date().toISOString(), note: 'agreed', prevHopSig: 'sigB-e2e-2', hopSig: 'sigC-e2e-2' },
        ]);
        await putPost(hop1); await putPost(hop2); await __td.sleep(300);
        // bounce the tab to re-list
        const chat = document.querySelector('[aria-controls="tabpanel-chat"]'); if (chat) { chat.click(); await __td.sleep(400); }
        tab = document.querySelector('[aria-controls="tabpanel-pulse"]'); tab.click(); await __td.sleep(900);

        const feedText = document.body.innerText || '';
        // Find the hop-1 card (contains its body text) and inspect its buttons.
        const cards = [...document.querySelectorAll('li')];
        const card1 = cards.find((c) => (c.innerText || '').includes('passed-along body PA-E2E-1'));
        const card2 = cards.find((c) => (c.innerText || '').includes('passed-along body PA-E2E-2'));
        const shareLabel = /Vidarebefordra|Pass along/i;
        const card1HasShare = !!card1 && [...card1.querySelectorAll('button')].some((b) => shareLabel.test(b.getAttribute('aria-label') || ''));
        const card2HasShare = !!card2 && [...card2.querySelectorAll('button')].some((b) => shareLabel.test(b.getAttribute('aria-label') || ''));
        const card1ReadOnly = !!card1 && /Skrivskyddat|Read-only/i.test(card1.innerText || '');

        return {
          hadConsent,
          consent: pa ? { allowed: pa.allowed, maxHops: pa.maxHops, hasPubkey: !!pa.authorPubkey, hasHash: !!pa.contentHash, hasSig: !!pa.consentSig } : null,
          byline1: /Vidarebefordrat av Bob|Passed along by Bob/i.test(feedText),
          note1: feedText.includes('worth a look'),
          byVia2: /via Bob|Vidarebefordrat av Carol/i.test(feedText),
          card1HasShare, card2HasShare, card1ReadOnly,
        };
      })()`);
      if (r.err) throw new Error(`${r.err} ${JSON.stringify(r)}`);
      // 1. consent signing
      assert.ok(r.consent, 'composed post carries a passAlong consent bundle');
      assert.equal(r.consent.allowed, true, 'consent allowed=true');
      assert.equal(r.consent.maxHops, 2, 'consent maxHops=2 (user-chosen cap)');
      assert.ok(r.consent.hasPubkey && r.consent.hasHash && r.consent.hasSig, 'consent has authorPubkey + contentHash + consentSig (real signing ran)');
      // 2. copy render + read-only + reshareable
      assert.ok(r.byline1, 'hop-1 copy renders the "passed along by Bob" byline');
      assert.ok(r.note1, 'hop-1 resharer note renders');
      assert.ok(r.card1ReadOnly, 'hop-1 copy shows the read-only marker (no reaction bar)');
      assert.ok(r.card1HasShare, 'hop-1 copy (hop 1 < max 2) offers a Pass-along button');
      // 3. hop-2 terminal
      assert.equal(r.card2HasShare, false, 'hop-2 copy is TERMINAL — no Pass-along button (cap reached)');
      log(`consent{allowed=${r.consent.allowed},maxHops=${r.consent.maxHops}} ; hop1 byline+note+readonly+share=ok ; hop2 terminal=ok`);
    } finally {
      s.close();
    }
  },
};
