/**
 * fc-checkout.test.ts — web-checkout gateway routes (plan #11, Area 7).
 *
 * Spins the route factory on an ephemeral Express server with the chain reader
 * + webhook poster INJECTED (no real network, no funds). Uses the REAL gateway
 * API-key model (fc_gateway_config) — the test sets a known key + enables the
 * gateway in setup, and restores the prior state in teardown.
 *
 * Requires DATABASE_URL (skip otherwise — same pattern as council-dissent).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import express from 'express';
import type { Server } from 'http';
import type { ChainFetcher } from '../../server/services/checkout-service.js';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
}
const DATABASE_URL = resolveDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

describeOrSkip('fc-checkout routes', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;

  const API_KEY = `testgw_${randomBytes(8).toString('hex')}`;
  const merchantRef = 'default'; // routes auth against the single-tenant gateway config
  const RECEIVING = `fc_rt_${randomBytes(4).toString('hex')}`;
  const MERCHANT_ID = 'RTMID001';

  let chainResponse: unknown = { transactions: [] };
  const chainFetcher: ChainFetcher = async () => chainResponse;
  const sentWebhooks: Array<{ headers: Record<string, string>; body: string }> = [];
  const webhookPoster = async (_url: string, body: string, headers: Record<string, string>) => {
    sentWebhooks.push({ headers, body }); return { status: 200 };
  };

  // Snapshot of the prior gateway config so we restore it.
  let prior: { api_key: string; enabled: boolean } | undefined;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createFCCheckoutRoutes } = await import('../../server/routes/fc-checkout.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    // Ensure the gateway config row exists, snapshot, then set a known enabled key.
    await db.run("INSERT INTO fc_gateway_config (id, api_key) VALUES ('default', ?) ON CONFLICT (id) DO NOTHING", randomBytes(16).toString('hex'));
    prior = await db.get<{ api_key: string; enabled: boolean }>("SELECT api_key, enabled FROM fc_gateway_config WHERE id = 'default'");
    await db.run("UPDATE fc_gateway_config SET api_key = ?, enabled = TRUE WHERE id = 'default'", API_KEY);

    const app = express();
    app.use(express.json());
    app.use('/api/checkout', await createFCCheckoutRoutes(db, { chainFetcher, webhookPoster }));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('no addr');
    base = `http://127.0.0.1:${addr.port}`;
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM web_payment_requests WHERE merchant_ref = ? AND receiving_address = ?', merchantRef, RECEIVING);
      if (prior) await db.run("UPDATE fc_gateway_config SET api_key = ?, enabled = ? WHERE id = 'default'", prior.api_key, prior.enabled);
    } finally {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      await db.close();
    }
  });

  async function create(body: Record<string, unknown>, key = API_KEY) {
    const r = await fetch(`${base}/api/checkout/v1/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  it('rejects create without a valid API key (401)', async () => {
    const r = await create({ receivingAddress: RECEIVING, merchantId: MERCHANT_ID, fiatAmount: 10, fiatRate: 0.1 }, 'wrong-key');
    expect(r.status).toBe(401);
  });

  it('POST /v1/requests seals the amount and returns {id, qrUri, needsAnimated, exp} with NO key leak', async () => {
    const r = await create({ receivingAddress: RECEIVING, merchantId: MERCHANT_ID, fiatAmount: 110, fiatCurrency: 'SEK', fiatRate: 0.1 });
    expect(r.status).toBe(200);
    expect(String(r.json.id)).toMatch(/^wpr_/);
    expect(String(r.json.qrUri)).toMatch(/^futurechain:pay\?/);
    expect(typeof r.json.exp).toBe('number');
    expect(Object.keys(r.json).sort()).toEqual(['exp', 'id', 'needsAnimated', 'qrUri', 'status']);
    // The apiKey is NEVER echoed.
    expect(JSON.stringify(r.json)).not.toContain(API_KEY);
    expect(JSON.stringify(r.json)).not.toMatch(/secret|api_key/i);
    // The sealed amount (11 FTC) lives only in the QR, not as a top-level field.
    expect(new URLSearchParams(String(r.json.qrUri).slice('futurechain:pay?'.length)).get('amount')).toBe('11000000');
  });

  it('GET /v1/requests/:id/status drives the lifecycle pending → seen → confirmed', async () => {
    sentWebhooks.length = 0;
    const created = await create({
      receivingAddress: RECEIVING, merchantId: MERCHANT_ID, fiatAmount: 110, fiatRate: 0.1,
      webhookUrl: 'https://merchant.example/hook',
    });
    const id = String(created.json.id);
    const ref = new URLSearchParams(String(created.json.qrUri).slice('futurechain:pay?'.length)).get('ref')!;

    async function status() {
      const r = await fetch(`${base}/api/checkout/v1/requests/${id}/status`);
      return (await r.json()) as Record<string, unknown>;
    }

    // pending (no match)
    chainResponse = { transactions: [] };
    expect((await status()).status).toBe('pending');

    // seen (mempool sighting)
    chainResponse = { transactions: [{ tx_id: 'mtx', amount_micro_ftc: '11000000', ref }] };
    expect((await status()).status).toBe('seen');

    // confirmed (mined)
    chainResponse = { transactions: [{ tx_id: 'mtx', amount_micro_ftc: '11000000', ref, confirmations: 3 }] };
    const final = await status();
    expect(final.status).toBe('confirmed');
    expect(final.txId).toBe('mtx');

    // The public status NEVER leaks a key, and has no amount field of its own
    // (the qrUri legitimately embeds the sealed amount — the customer needs it).
    expect(JSON.stringify({ ...final, qrUri: '' })).not.toMatch(/11000000|secret|api_key/i);

    // Webhooks fired in order, ANTON-SIG present.
    expect(sentWebhooks.map((w) => w.headers['ANTON-Event'])).toEqual(['payment.seen', 'payment.confirmed']);
    expect(sentWebhooks.every((w) => /^sha256=[0-9a-f]{64}$/.test(w.headers['ANTON-SIG'] || ''))).toBe(true);
  });

  it('GET /v1/requests/:id/qr.svg returns an SVG QR', async () => {
    const created = await create({ receivingAddress: RECEIVING, merchantId: MERCHANT_ID, fiatAmount: 5, fiatRate: 0.1 });
    const id = String(created.json.id);
    const r = await fetch(`${base}/api/checkout/v1/requests/${id}/qr.svg`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/image\/svg/);
    expect(await r.text()).toMatch(/<svg/);
  });

  it('GET status for an unknown id returns 404', async () => {
    const r = await fetch(`${base}/api/checkout/v1/requests/wpr_doesnotexist/status`);
    expect(r.status).toBe(404);
  });
});
