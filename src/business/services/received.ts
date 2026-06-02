/**
 * received.ts — Business App: inbound payment matcher.
 *
 * Polls `/iso_received/<active wallet>` on the configured FC hub,
 * walks the response, and for each new transaction tries to match it
 * against a pending Receipt by (amount, ref, receiving address). On a
 * unique match, the receipt is flipped `pending → confirmed` with the
 * chain tx id stamped in. The caller (App-level poller) fires a local
 * notification for each confirmed receipt.
 *
 * Why this lives separately from the chain-side wallet ledger pattern
 * in Pay/Comm: the merchant doesn't need a generic "show me all
 * inbound txs" view — every legitimate inbound payment IS a sale
 * already known to the local Receipt store. Anything that lands
 * without a matching pending receipt is logged but not auto-recorded
 * (could be a wrong-amount payment, an out-of-app transfer, etc.) so
 * the merchant has to reconcile manually.
 *
 * Parser parity with src/pay/services/received.ts so chain-shape
 * tuning stays in one mental model.
 */
import { decodeRemittance } from '@futurechain/sdk/pacs008';
import type { AntonRemittance } from '@futurechain/sdk/pacs008';
import { getActiveWalletMeta } from './wallets';
import { getRpc } from './fc-rpc';
import { confirmReceiptByMatch } from './receipts';
import type { Receipt } from './types';

/** Poll once. Returns the newly-confirmed receipts (caller fires a
 *  notification per row). Never throws — network / parse errors are
 *  swallowed and retried on the next tick. */
export async function pollIncomingOnce(): Promise<Receipt[]> {
  const meta = await getActiveWalletMeta();
  if (!meta) return [];
  try {
    const rpc = await getRpc();
    const raw = await rpc.getIsoReceived(meta.address);
    const items = extractItems(raw);
    const confirmed: Receipt[] = [];
    for (const item of items) {
      const n = normaliseItem(item);
      if (!n) continue;
      const receipt = await confirmReceiptByMatch({
        amountMicroFtc: n.amountMicroFtc,
        ref: n.remittance ?? '',
        txHash: n.txHash,
        receivingAddress: meta.address,
        customerRemittance: n.customerRemittance,
        customerAddress: n.customerAddress,
      });
      if (receipt) confirmed.push(receipt);
    }
    return confirmed;
  } catch {
    return [];
  }
}

// ── Response parsing (identical shape to Pay/Comm receivers) ─────────

interface JsonObj { [k: string]: unknown }

function isObj(v: unknown): v is JsonObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

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

interface Normalised {
  txHash: string;
  amountMicroFtc: bigint;
  remittance?: string;
  /** Wave 10 — structured AntonRemittance decoded from the PACS.008
   *  `RmtInf.Strd` block, when the customer attached one. */
  customerRemittance?: AntonRemittance;
  /** The customer's (debtor's) fc_ wallet address, lifted from the
   *  inbound PACS.008's `DbtrAcct.Id.Othr.Id` — the same key src/pay
   *  populates from `buildPacs008`. Threaded onto the confirmed receipt
   *  so the merchant can save a repeat customer to their address book.
   *  undefined when the response carries no recognisable debtor account
   *  (the receipt still confirms on amount + ref). */
  customerAddress?: string;
}

function normaliseItem(raw: unknown): Normalised | null {
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
  ]);
  if (typeof amountFtc === 'number') {
    amountMicroFtc = BigInt(Math.round(amountFtc * 1_000_000));
  } else if (typeof amountFtc === 'string') {
    const n = Number(amountFtc);
    if (Number.isFinite(n)) amountMicroFtc = BigInt(Math.round(n * 1_000_000));
  } else {
    const sat = pick(raw, [['amount_raw'], ['amountRaw'], ['amountSatoshi']]);
    if (typeof sat === 'number' || typeof sat === 'string') {
      const n = typeof sat === 'string' ? Number(sat) : sat;
      if (Number.isFinite(n)) amountMicroFtc = BigInt(Math.round(n / 100));
    }
  }

  const remRaw = pick(raw, [
    ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'RmtInf', 'Ustrd'],
    ['CdtTrfTxInf', '0', 'RmtInf', 'Ustrd'],
    ['RmtInf', 'Ustrd'],
  ]);
  const remittance = Array.isArray(remRaw)
    ? remRaw.filter(s => typeof s === 'string').join(' ')
    : typeof remRaw === 'string' ? remRaw : undefined;

  // Wave 10 — pull the whole RmtInf block and try to decode the
  // ANTON-V1 structured envelope. Present only when the customer's
  // Pay app bundled order details / a note into the payment.
  const rmtInf = pick(raw, [
    ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'RmtInf'],
    ['CdtTrfTxInf', '0', 'RmtInf'],
    ['RmtInf'],
  ]);
  const customerRemittance = rmtInf ? decodeRemittance(rmtInf) ?? undefined : undefined;

  const customerAddress = extractDebtorAddress(raw);

  return { txHash, amountMicroFtc, remittance, customerRemittance, customerAddress };
}

/**
 * Pull the debtor (customer) account fc_ address out of an inbound
 * PACS.008 envelope. Mirrors the exact key src/pay's `buildPacs008`
 * emits — `DbtrAcct: { Id: { Othr: { Id: ... } } }` nested under
 * `CdtTrfTxInf[0]` — with the bare-CdtTrfTxInf fallback for responses
 * that hoist the credit-transfer block to the top level (parity with
 * src/pay/services/received.ts). Returns undefined when no recognisable
 * debtor account is present; the receipt still confirms on amount + ref.
 *
 * Exported for unit testing the envelope-shape contract.
 */
export function extractDebtorAddress(raw: unknown): string | undefined {
  const debtorAddr = pick(raw, [
    ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'DbtrAcct', 'Id', 'Othr', 'Id'],
    ['CdtTrfTxInf', '0', 'DbtrAcct', 'Id', 'Othr', 'Id'],
  ]);
  return typeof debtorAddr === 'string' && debtorAddr ? debtorAddr : undefined;
}
