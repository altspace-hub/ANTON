/**
 * comm-pulse.e2e.cjs — Pulse feed: compose a post + self-like (single Comm
 * phone, idempotent, no network).
 *
 * publishPulsePost writes the pulse_posts row BEFORE any relay fanout, and
 * togglePulseLike writes the pulse_interactions row + bumps likeCount BEFORE
 * its own-post early-return — so both are fully assertable on one funded phone.
 * Uses a stable marker + check-then-create (mirrors comm-events); re-runs are
 * no-ops (post already present, already self-liked). Cross-device fanout +
 * inbound apply are deferred to a future two-phone scenario.
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const MARKER = 'E2E Fixture Pulse';

module.exports = {
  name: 'comm-pulse',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    try {
      const r = await s.eval(`(async () => {
        const me = (() => { try { return JSON.parse(localStorage.getItem('anton-comm-identity')); } catch { return null; } })();
        const myHash = me && me.contactHash;

        // resume-robust nav to the Pulse tab
        let tab = null;
        for (let i = 0; i < 12 && !tab; i++) {
          for (let j = 0; j < 3; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150);
          tab = document.querySelector('[aria-controls="tabpanel-pulse"]');
          if (!tab) await __td.sleep(400);
        }
        if (!tab) return { err: 'pulse tab never appeared (app not resumed?)' };
        tab.click(); await __td.sleep(900);

        // idempotent create (check store first)
        let posts = await __td.readStore('anton-comm', 'pulse_posts');
        let created = posts.find((p) => (p.text || '').includes(${JSON.stringify(MARKER)}));
        const had = !!created;
        if (!created) {
          const add = [...document.querySelectorAll('button,[role=button]')].find((b) => /New post|Nytt inlägg/i.test(b.getAttribute('aria-label') || ''));
          if (!add) return { err: 'new-post (+) button not found' };
          add.click(); await __td.sleep(900);
          const ta = document.querySelector('textarea');
          if (!ta) return { err: 'compose textarea not found' };
          __td.setVal(ta, ${JSON.stringify(MARKER)}); await __td.sleep(400);
          // header submit — "Post"/"Publicera" exactly (not the feed/tab '+' which are aria-label only)
          const post = [...document.querySelectorAll('button')].find((b) => /^(Post|Publicera)$/.test((b.innerText || '').trim()) && !b.disabled);
          if (!post) return { err: 'post submit button not found/enabled' };
          post.click(); await __td.sleep(1700);
          posts = await __td.readStore('anton-comm', 'pulse_posts');
          created = posts.find((p) => (p.text || '').includes(${JSON.stringify(MARKER)}));
        }
        if (!created) return { err: 'post row not persisted to pulse_posts' };

        // idempotent self-like — find the feed card for MARKER, tap its nested heart
        let ints = await __td.readStore('anton-comm', 'pulse_interactions');
        const likedAlready = ints.some((i) => i.postId === created.id && i.kind === 'like' && i.fromHash === myHash);
        if (!likedAlready) {
          let card = null;
          for (let i = 0; i < 4 && !card; i++) {
            card = [...document.querySelectorAll('button')].find((b) => /Open post by|Öppna inlägg av/i.test(b.getAttribute('aria-label') || '') && (b.innerText || '').includes(${JSON.stringify(MARKER)}));
            if (!card) await __td.sleep(800);
          }
          if (!card) return { err: 'feed card for the post not found' };
          const likeBtn = card.querySelector('button'); // first nested button = the heart
          if (!likeBtn) return { err: 'like button not found inside the card' };
          likeBtn.click(); await __td.sleep(1100);
          ints = await __td.readStore('anton-comm', 'pulse_interactions');
        }
        const likeRow = ints.find((i) => i.postId === created.id && i.kind === 'like' && i.fromHash === myHash);
        posts = await __td.readStore('anton-comm', 'pulse_posts');
        const fresh = posts.find((p) => p.id === created.id);
        return {
          had, postId: created.id, authorHash: created.authorHash, myHash,
          expiresAt: created.expiresAt, likeRow: !!likeRow, likeCount: fresh ? fresh.likeCount : null,
        };
      })()`);
      if (r.err) throw new Error(r.err);
      assert.ok(r.postId, 'pulse post persisted to the pulse_posts store');
      assert.equal(r.authorHash, r.myHash, 'post authorHash is my own identity (locally composed)');
      assert.ok(r.likeRow, 'self-like persisted a pulse_interactions row (kind=like, fromHash=me)');
      assert.ok(typeof r.likeCount === 'number' && r.likeCount >= 1, 'likeCount denormalized onto the post (>=1) after self-like');
      log(`post ${r.had ? 'present' : 'created'} (${String(r.postId).slice(0, 8)}…), self-like ok, likeCount=${r.likeCount}, expiresAt=${r.expiresAt ? 'set' : 'null'}`);
    } finally {
      s.close();
    }
  },
};
