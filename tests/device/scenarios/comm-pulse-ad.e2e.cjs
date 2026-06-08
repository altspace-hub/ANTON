/**
 * comm-pulse-ad.e2e.cjs — Pulse "Advertisement" self-disclosure on-device.
 *
 * Compose a Pulse post, turn ON the "Mark as ad" toggle, publish, and assert the
 * stored post carries ad=true AND the "Advertisement" (Annons) banner renders on
 * the feed card. Drives the real composer → publishPulsePost → putPost → render path.
 *
 * Requires ANTON_COMM_SERIAL = the funded phone (Swedish locale).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const TEXT = 'E2E ad post ' + Math.floor(Date.now() / 1000); // unique per run (stamped here, not in-page)

module.exports = {
  name: 'comm-pulse-ad',
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

        // Open the composer (header/FAB "New post").
        const compose = [...document.querySelectorAll('button')].find((b) => /Nytt inlägg|New post/i.test(b.getAttribute('aria-label') || ''));
        if (!compose) return { err: 'no compose button' };
        compose.click(); await __td.sleep(700);

        const ta = document.querySelector('textarea');
        if (!ta) return { err: 'no composer textarea' };
        __td.setVal(ta, ${JSON.stringify(TEXT)}); await __td.sleep(250);

        // Turn ON the advertisement toggle.
        const adBtn = [...document.querySelectorAll('button')].find((b) => /Markera som annons|Mark as ad/i.test(b.innerText || ''));
        if (!adBtn) return { err: 'no ad toggle' };
        adBtn.click(); await __td.sleep(250);
        const toggledOn = [...document.querySelectorAll('button')].some((b) => (b.getAttribute('aria-pressed') === 'true') && /Annons|Advertisement/i.test(b.innerText || ''));

        // Publish.
        await __td.clickText(/^Publicera$|^Post$/i, 1500);
        await __td.sleep(1200);

        const me = JSON.parse(__td.ls('anton-comm-identity') || '{}');
        const posts = await __td.readStore('anton-comm', 'pulse_posts');
        const mine = posts.filter((p) => p.text === ${JSON.stringify(TEXT)});
        const post = mine[0];
        const bannerShown = /Annons|Advertisement/i.test(document.body.innerText);
        return { toggledOn, found: !!post, ad: post && post.ad, author: post && post.authorHash === me.contactHash, bannerShown };
      })()`);
      if (r.err) throw new Error(r.err);
      assert.ok(r.toggledOn, 'the ad toggle reflected the ON state');
      assert.ok(r.found, 'the post was published + stored');
      assert.equal(r.ad, true, 'the stored post carries ad=true');
      assert.ok(r.author, 'the post is authored by me');
      assert.ok(r.bannerShown, 'the "Advertisement" banner renders on the feed');
      log(`pulse ad: toggle✓ stored ad=${r.ad} banner✓`);
    } finally {
      s.close();
    }
  },
};
