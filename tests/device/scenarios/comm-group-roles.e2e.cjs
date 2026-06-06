/**
 * comm-group-roles.e2e.cjs — Roles+Scale v1 on-device: drive the REAL create →
 * announce → promote flow through the UI and assert the persisted roster in IDB.
 *
 * One phone can fully exercise the owner side (the owner is the sole roster
 * authority): create an ANNOUNCEMENT group, confirm it persists with announce +
 * me as owner + the composer visible (owner can post), open Group info, confirm
 * the announce row + a member's "Make admin" control render, promote the member,
 * and confirm the roster now carries role='admin' at a bumped version. The
 * read-only-member side needs a second updated phone (out of scope here; covered
 * by the 24 unit tests in group-roles.test.ts).
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone (Swedish locale, 1 contact).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const NAME = 'Roles Test';

module.exports = {
  name: 'comm-group-roles',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    try {
      // ── 1. Clean slate + open the create-group flow ─────────────────────
      const setup = await s.eval(`(async () => {
        for (let j = 0; j < 4; j++) await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i, 120);
        await __td.clearStore('anton-comm', 'groups');               // funded phone has 0 real groups
        const contacts = await __td.readStore('anton-comm', 'contacts');
        const withKey = contacts.filter((c) => c.publicKeyHex);
        if (!withKey.length) return { err: 'no contact with a pubkey to add' };
        const tab = document.querySelector('[aria-controls="tabpanel-chat"]'); if (tab) { tab.click(); await __td.sleep(500); }
        const opened = await __td.clickText(/Ny grupp|New group/i, 800);
        // The create screen is identified by its name INPUT (placeholder isn't in innerText).
        const onCreate = !![...document.querySelectorAll('input')].find((i) => /Gruppnamn|Group name/i.test(i.placeholder || ''));
        return { opened, onCreate, contact: withKey[0].displayName };
      })()`);
      if (setup.err) throw new Error(setup.err);
      assert.ok(setup.opened && setup.onCreate, 'create-group screen opened');
      log(`create screen open; adding contact "${setup.contact}"`);

      // ── 2. Name it, turn ON announcement mode, select the contact, create ─
      const made = await s.eval(`(async () => {
        const nameInput = [...document.querySelectorAll('input')].find((i) => /Gruppnamn|Group name/i.test(i.placeholder || ''));
        __td.setVal(nameInput, ${JSON.stringify(NAME)}); await __td.sleep(300);
        await __td.clickText(/Endast meddelanden|Announcements only/i, 350);      // announce toggle ON
        const row = [...document.querySelectorAll('button')].find((b) => new RegExp(${JSON.stringify(setup.contact)}).test(b.innerText || ''));
        if (row) row.click(); await __td.sleep(350);
        const createBtn = __td.byExactText('Skapa') || __td.byExactText('Create');
        if (createBtn) createBtn.click();
        await __td.sleep(1600);
        return { onThread: !!document.querySelector('textarea') || /Säg hej|Say hi/.test(document.body.innerText) };
      })()`);
      log(`created (on thread: ${made.onThread})`);

      // ── 3. The roster persisted: announce + owner + the contact, composer up ─
      const persisted = await s.eval(`(async () => {
        const groups = await __td.readStore('anton-comm', 'groups');
        const g = groups.find((x) => x.name === ${JSON.stringify(NAME)});
        if (!g) return { found: false, count: groups.length };
        const me = JSON.parse(__td.ls('anton-comm-identity') || '{}');
        const mine = g.members.find((m) => m.hash === me.contactHash);
        return {
          found: true, announce: g.announce === true, memberCount: g.members.length,
          myRole: mine && mine.role, ver: g.rosterVersion,
          composerVisible: !!document.querySelector('textarea'),
          gid: g.groupId,
        };
      })()`);
      assert.ok(persisted.found, 'the new group persisted to IndexedDB');
      assert.equal(persisted.announce, true, 'group stored with announce=true');
      assert.equal(persisted.myRole, 'owner', 'creator stored as owner');
      assert.ok(persisted.memberCount >= 2, 'roster has me + the added contact');
      assert.ok(persisted.composerVisible, 'owner sees the composer in an announce group (not read-only)');
      log(`roster: announce=${persisted.announce} myRole=${persisted.myRole} members=${persisted.memberCount} v${persisted.ver}`);

      // ── 4. Group info renders the announce state + the promote control ──
      const info = await s.eval(`(async () => {
        // The header info button's innerText (name + member count) shadows its
        // aria-label, so target it by the member-count text.
        const hdr = [...document.querySelectorAll('button')].find((b) => /medlemmar|members/i.test(b.innerText || ''));
        if (hdr) hdr.click(); await __td.sleep(900);
        const body = document.body.innerText;
        return {
          announceOn: /Bara admins kan skriva|Only admins can post/i.test(body),
          hasPromote: /Gör till admin|Make admin/i.test(body),
          ownerBadge: /Ägare|Owner/i.test(body), // the badge is CSS-uppercased → innerText "ÄGARE"
        };
      })()`);
      assert.ok(info.announceOn, 'Group info shows announce is on ("only admins can post")');
      assert.ok(info.hasPromote, 'the owner sees a "Make admin" control for the member');
      assert.ok(info.ownerBadge, 'an Owner role badge renders');
      log(`group info: announceOn=${info.announceOn} promote=${info.hasPromote} ownerBadge=${info.ownerBadge}`);

      // ── 5. Promote the member → roster carries role=admin at a bumped version ─
      const promoted = await s.eval(`(async () => {
        await __td.clickText(/Gör till admin|Make admin/i, 1000);
        const groups = await __td.readStore('anton-comm', 'groups');
        const g = groups.find((x) => x.name === ${JSON.stringify(NAME)});
        return { admins: g ? g.members.filter((m) => m.role === 'admin').length : -1, ver: g && g.rosterVersion };
      })()`);
      assert.equal(promoted.admins, 1, 'the promoted member now has role=admin in the roster');
      assert.ok(promoted.ver >= 2, 'rosterVersion bumped after the role change');
      log(`promote verified: admins=${promoted.admins} rosterVersion=${promoted.ver}`);
    } finally {
      s.close();
    }
  },
};
