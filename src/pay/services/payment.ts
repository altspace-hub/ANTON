/**
 * payment.ts — decode a `futurechain:pay` URI and record confirmed
 * payments.
 *
 * The decode half is pure logic (no I/O) and is unit-tested in
 * __tests__/payment.test.ts. The Business app encodes the QR via
 * @futurechain/sdk `reference.encodeV1`; this module decodes it back
 * with `reference.decode` and validates the URI envelope around it.
 *
 * Settlement is bilateral (merchant ↔ Safello) — `recordPayment` only
 * writes the customer's local receipt, it does not broadcast a chain
 * transaction.
 */
import { pacs008, reference } from '@futurechain/sdk';
import type { DecodedCreditor, DecodedPayment, PaymentRecord } from './types';
import { getAllPayments, getPayment, putPayment, wipePayments } from './db';
import { loadPayerIdentity, type PayerIdentity } from './payment-identity';
import { loadWallet } from './wallet';
import { requireBiometric } from './biometric';
import { assembleDraft } from './pacs008-draft';
import {
  deriveBehaviorProfile, type BehaviorEvent, type BehaviorProfile,
} from './behavior-profile';
import type { FraudAssessment } from './fraud-engine';
import { getRpc } from './fc-rpc';

/** 1 FTC = 1_000_000 micro-FTC. */
const MICRO_FTC_PER_FTC = 1_000_000;

const DIGITS_RE = /^[0-9]+$/;

export type DecodeResult =
  | { ok: true; payment: DecodedPayment }
  | { ok: false; reason: 'invalid' | 'expired' };

/**
 * Decode + validate a `futurechain:pay` URI. Never throws. `now` is
 * injectable for deterministic tests; defaults to the wall clock.
 */
export function decodePaymentUri(uri: string, now?: number): DecodeResult {
  if (typeof uri !== 'string') return { ok: false, reason: 'invalid' };
  const trimmed = uri.trim();

  // Scheme — `futurechain:pay`, scheme matched case-insensitively.
  if (!trimmed.toLowerCase().startsWith('futurechain:pay')) {
    return { ok: false, reason: 'invalid' };
  }
  const q = trimmed.indexOf('?');
  if (q === -1) return { ok: false, reason: 'invalid' };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(trimmed.slice(q + 1));
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const to = params.get('to');
  const amountStr = params.get('amount');
  const ref = params.get('ref');
  const currency = params.get('currency') ?? 'FTC';
  const v = params.get('v');
  const expStr = params.get('exp');

  if (!to) return { ok: false, reason: 'invalid' };
  if (!amountStr || !DIGITS_RE.test(amountStr)) return { ok: false, reason: 'invalid' };
  if (!ref) return { ok: false, reason: 'invalid' };
  if (currency !== 'FTC') return { ok: false, reason: 'invalid' };
  if (v !== null && v !== '1') return { ok: false, reason: 'invalid' };

  let amountMicroFtc: bigint;
  try {
    amountMicroFtc = BigInt(amountStr);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (amountMicroFtc <= 0n) return { ok: false, reason: 'invalid' };

  // The ADR-004 reference must be a v1 (merchant-bearing) remittance.
  const decoded = reference.decode(ref);
  if (decoded.kind !== 'v1') return { ok: false, reason: 'invalid' };
  const f = decoded.fields;

  let expUnixSeconds = 0;
  if (expStr !== null) {
    if (!DIGITS_RE.test(expStr)) return { ok: false, reason: 'invalid' };
    expUnixSeconds = Number.parseInt(expStr, 10);
  }

  // Optional ISO 20022 creditor party (cn/cc/cct/cst/cpc). Present only
  // on QRs from a creditor-aware merchant app; absent on older QRs.
  let creditor: DecodedCreditor | null = null;
  const cn = params.get('cn');
  if (cn) {
    creditor = {
      name: cn,
      country: params.get('cc') ?? 'SE',
      city: params.get('cct') ?? undefined,
      street: params.get('cst') ?? undefined,
      postcode: params.get('cpc') ?? undefined,
    };
  }

  const payment: DecodedPayment = {
    toAddress: to,
    amountMicroFtc,
    currency,
    ref,
    merchantId: f.merchantId,
    orderId: f.orderId,
    purpose: f.purpose,
    itemCount: f.itemCount ?? null,
    vatMicroFtc: f.vatMicroUnits ?? null,
    discountMicroFtc: f.discountMicroUnits ?? null,
    expUnixSeconds,
    creditor,
    qrUri: trimmed,
  };

  if (isExpired(payment, now)) return { ok: false, reason: 'expired' };
  return { ok: true, payment };
}

/** True when the QR carried an expiry that has already passed. A QR
 *  with no `exp` (expUnixSeconds === 0) never expires. */
export function isExpired(payment: { expUnixSeconds: number }, now?: number): boolean {
  if (payment.expUnixSeconds <= 0) return false;
  const nowSec = Math.floor((now ?? Date.now()) / 1000);
  return nowSec > payment.expUnixSeconds;
}

/** Seconds left before the QR expires, or null if it has no expiry.
 *  Clamped at 0 (never negative). */
export function secondsUntilExpiry(
  payment: { expUnixSeconds: number },
  now?: number,
): number | null {
  if (payment.expUnixSeconds <= 0) return null;
  const nowSec = Math.floor((now ?? Date.now()) / 1000);
  return Math.max(0, payment.expUnixSeconds - nowSec);
}

// ── Amount helpers ────────────────────────────────────────────────────

/** micro-FTC → FTC as a float. */
export function microFtcToFtc(micro: bigint): number {
  return Number(micro) / MICRO_FTC_PER_FTC;
}

/** Format micro-FTC as a human FTC string, trimming trailing zeros. */
export function formatFtc(micro: bigint): string {
  return microFtcToFtc(micro).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
}

/** Estimate the SEK value of a micro-FTC amount at the given rate
 *  (FTC per 1 SEK). The QR carries only FTC, so this is an estimate. */
export function estimateSek(micro: bigint, ftcPerSek: number): number {
  if (!Number.isFinite(ftcPerSek) || ftcPerSek <= 0) return 0;
  return microFtcToFtc(micro) / ftcPerSek;
}

/** Format an estimated SEK amount — whole krona, grouped. */
export function formatSek(sek: number): string {
  return sek.toLocaleString('sv-SE', { maximumFractionDigits: 2 });
}

/** Short reason string for the biometric prompt — `Send 0.10 FTC to
 *  fc_VLak…SyS2`. Truncates the address so the prompt fits one line on
 *  small phones. */
function shortGateReason(amountFtc: number, to: string): string {
  const amt = amountFtc.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
  const tail = to.length > 16 ? `${to.slice(0, 8)}…${to.slice(-4)}` : to;
  return `Send ${amt} FTC to ${tail}`;
}

// ── Payment records ───────────────────────────────────────────────────

/** Persist a confirmed payment as a local receipt only — no chain
 *  settlement. Kept for backward compatibility with older builds that
 *  pre-date the chain-settle flow. New code paths should call
 *  `executePayment` instead. */
export async function recordPayment(
  decoded: DecodedPayment,
  risk?: FraudAssessment,
): Promise<PaymentRecord> {
  const [identity, wallet] = await Promise.all([loadPayerIdentity(), loadWallet()]);
  const record: PaymentRecord = {
    id: newId(),
    toAddress: decoded.toAddress,
    merchantId: decoded.merchantId,
    orderId: decoded.orderId,
    purpose: decoded.purpose,
    amountMicroFtc: decoded.amountMicroFtc,
    ref: decoded.ref,
    qrUri: decoded.qrUri,
    status: 'recorded',
    paidAt: Date.now(),
    pacs008: wallet ? assembleDraft(identity, wallet.address, decoded) : undefined,
    risk,
  };
  await putPayment(record);
  return record;
}

/** 1 FTC = 100_000_000 satoshi (chain output unit).
 *  1 FTC = 1_000_000 micro-FTC (URI/QR unit).
 *  → 1 micro-FTC = 100 satoshi. */
const SATOSHI_PER_MICRO_FTC = 100;

/** Default tx fee in satoshi when the SDK's default would underpay.
 *  Mirrors the FutureChain min-fee (100 sat = 1e-6 FTC) used by the
 *  regression vectors; chosen to be invisible at retail amounts but
 *  not zero so mempool fee-priority ordering still has a signal. */
const DEFAULT_FEE_SATOSHI = 100;

/**
 * Settle a payment on the FutureChain via the SDK + the public
 * light-hub at rpc.futurechain.eu:
 *
 *   1. Load the on-device wallet + payer identity.
 *   2. Fetch the wallet's UTXOs (greedy-select for amount + fee).
 *   3. Build a PACS.008 message + signed Transaction (`buildSignedPacs008Transaction`).
 *   4. POST /submit_signed_transaction — Caddy enforces the X-API-Key.
 *   5. Persist a `PaymentRecord` (status `queued|accepted|failed`) and
 *      kick off a background poller that watches `/transaction/{txid}`
 *      and flips status to `confirmed` when the tx is mined.
 *
 * Returns immediately after step 4. The poller updates the DB row in
 * the background; the UI is expected to re-read the record via
 * `getPaymentRecord(id)` to observe the status transitions.
 */
export async function executePayment(
  decoded: DecodedPayment,
  risk?: FraudAssessment,
): Promise<PaymentRecord> {
  const [identity, wallet] = await Promise.all([
    loadPayerIdentity(),
    loadWallet(),
  ]);
  if (!wallet) {
    throw new Error('executePayment: no wallet on this device');
  }

  const id = newId();
  const draft = assembleDraft(identity, wallet.address, decoded);
  const amountSatoshi = Number(decoded.amountMicroFtc) * SATOSHI_PER_MICRO_FTC;
  const amountFtc = microFtcToFtc(decoded.amountMicroFtc);
  const rpc = getRpc();

  // Biometric gate — fresh user-presence check before we sign anything.
  // On a real device this surfaces Face ID / Touch ID / fingerprint or
  // the device-credential fallback. On web/dev/tests it's a no-op so
  // the existing smoke + unit tests keep working unchanged. A denied
  // prompt returns a `failed` record (with `cancelled` / `unavailable`
  // / `failed` in the error string) BEFORE any DB row is persisted.
  const gate = await requireBiometric({
    reason: shortGateReason(amountFtc, decoded.toAddress),
  });
  if (!gate.ok) {
    const failed: PaymentRecord = {
      id,
      toAddress: decoded.toAddress,
      merchantId: decoded.merchantId,
      orderId: decoded.orderId,
      purpose: decoded.purpose,
      amountMicroFtc: decoded.amountMicroFtc,
      ref: decoded.ref,
      qrUri: decoded.qrUri,
      status: 'failed',
      paidAt: Date.now(),
      pacs008: draft,
      risk,
      error: `biometric ${gate.reason}`,
    };
    await putPayment(failed);
    return failed;
  }

  // Persist the "submitting" record so the UI can navigate immediately.
  const baseRecord: PaymentRecord = {
    id,
    toAddress: decoded.toAddress,
    merchantId: decoded.merchantId,
    orderId: decoded.orderId,
    purpose: decoded.purpose,
    amountMicroFtc: decoded.amountMicroFtc,
    ref: decoded.ref,
    qrUri: decoded.qrUri,
    status: 'submitting',
    paidAt: Date.now(),
    pacs008: draft,
    risk,
  };
  await putPayment(baseRecord);

  try {
    // 1. UTXOs the sender can spend.
    const utxos = await rpc.getUtxos(wallet.address);
    if (utxos.length === 0) {
      throw new Error('no spendable UTXOs — wallet has no on-chain balance');
    }

    // 2. PACS.008 message with the actual ISO parties.
    const message = pacs008.buildPacs008({
      debtor: identityToPacsParty(identity, wallet.address),
      creditor: creditorToPacsParty(decoded),
      amountFtc,
      remittanceText: decoded.ref,
    });
    const uetr = extractUetr(message);

    // 3. Signed Transaction (greedy UTXO + outputs + Ed25519 sig).
    const tx = pacs008.buildSignedPacs008Transaction({
      wallet,
      utxos,
      recipient: decoded.toAddress,
      amountSatoshi,
      feeSatoshi: DEFAULT_FEE_SATOSHI,
      pacs008: message,
      uetr,
    });

    // 4. Submit. Caddy enforces X-API-Key; futurechain enforces it again.
    const submit = await rpc.submitSignedTransaction(tx);
    const status = mapSubmitStatus(submit.status);
    const updated: PaymentRecord = {
      ...baseRecord,
      status,
      txId: submit.tx_id ?? uetr,
      requestId: submit.request_id,
      submittedAt: Date.now(),
      error: status === 'failed' ? (submit.reason ?? submit.error ?? 'rejected') : undefined,
    };
    await putPayment(updated);

    if (status === 'queued' || status === 'accepted') {
      // Fire-and-forget — poller updates the DB row in the background.
      void pollConfirmation(updated.id, updated.txId ?? uetr, decoded.toAddress);
    }
    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed: PaymentRecord = {
      ...baseRecord,
      status: 'failed',
      error: message,
    };
    await putPayment(failed);
    return failed;
  }
}

/** Re-read a payment record (UI polls this to observe status). */
export async function getPaymentRecord(id: string): Promise<PaymentRecord | null> {
  return getPayment(id);
}

/** Background poller — watches the recipient's `/get_utxos` until a
 *  UTXO with our `txId` appears (i.e. the tx is mined into a block
 *  and the recipient's spendable set has been updated). Updates
 *  `status` to `confirmed` (with `confirmedAt`) on success; leaves
 *  the record alone on timeout so the user can manually refresh later.
 *
 *  Why not poll `/transaction/{id}`? FutureChain's
 *  `blockchain.get_transaction` (rpc/mod.rs → blockchain.rs) searches
 *  the mempool first and the chain second, so /transaction returns
 *  the full tx body even while it's still pending. The recipient's
 *  UTXO set, by contrast, only reflects mined output.
 *
 *  Exported + idempotent so the UI (PaymentDoneScreen on mount) can
 *  re-arm a poller for a non-terminal record after the app has been
 *  backgrounded and the original `executePayment`-spawned poller
 *  has been killed by the OS. Concurrent runs are safe — both will
 *  write the same `confirmed` row when they see the UTXO. */
export async function pollConfirmation(
  recordId: string,
  txId: string,
  recipientAddress: string,
): Promise<void> {
  const rpc = getRpc();
  const deadline = Date.now() + 5 * 60_000; // 5 min
  const intervalMs = 5_000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    try {
      const utxos = await rpc.getUtxos(recipientAddress);
      if (utxos.some((u) => u.tx_id === txId)) {
        const current = await getPayment(recordId);
        if (!current) return;
        await putPayment({
          ...current,
          status: 'confirmed',
          confirmedAt: Date.now(),
        });
        return;
      }
    } catch {
      // Transient — keep polling until the deadline.
    }
  }
}

function mapSubmitStatus(s: string): PaymentRecord['status'] {
  if (s === 'queued') return 'queued';
  if (s === 'accepted') return 'accepted';
  if (s === 'rejected' || s === 'error') return 'failed';
  if (s === 'pending') return 'queued';
  return 'queued';
}

function identityToPacsParty(
  identity: PayerIdentity | null,
  walletAddress: string,
): pacs008.Pacs008Party {
  return {
    name: identity?.name.trim() || walletAddress,
    countryOfResidence: identity?.country.trim().toUpperCase() || 'SE',
    accountId: walletAddress,
  };
}

function creditorToPacsParty(decoded: DecodedPayment): pacs008.Pacs008Party {
  return {
    name: decoded.creditor?.name.trim() || decoded.merchantId,
    countryOfResidence: decoded.creditor?.country.trim().toUpperCase() || 'SE',
    accountId: decoded.toAddress,
  };
}

function extractUetr(message: pacs008.Pacs008Message): string {
  // Defensive — the SDK's buildPacs008 always populates the UETR at
  // document.FIToFICstmrCdtTrf.CdtTrfTxInf[0].PmtId.UETR; we read it
  // out rather than re-generate to ensure tx.id and the PACS.008
  // payload agree (the chain requires this).
  const doc = (message as Record<string, unknown>).document as
    | Record<string, unknown>
    | undefined;
  const blk = doc?.FIToFICstmrCdtTrf as Record<string, unknown> | undefined;
  const txs = blk?.CdtTrfTxInf as Array<Record<string, unknown>> | undefined;
  const pmtId = txs?.[0]?.PmtId as Record<string, unknown> | undefined;
  const uetr = pmtId?.UETR;
  if (typeof uetr !== 'string') {
    throw new Error('extractUetr: PACS.008 payload missing UETR');
  }
  return uetr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Every recorded payment, newest first. */
export async function listPayments(): Promise<PaymentRecord[]> {
  return getAllPayments();
}

/** Normalise a stored payment into a behaviour event. */
function recordToEvent(r: PaymentRecord): BehaviorEvent {
  return {
    amountMicroFtc: r.amountMicroFtc,
    counterparty: r.merchantId,
    purpose: r.purpose,
    at: r.paidAt,
  };
}

/** Derive the customer's behaviour profile from their payment history.
 *  `now` is injectable for tests; defaults to the wall clock. */
export async function loadBehaviorProfile(now?: number): Promise<BehaviorProfile> {
  const records = await getAllPayments();
  return deriveBehaviorProfile(records.map(recordToEvent), now);
}

/** Erase all payment records (Settings → Reset app). */
export async function wipeAllPayments(): Promise<void> {
  await wipePayments();
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID.
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}
