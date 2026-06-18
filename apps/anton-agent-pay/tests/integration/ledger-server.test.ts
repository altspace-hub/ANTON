/**
 * ledger-server.test.ts — proves the durable ledger is wired through the
 * real JSON-RPC server exactly as production does it: an approved payment
 * is recorded, and listTransactions returns the merged sent+received history
 * (and keeps returning the sends after a "restart" on the same storage).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer, type ServerDeps } from '../../src/main/server.js';
import { ProposalStore } from '../../src/main/proposals.js';
import { PairingStore } from '../../src/main/pairing.js';
import { StubModalDriver } from '../../src/main/modal.js';
import { TransactionLedger, type FetchedRow } from '../../src/main/ledger.js';
import { InMemoryStorageBackend, type StorageBackend } from '../../src/main/wallet/storage.js';

const TO = 'fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs';

interface Harness {
  app: FastifyInstance;
  modal: StubModalDriver;
  /** The received rows the next listTransactions "fetch" will fold in. */
  fetched: FetchedRow[];
  pair: () => { sessionToken: string };
  call: (token: string, method: string, params?: unknown) => Promise<{ status: number; body: unknown }>;
}

/** Wire a real TransactionLedger into ServerDeps mirroring main.ts /
 *  standalone: submitPayment → recordSent; recentTransactions →
 *  mergeFetched(fetched) then list. `storage` is shared so a "restart"
 *  test can re-open the same ledger. */
function buildHarness(storage: StorageBackend): Harness {
  const pairings = new PairingStore();
  const proposals = new ProposalStore();
  const modal = new StubModalDriver();
  const ledger = new TransactionLedger(storage, async () => 'fc_TESTWALLET');
  const fetched: FetchedRow[] = [];
  let n = 0;
  const deps: ServerDeps = {
    pairings, proposals, modal,
    walletStatus: async () => ({ walletAddress: 'fc_TESTWALLET', balanceFtc: 100, lastSeenBlock: 805000 }),
    submitPayment: async (req) => {
      const result = { txId: `tx-${++n}`, feeFtc: 0.001 };
      await ledger.recordSent({
        txId: result.txId, amount: req.amountFtc, counterparty: req.to, feeFtc: result.feeFtc,
        ...(req.reference !== undefined ? { reference: req.reference } : {}),
      });
      return result;
    },
    recentTransactions: async (limit) => {
      await ledger.mergeFetched(fetched);
      return ledger.list(limit);
    },
    counterpartyHint: async () => null,
    walletHasPassphrase: async () => false,
  };
  const app = buildServer(deps, { bypassOriginCheck: true });
  return {
    app, modal, fetched,
    pair: () => {
      const code = pairings.newCode();
      const issued = pairings.redeemCode({ name: 'test-agent', code });
      return { sessionToken: issued.sessionToken };
    },
    call: async (token, method, params) => {
      const res = await app.inject({
        method: 'POST', url: '/rpc',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: 'http://localhost' },
        payload: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      });
      return { status: res.statusCode, body: res.json() };
    },
  };
}

async function flushAsync(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
  await new Promise((r) => setImmediate(r));
}

describe('ledger wired through the JSON-RPC server', () => {
  let storage: InMemoryStorageBackend;
  let h: Harness;
  beforeEach(() => { storage = new InMemoryStorageBackend(); h = buildHarness(storage); });

  it('records an approved payment so it shows in listTransactions', async () => {
    const { sessionToken } = h.pair();
    h.modal.queueDecision({ kind: 'approve' });

    await h.call(sessionToken, 'proposePayment', { to: TO, amountFtc: 5, reference: 'two espressos' });
    await flushAsync();

    const r = await h.call(sessionToken, 'listTransactions', { limit: 10 });
    const rows = (r.body as { result: Array<Record<string, unknown>> }).result;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ direction: 'out', amount: 5, counterparty: TO, reference: 'two espressos', txId: 'tx-1' });
  });

  it('merges best-effort received rows alongside the recorded send', async () => {
    const { sessionToken } = h.pair();
    h.modal.queueDecision({ kind: 'approve' });
    await h.call(sessionToken, 'proposePayment', { to: TO, amountFtc: 2 });
    await flushAsync();

    // The node now reports an inbound delivery.
    h.fetched.push({ txId: 'rx-1', direction: 'in', amount: 9, counterparty: 'fc_payer', ts: 1, confirmed: true });

    const r = await h.call(sessionToken, 'listTransactions', { limit: 10 });
    const rows = (r.body as { result: Array<{ txId: string; direction: string }> }).result;
    expect(rows.map((x) => x.txId).sort()).toEqual(['rx-1', 'tx-1']);
    expect(rows.find((x) => x.txId === 'tx-1')!.direction).toBe('out');
    expect(rows.find((x) => x.txId === 'rx-1')!.direction).toBe('in');
  });

  it('still returns the recorded send after a "restart" on the same storage', async () => {
    const { sessionToken } = h.pair();
    h.modal.queueDecision({ kind: 'approve' });
    await h.call(sessionToken, 'proposePayment', { to: TO, amountFtc: 3 });
    await flushAsync();

    // Restart: a brand-new server + ledger on the SAME storage (the file
    // backend in production). The history must persist.
    const h2 = buildHarness(storage);
    const { sessionToken: t2 } = h2.pair();
    const r = await h2.call(t2, 'listTransactions', { limit: 10 });
    const rows = (r.body as { result: Array<{ txId: string; amount: number }> }).result;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ txId: 'tx-1', amount: 3 });
  });
});
