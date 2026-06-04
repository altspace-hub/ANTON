/**
 * comm-event-location.e2e.cjs — pin a map location on an event (single Comm
 * phone, no network). Creates an event, taps "Use current location", and
 * asserts the event row stores geo{lat,lng} and the detail renders a tappable
 * geo: map link. Fresh title per run + deletes the created event.
 *
 * Requires ANTON_COMM_SERIAL pinned + device location services ON.
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const PKG = 'com.futurechain.anton.communication';

module.exports = {
  name: 'comm-event-location',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const SER = comm.serial;
    const adb = (args) => { try { return execFileSync('adb', ['-s', SER, ...args], { encoding: 'utf8', timeout: 15000 }); } catch (e) { return (e.stdout || '') + (e.stderr || ''); } };
    adb(['shell', 'pm', 'grant', PKG, 'android.permission.ACCESS_FINE_LOCATION']);
    adb(['shell', 'pm', 'grant', PKG, 'android.permission.ACCESS_COARSE_LOCATION']);

    const s = new CdpSession(comm.wsUrl); await install(s);
    const TITLE = 'E2E Geo Event ' + Date.now();
    let eventId = null;
    try {
      // Events tab → create event
      await s.eval(`(async()=>{for(let i=0;i<6;i++){await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i,150);}})()`);
      await s.eval(`(()=>{const t=document.querySelector('[aria-controls="tabpanel-events"]');if(t)t.click();})()`); await s.eval('__td.sleep(800)');
      const addBtn = await s.eval(`(()=>{const b=[...document.querySelectorAll('button,[role=button]')].find(x=>/Create event|Skapa händelse/i.test(x.getAttribute('aria-label')||''));if(b){b.click();return true;}return false;})()`);
      assert.ok(addBtn, 'create-event (+) button found');
      await s.eval('__td.sleep(900)');

      // title
      await s.eval(`(()=>{const ta=document.querySelector('input[type=text]')||document.querySelector('input');if(ta)__td.setVal(ta, ${JSON.stringify(TITLE)});})()`); await s.eval('__td.sleep(400)');

      // tap "Use current location" → wait for the coords chip
      const pinned = await s.eval(`__td.clickText(/Use current location|Använd nuvarande plats/i, 800)`);
      assert.ok(pinned, '"Use current location" button present + tapped');
      let chip = false;
      for (let i = 0; i < 6 && !chip; i++) { await s.eval('__td.sleep(1500)'); chip = /-?\d+\.\d{5},\s*-?\d+\.\d{5}/.test(await s.eval('document.body.innerText')); }
      assert.ok(chip, 'the pin resolved + showed the coords chip (geo acquired)');
      log('location pinned');

      // create the event
      await s.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^(Create|Skapa|Skapa & bjud in|Create & invite)/i.test((x.innerText||'').trim()) && !x.disabled);if(b)b.click();})()`); await s.eval('__td.sleep(1600)');

      const events = await s.eval(`__td.readStore('anton-comm','events')`);
      const ev = (events || []).find((e) => (e.title || '') === TITLE);
      assert.ok(ev, 'event persisted to the events store');
      eventId = ev.id;
      assert.ok(ev.geo && typeof ev.geo.lat === 'number' && typeof ev.geo.lng === 'number', 'event row stores geo{lat,lng}');
      log('event saved with geo ' + JSON.stringify(ev.geo));

      // open the detail → tappable geo: map link
      await s.eval(`(()=>{const b=[...document.querySelectorAll('button,a,[role=button]')].find(x=>(x.innerText||'').includes(${JSON.stringify(TITLE)}));if(b)b.click();})()`); await s.eval('__td.sleep(1200)');
      const body = await s.eval('document.body.innerText');
      const hasGeoHref = await s.eval(`[...document.querySelectorAll('a')].some(a=>(a.getAttribute('href')||'').startsWith('geo:'))`);
      assert.ok(/Open in maps|Öppna i kartor/i.test(body) && hasGeoHref, 'detail renders a tappable geo: map link');
      log('detail map link OK');
    } finally {
      if (eventId) await s.eval(`(()=>new Promise((res)=>{const r=indexedDB.open('anton-comm');r.onsuccess=()=>{const db=r.result;const tx=db.transaction('events','readwrite');tx.objectStore('events').delete(${JSON.stringify(eventId)});tx.oncomplete=()=>{db.close();res(1)};tx.onerror=()=>{db.close();res(0)}};r.onerror=()=>res(0)}))()`);
      s.close();
    }
  },
};
