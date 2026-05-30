/**
 * wallet-ledger.test.ts — per-wallet ledger scoping (roadmap Phase 5).
 *
 * Before this fix the wallet ledger (listTxs / computeBalanceMicroFtc) returned
 * EVERY wallet's rows, so multi-wallet showed wrong balances and the tax engine
 * read the wrong positions. Rows are now tagged with walletAddress and reads are
 * scoped; legacy untagged rows stay visible (backward-compatible).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { recordTx, listTxs, computeBalanceMicroFtc } from '../services/transactions';
import { openDb, STORE_WALLET_TXS } from '../services/db';

const WALLET_A = 'fc_wallet_aaaaaaaaaaaaaaaa';
const WALLET_B = 'fc_wallet_bbbbbbbbbbbbbbbb';

async function clearTxs(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_WALLET_TXS, 'readwrite');
    tx.objectStore(STORE_WALLET_TXS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const send = (walletAddress: string | undefined, amountMicroFtc: string, counterparty = 'merchant') =>
  recordTx({ kind: 'send', counterparty, amountMicroFtc, fiatValueAtTx: 0, fiatCurrency: 'SEK',
    ref: null, txHash: null, jurisdictionAtTx: 'SE', walletAddress });

const receive = (walletAddress: string | undefined, amountMicroFtc: string, counterparty = 'peer') =>
  recordTx({ kind: 'receive', counterparty, amountMicroFtc, fiatValueAtTx: 0, fiatCurrency: 'SEK',
    ref: null, txHash: null, jurisdictionAtTx: 'SE', walletAddress });

describe('wallet ledger is scoped per wallet', () => {
  beforeEach(clearTxs);

  it('listTxs returns only the requested wallet’s rows', async () => {
    await send(WALLET_A, '5000000');
    await receive(WALLET_B, '3000000');
    await send(WALLET_A, '1000000');

    const a = await listTxs(100, WALLET_A);
    const b = await listTxs(100, WALLET_B);
    expect(a).toHaveLength(2);
    expect(a.every((t) => t.walletAddress === WALLET_A)).toBe(true);
    expect(b).toHaveLength(1);
    expect(b[0]!.walletAddress).toBe(WALLET_B);
  });

  it('computeBalanceMicroFtc is per wallet — no cross-wallet leakage', async () => {
    await send(WALLET_A, '5000000');
    await receive(WALLET_B, '3000000');
    await send(WALLET_A, '1000000');

    expect(await computeBalanceMicroFtc(WALLET_A)).toBe(-6_000_000n);
    expect(await computeBalanceMicroFtc(WALLET_B)).toBe(3_000_000n);
  });

  it('legacy untagged rows stay visible under any wallet (backward compat)', async () => {
    await receive(undefined, '2000000', 'legacy'); // recorded before multi-wallet (no active wallet in test env)
    const a = await listTxs(100, WALLET_A);
    expect(a.some((t) => t.counterparty === 'legacy')).toBe(true);
    expect(await computeBalanceMicroFtc(WALLET_A)).toBe(2_000_000n);
  });
});
