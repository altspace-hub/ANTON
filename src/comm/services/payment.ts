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
import { assertBiometric } from './biometric';
import { loadWallet } from './wallet';
import { loadPayerIdentity } from './payment-identity';
import { getRpc } from './fc-rpc';

/** 1 µFTC = 100 satoshi (1 FTC = 1e6 µFTC = 1e8 satoshi). */
const SATOSHI_PER_MICRO_FTC = 100;
/** FutureChain minimum fee — invisible at retail amounts but non-zero
 *  so the mempool's fee-priority ordering has a signal. */
const DEFAULT_FEE_SATOSHI = 100;

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
}

/** Send a transaction on-chain. Throws on any failure; the caller
 *  surfaces the error string to the user. Gated by a fresh biometric
 *  prompt — cancel/unavailable rejects before we touch the wallet. */
export async function sendOnChain(input: SendInput): Promise<SendResult> {
  const amountSatoshi = Number(input.amountMicroFtc) * SATOSHI_PER_MICRO_FTC;
  const amountFtc = Number(input.amountMicroFtc) / 1_000_000;

  // Biometric — Comm's pattern matches pay + business.
  await assertBiometric({
    reason: shortGateReason(amountFtc, input.to),
  });

  const [identity, wallet] = await Promise.all([
    loadPayerIdentity(),
    loadWallet(),
  ]);
  if (!wallet) {
    throw new Error('no wallet on this device');
  }

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

  const tx = pacs008.buildSignedPacs008Transaction({
    wallet,
    utxos,
    recipient: input.to,
    amountSatoshi,
    feeSatoshi: DEFAULT_FEE_SATOSHI,
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
