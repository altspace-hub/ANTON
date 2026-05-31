/**
 * rpc.test.ts — RpcClient HTTP layer tests (mocked fetch).
 *
 * Verifies: URL construction, JSON request/response, X-API-Key header
 * injection, error wrapping (RpcError on non-2xx), timeout via
 * AbortController, optional fetch override.
 *
 * For the LIVE integration tests against the running 3-node network
 * (Node 1 @ 127.0.0.1:8545, Bahnhof @ 79.136.1.113:8545), see
 * `e2e-live.test.ts` — gated by `FUTURECHAIN_LIVE_RPC` env.
 */
import { describe, it, expect } from 'vitest';
import { RpcClient, RpcError, type Utxo, type BalanceResponse } from './index.js';
import type { Transaction } from '../pacs008/index.js';

// ───────────────────────────────────────────────────────────────────────
// Fetch mocking — record calls + return canned responses
// ───────────────────────────────────────────────────────────────────────

interface RecordedCall {
  url: string;
  method: string;
  body?: unknown;
  headers: Record<string, string>;
}

function mockFetch(
  responses: Array<{ status?: number; body?: unknown; raw?: string }>,
): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let i = 0;
  const f: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    const headersIn = init?.headers as Record<string, string> | undefined;
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, method, body, headers: headersIn ?? {} });

    const r = responses[i++] ?? { status: 500, body: { error: 'no more responses' } };
    const text = r.raw ?? JSON.stringify(r.body ?? null);
    const status = r.status ?? 200;
    return new Response(text, {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch: f, calls };
}

// ───────────────────────────────────────────────────────────────────────
// Constructor
// ───────────────────────────────────────────────────────────────────────

describe('RpcClient — constructor', () => {
  it('requires an endpoint', () => {
    expect(() => new RpcClient({ endpoint: '' })).toThrow(/endpoint/);
  });

  it('strips trailing slashes from the endpoint', async () => {
    const { fetch: f, calls } = mockFetch([{ body: { status: 'healthy' } }]);
    const c = new RpcClient({ endpoint: 'http://node:8545///', fetch: f });
    await c.getHealth();
    expect(calls[0]!.url).toBe('http://node:8545/health');
  });

  it('requires fetch when none is on globalThis (rare in Node 24 / modern envs)', () => {
    // We just verify the path runs — globalThis.fetch exists in Vitest by default.
    const c = new RpcClient({ endpoint: 'http://x', fetch: globalThis.fetch });
    expect(c).toBeDefined();
  });
});

// ───────────────────────────────────────────────────────────────────────
// Read endpoints
// ───────────────────────────────────────────────────────────────────────

describe('RpcClient — read endpoints', () => {
  it('getBalance hits /balance/{address} and parses the response', async () => {
    const body: BalanceResponse = {
      address: 'fc_TestAddr0000000000000000000000000',
      balance: 12_345_000,
      balance_ftc: 0.12345,
      utxo_count: 3,
    };
    const { fetch: f, calls } = mockFetch([{ body }]);
    const c = new RpcClient({ endpoint: 'http://node:8545', fetch: f });
    const r = await c.getBalance('fc_TestAddr0000000000000000000000000');
    expect(r).toEqual(body);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toBe(
      'http://node:8545/balance/fc_TestAddr0000000000000000000000000',
    );
  });

  it('getUtxos returns the array of UTXOs', async () => {
    const body: Utxo[] = [
      { tx_id: 'aa', output_index: 0, address: 'fc_x', amount: 100, block_height: 1 },
      { tx_id: 'bb', output_index: 1, address: 'fc_x', amount: 200, block_height: 2 },
    ];
    const { fetch: f } = mockFetch([{ body }]);
    const c = new RpcClient({ endpoint: 'http://node:8545', fetch: f });
    const r = await c.getUtxos('fc_x');
    expect(r).toHaveLength(2);
    expect(r[0]!.amount).toBe(100);
  });

  it('URL-encodes addresses with special characters', async () => {
    const { fetch: f, calls } = mockFetch([{ body: { utxo_count: 0 } }, { body: [] }]);
    const c = new RpcClient({ endpoint: 'http://node:8545', fetch: f });
    await c.getBalance('fc/weird+addr');
    expect(calls[0]!.url).toBe('http://node:8545/balance/fc%2Fweird%2Baddr');
  });
});

// ───────────────────────────────────────────────────────────────────────
// POST /submit_signed_transaction
// ───────────────────────────────────────────────────────────────────────

describe('RpcClient — submitSignedTransaction', () => {
  function fakeTx(): Transaction {
    return {
      id: 'tx-id',
      inputs: [{
        previous_tx_id: '00',
        output_index: 0,
        signature: [1, 2, 3],
        public_key: [4, 5, 6],
      }],
      outputs: [{ address: 'fc_recv', amount: 1 }],
      fee: 1,
      timestamp: '2026-05-20T00:00:00Z',
      signature: [7, 8, 9],
      metadata: {
        iso20022_ref: 'uetr',
        transaction_type: 'ISO20022_PACS008',
        compliance_node_address: null,
        compliance_screening_id: null,
        compliance_decision_hash: null,
        compliance_signature: null,
        compliance_timestamp: null,
      },
      encrypted_data: [0xaa, 0xbb],
      privacy_proof: null,
      access_list: null,
    };
  }

  it('POSTs the tx as JSON and returns the queued envelope (Phase 0.5 light hub)', async () => {
    const queued = {
      status: 'queued',
      request_id: 'req-123',
      tx_id: 'tx-id',
      originator_address: 'fc_orig',
      note: 'broadcast as ComplianceScreenRequest over P2P',
    };
    const { fetch: f, calls } = mockFetch([{ body: queued }]);
    const c = new RpcClient({ endpoint: 'http://lightHub:8545', fetch: f });
    const r = await c.submitSignedTransaction(fakeTx());
    expect(r.status).toBe('queued');
    expect(r.request_id).toBe('req-123');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('http://lightHub:8545/submit_signed_transaction');
    expect((calls[0]!.body as { metadata: { transaction_type: string } }).metadata.transaction_type).toBe(
      'ISO20022_PACS008',
    );
    expect(calls[0]!.headers['Content-Type']).toBe('application/json');
  });

  it('returns the rejected envelope as-is (200 OK with status: rejected)', async () => {
    const rejected = {
      status: 'rejected',
      error: 'no local compliance gateway and refuses to gossip wallet passwords',
    };
    const { fetch: f } = mockFetch([{ body: rejected }]);
    const c = new RpcClient({ endpoint: 'http://x', fetch: f });
    const r = await c.submitSignedTransaction(fakeTx());
    expect(r.status).toBe('rejected');
    expect(r.error).toMatch(/wallet password/);
  });

  it('injects X-API-Key when apiKey is configured', async () => {
    const { fetch: f, calls } = mockFetch([{ body: { status: 'queued' } }]);
    const c = new RpcClient({ endpoint: 'http://x', apiKey: 'SECRET_KEY', fetch: f });
    await c.submitSignedTransaction(fakeTx());
    expect(calls[0]!.headers['X-API-Key']).toBe('SECRET_KEY');
  });

  it('does NOT send X-API-Key on public read endpoints', async () => {
    // The Bahnhof public light hub only auths POST /submit_signed_transaction.
    // Sending the key on /balance, /get_utxos, /info, etc. would leak it
    // into the reverse-proxy access log on every UI poll.
    const { fetch: f, calls } = mockFetch([
      { body: { address: 'fc_x', balance: 0, balance_ftc: 0, utxo_count: 0 } },
      { body: [] },
      { body: { tx_id: 't', status: 'pending' } },
      { body: { chain_height: 1 } },
      { body: { status: 'ok' } },
    ]);
    const c = new RpcClient({ endpoint: 'http://x', apiKey: 'SECRET_KEY', fetch: f });
    await c.getBalance('fc_x');
    await c.getUtxos('fc_x');
    await c.getTransaction('t');
    await c.getInfo();
    await c.getHealth();
    for (const call of calls) {
      expect(call.headers['X-API-Key']).toBeUndefined();
    }
  });

  it('sends X-API-Key on the credentialed ISO receive-history read', async () => {
    // /iso_received returns full PACS.008 payee PII — it is a CREDENTIALED
    // read (unlike /balance, /get_utxos), so the per-install key is sent.
    const { fetch: f, calls } = mockFetch([{ body: [] }]);
    const c = new RpcClient({ endpoint: 'http://x', apiKey: 'SECRET_KEY', fetch: f });
    await c.getIsoReceived('fc_x');
    expect(calls[0]!.headers['X-API-Key']).toBe('SECRET_KEY');
  });

  it('omits X-API-Key on /iso_received when no apiKey is configured', async () => {
    // The Business app constructs the client without a key — no header.
    const { fetch: f, calls } = mockFetch([{ body: [] }]);
    const c = new RpcClient({ endpoint: 'http://x', fetch: f });
    await c.getIsoReceived('fc_x');
    expect(calls[0]!.headers['X-API-Key']).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────
// Error handling
// ───────────────────────────────────────────────────────────────────────

describe('RpcClient — error handling', () => {
  it('throws RpcError on a 5xx response', async () => {
    const { fetch: f } = mockFetch([{ status: 503, body: { error: 'down' } }]);
    const c = new RpcClient({ endpoint: 'http://x', fetch: f });
    // Mock fetch is single-use per response — capture the error in one await.
    let err: unknown;
    try { await c.getInfo(); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(RpcError);
    expect(err).toMatchObject({
      httpStatus: 503,
      url: 'http://x/info',
    });
  });

  it('throws RpcError on a 4xx response', async () => {
    const { fetch: f } = mockFetch([{ status: 401, body: { error: 'no API key' } }]);
    const c = new RpcClient({ endpoint: 'http://x', fetch: f });
    let err: unknown;
    try { await c.getBalance('fc_y'); } catch (e) { err = e; }
    expect(err).toMatchObject({ httpStatus: 401 });
  });

  it('throws RpcError when the response is not JSON', async () => {
    const { fetch: f } = mockFetch([{ status: 200, raw: '<html>not json</html>' }]);
    const c = new RpcClient({ endpoint: 'http://x', fetch: f });
    await expect(c.getInfo()).rejects.toMatchObject({
      message: /not JSON/,
    });
  });

  it('wraps a network failure as RpcError httpStatus=0', async () => {
    const failingFetch: typeof fetch = async () => {
      throw new TypeError('fetch failed: ECONNREFUSED');
    };
    const c = new RpcClient({ endpoint: 'http://x', fetch: failingFetch });
    await expect(c.getInfo()).rejects.toMatchObject({
      httpStatus: 0,
      message: /fetch failed/,
    });
  });
});
