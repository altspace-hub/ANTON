/**
 * checkout-service.test.ts — "Pay with FutureChain" web checkout (plan #11).
 *
 * Exercises the gateway service against the REAL PostgreSQL schema (migration
 * 235) but with the chain reader, webhook poster and clock all INJECTED — so
 * there is NO real network and NO real funds. Each test uses a unique
 * merchant_ref + orderId for isolation and cleans up after itself.
 *
 * Coverage: pure helpers (amount sealing, URI build, HMAC sign/verify, the
 * match guards) run unconditionally; the DB-backed lifecycle tests require
 * DATABASE_URL (skip otherwise, same pattern as the route tests).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import {
  resolveAmountMicroFtc,
  buildPayUri,
  matchInbound,
  signWebhook,
  verifyWebhook,
  generateOrderId,
} from '../../server/services/checkout-service.js';
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

// ─────────────────────────── pure helpers (no DB) ───────────────────────────

describe('checkout pure helpers', () => {
  it('resolveAmountMicroFtc seals fiat × rate into micro-FTC', () => {
    // 110 SEK × 0.1 FTC/SEK = 11 FTC = 11_000_000 micro-FTC
    expect(resolveAmountMicroFtc({ receivingAddress: 'fc_x', merchantId: 'M', fiatAmount: 110, fiatRate: 0.1 }))
      .toBe(11_000_000n);
  });

  it('resolveAmountMicroFtc accepts an explicit FTC amount', () => {
    expect(resolveAmountMicroFtc({ receivingAddress: 'fc_x', merchantId: 'M', amountMicroFtc: '5000000' }))
      .toBe(5_000_000n);
  });

  it('resolveAmountMicroFtc rejects a non-positive rate', () => {
    expect(() => resolveAmountMicroFtc({ receivingAddress: 'fc_x', merchantId: 'M', fiatAmount: 10, fiatRate: 0 }))
      .toThrow(/fiatRate/);
  });

  it('buildPayUri emits the canonical futurechain:pay wire format', () => {
    const uri = buildPayUri({
      toAddress: 'fc_merchant', amountMicroFtc: 11_000_000n,
      ref: 'v1: M:DEMO0001 O:ABCDEF012345 P:RETAIL', orderId: 'ABCDEF012345', expUnix: 1_900_000_000,
    });
    expect(uri.startsWith('futurechain:pay?')).toBe(true);
    const q = new URLSearchParams(uri.slice('futurechain:pay?'.length));
    expect(q.get('to')).toBe('fc_merchant');
    expect(q.get('amount')).toBe('11000000');
    expect(q.get('currency')).toBe('FTC');
    expect(q.get('inv')).toBe('ABCDEF012345');
    expect(q.get('exp')).toBe('1900000000');
    expect(q.get('v')).toBe('1');
  });

  it('buildPayUri carries an order envelope under &order= (kvitto before paying)', () => {
    const uri = buildPayUri({
      toAddress: 'fc_m', amountMicroFtc: 1n, ref: 'r', orderId: 'AAAAAAAAAAAA', expUnix: 1,
      orderEnvelope: { v: 1, kind: 'order', ref: 'X', items: [{ name: 'Coffee', qty: 1 }], amountSek: 39 },
    });
    expect(new URLSearchParams(uri.slice('futurechain:pay?'.length)).get('order')).toBeTruthy();
  });

  it('generateOrderId matches the ADR-004 grammar', () => {
    for (let i = 0; i < 20; i++) expect(generateOrderId()).toMatch(/^[A-Z0-9]{12}$/);
  });

  it('signWebhook is deterministic, prefixed sha256=, and verifies timing-safe', () => {
    const body = JSON.stringify({ event: 'payment.confirmed', requestId: 'wpr_1' });
    const sig = signWebhook(body, 'secret-key');
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signWebhook(body, 'secret-key')).toBe(sig);
    expect(verifyWebhook(body, 'secret-key', sig)).toBe(true);
    // Tampered body fails.
    expect(verifyWebhook(body + 'x', 'secret-key', sig)).toBe(false);
    // Wrong secret fails.
    expect(verifyWebhook(body, 'other-key', sig)).toBe(false);
  });
});

// ─────────────────── match guards (amount/ref/multi-match) ───────────────────

describe('matchInbound guards', () => {
  const REF = 'v1: M:DEMO0001 O:ABCDEF012345 P:RETAIL';
  const AMOUNT = 11_000_000n;
  const ADDR = 'fc_merchant';

  function tx(over: Record<string, unknown> = {}) {
    return { tx_id: 'tx1', amount_micro_ftc: '11000000', ref: REF, ...over };
  }

  it('matches on amount-exact + ref-substring (seen, not yet mined)', () => {
    const m = matchInbound({ transactions: [tx()] }, { amountMicroFtc: AMOUNT, ref: REF, receivingAddress: ADDR });
    expect(m).toEqual({ txHash: 'tx1', confirmed: false });
  });

  it('reports confirmed when the inbound is mined (confirmations > 0)', () => {
    const m = matchInbound({ transactions: [tx({ confirmations: 3 })] }, { amountMicroFtc: AMOUNT, ref: REF, receivingAddress: ADDR });
    expect(m).toEqual({ txHash: 'tx1', confirmed: true });
  });

  it('IGNORES a wrong amount (tampered amount cannot confirm)', () => {
    const m = matchInbound({ transactions: [tx({ amount_micro_ftc: '99999999' })] }, { amountMicroFtc: AMOUNT, ref: REF, receivingAddress: ADDR });
    expect(m).toBeNull();
  });

  it('IGNORES a wrong ref', () => {
    const m = matchInbound({ transactions: [tx({ ref: 'v1: M:OTHER999 O:ZZZZZZZZZZZZ P:RETAIL' })] }, { amountMicroFtc: AMOUNT, ref: REF, receivingAddress: ADDR });
    expect(m).toBeNull();
  });

  it('REFUSES a multi-match (two inbound txs share amount + ref)', () => {
    const m = matchInbound(
      { transactions: [tx({ tx_id: 'a' }), tx({ tx_id: 'b' })] },
      { amountMicroFtc: AMOUNT, ref: REF, receivingAddress: ADDR },
    );
    expect(m).toBeNull();
  });

  it('matches ref as a substring inside wrapping remittance text', () => {
    const m = matchInbound(
      { transactions: [tx({ ref: `note from customer · ${REF} · thanks` })] },
      { amountMicroFtc: AMOUNT, ref: REF, receivingAddress: ADDR },
    );
    expect(m?.txHash).toBe('tx1');
  });
});

// ─────────────────────────── DB-backed lifecycle ────────────────────────────

describeOrSkip('checkout lifecycle (real PG, injected chain/clock)', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  const merchantRef = `test_${randomBytes(4).toString('hex')}`;
  const RECEIVING = `fc_test_${randomBytes(4).toString('hex')}`;
  const MERCHANT_ID = 'TESTMID1';

  // Switchable injected chain response.
  let chainResponse: unknown = { transactions: [] };
  const chainFetcher: ChainFetcher = async () => chainResponse;

  // Switchable clock.
  let nowMs = Date.UTC(2026, 0, 1, 12, 0, 0);
  const now = () => nowMs;

  // Captured webhook deliveries (NO network).
  const sentWebhooks: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
  const webhookPoster = async (url: string, body: string, headers: Record<string, string>) => {
    sentWebhooks.push({ url, body, headers });
    return { status: 200 };
  };

  let svc: Awaited<ReturnType<typeof import('../../server/services/checkout-service.js')['createCheckoutService']>>;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createCheckoutService } = await import('../../server/services/checkout-service.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    svc = await createCheckoutService(db, { chainFetcher, webhookPoster, now });
  }, 60_000);

  afterAll(async () => {
    await db.run('DELETE FROM web_payment_requests WHERE merchant_ref = ?', merchantRef);
    await db.close();
  });

  async function freshOrderId() { return generateOrderId(); }

  it('createRequest seals the amount and returns {id, qrUri, exp} with no key leak', async () => {
    const orderId = await freshOrderId();
    const r = await svc.createRequest({
      merchantRef, receivingAddress: RECEIVING, merchantId: MERCHANT_ID,
      fiatAmount: 110, fiatCurrency: 'SEK', fiatRate: 0.1, orderId,
    });
    expect(r.id).toMatch(/^wpr_/);
    expect(r.qrUri.startsWith('futurechain:pay?')).toBe(true);
    expect(r.exp).toBeGreaterThan(Math.floor(nowMs / 1000));
    expect(r.status).toBe('pending');
    // No apiKey / secret / amount fields leak into the result.
    expect(Object.keys(r).sort()).toEqual(['exp', 'id', 'needsAnimated', 'qrUri', 'status']);
    expect(JSON.stringify(r)).not.toMatch(/secret|apiKey|api_key/i);

    // The QR carries the SEALED amount (11 FTC) — the customer needs it to pay.
    const amount = new URLSearchParams(r.qrUri.slice('futurechain:pay?'.length)).get('amount');
    expect(amount).toBe('11000000');
    // But the public status exposes ONLY the safe fields — no amount field of
    // its own, no secret, no apiKey. (The qrUri legitimately embeds the amount.)
    const pub = await svc.getPublicStatus(r.id);
    expect(Object.keys(pub!).sort()).toEqual(['confirmedAt', 'exp', 'id', 'needsAnimated', 'qrUri', 'seenAt', 'status', 'txId']);
    const pubNoQr = JSON.stringify({ ...pub, qrUri: '' });
    expect(pubNoQr).not.toMatch(/11000000|secret|apiKey|api_key/i);
  });

  it('refuses a duplicate orderId (single-use replay guard)', async () => {
    const orderId = await freshOrderId();
    await svc.createRequest({ merchantRef, receivingAddress: RECEIVING, merchantId: MERCHANT_ID, fiatAmount: 10, fiatRate: 0.1, orderId });
    await expect(svc.createRequest({ merchantRef, receivingAddress: RECEIVING, merchantId: MERCHANT_ID, fiatAmount: 10, fiatRate: 0.1, orderId }))
      .rejects.toThrow(/already used/);
  });

  it('advances pending → seen → confirmed via the injected /iso_received match + fires HMAC webhooks', async () => {
    sentWebhooks.length = 0;
    const orderId = await freshOrderId();
    const created = await svc.createRequest({
      merchantRef, receivingAddress: RECEIVING, merchantId: MERCHANT_ID,
      fiatAmount: 110, fiatRate: 0.1, orderId, webhookUrl: 'https://merchant.example/hook',
    });
    const ref = new URLSearchParams(created.qrUri.slice('futurechain:pay?'.length)).get('ref')!;

    // 1) No matching tx yet → stays pending.
    chainResponse = { transactions: [] };
    expect((await svc.pollRequest(created.id)).status).toBe('pending');

    // 2) A matching mempool tx (no confirmations) → seen + webhook 'payment.seen'.
    chainResponse = { transactions: [{ tx_id: 'mempool_tx', amount_micro_ftc: '11000000', ref }] };
    const seen = await svc.pollRequest(created.id);
    expect(seen.status).toBe('seen');
    expect(seen.changed).toBe('seen');
    const seenStatus = await svc.getPublicStatus(created.id);
    expect(seenStatus?.status).toBe('seen');
    expect(seenStatus?.txId).toBe('mempool_tx');

    // 3) Same tx now mined → confirmed + webhook 'payment.confirmed'.
    chainResponse = { transactions: [{ tx_id: 'mempool_tx', amount_micro_ftc: '11000000', ref, confirmations: 2 }] };
    const conf = await svc.pollRequest(created.id);
    expect(conf.status).toBe('confirmed');
    expect(conf.changed).toBe('confirmed');

    // Two webhooks fired, each ANTON-SIG-signed and verifiable.
    const events = sentWebhooks.map((w) => w.headers['ANTON-Event']);
    expect(events).toEqual(['payment.seen', 'payment.confirmed']);
    const row = await db.get<{ webhook_secret: string }>('SELECT webhook_secret FROM web_payment_requests WHERE id = ?', created.id);
    for (const w of sentWebhooks) {
      expect(verifyWebhook(w.body, row!.webhook_secret, w.headers['ANTON-SIG']!)).toBe(true);
    }

    // 4) Idempotent: re-poll a confirmed request → no new webhook, stays confirmed.
    const again = await svc.pollRequest(created.id);
    expect(again.changed).toBeNull();
    expect(sentWebhooks.length).toBe(2);
  });

  it('does NOT confirm on a tampered amount (amount-exact match)', async () => {
    const orderId = await freshOrderId();
    const created = await svc.createRequest({ merchantRef, receivingAddress: RECEIVING, merchantId: MERCHANT_ID, fiatAmount: 50, fiatRate: 0.1, orderId });
    const ref = new URLSearchParams(created.qrUri.slice('futurechain:pay?'.length)).get('ref')!;
    // Attacker pays a different (smaller) amount with the right ref.
    chainResponse = { transactions: [{ tx_id: 'tampered', amount_micro_ftc: '1', ref, confirmations: 5 }] };
    const r = await svc.pollRequest(created.id);
    expect(r.status).toBe('pending');
    expect((await svc.getPublicStatus(created.id))?.status).toBe('pending');
  });

  it('expires a stale request once the clock passes exp (and never settles after)', async () => {
    const orderId = await freshOrderId();
    const created = await svc.createRequest({
      merchantRef, receivingAddress: RECEIVING, merchantId: MERCHANT_ID,
      fiatAmount: 20, fiatRate: 0.1, orderId, expirySeconds: 60,
    });
    // Advance the clock past expiry.
    nowMs += 61_000;
    const pub = await svc.getPublicStatus(created.id);
    expect(pub?.status).toBe('expired');
    // A matching tx arriving after expiry does NOT resurrect it.
    const ref = new URLSearchParams(created.qrUri.slice('futurechain:pay?'.length)).get('ref')!;
    chainResponse = { transactions: [{ tx_id: 'late', amount_micro_ftc: '2000000', ref, confirmations: 9 }] };
    const r = await svc.pollRequest(created.id);
    expect(r.status).toBe('expired');
    nowMs -= 61_000; // restore for any later test
  });
});
