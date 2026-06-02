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
import type { DecodedCreditor, DecodedPayment, PaymentPurpose, PaymentRecord } from './types';
import { getAllPayments, getPayment, putPayment, wipePayments } from './db';
import { loadPayerIdentity, type PayerIdentity } from './payment-identity';
import { loadWallet } from './wallet';
import {
  activeWalletHasPassphrase, getActiveSigner, getActiveWalletMeta,
  PassphraseRequiredError,
} from './wallets';
import { BadPassphraseError } from './wallet-passphrase';
import { requireBiometric } from './biometric';
import { hasPaymentPin, setPaymentPin, verifyPaymentPin } from './payment-pin';
import { assembleDraft, type PartyIdentification } from './pacs008-draft';
import {
  deriveBehaviorProfile, type BehaviorEvent, type BehaviorProfile,
} from './behavior-profile';
import type { FraudAssessment } from './fraud-engine';
import { getRpc } from './fc-rpc';
import { getDisplayQuote } from './fx';
import {
  fullDisclosureReady, missingFields, travelRuleTierFor,
  type IdentityFieldStatus,
} from './travel-rule';

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
  if (currency !== 'FTC') return { ok: false, reason: 'invalid' };
  if (v !== null && v !== '1') return { ok: false, reason: 'invalid' };

  let amountMicroFtc: bigint;
  try {
    amountMicroFtc = BigInt(amountStr);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (amountMicroFtc <= 0n) return { ok: false, reason: 'invalid' };

  // The ADR-004 `ref` is optional. Merchant QRs (ANTON Business) always
  // carry a v1 reference and we still REQUIRE it to be a valid v1 when
  // present — a malformed/v2 ref is a hard reject (the merchant flow
  // depends on the merchantId/orderId it carries). But a pay-to-pay
  // *receive* (ReceiveScreen / the animated rich QR) has no merchant,
  // so an absent ref is allowed: the merchant-bearing fields are simply
  // empty and the purpose defaults to a generic person-to-person value.
  // This keeps the static and animated decode paths consistent.
  let f: {
    merchantId: string; orderId: string; purpose: PaymentPurpose;
    itemCount?: number; vatMicroUnits?: bigint; discountMicroUnits?: bigint;
  };
  if (ref) {
    const decoded = reference.decode(ref);
    if (decoded.kind !== 'v1') return { ok: false, reason: 'invalid' };
    f = decoded.fields;
  } else {
    f = { merchantId: '', orderId: '', purpose: 'SERVICE' };
  }

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

  // Wave 10 — optional structured order envelope (cart items, totals,
  // ref). Present only when the merchant flipped "Include order details"
  // on the QR generation screen. Base64url-JSON in the `order` param.
  let orderEnvelope: DecodedPayment['orderEnvelope'] = null;
  const orderParam = params.get('order');
  if (orderParam) {
    orderEnvelope = decodeOrderEnvelopeParam(orderParam);
  }

  const payment: DecodedPayment = {
    toAddress: to,
    amountMicroFtc,
    currency,
    ref: ref ?? '',
    merchantId: f.merchantId,
    orderId: f.orderId,
    purpose: f.purpose,
    itemCount: f.itemCount ?? null,
    vatMicroFtc: f.vatMicroUnits ?? null,
    discountMicroFtc: f.discountMicroUnits ?? null,
    expUnixSeconds,
    creditor,
    orderEnvelope,
    qrUri: trimmed,
  };

  if (isExpired(payment, now)) return { ok: false, reason: 'expired' };
  return { ok: true, payment };
}

/** Decode the `order=` QR param. Base64url → UTF-8 → JSON →
 *  AntonRemittance. Returns null on any failure. The Pay app's Review
 *  screen calls this once per scan; subsequent payment-record reads
 *  pass the parsed shape through without re-decoding. */
function decodeOrderEnvelopeParam(b64: string): DecodedPayment['orderEnvelope'] {
  try {
    const pad = (4 - (b64.length % 4)) % 4;
    const std = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
    const bin = typeof atob === 'function'
      ? atob(std)
      : Buffer.from(std, 'base64').toString('binary');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && parsed.v === 1) return parsed;
    return null;
  } catch {
    return null;
  }
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
/** Caller-supplied callback for the (optional) wallet-passphrase
 *  dialog. Receives the number of failed attempts so far (0 = first
 *  prompt; bumps to 1, 2, … on each wrong entry up to MAX_ATTEMPTS).
 *  Resolve with the entered passphrase, or null when the user
 *  cancels — executePayment treats null as a clean abort (no signing,
 *  status: failed, error: 'passphrase cancelled'). */
export type PassphrasePrompt = (failedAttempts: number) => Promise<string | null>;

/** Caller-supplied callback for the in-app payment-PIN dialog — the
 *  user-presence fallback used when the device has no usable biometric.
 *  `mode` is 'create' the first time (no PIN set yet) or 'enter' afterwards;
 *  `failedAttempts` drives the back-off in 'enter' mode. Resolve with the
 *  entered PIN, or null when the user cancels. */
export type PinPrompt = (mode: 'create' | 'enter', failedAttempts: number) => Promise<string | null>;

const MAX_PASSPHRASE_ATTEMPTS = 5;
const MAX_PIN_ATTEMPTS = 5;

export interface ExecutePaymentOptions {
  /** Required IF the active wallet has a passphrase set. Without this
   *  callback, executePayment throws on a passphrased wallet so the
   *  signing path can't silently fail. */
  promptForPassphrase?: PassphrasePrompt;
  /** The biometric→PIN fallback dialog. Used ONLY when the device has no
   *  usable biometric (requireBiometric returns unavailable/failed). Without
   *  it, a no-biometric device fails the gate exactly as before. */
  promptForPin?: PinPrompt;
}

/** Run the in-app payment-PIN gate. Returns true when the user authorizes
 *  (a correct existing PIN, or a freshly-created one), false on cancel,
 *  exhaustion, or no callback. Mirrors the passphrase retry loop. */
async function runPinGate(prompt: PinPrompt | undefined): Promise<boolean> {
  if (!prompt) return false;
  if (await hasPaymentPin()) {
    let failures = 0;
    while (failures < MAX_PIN_ATTEMPTS) {
      const entered = await prompt('enter', failures);
      if (entered == null) return false;             // cancelled
      if (await verifyPaymentPin(entered)) return true;
      failures++;
    }
    return false;                                     // exhausted
  }
  // No PIN yet → create one now (the modal handles enter + confirm).
  const created = await prompt('create', 0);
  if (created == null) return false;                  // cancelled
  try {
    await setPaymentPin(created);
  } catch {
    return false;                                     // malformed — UI validates, so rare
  }
  return true;
}

export async function executePayment(
  decoded: DecodedPayment,
  risk?: FraudAssessment,
  /** Wave 10 — customer's optional free-text note. Bundles into the
   *  PACS.008 RmtInf alongside the merchant's order envelope (if any).
   *  Pass undefined or '' for the default minimal-remittance behaviour. */
  customerNote?: string,
  options?: ExecutePaymentOptions,
): Promise<PaymentRecord> {
  // Resolve only the *non-secret* bits eagerly — identity + wallet
  // address. The actual signer (which may need a passphrase prompt)
  // is deferred until after the biometric gate so we can sequence the
  // user-facing prompts in the right order.
  const [identity, walletMeta] = await Promise.all([
    loadPayerIdentity(),
    getActiveWalletMeta(),
  ]);
  if (!walletMeta) {
    throw new Error('executePayment: no wallet on this device');
  }
  // A payment must carry a real originator name — shipping the bare
  // fc_ address as the debtor "name" is not a KYC identity, and the
  // chain's compliance validator rejects a missing / placeholder
  // debtor name. The ReviewScreen gate is the primary block; this is
  // the defence-in-depth backstop right before signing.
  if (!identity || !identity.name.trim()) {
    throw new Error(
      'Set your payment identity (your name) in Settings before sending a payment.',
    );
  }
  const wallet = { address: walletMeta.address };

  const id = newId();
  // Travel-Rule tier — decides whether the originator postal address
  // is disclosed on-chain: >= EUR 1000 (or no live FX rate — the
  // conservative default) includes it; sub-threshold omits it per
  // GDPR data-minimisation. Resolved once here so the signed message
  // and the on-record draft agree.
  const eurQuote = await getDisplayQuote('EUR');
  const tier = travelRuleTierFor(decoded.amountMicroFtc, eurQuote);
  // Backstop for the ReviewScreen gate: when the Travel Rule applies
  // (full / no-rate-conservative tier), the payer identity MUST be
  // complete — otherwise executePayment called via a deeplink or
  // programmatic path would silently ship a partial PstlAdr.
  if (tier !== 'minimal') {
    const fields: IdentityFieldStatus = {
      hasName: !!identity.name.trim(),
      hasCountry: !!identity.country.trim(),
      hasStreet: !!identity.street.trim(),
      hasCity: !!identity.city.trim(),
      hasPostcode: !!identity.postcode.trim(),
    };
    if (!fullDisclosureReady(fields)) {
      throw new Error(
        `Travel Rule applies — complete your address ` +
        `(${missingFields(fields).join(', ')}) in Settings before sending.`,
      );
    }
  }
  const draft = assembleDraft(identity, wallet.address, decoded, tier);
  const amountSatoshi = Number(decoded.amountMicroFtc) * SATOSHI_PER_MICRO_FTC;
  const amountFtc = microFtcToFtc(decoded.amountMicroFtc);
  const rpc = await getRpc();

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
    // Biometric not usable on this device → fall back to the in-app payment
    // PIN (a user-presence check that works without a fingerprint). A user
    // who actively CANCELLED a real biometric prompt is a clean abort and
    // does NOT fall through; 'unavailable' (no sensor / none enrolled) and
    // 'failed' (e.g. no-hardware error) both fall through to the PIN gate.
    const canUsePin = gate.reason === 'unavailable' || gate.reason === 'failed';
    const pinOk = canUsePin && (await runPinGate(options?.promptForPin));
    if (!pinOk) {
      // Distinguish the failure: a wired-up PIN that the user cancelled vs a
      // biometric cancel vs no PIN callback at all.
      const reason = canUsePin && options?.promptForPin
        ? 'pin cancelled'
        : `biometric ${gate.reason}`;
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
        error: reason,
      };
      await putPayment(failed);
      return failed;
    }
  }

  // Wallet passphrase gate — second factor on top of biometric, opt-in.
  // When a passphrase is set, loop until the user enters the right one,
  // cancels, or exhausts the 5-attempt budget. The modal (via the
  // PassphrasePrompt callback) shows back-off + remaining-attempts UI
  // based on the `failedAttempts` it's told about on each prompt.
  let signer: Awaited<ReturnType<typeof getActiveSigner>>;
  if (await activeWalletHasPassphrase()) {
    if (!options?.promptForPassphrase) {
      throw new Error(
        'executePayment: active wallet has a passphrase but no ' +
        'promptForPassphrase callback was provided',
      );
    }
    let resolved: typeof signer = null;
    let failures = 0;
    let cancelled = false;
    while (failures < MAX_PASSPHRASE_ATTEMPTS) {
      const pp = await options.promptForPassphrase(failures);
      if (!pp) {
        cancelled = true;
        break;
      }
      try {
        resolved = await getActiveSigner(pp);
        break;
      } catch (e) {
        if (e instanceof BadPassphraseError) {
          failures++;
          continue;
        }
        throw e;
      }
    }
    if (!resolved) {
      const reason = cancelled
        ? 'passphrase cancelled'
        : `passphrase incorrect (${MAX_PASSPHRASE_ATTEMPTS} attempts)`;
      const failed: PaymentRecord = {
        id, toAddress: decoded.toAddress, merchantId: decoded.merchantId,
        orderId: decoded.orderId, purpose: decoded.purpose,
        amountMicroFtc: decoded.amountMicroFtc, ref: decoded.ref,
        qrUri: decoded.qrUri, status: 'failed', paidAt: Date.now(),
        pacs008: draft, risk, error: reason,
      };
      await putPayment(failed);
      return failed;
    }
    signer = resolved;
  } else {
    signer = await getActiveSigner();
  }
  if (!signer) {
    throw new Error('executePayment: no wallet on this device');
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
    // Wave 10 — if the merchant attached a structured order envelope
    // (or the customer added a note), build the rich RmtInf and pass
    // it through instead of the legacy single-line `remittanceText`.
    const trimmedNote = (customerNote ?? '').trim();
    let remittanceInfo: ReturnType<typeof pacs008.encodeRemittance>['rmtInf'] | undefined;
    if (decoded.orderEnvelope || trimmedNote) {
      const merged: pacs008.AntonRemittance = decoded.orderEnvelope
        ? { ...decoded.orderEnvelope, ...(trimmedNote ? { message: trimmedNote } : {}) }
        : {
            v: 1,
            kind: 'message',
            ref: decoded.orderId,
            ...(trimmedNote ? { message: trimmedNote } : {}),
          };
      try {
        const encoded = pacs008.encodeRemittance(merged);
        remittanceInfo = encoded.rmtInf;
      } catch (e) {
        // Hard-cap exceeded — fall back to the legacy single-line
        // shorthand so the payment still proceeds.
        // eslint-disable-next-line no-console
        console.warn('executePayment: rich remittance too large, falling back to ref', e);
      }
    }
    const message = pacs008.buildPacs008({
      debtor: pacsPartyFromDraft(draft.debtor),
      creditor: pacsPartyFromDraft(draft.creditor),
      amountFtc,
      purpose: isoPurpose(draft.purpose),
      ...(remittanceInfo
        ? { remittanceInfo }
        : { remittanceText: decoded.ref }),
    });
    const uetr = extractUetr(message);

    // 3. Signed Transaction (greedy UTXO + outputs + Ed25519 sig).
    // Wave 7: signer-callback path so the priv key never enters the
    // JS heap on a real device. Falls back to in-JS @noble on dev.
    const tx = await pacs008.buildSignedPacs008TransactionWithSigner({
      publicKey: signer.publicKey,
      senderAddress: wallet.address,
      signer: signer.sign,
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
  const rpc = await getRpc();
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

/** Convert a draft PartyIdentification — which has already had the
 *  Travel-Rule tier applied (postal address present on full /
 *  conservative tiers, omitted on minimal) — into the SDK's on-chain
 *  Pacs008Party, carrying the structured postal address through to
 *  the signed message. */
function pacsPartyFromDraft(p: PartyIdentification): pacs008.Pacs008Party {
  const party: pacs008.Pacs008Party = {
    name: p.name,
    countryOfResidence: p.country,
    accountId: p.address,
  };
  if (p.street || p.city || p.postcode) {
    party.postalAddress = {
      streetName: p.street || undefined,
      townName: p.city || undefined,
      postCode: p.postcode || undefined,
      country: p.country,
    };
  }
  return party;
}

/** Map the app's display purpose to a valid ISO 20022 external
 *  purpose code for `Purp.Cd`. GDDS / SCVE / OTHR are ISO codes; the
 *  app-local 'REFUND' has no ISO equivalent and maps to OTHR. */
function isoPurpose(p: string): string {
  return p === 'REFUND' ? 'OTHR' : p;
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
