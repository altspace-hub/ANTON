/**
 * comm-iso-envelope.e2e.cjs — #Iter-4 ISO 20022 raw-envelope viewer + the
 * partial-pacs008 no-blank guard (single Comm phone, idempotent, no network).
 *
 *  A) a tx with a FULL pacs008 → the detail's "View raw ISO 20022 envelope"
 *     toggle reveals a labelled block containing the parties + a street value
 *     the summary rows collapse.
 *  B) a tx with a PARTIAL pacs008 (debtor only, no creditor) → the detail still
 *     RENDERS (does not blank) — the guard that previously crashed the screen.
 * Fresh ids + full cleanup.
 *
 * Requires ANTON_COMM_SERIAL pinned.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

module.exports = {
  name: 'comm-iso-envelope',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl); await install(s);
    const FULL = 'e2e-iso-full-' + Date.now();
    const PARTIAL = 'e2e-iso-partial-' + Date.now();
    const put = (rec) => `(()=>new Promise((res,rej)=>{const r=indexedDB.open('anton-comm');r.onsuccess=()=>{const db=r.result;const tx=db.transaction('wallet_txs','readwrite');tx.objectStore('wallet_txs').put(${JSON.stringify(rec)});tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>{db.close();rej(''+tx.error)}};r.onerror=()=>rej('open')}))()`;
    const del = (key) => `(()=>new Promise((res)=>{const r=indexedDB.open('anton-comm');r.onsuccess=()=>{const db=r.result;const tx=db.transaction('wallet_txs','readwrite');tx.objectStore('wallet_txs').delete(${JSON.stringify(key)});tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>{db.close();res(false)}};r.onerror=()=>res(false)}))()`;
    const openRowAndWait = async (marker) => {
      await s.eval(`(async()=>{for(let i=0;i<6;i++){await __td.clickText(/Tillbaka|Avbryt|Back|Cancel/i,150);}})()`);
      await s.eval(`(()=>{const t=document.querySelector('[aria-controls="tabpanel-wallet"]');if(t)t.click();})()`); await s.eval('__td.sleep(1100)');
      await s.eval(`__td.clickText(/Historik|History/i, 1000)`);
      const opened = await s.eval(`(()=>{const el=[...document.querySelectorAll('*')].find(x=>(x.innerText||'').includes(${JSON.stringify(marker)})&&![...x.children].some(c=>(c.textContent||'').includes(${JSON.stringify(marker)})));if(el){el.click();return true;}return false;})()`);
      let body = '';
      for (let i = 0; i < 8 && !/Motpart|Counterparty/i.test(body); i++) { await s.eval('__td.sleep(600)'); body = await s.eval('document.body.innerText'); }
      return { opened, body };
    };
    try {
      // A) full pacs008 — raw envelope viewer
      const full = { id: FULL, ts: Date.now(), kind: 'send', counterparty: 'fc_E2EIsoFull0000000000000000000000A', amountMicroFtc: '200000', fiatValueAtTx: 0, fiatCurrency: 'SEK', ref: null, txHash: null, jurisdictionAtTx: null, walletAddress: null,
        pacs008: { debtor: { address: 'fc_me00000000000000000000000000000000', name: 'Anna Debtor', country: 'SE', street: 'Storgatan 5', postcode: '11122', city: 'Stockholm' }, creditor: { address: 'fc_E2EIsoFull0000000000000000000000A', name: 'Bob Creditor', country: 'SE', street: 'Kungsgatan 9', postcode: '11143', city: 'Stockholm' }, amountMicroFtc: '200000', currency: 'FTC', purpose: 'COMMERCE', reference: 'E2E-REF-001' } };
      await s.eval(put(full));
      const a = await openRowAndWait('E2EIsoF'); // abbreviation-safe (history shows fc_E2EIsoF…)
      assert.ok(a.opened, 'full-pacs008 tx row opened');
      assert.ok(/View raw|Visa rått/i.test(a.body), '"View raw ISO 20022 envelope" toggle present');
      await s.eval(`__td.clickText(/View raw ISO 20022 envelope|Visa rått ISO 20022-kuvert/i, 700)`);
      const raw = await s.eval('document.body.innerText');
      assert.ok(/pacs\.008/i.test(raw) && /Bob Creditor/.test(raw) && /Kungsgatan 9/.test(raw),
        'raw envelope reveals the full labelled message (parties + collapsed street)');
      log('raw envelope viewer OK');

      // B) partial pacs008 (no creditor) — must not blank the detail
      const partial = { id: PARTIAL, ts: Date.now() - 1000, kind: 'receive', counterparty: 'fc_E2EIsoPart0000000000000000000000B', amountMicroFtc: '50000', fiatValueAtTx: 0, fiatCurrency: 'SEK', ref: null, txHash: null, jurisdictionAtTx: null, walletAddress: null,
        pacs008: { debtor: { address: 'fc_E2EIsoPart0000000000000000000000B', name: 'Solo Debtor', country: 'SE' }, amountMicroFtc: '50000', currency: 'FTC', purpose: 'COMMERCE', reference: 'E2E-REF-002' } };
      await s.eval(put(partial));
      const b = await openRowAndWait('E2EIsoP'); // abbreviation-safe (history shows fc_E2EIsoP…)
      assert.ok(b.opened, 'partial-pacs008 tx row opened');
      assert.ok(/Motpart|Counterparty/i.test(b.body), 'partial-pacs008 detail renders (does not blank — guard works)');
      assert.ok(/Solo Debtor|E2EIsoPart/.test(b.body), 'partial-pacs008 detail shows its content');
      log('partial-pacs008 no-blank guard OK');
    } finally {
      await s.eval(del(FULL));
      await s.eval(del(PARTIAL));
      s.close();
    }
  },
};
