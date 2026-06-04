/**
 * comm-wassup-relay.e2e.cjs — TWO-PHONE: a Wassup post fans out over the relay
 * to a peer's feed. Alice composes a post (audience = Everyone, the default);
 * we poll Bob's `wassup_posts` store until the post arrives + applyInboundPost
 * stores it.
 *
 * SLOW BY DESIGN: publishWassupPost jitters each recipient send across a 0–30 s
 * window (an anti-traffic-analysis measure), so Bob can legitimately take up to
 * ~30 s to receive it — the poll budget is ~40 s. This proves the cross-device
 * fanout that the single-phone comm-wassup scenario can't.
 *
 * Requires the two Comm phones paired (ANTON_COMM_SERIAL + _B).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-wassup-relay',
  apps: ['comm'],
  async run({ log }) {
    const marker = 'wassup-relay-' + Date.now();
    const alice = await forwardApp('comm', 0);
    const bob = await forwardApp('comm', 1);
    const as = new CdpSession(alice.wsUrl); await install(as);
    const bs = new CdpSession(bob.wsUrl); await install(bs);
    try {
      // Alice composes + publishes a Wassup post (audience Everyone default).
      const posted = await as.eval(`(async () => {
        let tab = null;
        for (let i = 0; i < 12 && !tab; i++) {
          for (let j = 0; j < 3; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 150);
          tab = document.querySelector('[aria-controls="tabpanel-wassup"]');
          if (!tab) await __td.sleep(400);
        }
        if (!tab) return { err: 'wassup tab never appeared' };
        tab.click(); await __td.sleep(900);
        const add = [...document.querySelectorAll('button,[role=button]')].find((b) => /New post|Nytt inlägg/i.test(b.getAttribute('aria-label') || ''));
        if (!add) return { err: 'new-post button not found' };
        add.click(); await __td.sleep(900);
        const ta = document.querySelector('textarea'); if (!ta) return { err: 'compose textarea not found' };
        __td.setVal(ta, ${JSON.stringify(marker)}); await __td.sleep(400);
        const post = [...document.querySelectorAll('button')].find((b) => /^(Post|Publicera)$/.test((b.innerText || '').trim()) && !b.disabled);
        if (!post) return { err: 'post submit not found/enabled' };
        post.click(); await __td.sleep(1500);
        // confirm it persisted locally on Alice
        const mine = (await __td.readStore('anton-comm', 'wassup_posts')).some((p) => (p.text || '').includes(${JSON.stringify(marker)}));
        return { ok: mine };
      })()`);
      if (posted.err) throw new Error('Alice compose: ' + posted.err);
      assert.ok(posted.ok, 'Alice published the post locally');
      log('Alice posted; waiting for relay fanout (jittered up to 30s)…');

      // Bob's feed receives the post via applyInboundPost (poll ~40s).
      let got = null;
      for (let i = 0; i < 27 && !got; i++) {
        const rows = await bs.eval("__td.readStore('anton-comm', 'wassup_posts')");
        got = (rows || []).find((p) => (p.text || '').includes(marker) && p.authorHash !== undefined);
        if (!got) await new Promise((r) => setTimeout(r, 1500));
      }
      assert.ok(got, "Bob's feed received Alice's Wassup post via relay fanout (within ~40s)");
      log('post fanned out to Bob (author ' + String(got.authorHash).slice(0, 8) + '…)');
    } finally {
      as.close(); bs.close();
    }
  },
};
