/**
 * ledger.test.ts — the durable transaction ledger: record sends, fold in
 * fetched received rows, dedup, persistence across restart, and the
 * write-serialisation that stops concurrent writes from losing entries.
 */
import { describe, it, expect } from 'vitest';
import { TransactionLedger, type FetchedRow } from '../../src/main/ledger.js';
import { InMemoryStorageBackend } from '../../src/main/wallet/storage.js';

const ADDR = 'fc_test';
function mkLedger(now = 1000) {
  const storage = new InMemoryStorageBackend();
  let t = now;
  const ledger = new TransactionLedger(storage, async () => ADDR, () => t);
  return { storage, ledger, setNow: (n: number) => { t = n; } };
}

describe('TransactionLedger', () => {
  it('records a sent payment and lists it (durable source of truth for sends)', async () => {
    const { ledger } = mkLedger(1000);
    await ledger.recordSent({ txId: 'tx1', amount: 1.5, counterparty: 'fc_b', reference: 'coffee', feeFtc: 0.001 });
    const rows = await ledger.list(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      txId: 'tx1', direction: 'out', amount: 1.5, counterparty: 'fc_b',
      reference: 'coffee', feeFtc: 0.001, confirmed: false, ts: 1000,
    });
  });

  it('is idempotent on txId — a re-record updates rather than duplicates', async () => {
    const { ledger } = mkLedger();
    await ledger.recordSent({ txId: 'tx1', amount: 1, counterparty: 'fc_b' });
    await ledger.recordSent({ txId: 'tx1', amount: 1, counterparty: 'fc_b', confirmed: true });
    const rows = await ledger.list(10);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.confirmed).toBe(true);
  });

  it('persists across a fresh ledger instance on the same storage (survives restart)', async () => {
    const { storage, ledger } = mkLedger();
    await ledger.recordSent({ txId: 'tx1', amount: 2, counterparty: 'fc_b' });
    const reopened = new TransactionLedger(storage, async () => ADDR, () => 2000);
    expect((await reopened.list(10)).map((r) => r.txId)).toEqual(['tx1']);
  });

  it('keys history per wallet — a different wallet never sees the prior one', async () => {
    const storage = new InMemoryStorageBackend();
    const a = new TransactionLedger(storage, async () => 'fc_walletA');
    const b = new TransactionLedger(storage, async () => 'fc_walletB');
    await a.recordSent({ txId: 'a1', amount: 1, counterparty: 'x' });
    await b.recordSent({ txId: 'b1', amount: 2, counterparty: 'y' });
    expect((await a.list(10)).map((r) => r.txId)).toEqual(['a1']);
    expect((await b.list(10)).map((r) => r.txId)).toEqual(['b1']); // no bleed
  });

  it('mergeFetched adds new received rows, deduped by txId', async () => {
    const { ledger } = mkLedger();
    const fetched: FetchedRow[] = [
      { txId: 'rx1', direction: 'in', amount: 50, counterparty: 'fc_c', ts: 900, confirmed: true },
      { txId: 'rx2', direction: 'in', amount: 25, counterparty: 'fc_d', ts: 950, confirmed: false },
    ];
    await ledger.mergeFetched(fetched);
    await ledger.mergeFetched(fetched); // again → no duplicates
    expect((await ledger.list(10)).map((r) => r.txId).sort()).toEqual(['rx1', 'rx2']);
  });

  it('mergeFetched never clobbers a recorded send — only flips confirmed', async () => {
    const { ledger } = mkLedger();
    await ledger.recordSent({ txId: 'tx1', amount: 1, counterparty: 'fc_b', reference: 'keep-me', feeFtc: 0.001 });
    // The node echoes our own send back via getIsoReceived — without our
    // reference/fee, with a bogus amount, but now confirmed.
    await ledger.mergeFetched([{ txId: 'tx1', direction: 'out', amount: 999, counterparty: 'fc_b', ts: 5, confirmed: true }]);
    expect(await ledger.getByTxId('tx1')).toMatchObject({
      amount: 1, reference: 'keep-me', feeFtc: 0.001, confirmed: true, // ours kept, confirmed flipped
    });
  });

  it('lists newest-first and caps at the requested limit', async () => {
    const { ledger, setNow } = mkLedger();
    setNow(100); await ledger.recordSent({ txId: 'a', amount: 1, counterparty: 'x' });
    setNow(300); await ledger.recordSent({ txId: 'b', amount: 1, counterparty: 'x' });
    setNow(200); await ledger.recordSent({ txId: 'c', amount: 1, counterparty: 'x' });
    expect((await ledger.list(2)).map((r) => r.txId)).toEqual(['b', 'c']);
  });

  it('returns persisted sends even when the fetch is empty (node-outage path)', async () => {
    const { ledger } = mkLedger();
    await ledger.recordSent({ txId: 'tx1', amount: 1, counterparty: 'fc_b' });
    await ledger.mergeFetched([]); // outage → no rows
    expect((await ledger.list(10)).map((r) => r.txId)).toEqual(['tx1']);
  });

  it('serialises concurrent writes without losing entries', async () => {
    const { ledger } = mkLedger();
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
      ledger.recordSent({ txId: `tx${i}`, amount: 1, counterparty: 'x' })));
    const rows = await ledger.list(100);
    expect(rows).toHaveLength(20);
    expect(new Set(rows.map((r) => r.txId)).size).toBe(20);
  });

  it('tolerates a corrupt store (returns empty, never throws)', async () => {
    const storage = new InMemoryStorageBackend();
    await storage.set(`ledger.v1.${ADDR}`, 'not json{');
    const ledger = new TransactionLedger(storage, async () => ADDR);
    expect(await ledger.list(10)).toEqual([]);
  });
});
