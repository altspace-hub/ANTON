/**
 * payment.ts — Comm App: on-chain send via Bahnhof.
 *
 * Phase G2 (May 21 2026): closes the "WalletSendScreen records local-
 * only `send` txs" gap. The flow mirrors
 * `src/pay/services/payment.ts::executePayment` but slims down to what
 * Comm needs:
 *
 *   1. Biometric gate (Comm has its own biometric.ts).
 *   2. Load the on-device Ed25519 wallet.
 *   3. Fetch the wallet's UTXOs from the public hub.
 *   4. Build a signed PACS.008 Transaction via @futurechain/sdk
 *      (`buildPacs008` + `buildSignedPacs008Transaction`).
 *   5. POST /submit_signed_transaction — Caddy + sidecar enforce the
 *      per-install bearer; FC light-hub gossips the tx.
 *   6. Return the tx id + UETR to the caller. The caller (WalletSendScreen)
 *      is responsible for writing the `recordTx({kind:'send', ...})`
 *      row with the returned txHash — that keeps the local tax-ledger
 *      schema in Comm's hands without this module having to know it.
 *
 * Confirmation polling is intentionally NOT done here. The Pay app's
 * confirmation poller targets a stateful PaymentRecord lifecycle which
 * Comm doesn't have; if Comm later wants confirmation status it can
 * call the same `/get_utxos/{recipient}` poll pattern shown in
 * `src/pay/services/payment.ts::pollConfirmation`.
 */
import { pacs008 } from '@futurechain/sdk';
import { requireBiometric } from './biometric';
import { loadWallet } from './wallet';
import { getActiveSigner } from './wallets';
import { loadPayerIdentity } from './payment-identity';
import { getRpc } from './fc-rpc';
import { hasPaymentPin, verifyPaymentPin, setPaymentPin } from './payment-pin';

/** The review screen passes these so sendOnChain can fall back from biometric to
 *  the in-app PIN (and, in Phase 3b, prompt for the wallet passphrase). */
export type PinPrompt = (mode: 'create' | 'enter', failedAttempts: number) => Promise<string | null>;
export interface SendOptions {
  promptForPin?: PinPrompt;
}
const MAX_PIN_ATTEMPTS = 5;

/** Biometric-less fallback: verify an existing PIN (looped) or create one now.
 *  Returns true when the user authorized, false on cancel/exhaustion. */
async function runPinGate(prompt: PinPrompt | undefined): Promise<boolean> {
  if (!prompt) return false;
  if (await hasPaymentPin()) {
    let failures = 0;
    while (failures < MAX_PIN_ATTEMPTS) {
      const entered = await prompt('enter', failures);
      if (entered == null) return false;            // cancelled
      if (await verifyPaymentPin(entered)) return true;
      failures++;
    }
    return false;                                    // exhausted
  }
  const created = await prompt('create', 0);
  if (created == null) return false;                 // cancelled
  try { await setPaymentPin(created); } catch { return false; }
  return true;
}

/** 1 µFTC = 100 satoshi (1 FTC = 1e6 µFTC = 1e8 satoshi). */
const SATOSHI_PER_MICRO_FTC = 100;
const MICRO_FTC_PER_FTC = 1_000_000;

/** micro-FTC → FTC as a number (for display only). */
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

/** The network fee (0.1% capped at 0.1 FTC) for an amount, in micro-FTC —
 *  for pre-confirm display. Single source of truth = the SDK; matches what
 *  sendOnChain signs + the node enforces. See docs/FEE_POLICY.md. */
export function feeMicroFtcFor(amountMicroFtc: bigint): bigint {
  const feeSat = pacs008.computeNetworkFee(Number(amountMicroFtc) * SATOSHI_PER_MICRO_FTC);
  return BigInt(Math.round(feeSat / SATOSHI_PER_MICRO_FTC));
}

export interface SendInput {
  /** Recipient `fc_…` Base58 address. */
  to: string;
  /** Amount in micro-FTC (1 FTC = 1_000_000 µFTC). */
  amountMicroFtc: bigint;
  /** Optional remittance text — placed in PACS.008 `RmtInf.Ustrd`. */
  remittanceText?: string | null;
  /** Optional ISO 20022 creditor party — passed to `buildPacs008` as
   *  the creditor side. Falls back to a minimal `{name: to, …}` when
   *  unknown (the QR may not carry full creditor details). */
  creditor?: { name: string; countryOfResidence?: string } | null;
}

export interface SendResult {
  /** The PACS.008 UETR (`pmt.PmtId.UETR`). */
  uetr: string;
  /** The chain-side tx id returned by `/submit_signed_transaction`. */
  txId: string;
  /** P2P / mempool status the hub reported. */
  status: string;
  /** Network fee signed into the tx (satoshi). Persisted on the WalletTx so the
   *  caller doesn't recompute. 0.1% capped at 0.1 FTC. */
  feeSatoshi: number;
}

/** Send a transaction on-chain. Throws on any failure; the caller
 *  surfaces the error string to the user. Gated by a fresh biometric
 *  prompt — cancel/unavailable rejects before we touch the wallet. */
export async function sendOnChain(input: SendInput, options?: SendOptions): Promise<SendResult> {
  const amountSatoshi = Number(input.amountMicroFtc) * SATOSHI_PER_MICRO_FTC;
  // Network fee = 0.1% capped at 0.1 FTC (SDK single source of truth; matches
  // the node's enforced rule). See docs/FEE_POLICY.md.
  const feeSatoshi = pacs008.computeNetworkFee(amountSatoshi);
  const amountFtc = Number(input.amountMicroFtc) / 1_000_000;

  // Auth gate — biometric first, falling back to the in-app PIN when the device
  // has no usable biometric (mirrors Pay's executePayment). A deliberate cancel
  // aborts; 'unavailable'/'failed' fall through to the PIN.
  const gate = await requireBiometric({ reason: shortGateReason(amountFtc, input.to) });
  if (!gate.ok) {
    const canUsePin = gate.reason === 'unavailable' || gate.reason === 'failed';
    const pinOk = canUsePin && (await runPinGate(options?.promptForPin));
    if (!pinOk) {
      throw new Error(canUsePin && options?.promptForPin ? 'pin cancelled' : `biometric ${gate.reason}`);
    }
  }

  const [identity, signer] = await Promise.all([
    loadPayerIdentity(),
    getActiveSigner(),
  ]);
  if (!signer) {
    throw new Error('no wallet on this device');
  }
  // Wave 7 — wallet shape carries only the public bits. Signing
  // goes through signer.sign(); the priv key never enters JS heap
  // on a real device.
  const wallet = { address: signer.address, publicKey: signer.publicKey };

  const client = await getRpc();
  const utxos = await client.getUtxos(wallet.address);
  if (utxos.length === 0) {
    throw new Error('no spendable UTXOs — wallet has no on-chain balance');
  }

  const debtor: pacs008.Pacs008Party = {
    name: identity?.name || 'ANTON Comm user',
    accountId: wallet.address,
    countryOfResidence: identity?.country || 'SE',
  };
  const creditor: pacs008.Pacs008Party = {
    name: input.creditor?.name ?? input.to,
    accountId: input.to,
    countryOfResidence: input.creditor?.countryOfResidence ?? 'SE',
  };

  const message = pacs008.buildPacs008({
    debtor,
    creditor,
    amountFtc,
    remittanceText: input.remittanceText ?? undefined,
  });
  const uetr = extractUetr(message);

  const tx = await pacs008.buildSignedPacs008TransactionWithSigner({
    publicKey: wallet.publicKey,
    senderAddress: wallet.address,
    signer: signer.sign,
    utxos,
    recipient: input.to,
    amountSatoshi,
    feeSatoshi,
    pacs008: message,
    uetr,
  });

  const submit = await client.submitSignedTransaction(tx);
  if (submit.status === 'rejected' || submit.error) {
    throw new Error(submit.reason ?? submit.error ?? 'rejected');
  }
  return {
    uetr,
    txId: submit.tx_id ?? uetr,
    status: String(submit.status ?? 'submitted'),
    feeSatoshi,
  };
}

function shortGateReason(amountFtc: number, to: string): string {
  const amt = amountFtc.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  });
  const tail = to.length > 16 ? `${to.slice(0, 8)}…${to.slice(-4)}` : to;
  return `Send ${amt} FTC to ${tail}`;
}

function extractUetr(msg: pacs008.Pacs008Message): string {
  // Mirrors pay's payment.ts extraction. The UETR lives under
  // document.FIToFICstmrCdtTrf.CdtTrfTxInf[0].PmtId.UETR.
  try {
    const doc = (msg as Record<string, unknown>)['document'] as Record<string, unknown>;
    const cct = doc['FIToFICstmrCdtTrf'] as Record<string, unknown>;
    const arr = cct['CdtTrfTxInf'] as Array<Record<string, unknown>>;
    const pmtId = arr[0]?.['PmtId'] as Record<string, unknown>;
    const uetr = pmtId?.['UETR'];
    if (typeof uetr === 'string') return uetr;
  } catch { /* fall through */ }
  throw new Error('UETR missing from built PACS.008');
}
