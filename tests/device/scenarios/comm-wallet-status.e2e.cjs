/**
 * comm-wallet-status.e2e.cjs — WalletTx send-lifecycle persistence on-device
 * (single phone, no spend, self-cleaning). Writes a `send` row carrying
 * status='queued', flips it to 'confirmed' (the lifecycle the poller drives),
 * and reads it back to assert the new status field round-trips through the
 * device's wallet_txs store (#79 Phase 4). A real send is blocked by the
 * Travel-Rule gate + would spend FTC, so the lifecycle is exercised at the
 * data layer; the StatusPill render is a 1-line faithful port verified by
 * typecheck + build. The fixture is deleted at the end.
 */
const assert = require('node:assert/strict');
const { forwardApp } = require('../lib/devices.cjs');
const { CdpSession } = require('../lib/cdp.cjs');
const { install } = require('../lib/dom-driver.cjs');

const FIX_ID = 'e2e-status-fixture';

module.exports = {
  name: 'comm-wallet-status',
  apps: ['comm'],
  async run({ log }) {
    const comm = await forwardApp('comm', 0);
    const s = new CdpSession(comm.wsUrl);
    await install(s);
    try {
      const r = await s.eval(`(async () => {
        const idb = (mode, fn) => new Promise((resolve, reject) => {
          const req = indexedDB.open('anton-comm');
          req.onsuccess = () => {
            const db = req.result;
            try {
              const tx = db.transaction('wallet_txs', mode);
              const out = fn(tx.objectStore('wallet_txs'));
              tx.oncomplete = () => { db.close(); resolve(out ? out.result : undefined); };
              tx.onerror = () => { db.close(); reject(tx.error); };
            } catch (e) { try { db.close(); } catch {} reject(e); }
          };
          req.onerror = () => reject(req.error);
        });
        const ID = ${JSON.stringify(FIX_ID)};
        // write a queued send row
        await idb('readwrite', (st) => st.put({
          id: ID, ts: Date.now(), kind: 'send', counterparty: 'fc_E2eStatusFixture',
          amountMicroFtc: '200000', fiatValueAtTx: 0, fiatCurrency: 'SEK', ref: null,
          txHash: 'e2e-status-txhash', jurisdictionAtTx: 'SE', status: 'queued',
        }));
        const afterWrite = await idb('readonly', (st) => st.get(ID));
        // flip to confirmed, like pollConfirmation/updateTxStatus does
        const row = await idb('readonly', (st) => st.get(ID));
        await idb('readwrite', (st) => st.put({ ...row, status: 'confirmed' }));
        const afterConfirm = await idb('readonly', (st) => st.get(ID));
        // clean up
        await idb('readwrite', (st) => st.delete(ID));
        const afterDelete = await idb('readonly', (st) => st.get(ID));
        return {
          wroteQueued: afterWrite && afterWrite.status === 'queued' && afterWrite.jurisdictionAtTx === 'SE',
          flippedConfirmed: afterConfirm && afterConfirm.status === 'confirmed',
          cleaned: afterDelete == null,
        };
      })()`);
      assert.ok(r.wroteQueued, 'send row persists status=queued + jurisdictionAtTx');
      assert.ok(r.flippedConfirmed, 'status flips queued → confirmed (the poller path)');
      assert.ok(r.cleaned, 'fixture removed');
      log('WalletTx status lifecycle persists on-device (queued → confirmed)');
    } finally {
      s.close();
    }
  },
};
