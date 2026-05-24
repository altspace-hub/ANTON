/**
 * chain.test.ts — submitPayment + fetchRecentTransactions with a
 * stubbed fetch. No network, no real chain — proves the SDK wiring
 * + UETR plumbing + Ed25519 signing.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getChainClient, _resetChainClient,
  submitPayment, fetchRecentTransactions, type ChainConfig,
} from '../../src/main/chain.js';
import {
  Wallet, InMemoryStorageBackend,
} from '../../src/main/wallet/index.js';

const RECIPIENT = 'fc_VEH4mJb5P9hKEaWkiuXRG6e6jooCnQZqKs';

/** Build a fetch-mock that records every call + returns canned
 *  responses keyed on URL substring. Provides BOTH `.json()` and
 *  `.text()` because the SDK's RpcClient reads `res.text()` first
 *  and JSON-parses itself (so it can include the body in error
 *  messages). */
type RouteHandler = unknown | ((body: unknown) => unknown);
type FetchFn = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;
function stubFetch(routes: Record<string, RouteHandler>): {
  fn: FetchFn; calls: Array<{ url: string; init?: RequestInit; body?: unknown }>;
} {
  const calls: Array<{ url: string; init?: RequestInit; body?: unknown }> = [];
  const fn: FetchFn = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, ...(init !== undefined ? { init } : {}), body });
    for (const [pattern, handler] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        const result = typeof handler === 'function'
          ? (handler as (b: unknown) => unknown)(body)
          : handler;
        const text = JSON.stringify(result);
        return {
          ok: true, status: 200,
          text: async () => text,
          json: async () => result,
        } as Response;
      }
    }
    const errText = JSON.stringify({ error: `no stub for ${url}` });
    return {
      ok: false, status: 404,
      text: async () => errText,
      json: async () => ({ error: `no stub for ${url}` }),
    } as Response;
  }) as FetchFn;
  return { fn, calls };
}

const TEST_CONFIG = (fetch?: FetchFn): ChainConfig => ({
  endpoint: 'http://test.local:8545',
  ...(fetch ? { fetch: fetch as typeof globalThis.fetch } : {}),
});

describe('chain', () => {
  beforeEach(() => { _resetChainClient(); });
  afterEach(() => { _resetChainClient(); });

  describe('getChainClient', () => {
    it('returns a client with the configured endpoint', () => {
      const c = getChainClient(TEST_CONFIG());
      expect(c).toBeTruthy();
    });

    it('caches the client across calls with the same config', () => {
      const c1 = getChainClient(TEST_CONFIG());
      const c2 = getChainClient(TEST_CONFIG());
      expect(c2).toBe(c1);
    });

    it('rebuilds the client when the apiKey changes', () => {
      const c1 = getChainClient({ endpoint: 'http://a.local' });
      const c2 = getChainClient({ endpoint: 'http://a.local', apiKey: 'newkey' });
      expect(c2).not.toBe(c1);
    });
  });

  // ── submitPayment ────────────────────────────────────────────────

  describe('submitPayment', () => {
    it('builds a PACS.008 tx + signs + POSTs /submit_signed_transaction', async () => {
      // Set up a real wallet (in-memory) so we have a real keypair to sign with.
      const wallet = new Wallet(new InMemoryStorageBackend());
      await wallet.create();
      const unlocked = await wallet.unlock();

      const { fn, calls } = stubFetch({
        '/get_utxos': [
          // 5 FTC of UTXOs — plenty to cover a 1 FTC payment + 100 sat fee
          { tx_id: 'utxo-1', output_index: 0, amount: 5 * 100_000_000,
            address: unlocked.address, block_height: 805000 },
        ],
        '/submit_signed_transaction': (body: unknown) => ({
          status: 'accepted',
          tx_id: (body as { id: string }).id,
          originator_address: unlocked.address,
        }),
      });

      const result = await submitPayment({
        unlocked,
        to: RECIPIENT,
        amountFtc: 1.0,
        chainConfig: TEST_CONFIG(fn),
      });

      expect(result.txId).toBeTruthy();
      expect(result.feeFtc).toBe(0.000001); // 100 sat / 1e8

      // Verify the calls: /get_utxos then /submit_signed_transaction.
      const paths = calls.map(c => c.url);
      expect(paths.some(u => u.includes('/get_utxos'))).toBe(true);
      expect(paths.some(u => u.includes('/submit_signed_transaction'))).toBe(true);

      // Verify the submit body shape — id present, inputs reference
      // the UTXO we set up, outputs include the recipient amount.
      const submitCall = calls.find(c => c.url.includes('/submit_signed_transaction'));
      expect(submitCall).toBeTruthy();
      const tx = submitCall!.body as {
        id: string;
        inputs: Array<{ previous_tx_id: string; signature: string | null }>;
        outputs: Array<{ address: string; amount: number }>;
      };
      expect(tx.id).toBeTruthy(); // UETR
      expect(tx.inputs).toHaveLength(1);
      expect(tx.inputs[0]!.previous_tx_id).toBe('utxo-1');
      expect(tx.inputs[0]!.signature).toBeTruthy(); // signed
      expect(tx.outputs[0]!.address).toBe(RECIPIENT);
      expect(tx.outputs[0]!.amount).toBe(100_000_000); // 1 FTC = 1e8 sat

      unlocked.zero();
    });

    it('attaches the agent reference into the PACS.008 RmtInf', async () => {
      const wallet = new Wallet(new InMemoryStorageBackend());
      await wallet.create();
      const unlocked = await wallet.unlock();

      const { fn, calls } = stubFetch({
        '/get_utxos': [
          { tx_id: 'utxo-1', output_index: 0, amount: 10_000_000_000,
            address: unlocked.address, block_height: 805000 },
        ],
        '/submit_signed_transaction': (body: unknown) => ({
          status: 'accepted', tx_id: (body as { id: string }).id,
        }),
      });

      await submitPayment({
        unlocked, to: RECIPIENT, amountFtc: 0.5,
        reference: 'two espressos',
        chainConfig: TEST_CONFIG(fn),
      });

      // The encrypted_data field carries the PACS.008 — find the call
      // and parse it out. The reference shows up under the Ustrd block.
      const submitCall = calls.find(c => c.url.includes('/submit_signed_transaction'));
      const tx = submitCall!.body as { encrypted_data: number[] | null };
      // encrypted_data is the PACS.008 serialised as a byte array
      expect(tx.encrypted_data).toBeTruthy();
      const json = Buffer.from(tx.encrypted_data!).toString('utf8');
      expect(json).toContain('two espressos');

      unlocked.zero();
    });

    it('throws when the wallet has no UTXOs', async () => {
      const wallet = new Wallet(new InMemoryStorageBackend());
      await wallet.create();
      const unlocked = await wallet.unlock();

      const { fn } = stubFetch({ '/get_utxos': [] });

      await expect(submitPayment({
        unlocked, to: RECIPIENT, amountFtc: 1.0,
        chainConfig: TEST_CONFIG(fn),
      })).rejects.toThrow(/no UTXOs/);

      unlocked.zero();
    });

    it('throws when amountFtc is zero or negative', async () => {
      const wallet = new Wallet(new InMemoryStorageBackend());
      await wallet.create();
      const unlocked = await wallet.unlock();
      const { fn } = stubFetch({});

      await expect(submitPayment({
        unlocked, to: RECIPIENT, amountFtc: 0,
        chainConfig: TEST_CONFIG(fn),
      })).rejects.toThrow(/amountFtc must be > 0/);

      unlocked.zero();
    });

    it('selects multiple UTXOs greedily when one is too small', async () => {
      const wallet = new Wallet(new InMemoryStorageBackend());
      await wallet.create();
      const unlocked = await wallet.unlock();

      // Three 0.4 FTC UTXOs — need two to cover a 0.5 FTC payment + fee
      const { fn, calls } = stubFetch({
        '/get_utxos': [
          { tx_id: 'u1', output_index: 0, amount: 40_000_000, address: unlocked.address, block_height: 805000 },
          { tx_id: 'u2', output_index: 0, amount: 40_000_000, address: unlocked.address, block_height: 805001 },
          { tx_id: 'u3', output_index: 0, amount: 40_000_000, address: unlocked.address, block_height: 805002 },
        ],
        '/submit_signed_transaction': (body: unknown) => ({
          status: 'accepted', tx_id: (body as { id: string }).id,
        }),
      });

      await submitPayment({
        unlocked, to: RECIPIENT, amountFtc: 0.5,
        chainConfig: TEST_CONFIG(fn),
      });

      const submitCall = calls.find(c => c.url.includes('/submit_signed_transaction'));
      const tx = submitCall!.body as { inputs: Array<unknown> };
      expect(tx.inputs.length).toBeGreaterThanOrEqual(2);

      unlocked.zero();
    });
  });

  // ── fetchRecentTransactions ─────────────────────────────────────

  describe('fetchRecentTransactions', () => {
    it('returns the mapped iso_received list', async () => {
      const ADDRESS = 'fc_TEST_ADDRESS';
      const { fn } = stubFetch({
        '/iso_received': [
          { tx_id: 'tx-a', amount: 100, sender: 'fc_other',
            receiver: ADDRESS, timestamp: 1000, confirmed: true },
          { tx_id: 'tx-b', amount: 50, sender: 'fc_another',
            receiver: ADDRESS, timestamp: 1100, confirmed: false },
        ],
      });

      const rows = await fetchRecentTransactions(ADDRESS, 10, TEST_CONFIG(fn));
      expect(rows).toHaveLength(2);
      expect(rows[0]!.txId).toBe('tx-a');
      expect(rows[0]!.direction).toBe('in');
      expect(rows[0]!.counterparty).toBe('fc_other');
      expect(rows[0]!.confirmed).toBe(true);
      expect(rows[1]!.confirmed).toBe(false);
    });

    it('returns [] on RPC failure (does not throw)', async () => {
      const { fn } = stubFetch({}); // every URL 404s
      const rows = await fetchRecentTransactions('fc_X', 10, TEST_CONFIG(fn));
      expect(rows).toEqual([]);
    });

    it('caps the result at the requested limit', async () => {
      const { fn } = stubFetch({
        '/iso_received': Array.from({ length: 10 }, (_, i) => ({
          tx_id: `tx-${i}`, amount: 1, sender: 'fc_a',
          receiver: 'fc_b', timestamp: 1000 + i, confirmed: true,
        })),
      });
      const rows = await fetchRecentTransactions('fc_b', 3, TEST_CONFIG(fn));
      expect(rows).toHaveLength(3);
    });
  });
});
