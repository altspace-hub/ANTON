/**
 * comm-save-friend.e2e.cjs — "Save as friend" from the tx detail (single Comm
 * phone, idempotent, no network). Injects a received tx from an un-saved
 * address, opens Wallet → History → the row → detail, asserts the "Save as
 * friend" button shows, taps it, and asserts an fc_contact is created at that
 * address under the real PACS.008 party name. Fresh ids + full cleanup.
 *
 * Requires ANTON_COMM_SERIAL pinned.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-save-friend',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    const ADDR = 'fc_E2ESaveFriend99999999999999999999';
    const TXID = 'e2e-savefriend-' + Date.now();
    const put = (store, rec) => `(()=>new Promise((res,rej)=>{const r=indexedDB.open('anton-comm');r.onsuccess=()=>{const db=r.result;const tx=db.transaction(${JSON.stringify(store)},'readwrite');tx.objectStore(${JSON.stringify(store)}).put(${JSON.stringify(rec)});tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>{db.close();rej(''+tx.error)}};r.onerror=()=>rej('open')}))()`;
    const del = (store, key) => `(()=>new Promise((res)=>{const r=indexedDB.open('anton-comm');r.onsuccess=()=>{const db=r.result;const tx=db.transaction(${JSON.stringify(store)},'readwrite');tx.objectStore(${JSON.stringify(store)}).delete(${JSON.stringify(key)});tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>{db.close();res(false)}};r.onerror=()=>res(false)}))()`;
    let savedId = null;
    try {
      // received tx from an un-saved address; full pacs008 (debtor=sender, creditor=me)
      const tx = { id: TXID, ts: Date.now(), kind: 'receive', counterparty: ADDR, amountMicroFtc: '50000', fiatValueAtTx: 0, fiatCurrency: 'SEK', ref: null, txHash: null, jurisdictionAtTx: null, walletAddress: null, pacs008: { debtor: { address: ADDR, name: 'E2E SaveMe', country: 'SE' }, creditor: { address: 'fc_me0000000000000000000000000000000', name: 'Me', country: 'SE' } } };
      await s.eval(put('wallet_txs', tx));

      // wallet → history → open the row → detail
      await s.eval(`(async()=>{for(let i=0;i<6;i++){await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i,150);}})()`);
      await s.eval(`(()=>{const t=document.querySelector('[aria-controls="tabpanel-wallet"]');if(t)t.click();})()`); await s.eval('__td.sleep(1100)');
      await s.eval(`__td.clickText(/Historik|History/i, 1000)`);
      // the row is a <div onClick> — click a leaf descendant so the click bubbles to its handler
      const opened = await s.eval(`(()=>{const el=[...document.querySelectorAll('*')].find(x=>(x.innerText||'').includes('E2ESave')&&![...x.children].some(c=>(c.textContent||'').includes('E2ESave')));if(el){el.click();return true;}return false;})()`);
      assert.ok(opened, 'history row for the injected tx found + tapped');
      let body = '';
      for (let i = 0; i < 8 && !/Motpart|Counterparty/i.test(body); i++) { await s.eval('__td.sleep(600)'); body = await s.eval('document.body.innerText'); }
      assert.ok(/Save as friend|Spara som vän/i.test(body), 'tx detail shows "Save as friend" for the un-saved counterparty');
      log('detail Save-as-friend button shown');

      // tap it → an fc_contact is created at the address under the real party name
      await s.eval(`__td.clickText(/Save as friend|Spara som vän/i, 1500)`);
      await s.eval('__td.sleep(1500)');
      const contacts = await s.eval(`__td.readStore('anton-comm','fc_contacts')`);
      const saved = (contacts || []).find((c) => c.address === ADDR);
      savedId = saved ? saved.id : null;
      assert.ok(saved, 'tapping "Save as friend" created an fc_contact at the counterparty address');
      assert.equal(saved.label, 'E2E SaveMe', 'the contact is saved under the real PACS.008 party name');
      log('contact created: ' + saved.label);
    } finally {
      await s.eval(del('wallet_txs', TXID));
      if (savedId) await s.eval(del('fc_contacts', savedId));
      s.close();
    }
  },
};
