/**
 * pay-friends.e2e.cjs — Pay Friends screen (single phone, idempotent).
 * Opens Settings -> Friends, adds a fixture friend if not already present, and
 * asserts the persisted fc_contacts row. Re-runs are no-ops (friend already
 * there) — assertion still holds. No spend.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const FRIEND_NAME = 'E2E Friend';
const FRIEND_ADDR = 'fc_E2eTestFriendAddr22222222222222';

module.exports = {
  name: 'pay-friends',
  apps: ['pay'],
  async run({ log }) {
    const pay = await forwardApp('pay');
    const s = new CdpSession(pay.wsUrl);
    await install(s);
    try {
      const r = await s.eval(`(async () => {
        const byText = (re) => [...document.querySelectorAll('button,a,[role=button]')].find((x) => re.test(x.innerText || x.getAttribute('aria-label') || ''));
        const findGear = () => [...document.querySelectorAll('[aria-label]')].find((e) => /Inställningar|Settings/i.test(e.getAttribute('aria-label') || ''));
        // "Add a friend" / "Saved friends" are unique to the Friends screen — the
        // Settings menu only shows a "Friends" row, so this can't false-positive.
        const isFriends = () => /Add a friend|Lägg till vän|Saved friends|Sparade vänner/i.test(document.body.innerText || '');
        // Resume-robust nav: when the suite runs scenario-to-scenario it may have
        // just foregrounded Pay from the background, so first wait for home (the
        // settings gear), then retry the gear -> Friends hop until it lands.
        let gear = null;
        for (let i = 0; i < 12 && !gear; i++) {
          for (let j = 0; j < 3; j++) { await __td.clickText(/Tillbaka|Avbryt|Back/i, 150); }
          gear = findGear();
          if (!gear) await __td.sleep(500);
        }
        if (!gear) return { err: 'home settings gear never appeared (app not resumed?)' };
        let onFriends = false;
        for (let attempt = 0; attempt < 4 && !onFriends; attempt++) {
          (findGear() || gear).click(); await __td.sleep(900);
          const fr = byText(/Friends|Vänner/i); if (fr) { fr.click(); await __td.sleep(1100); }
          onFriends = isFriends();
          if (!onFriends) { for (let j = 0; j < 3; j++) { await __td.clickText(/Tillbaka|Avbryt|Back/i, 150); } }
        }

        let before = await __td.readStore('anton-pay', 'fc_contacts');
        const already = before.some((c) => (c.address || '') === ${JSON.stringify(FRIEND_ADDR)});
        if (!already) {
          const add = byText(/Add friend|Lägg till vän|\\+ /i); if (add) { add.click(); await __td.sleep(500); }
          const ins = [...document.querySelectorAll('input,textarea')];
          if (ins.length >= 2) {
            __td.setVal(ins[0], ${JSON.stringify(FRIEND_NAME)});
            __td.setVal(ins[1], ${JSON.stringify(FRIEND_ADDR)});
            await __td.sleep(400);
            const save = [...document.querySelectorAll('button')].find((b) => /Add|Save|Spara|Lägg till/i.test(b.innerText) && !b.disabled);
            if (save) save.click();
            await __td.sleep(1500);
          }
        }
        const after = await __td.readStore('anton-pay', 'fc_contacts');
        const row = after.find((c) => (c.address || '') === ${JSON.stringify(FRIEND_ADDR)});
        await __td.clickText(/Tillbaka|Back/i, 400);
        return { onFriends, alreadyExisted: already, found: !!row, label: row ? (row.label || row.name) : null, count: after.length };
      })()`);
      assert.ok(r.onFriends, 'opened the Friends screen');
      assert.ok(r.found, 'fixture friend persisted to fc_contacts');
      assert.equal(r.label, FRIEND_NAME, 'friend saved under the right name');
      log(`friend ${r.alreadyExisted ? 'present' : 'added'} (${r.count} contacts)`);
    } finally {
      s.close();
    }
  },
};
