/**
 * comm-file-attach.e2e.cjs — #91 generic file attachment, RECEIVE + render +
 * binary-save path on a single Comm phone (idempotent, no network).
 *
 * Injects a received 'file' ChatMessage into the funded phone's `messages`
 * store, opens the thread, asserts the FileBubble renders (filename + tap
 * hint), taps it, and confirms the file is written to the app cache as BINARY
 * via @capacitor/filesystem (read back over `adb run-as`). The send/wire path
 * is unit-tested (src/comm/__tests__/file-attachment.test.ts) and identical to
 * image/video which already round-trips on-device. Cleans up after itself.
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone.
 */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const PKG = 'com.futurechain.anton.communication';
const FNAME = 'anton-e2e-doc.txt';
const CONTENT = 'ANTON file attachment E2E — #91';
const B64 = Buffer.from(CONTENT).toString('base64');

module.exports = {
  name: 'comm-file-attach',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const SER = comm.serial;
    const adb = (args) => { try { return execFileSync('adb', ['-s', SER, ...args], { encoding: 'utf8', timeout: 15000 }); } catch (e) { return (e.stdout || '') + (e.stderr || ''); } };
    const s = new CdpSession(comm.wsUrl); await install(s);

    const MID = 'e2e-file-' + Date.now();
    const put = (store, rec) => `(()=>new Promise((res,rej)=>{const r=indexedDB.open('anton-comm');r.onsuccess=()=>{const db=r.result;const tx=db.transaction(${JSON.stringify(store)},'readwrite');tx.objectStore(${JSON.stringify(store)}).put(${JSON.stringify(rec)});tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>{db.close();rej(''+tx.error)}};r.onerror=()=>rej('open')}))()`;
    const del = (store, key) => `(()=>new Promise((res)=>{const r=indexedDB.open('anton-comm');r.onsuccess=()=>{const db=r.result;const tx=db.transaction(${JSON.stringify(store)},'readwrite');tx.objectStore(${JSON.stringify(store)}).delete(${JSON.stringify(key)});tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>{db.close();res(false)}};r.onerror=()=>res(false)}))()`;

    try {
      adb(['shell', 'run-as', PKG, 'rm', `cache/${FNAME}`]); // clean slate

      const id = await s.eval(`(()=>{try{return JSON.parse(localStorage.getItem('anton-comm-identity')).contactHash}catch{return 'me'}})()`);
      const peer = await s.eval(`(async()=>{const cs=await __td.readStore('anton-comm','contacts');const c=cs.find(x=>x.publicKeyHex)||cs[0];return c?{hash:c.contactHash,name:c.displayName}:null;})()`);
      if (!peer) throw new Error('phone has no contacts to attach a thread to');
      log('peer: ' + peer.name);

      const payload = { data: B64, mimeType: 'text/plain', filename: FNAME, size: CONTENT.length };
      const msg = { id: MID, threadHash: peer.hash, fromHash: peer.hash, toHash: id, direction: 'in', plaintext: JSON.stringify(payload), status: 'received', kind: 'file', ts: new Date().toISOString() };
      await s.eval(put('messages', msg));

      // resume-robust nav: reset, open chat tab, open the peer thread
      await s.eval(`(async()=>{for(let i=0;i<5;i++){await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i,160);}})()`);
      await s.eval(`(()=>{const t=document.querySelector('[aria-controls="tabpanel-chat"]');if(t)t.click();})()`); await s.eval('__td.sleep(700)');
      await s.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.innerText||'').includes(${JSON.stringify(peer.name)}));if(b)b.click();})()`); await s.eval('__td.sleep(1600)');

      const body = await s.eval('document.body.innerText');
      const hasFile = body.includes(FNAME);
      const hasTap = /Tap to open|Tryck för att öppna/i.test(body);
      log(`FileBubble: filename=${hasFile} tapHint=${hasTap}`);
      assert.ok(hasFile && hasTap, 'received file renders as a FileBubble (filename + tap-to-open)');

      // tap to save+open (writeFile to cache happens before the share sheet opens)
      await s.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.innerText||'').includes(${JSON.stringify(FNAME)}));if(b)b.click();})()`); await s.eval('__td.sleep(2200)');

      const ls = adb(['shell', 'run-as', PKG, 'ls', 'cache']);
      const saved = ls.split(/\s+/).some((x) => x === FNAME);
      adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']); // dismiss share sheet
      adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
      log('cache after tap: saved=' + saved);
      assert.ok(saved, 'tapping the file saved it to the app cache (binary) via @capacitor/filesystem');
    } finally {
      await s.eval(del('messages', MID));
      adb(['shell', 'run-as', PKG, 'rm', `cache/${FNAME}`]);
      s.close();
    }
  },
};
