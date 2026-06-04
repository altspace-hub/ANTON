/**
 * comm-send-to-person.e2e.cjs — #93 Send-to-person on a single Comm phone
 * (idempotent, no network, no spend).
 *
 * Injects a SENT wallet_tx (creditor "E2E Payee") + a saved fc_contact
 * ("E2E Friend"), opens Wallet → Send, and asserts:
 *   - the recipient picker lists the paid recipient (Recent) + the friend,
 *   - starring the recent promotes it to a STARRED fc_contact saved under its
 *     real creditor name (not the abbreviated address),
 *   - tapping a recipient opens the locked "Paying" compose card.
 * Fresh ids per run + full cleanup (including the contact the star created).
 *
 * Requires ANTON_COMM_SERIAL pinned to the funded phone (with a wallet).
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const PAYEE = 'fc_E2EPayee1111111111111111111111111';
const FRIEND = 'fc_E2EFriend2222222222222222222222222';

module.exports = {
  name: 'comm-send-to-person',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    const TXID = 'e2e-s2p-tx-' + Date.now();
    const CID = 'e2e-s2p-friend-' + Date.now();
    const put = (store, rec) => `(()=>new Promise((res,rej)=>{const r=indexedDB.open('anton-comm');r.onsuccess=()=>{const db=r.result;const tx=db.transaction(${JSON.stringify(store)},'readwrite');tx.objectStore(${JSON.stringify(store)}).put(${JSON.stringify(rec)});tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>{db.close();rej(''+tx.error)}};r.onerror=()=>rej('open')}))()`;
    const del = (store, key) => `(()=>new Promise((res)=>{const r=indexedDB.open('anton-comm');r.onsuccess=()=>{const db=r.result;const tx=db.transaction(${JSON.stringify(store)},'readwrite');tx.objectStore(${JSON.stringify(store)}).delete(${JSON.stringify(key)});tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>{db.close();res(false)}};r.onerror=()=>res(false)}))()`;
    let createdStarId = null;
    try {
      // 1. inject a sent tx + a saved friend (walletAddress null → visible under any wallet)
      const tx = { id: TXID, ts: Date.now(), kind: 'send', counterparty: PAYEE, amountMicroFtc: '200000', fiatValueAtTx: 0, fiatCurrency: 'SEK', ref: null, txHash: null, jurisdictionAtTx: null, walletAddress: null, pacs008: { creditor: { address: PAYEE, name: 'E2E Payee', country: 'SE' } } };
      const friend = { id: CID, label: 'E2E Friend', address: FRIEND, addedAt: Date.now() };
      await s.eval(put('wallet_txs', tx));
      await s.eval(put('fc_contacts', friend));

      // 2. nav: wallet tab → Send → picker
      await s.eval(`(async()=>{for(let i=0;i<6;i++){await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i,150);}})()`);
      await s.eval(`(()=>{const t=document.querySelector('[aria-controls="tabpanel-wallet"]');if(t)t.click();})()`); await s.eval('__td.sleep(1100)');
      const sentBtn = await s.eval(`__td.clickText(/^\\s*Skicka\\s*$|^\\s*Send\\s*$/i, 1000)`);
      assert.ok(sentBtn, 'Send button found on the balance screen');

      const body = await s.eval('document.body.innerText');
      const hasPayee = body.includes('E2E Payee');
      const hasFriend = body.includes('E2E Friend');
      const hasSection = /Senaste|Recent|Vänner|Friends/i.test(body);
      log(`picker: payee=${hasPayee} friend=${hasFriend} section=${hasSection}`);
      assert.ok(hasPayee && hasFriend && hasSection, 'recipient picker lists the paid recipient + the friend under sections');

      // 3. star the payee → promotes to a starred fc_contact (first ⭐ button = Recent row)
      const starTapped = await s.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Add favourite|Lägg till favorit/i.test(x.getAttribute('aria-label')||''));if(b){b.click();return true;}return false;})()`);
      assert.ok(starTapped, 'a favourite (☆) toggle was present and tapped');
      await s.eval('__td.sleep(1500)'); // addContact + setContactStarred + refresh
      const contacts = await s.eval(`__td.readStore('anton-comm','fc_contacts')`);
      const star = (contacts || []).find((c) => c.address === PAYEE && c.starred === true);
      createdStarId = star ? star.id : null;
      assert.ok(star, 'starring the recent created a starred fc_contact at the payee address');
      assert.equal(star.label, 'E2E Payee', 'the new contact is saved under the real creditor name (not the abbreviated address)');

      // 4. tap the payee row → locked "Paying" compose card
      await s.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.innerText||'').includes('E2E Payee'));if(b)b.click();})()`); await s.eval('__td.sleep(1300)');
      const compose = await s.eval('document.body.innerText');
      assert.ok(/Betalar|Paying/i.test(compose) && compose.includes('E2E Payee'), 'tapping a recipient opens the locked "Paying" compose card');
      log('compose locked-recipient card OK');
    } finally {
      await s.eval(del('wallet_txs', TXID));
      await s.eval(del('fc_contacts', CID));
      if (createdStarId) await s.eval(del('fc_contacts', createdStarId));
      s.close();
    }
  },
};
