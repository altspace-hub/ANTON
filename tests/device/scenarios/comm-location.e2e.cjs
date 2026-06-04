/**
 * comm-location.e2e.cjs — location sharing acquires a fix + sends (single Comm
 * phone). Guards the regression where the picker hung forever on "Locating…"
 * because geo.ts's dynamic import('@capacitor/geolocation') never resolved on
 * device (fixed by using the already-registered window.Capacitor plugin + a
 * JS-level timeout + coarse fallback).
 *
 * Grants the location runtime permission via adb (so acquisition can succeed),
 * opens a chat thread → attachment sheet → Location, asserts the picker
 * resolves to coords (NOT stuck busy), taps "Share once", and asserts a
 * 'location' message is recorded. Cleans up the sent message.
 *
 * Requires ANTON_COMM_SERIAL pinned + device location services ON + a keyed
 * contact.
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const PKG = 'com.futurechain.anton.communication';

module.exports = {
  name: 'comm-location',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const SER = comm.serial;
    const adb = (args) => { try { return execFileSync('adb', ['-s', SER, ...args], { encoding: 'utf8', timeout: 15000 }); } catch (e) { return (e.stdout || '') + (e.stderr || ''); } };
    adb(['shell', 'pm', 'grant', PKG, 'android.permission.ACCESS_FINE_LOCATION']);
    adb(['shell', 'pm', 'grant', PKG, 'android.permission.ACCESS_COARSE_LOCATION']);

    const s = new CdpSession(comm.wsUrl); await install(s);
    const before = Date.now();
    try {
      const peer = await s.eval(`(async()=>{const cs=await __td.readStore('anton-comm','contacts');const c=cs.find(x=>x.publicKeyHex)||cs[0];return c?{hash:c.contactHash,name:c.displayName}:null;})()`);
      if (!peer) throw new Error('no contacts');
      log('peer: ' + peer.name);

      // open the thread → attachment sheet → Location tile
      await s.eval(`(async()=>{for(let i=0;i<5;i++){await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i,160);}})()`);
      await s.eval(`(()=>{const t=document.querySelector('[aria-controls="tabpanel-chat"]');if(t)t.click();})()`); await s.eval('__td.sleep(700)');
      await s.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.innerText||'').includes(${JSON.stringify(peer.name)}));if(b)b.click();})()`); await s.eval('__td.sleep(1500)');
      const attach = await s.eval(`__td.clickText(/^Attach$|^Bifoga$/i, 500)`);
      assert.ok(attach, 'attachment sheet opened');
      // Exact tile label (hardcoded "Location"); anchored so we never tap an
      // existing LocationBubble (an <a href="geo:…"> that opens an external map).
      const loc = await s.eval(`__td.clickText(/^Location$/, 600)`);
      assert.ok(loc, 'Location tile tapped');

      // poll the picker — must resolve to coords (not hang on "Locating…")
      let resolved = false;
      for (let i = 0; i < 6 && !resolved; i++) {
        await s.eval('__td.sleep(1500)');
        const st = await s.eval(`(()=>{const b=document.body.innerText;return {busy:/Locating/i.test(b), coords:/-?\\d+\\.\\d{5},\\s*-?\\d+\\.\\d{5}/.test(b), err:/permission denied|Couldn't get location|not available/i.test(b)};})()`);
        if (st.err) throw new Error('picker errored acquiring a fix (location services off?)');
        resolved = st.coords && /Share once|Dela/i.test(await s.eval('document.body.innerText'));
      }
      assert.ok(resolved, 'picker acquired a fix + showed share options (did not hang on "Locating…")');
      log('fix acquired, share options shown');

      // tap "Share once" → a 'location' message is recorded
      const shared = await s.eval(`__td.clickText(/Share once|Dela en gång/i, 1800)`);
      assert.ok(shared, '"Share once" tapped');
      let sent = null;
      for (let i = 0; i < 6 && !sent; i++) {
        const rows = await s.eval(`__td.readStore('anton-comm','messages')`);
        sent = (rows || []).find((m) => m.kind === 'location' && m.direction !== 'in' && new Date(m.ts).getTime() >= before);
        if (!sent) await new Promise((r) => setTimeout(r, 600));
      }
      assert.ok(sent, 'a location message was recorded in the thread');
      log('location message sent: ' + String(sent.plaintext).slice(0, 48));
      // cleanup the sent location message
      await s.eval(`(()=>new Promise((res)=>{const r=indexedDB.open('anton-comm');r.onsuccess=()=>{const db=r.result;const tx=db.transaction('messages','readwrite');tx.objectStore('messages').delete(${JSON.stringify(sent.id)});tx.oncomplete=()=>{db.close();res(1)};tx.onerror=()=>{db.close();res(0)}};r.onerror=()=>res(0)}))()`);
    } finally {
      s.close();
    }
  },
};
