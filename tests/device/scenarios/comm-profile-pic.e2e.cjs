/**
 * comm-profile-pic.e2e.cjs — profile picture rendering on-device (#82).
 * The avatar is normally set via the native photo picker (not CDP-drivable),
 * so this injects a tiny avatar into the identity (localStorage IS page-
 * writable) and asserts AvatarCircle renders it as an <img data:image…>
 * in the TopBar and on the Settings profile screen (replacing the letter).
 * Restores the identity afterwards so the device is left untouched.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

// 1×1 transparent PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

module.exports = {
  name: 'comm-profile-pic',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl);
    await install(s);
    try {
      const r = await s.eval(`(async () => {
        const raw = localStorage.getItem('anton-comm-identity');
        if (!raw) return { err: 'no identity' };
        const id = JSON.parse(raw);
        const hadAvatar = !!id.avatarImage;
        id.avatarImage = ${JSON.stringify(PNG)}; id.avatarMime = 'image/png';
        localStorage.setItem('anton-comm-identity', JSON.stringify(id));

        // Force the tabs view + a re-render so TopBar re-reads the identity.
        for (let i = 0; i < 5; i++) { await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 120); }
        const wt = document.querySelector('[aria-controls=tabpanel-wallet]'); if (wt) wt.click(); await __td.sleep(500);
        const ct = document.querySelector('[aria-controls=tabpanel-chat]'); if (ct) ct.click(); await __td.sleep(700);

        const profBtn = document.querySelector('[aria-label="Öppna profil"],[aria-label="Open profile"]');
        const topImg = profBtn && profBtn.querySelector('img');
        const topAvatarShown = !!topImg && /^data:image/.test(topImg.src || '');

        // Open Settings and check the 80px profile avatar renders the image.
        if (profBtn) profBtn.click(); await __td.sleep(900);
        const settingsBody = document.body.textContent || '';
        const settingsImg = [...document.querySelectorAll('img')].some((im) => /^data:image\\/png/.test(im.src || ''));
        // Change-photo is the tappable avatar button (aria-label, not visible
        // text); Remove-photo is a visible text button shown when an avatar is set.
        const hasChangePhoto = !!document.querySelector('[aria-label="Byt bild"],[aria-label="Change photo"]');
        const hasRemovePhoto = /Ta bort bild|Remove photo/.test(settingsBody);

        // Restore identity (remove the injected avatar unless one existed).
        const raw2 = localStorage.getItem('anton-comm-identity');
        const id2 = JSON.parse(raw2);
        if (!hadAvatar) { delete id2.avatarImage; delete id2.avatarMime; }
        localStorage.setItem('anton-comm-identity', JSON.stringify(id2));

        return { topAvatarShown, settingsImg, hasChangePhoto, hasRemovePhoto };
      })()`);
      if (r.err) throw new Error(r.err);
      assert.ok(r.topAvatarShown, 'TopBar renders the avatar image (not the letter)');
      assert.ok(r.settingsImg, 'Settings profile shows the avatar image');
      assert.ok(r.hasChangePhoto, 'Settings exposes a Change-photo affordance');
      assert.ok(r.hasRemovePhoto, 'Settings exposes Remove-photo when an avatar is set');
      log('Profile pic: TopBar + Settings render the avatar image; change/remove affordances present');
      await s.eval('(async () => { for (let i = 0; i < 4; i++) { await __td.clickText(/Tillbaka|Back/i, 200); } return 1; })()');
    } finally {
      s.close();
    }
  },
};
