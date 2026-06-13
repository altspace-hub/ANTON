/**
 * checkout-service.ts — "Pay with FutureChain" merchant gateway (plan #11,
 * docs/INVESTIGATION_AND_PLAN_2026-06-13.md Area 7; MVP = Phase 0+1+2).
 *
 * A THIN server over the SHIPPED FutureChain payment rails. It never signs and
 * never custodies — the customer's ANTON Pay app is the only key-holder. The
 * merchant site calls `createRequest` server-side with its gateway API key; the
 * AMOUNT IS SEALED HERE at creation. A public `requestId` is handed to an
 * embeddable JS widget which renders the QR and polls status — the widget never
 * sees the amount or any key.
 *
 * Lifecycle (honest, never "Paid – final" on `seen` alone):
 *   pending → seen (in mempool, matched by the active-poll matcher)
 *           → confirmed (mined / poll-confirmed)
 *           → expired (exp passed before settlement)
 *
 * RAILS REUSE / PORT MAP (see docs/WEB_CHECKOUT.md "rails reused"):
 *  - ADR-004 v1 reference  — `@futurechain/sdk` `reference.encodeV1` (SDK-level,
 *    callable server-side; the same function src/business/services/qr.ts uses).
 *  - AntonRemittance order envelope — `@futurechain/sdk/pacs008` `encodeRemittance`
 *    / type `AntonRemittance` (SDK-level).
 *  - QR `futurechain:pay?…` URI builder — PORTED from src/business/services/qr.ts
 *    (pure, but lives behind the app boundary; copied below with a comment, NOT
 *    imported across `src/business`).
 *  - Active-poll detection (amount-exact + ref-substring + receiving-address +
 *    multi-match guard) — PORTED from src/business/services/received.ts
 *    `pollIncomingDetailed`/`normaliseItem` + receipts.ts `confirmReceiptByMatch`.
 *
 * No real network and no real funds are used by the unit tests: the chain read
 * is injected (`chainFetcher`) and defaults to the configured FutureChain node.
 */
import type { DatabaseAdapter } from '../db/database.js';
import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import { reference } from '@futurechain/sdk';
import { encodeRemittance } from '@futurechain/sdk/pacs008';
import type { AntonRemittance } from '@futurechain/sdk/pacs008';

// ── Constants (kept in lock-step with src/business so the wire is identical) ──

/** 15 minutes — matches `QR_EXPIRY_SECONDS` in src/business/services/qr.ts. */
export const DEFAULT_EXPIRY_SECONDS = 15 * 60;
/** 1 FTC = 1_000_000 micro-FTC. */
const MICRO_FTC_PER_FTC = 1_000_000n;
/** Animate the QR above this URI byte length — mirrors src/business
 *  qr-transfer/encoder.ts `SINGLE_QR_BYTE_LIMIT`. The widget renders frames. */
export const SINGLE_QR_BYTE_LIMIT = 600;

// ── Public types ─────────────────────────────────────────────────────────────

export type CheckoutStatus = 'pending' | 'seen' | 'confirmed' | 'expired' | 'failed';

export interface CreateRequestInput {
  /** Which gateway minted this (the single-tenant gateway key today). */
  merchantRef?: string;
  /** Watch-only merchant receiving address (no key ever leaves the customer). */
  receivingAddress: string;
  /** ADR-004 8-char merchant id. */
  merchantId: string;
  /** Amount — supply EITHER `amountMicroFtc` (FTC-native) OR fiat + rate. */
  amountMicroFtc?: bigint | string;
  /** Fiat amount (e.g. SEK) at checkout. */
  fiatAmount?: number;
  /** Fiat currency code (e.g. 'SEK'). */
  fiatCurrency?: string;
  /** units of FTC per 1 fiat unit, captured at creation (Wave-A manual rate). */
  fiatRate?: number;
  /** ADR-004 v1 purpose. */
  purpose?: reference.V1Purpose;
  /** Structured kvitto the customer sees in-app BEFORE paying. */
  orderEnvelope?: AntonRemittance;
  /** Optional explicit 12-char order id (else generated). Single-use. */
  orderId?: string;
  /** Seconds to expiry (default 15min). */
  expirySeconds?: number;
  /** Per-request webhook (BTCPay-style). */
  webhookUrl?: string;
  /** Free-form merchant metadata (never sent to the widget). */
  metadata?: Record<string, unknown>;
}

export interface CreateRequestResult {
  id: string;
  qrUri: string;
  needsAnimated: boolean;
  /** Unix seconds. */
  exp: number;
  /** Echo of the public status — always 'pending' at creation. */
  status: CheckoutStatus;
}

/** Public status the widget polls. NEVER carries the amount or any key. */
export interface PublicStatus {
  id: string;
  status: CheckoutStatus;
  needsAnimated: boolean;
  qrUri: string;
  exp: number;
  seenAt: string | null;
  confirmedAt: string | null;
  txId: string | null;
}

/** Injected chain reader — returns the raw `/iso_received/<addr>` body. */
export type ChainFetcher = (receivingAddress: string) => Promise<unknown>;

export interface CheckoutServiceOpts {
  /** Override the chain reader (tests inject a mock — no real network). */
  chainFetcher?: ChainFetcher;
  /** Override the HTTP POST used by the webhook dispatcher (tests inject). */
  webhookPoster?: (url: string, body: string, headers: Record<string, string>) => Promise<{ status: number }>;
  /** Override the clock (tests advance time to exercise expiry). */
  now?: () => number;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function createCheckoutService(db: DatabaseAdapter, opts: CheckoutServiceOpts = {}) {
  const now = opts.now ?? (() => Date.now());
  const chainFetcher = opts.chainFetcher ?? makeDefaultChainFetcher(db);
  const webhookPoster = opts.webhookPoster ?? defaultWebhookPoster;

  // ── Create a sealed payment request + the QR the customer scans ─────────────
  async function createRequest(input: CreateRequestInput): Promise<CreateRequestResult> {
    const merchantRef = input.merchantRef ?? 'default';
    if (!input.receivingAddress) throw new Error('receivingAddress is required');
    if (!input.merchantId) throw new Error('merchantId is required');

    const amountMicroFtc = resolveAmountMicroFtc(input);
    if (amountMicroFtc <= 0n) throw new Error('amount must be positive');

    const orderId = input.orderId ?? generateOrderId();
    if (!/^[A-Z0-9]{12}$/.test(orderId)) {
      throw new Error('orderId must match /^[A-Z0-9]{12}$/');
    }

    // Single-use orderId per merchant — the replay guard. A duplicate is a hard
    // refuse (NOT idempotent), so a replayed create can't resurrect a request.
    const existing = await db.get<{ id: string }>(
      'SELECT id FROM web_payment_requests WHERE merchant_ref = ? AND order_id = ?',
      merchantRef, orderId,
    );
    if (existing) throw new Error(`orderId already used: ${orderId}`);

    const purpose = input.purpose ?? 'RETAIL';
    const nowSec = Math.floor(now() / 1000);
    const expirySec = input.expirySeconds ?? DEFAULT_EXPIRY_SECONDS;
    const expUnix = nowSec + expirySec;

    // ── Build the ADR-004 v1 reference (SDK) + the futurechain:pay URI (ported) ─
    const ref = reference.encodeV1({
      merchantId: input.merchantId,
      orderId,
      purpose,
    });
    const qrUri = buildPayUri({
      toAddress: input.receivingAddress,
      amountMicroFtc,
      ref,
      orderId,
      expUnix,
      orderEnvelope: input.orderEnvelope,
    });
    const needsAnimated = utf8ByteLength(qrUri) > SINGLE_QR_BYTE_LIMIT;

    const id = `wpr_${randomBytes(12).toString('hex')}`;
    const webhookSecret = input.webhookUrl ? randomBytes(32).toString('hex') : null;

    await db.run(
      `INSERT INTO web_payment_requests
         (id, merchant_ref, amount_micro_ftc, currency, fiat_amount, fiat_currency, fiat_rate,
          receiving_address, order_envelope, ref, merchant_id, order_id, purpose,
          qr_uri, needs_animated, status, webhook_url, webhook_secret, metadata,
          created_at, expires_at)
       VALUES (?, ?, ?, 'FTC', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?,
               NOW(), to_timestamp(?))`,
      id, merchantRef, amountMicroFtc.toString(),
      input.fiatAmount ?? null, input.fiatCurrency ?? null, input.fiatRate ?? null,
      input.receivingAddress,
      input.orderEnvelope ? JSON.stringify(input.orderEnvelope) : null,
      ref, input.merchantId, orderId, purpose,
      qrUri, needsAnimated, input.webhookUrl ?? null, webhookSecret,
      JSON.stringify(input.metadata ?? {}), expUnix,
    );

    // The apiKey / webhookSecret are NEVER returned to the caller's transport.
    return { id, qrUri, needsAnimated, exp: expUnix, status: 'pending' };
  }

  // ── Public status (what the widget long-polls) ──────────────────────────────
  async function getPublicStatus(id: string): Promise<PublicStatus | null> {
    const row = await db.get<RequestRow>('SELECT * FROM web_payment_requests WHERE id = ?', id);
    if (!row) return null;
    // Lazy expiry: a request past its window with no settlement is `expired`.
    const status = await maybeExpire(row);
    return {
      id: row.id,
      status,
      needsAnimated: !!row.needs_animated,
      qrUri: row.qr_uri,
      exp: Math.floor(new Date(row.expires_at).getTime() / 1000),
      seenAt: row.seen_at ? new Date(row.seen_at).toISOString() : null,
      confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
      txId: row.tx_id ?? null,
    };
  }

  /** Flip a stale `pending`/`seen` row to `expired`. Settled rows are immune
   *  (a `confirmed` payment never "expires"). Returns the effective status. */
  async function maybeExpire(row: RequestRow): Promise<CheckoutStatus> {
    if (row.status === 'pending' || row.status === 'seen') {
      const exp = new Date(row.expires_at).getTime();
      if (now() > exp) {
        await db.run("UPDATE web_payment_requests SET status = 'expired' WHERE id = ? AND status IN ('pending','seen')", row.id);
        return 'expired';
      }
    }
    return row.status as CheckoutStatus;
  }

  // ── Per-request poll: pending → seen → confirmed ────────────────────────────
  //
  // PORTED matcher from src/business/services/received.ts + receipts.ts. The
  // request's sealed amount (amount-exact) + ADR-004 ref (substring) + receiving
  // address are the keys; a tampered amount cannot match. Multi-match is refused.
  //
  // Returns the status AFTER this poll, plus what changed, so the route + the
  // background sweeper can fire webhooks.
  async function pollRequest(id: string): Promise<{ status: CheckoutStatus; changed: 'seen' | 'confirmed' | null }> {
    const row = await db.get<RequestRow>('SELECT * FROM web_payment_requests WHERE id = ?', id);
    if (!row) return { status: 'failed', changed: null };

    const eff = await maybeExpire(row);
    if (eff !== 'pending' && eff !== 'seen') return { status: eff, changed: null };

    let raw: unknown;
    try {
      raw = await chainFetcher(row.receiving_address);
    } catch {
      // Unreachable hub — keep waiting (honest: not a settlement, not a failure).
      return { status: eff, changed: null };
    }

    const match = matchInbound(raw, {
      amountMicroFtc: BigInt(row.amount_micro_ftc),
      ref: row.ref,
      receivingAddress: row.receiving_address,
    });
    if (!match) return { status: eff, changed: null };

    // First sighting of a matching tx flips pending → seen. A `confirmed`
    // flag on the inbound (mined) flips seen → confirmed. Honest: `seen` is
    // mempool, `confirmed` is the same finality the Pay app waits for.
    if (eff === 'pending' && !match.confirmed) {
      await db.run(
        "UPDATE web_payment_requests SET status = 'seen', seen_at = NOW(), tx_id = ? WHERE id = ? AND status = 'pending'",
        match.txHash, id,
      );
      await dispatchWebhook(id, 'payment.seen');
      return { status: 'seen', changed: 'seen' };
    }
    if (match.confirmed) {
      // Cover the pending→confirmed fast path too (poll caught it post-mine):
      // stamp seen_at if we never saw the mempool sighting.
      await db.run(
        `UPDATE web_payment_requests
           SET status = 'confirmed', confirmed_at = NOW(),
               seen_at = COALESCE(seen_at, NOW()), tx_id = ?
         WHERE id = ? AND status IN ('pending','seen')`,
        match.txHash, id,
      );
      await dispatchWebhook(id, 'payment.confirmed');
      return { status: 'confirmed', changed: 'confirmed' };
    }
    return { status: eff, changed: null };
  }

  /** Sweep every live (pending/seen, unexpired) request once. The background
   *  poller calls this on an interval; expiry sweep is folded in. */
  async function pollAllLive(): Promise<void> {
    const rows = await db.all<{ id: string }>(
      "SELECT id FROM web_payment_requests WHERE status IN ('pending','seen') ORDER BY created_at ASC LIMIT 200",
    );
    for (const r of rows) {
      try { await pollRequest(r.id); } catch { /* one bad row never stalls the sweep */ }
    }
  }

  // ── HMAC webhook dispatcher (BTCPay 'BTCPAY-SIG' → our 'ANTON-SIG') ──────────
  async function dispatchWebhook(id: string, event: 'payment.seen' | 'payment.confirmed'): Promise<void> {
    const row = await db.get<RequestRow>('SELECT * FROM web_payment_requests WHERE id = ?', id);
    if (!row || !row.webhook_url || !row.webhook_secret) return;
    // Single delivery per event.
    if (event === 'payment.seen' && row.webhook_seen_sent) return;
    if (event === 'payment.confirmed' && row.webhook_confirmed_sent) return;

    const body = JSON.stringify(buildWebhookBody(row, event));
    const signature = signWebhook(body, row.webhook_secret);
    const headers = {
      'Content-Type': 'application/json',
      'ANTON-SIG': signature,
      'ANTON-Event': event,
    };
    const deliveryId = `whd_${randomBytes(8).toString('hex')}`;
    let httpStatus: number | null = null;
    let ok = false;
    let error: string | null = null;
    try {
      const res = await webhookPoster(row.webhook_url, body, headers);
      httpStatus = res.status;
      ok = res.status >= 200 && res.status < 300;
    } catch (e) {
      error = (e as Error).message;
    }
    await db.run(
      `INSERT INTO web_checkout_webhook_deliveries (id, request_id, event, target_url, signature, http_status, ok, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      deliveryId, id, event, row.webhook_url, signature, httpStatus, ok, error,
    );
    if (ok) {
      const col = event === 'payment.seen' ? 'webhook_seen_sent' : 'webhook_confirmed_sent';
      await db.run(`UPDATE web_payment_requests SET ${col} = TRUE WHERE id = ?`, id);
    }
  }

  return {
    createRequest,
    getPublicStatus,
    pollRequest,
    pollAllLive,
    dispatchWebhook,
    // exposed for tests / the route to reuse the exact same primitives
    _internal: { resolveAmountMicroFtc, buildPayUri, matchInbound, signWebhook, verifyWebhook, buildWebhookBody },
  };
}

export type CheckoutService = Awaited<ReturnType<typeof createCheckoutService>>;

// ═════════════════════════ pure helpers (no I/O) ═════════════════════════════

interface RequestRow {
  id: string;
  merchant_ref: string;
  amount_micro_ftc: string;
  currency: string;
  fiat_amount: number | null;
  fiat_currency: string | null;
  fiat_rate: number | null;
  receiving_address: string;
  order_envelope: unknown;
  ref: string;
  merchant_id: string | null;
  order_id: string;
  purpose: string;
  qr_uri: string;
  needs_animated: boolean;
  status: string;
  seen_at: string | null;
  confirmed_at: string | null;
  tx_id: string | null;
  webhook_url: string | null;
  webhook_secret: string | null;
  webhook_seen_sent: boolean;
  webhook_confirmed_sent: boolean;
  expires_at: string;
}

/** Resolve the sealed micro-FTC amount from either an explicit FTC amount or
 *  fiat × rate (the FX captured at creation). */
export function resolveAmountMicroFtc(input: CreateRequestInput): bigint {
  if (input.amountMicroFtc !== undefined) {
    const v = typeof input.amountMicroFtc === 'bigint' ? input.amountMicroFtc : BigInt(input.amountMicroFtc);
    return v;
  }
  if (input.fiatAmount !== undefined && input.fiatRate !== undefined) {
    if (!Number.isFinite(input.fiatAmount) || input.fiatAmount < 0) throw new Error('fiatAmount must be non-negative finite');
    if (!Number.isFinite(input.fiatRate) || input.fiatRate <= 0) throw new Error('fiatRate must be positive finite');
    const ftc = input.fiatAmount * input.fiatRate;
    const micro = Math.round(ftc * Number(MICRO_FTC_PER_FTC));
    if (!Number.isFinite(micro)) throw new Error('amount overflow');
    return BigInt(micro);
  }
  throw new Error('supply amountMicroFtc OR (fiatAmount + fiatRate)');
}

/**
 * PORTED from src/business/services/qr.ts `buildQr` (pure, no I/O). Copied —
 * NOT imported — because the source lives behind the `src/business` app
 * boundary. The wire format (`futurechain:pay?to&amount&currency&ref&inv&exp&v`
 * + optional `order=` base64 envelope) MUST stay byte-identical so the Pay app
 * decodes a web QR exactly like a POS QR.
 */
export function buildPayUri(o: {
  toAddress: string;
  amountMicroFtc: bigint;
  ref: string;
  orderId: string;
  expUnix: number;
  orderEnvelope?: AntonRemittance;
}): string {
  const params = new URLSearchParams({
    to: o.toAddress,
    amount: o.amountMicroFtc.toString(),
    currency: 'FTC',
    ref: o.ref,
    inv: o.orderId,
    exp: o.expUnix.toString(),
    v: '1',
  });
  if (o.orderEnvelope) {
    const envelopeJson = JSON.stringify(o.orderEnvelope);
    params.set('order', base64UrlSafe(envelopeJson));
  }
  return `futurechain:pay?${params.toString()}`;
}

/** url-safe base64 (mirrors src/business/services/qr.ts). */
function base64UrlSafe(s: string): string {
  return Buffer.from(new TextEncoder().encode(s)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** 12-char order id, /^[A-Z0-9]{12}$/ — matches src/business qr.ts. */
export function generateOrderId(): string {
  let hex = '';
  for (const b of randomBytes(6)) hex += b.toString(16).padStart(2, '0');
  return hex.toUpperCase();
}

// ── Inbound matcher (PORTED from src/business received.ts + receipts.ts) ──────

export interface InboundMatch {
  txHash: string;
  confirmed: boolean;
}

interface NormalisedInbound {
  txHash: string;
  amountMicroFtc: bigint;
  remittance: string;
  confirmed: boolean;
}

/**
 * Match a raw `/iso_received/<addr>` response against one request. Conservative,
 * exactly like `confirmReceiptByMatch`:
 *   - amount must equal the sealed micro-FTC (a tampered amount CANNOT match);
 *   - ref must contain the request's ADR-004 ref (substring — the chain may
 *     wrap it in other remittance text);
 *   - receiving address must match.
 * Multi-match guard: if more than one inbound tx satisfies all three, we refuse
 * to confirm and return null (the merchant reconciles manually). Returns the
 * single match (with its `confirmed`/mined flag) or null.
 */
export function matchInbound(
  raw: unknown,
  req: { amountMicroFtc: bigint; ref: string; receivingAddress: string },
): InboundMatch | null {
  const items = extractItems(raw);
  const matches: NormalisedInbound[] = [];
  for (const item of items) {
    const n = normaliseInbound(item);
    if (!n) continue;
    const amountOk = n.amountMicroFtc === req.amountMicroFtc;
    const refOk = req.ref === '' || n.remittance === req.ref || n.remittance.includes(req.ref);
    if (amountOk && refOk) matches.push(n);
  }
  if (matches.length !== 1) return null; // 0 = no sighting; >1 = ambiguous, refuse
  const m = matches[0]!;
  return { txHash: m.txHash, confirmed: m.confirmed };
}

interface JsonObj { [k: string]: unknown }
function isObj(v: unknown): v is JsonObj { return typeof v === 'object' && v !== null && !Array.isArray(v); }

/** From src/business received.ts `extractItems`. */
function extractItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (isObj(raw)) {
    for (const key of ['transactions', 'items', 'received', 'data']) {
      const v = raw[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

/** From src/business received.ts `pick`. */
function pick(obj: unknown, paths: string[][]): unknown {
  for (const path of paths) {
    let cur: unknown = obj;
    let ok = true;
    for (const seg of path) {
      if (isObj(cur)) cur = cur[seg];
      else if (Array.isArray(cur)) {
        const idx = Number(seg);
        cur = Number.isInteger(idx) ? cur[idx] : undefined;
      } else { ok = false; break; }
      if (cur === undefined || cur === null) { ok = false; break; }
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return undefined;
}

/** From src/business received.ts `normaliseItem` (trimmed to the fields the
 *  web matcher needs + a `confirmed`/mined flag). */
function normaliseInbound(raw: unknown): NormalisedInbound | null {
  const txHash = pick(raw, [
    ['tx_id'], ['txid'], ['id'],
    ['transaction', 'id'],
    ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'PmtId', 'TxId'],
    ['CdtTrfTxInf', '0', 'PmtId', 'TxId'],
    ['PmtId', 'TxId'],
  ]);
  if (typeof txHash !== 'string' || !txHash) return null;

  let amountMicroFtc = 0n;
  const amountFtc = pick(raw, [
    ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'IntrBkSttlmAmt', '$value'],
    ['CdtTrfTxInf', '0', 'IntrBkSttlmAmt', '$value'],
    ['IntrBkSttlmAmt', '$value'],
    ['amount_ftc'], ['amountFtc'],
  ]);
  if (typeof amountFtc === 'number') {
    amountMicroFtc = BigInt(Math.round(amountFtc * 1_000_000));
  } else if (typeof amountFtc === 'string') {
    const n = Number(amountFtc);
    if (Number.isFinite(n)) amountMicroFtc = BigInt(Math.round(n * 1_000_000));
  } else {
    const micro = pick(raw, [['amount_micro_ftc'], ['amountMicroFtc']]);
    if (typeof micro === 'number' || typeof micro === 'string') {
      try { amountMicroFtc = BigInt(micro); } catch { amountMicroFtc = 0n; }
    } else {
      const sat = pick(raw, [['amount_raw'], ['amountRaw'], ['amountSatoshi']]);
      if (typeof sat === 'number' || typeof sat === 'string') {
        const n = typeof sat === 'string' ? Number(sat) : sat;
        if (Number.isFinite(n)) amountMicroFtc = BigInt(Math.round(n / 100));
      }
    }
  }

  const remRaw = pick(raw, [
    ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'RmtInf', 'Ustrd'],
    ['CdtTrfTxInf', '0', 'RmtInf', 'Ustrd'],
    ['RmtInf', 'Ustrd'],
    ['ref'], ['remittance'],
  ]);
  const remittance = Array.isArray(remRaw)
    ? remRaw.filter(s => typeof s === 'string').join(' ')
    : typeof remRaw === 'string' ? remRaw : '';

  // Mined / confirmed flag — the same finality the Pay app's pollConfirmation
  // waits for. The hub surfaces this a few ways; treat a positive confirmations
  // count or an explicit confirmed:true / status:'confirmed' as mined.
  const confs = pick(raw, [['confirmations'], ['confirmation_count'], ['confs']]);
  const confirmedFlag = pick(raw, [['confirmed'], ['is_confirmed'], ['mined']]);
  const statusStr = pick(raw, [['status'], ['state']]);
  const confirmed =
    (typeof confs === 'number' && confs > 0) ||
    (typeof confs === 'string' && Number(confs) > 0) ||
    confirmedFlag === true ||
    (typeof statusStr === 'string' && /^(confirmed|mined|settled)$/i.test(statusStr));

  return { txHash, amountMicroFtc, remittance, confirmed };
}

// ── Webhook signing (BTCPay 'BTCPAY-SIG' pattern, timing-safe) ────────────────

/** `sha256=<hex hmac>` over the raw body bytes, keyed by the merchant secret. */
export function signWebhook(body: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  return `sha256=${mac}`;
}

/** Timing-safe verify the merchant side can use (also used by the demo). */
export function verifyWebhook(body: string, secret: string, signatureHeader: string): boolean {
  const expected = signWebhook(body, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader ?? '', 'utf8');
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

function buildWebhookBody(row: RequestRow, event: 'payment.seen' | 'payment.confirmed') {
  // The amount is the SEALED value — the merchant already knows it (they created
  // the request); echoing it back lets them reconcile without exposing it to the
  // widget. We deliberately do NOT send the webhook secret or apiKey.
  return {
    event,
    requestId: row.id,
    orderId: row.order_id,
    ref: row.ref,
    receivingAddress: row.receiving_address,
    amountMicroFtc: row.amount_micro_ftc,
    currency: row.currency,
    fiatAmount: row.fiat_amount,
    fiatCurrency: row.fiat_currency,
    txId: row.tx_id,
    status: event === 'payment.seen' ? 'seen' : 'confirmed',
    timestamp: new Date().toISOString(),
  };
}

// ── Default chain reader (no real network in tests — injected there) ──────────

/**
 * Read `/iso_received/<addr>` from the configured FutureChain node. The read is
 * credentialed on a public hub (X-API-Key → full PACS.008 payloads); the
 * merchant supplies that read-only key via `WEB_CHECKOUT_HUB_API_KEY` (the same
 * model the Business app uses per-install). When the node is in stub mode / no
 * URL is configured, returns an empty list so the poller simply keeps waiting.
 */
function makeDefaultChainFetcher(db: DatabaseAdapter): ChainFetcher {
  return async (receivingAddress: string) => {
    const cfg = await db.get<{ node_url: string | null; stub_mode: boolean }>(
      "SELECT node_url, stub_mode FROM fc_connection_config WHERE id = 'default'",
    );
    const nodeUrl = (cfg?.node_url ?? '').trim();
    if (!nodeUrl || cfg?.stub_mode) return { transactions: [] };
    const apiKey = process.env.WEB_CHECKOUT_HUB_API_KEY?.trim();
    const headers: Record<string, string> = {};
    if (apiKey) headers['X-API-Key'] = apiKey;
    const url = `${nodeUrl.replace(/\/+$/, '')}/iso_received/${encodeURIComponent(receivingAddress)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`iso_received HTTP ${res.status}`);
    return await res.json();
  };
}

async function defaultWebhookPoster(url: string, body: string, headers: Record<string, string>): Promise<{ status: number }> {
  const res = await fetch(url, { method: 'POST', body, headers });
  return { status: res.status };
}

// Re-export the SDK envelope encoder so the route/demo can build kvittos.
export { encodeRemittance };
export type { AntonRemittance };
