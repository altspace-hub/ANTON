/**
 * received.ts — inbound transaction polling + local persistence.
 *
 * The light hub serves a `GET /iso_received/<addr>` endpoint that
 * returns every ISO 20022 transaction the address has received. We
 * call it on app foreground and every 30 s, normalise whatever shape
 * we get back, dedupe against what we already stored, persist the
 * new arrivals, and return them to the caller — which fires a local
 * notification per new arrival.
 *
 * Response shape — the SDK declares this endpoint's return type as
 * `unknown` because the chain is in flux. We accept the three forms
 * we've seen in the wild (plain array, `{transactions:[…]}`,
 * `{items:[…]}`) and extract the fields below by walking multiple
 * candidate paths. Anything we can't parse becomes a row with the
 * raw payload in `rawJson` so the user still sees the receipt
 * (balance went up, after all) and we have a debug trail.
 */
import { getActiveWalletMeta } from './wallets';
import { getRpc } from './fc-rpc';
import { putReceived, getAllReceived, hasReceivedTxId } from './db';
import type { ReceivedRecord } from './types';

/** Poll the chain once. Returns the records that are new since last
 *  poll, in arrival order (oldest → newest). Empty array = nothing
 *  new, or no wallet yet, or the endpoint is unreachable. Never
 *  throws — the caller should treat any error as "try again next
 *  tick." */
export async function pollIncomingOnce(): Promise<ReceivedRecord[]> {
  const meta = await getActiveWalletMeta();
  if (!meta) return [];
  try {
    const rpc = await getRpc();
    const raw = await rpc.getIsoReceived(meta.address);
    const items = extractItems(raw);
    const fresh: ReceivedRecord[] = [];
    for (const item of items) {
      const rec = normaliseItem(item, meta.address);
      if (!rec) continue;
      // Dedupe by txId. If we've seen this txId in the local store,
      // we don't notify again. (txId is the UETR-derived chain hash;
      // stable across re-fetches.)
      if (await hasReceivedTxId(rec.txId)) continue;
      await putReceived(rec);
      fresh.push(rec);
    }
    return fresh;
  } catch {
    // Endpoint down / network unreachable / wallet has no chain
    // history yet → silent no-op. We'll retry on the next tick.
    return [];
  }
}

/** Every inbound record we've ever seen, newest first. Used by
 *  HistoryScreen + the HomeScreen "Recent" peek to merge with the
 *  outbound PaymentRecord list. */
export async function listReceived(): Promise<ReceivedRecord[]> {
  return getAllReceived();
}

// ── Response parsing ────────────────────────────────────────────────

interface JsonObj { [k: string]: unknown }

function isObj(v: unknown): v is JsonObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Pull out the array of "received tx" entries from whatever shape
 *  the chain returned. */
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

/** Try every candidate path; return the first defined value. */
function pick(obj: unknown, paths: string[][]): unknown {
  for (const path of paths) {
    let cur: unknown = obj;
    let ok = true;
    for (const seg of path) {
      if (isObj(cur)) {
        cur = cur[seg];
      } else if (Array.isArray(cur)) {
        const idx = Number(seg);
        cur = Number.isInteger(idx) ? cur[idx] : undefined;
      } else {
        ok = false; break;
      }
      if (cur === undefined || cur === null) { ok = false; break; }
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return undefined;
}

/** Map one raw item to a ReceivedRecord. Returns null when we can't
 *  pull even a txId — without an id we can't dedupe so we drop it. */
function normaliseItem(raw: unknown, myAddress: string): ReceivedRecord | null {
  const txId = pick(raw, [
    ['tx_id'], ['txid'], ['id'],
    ['transaction', 'id'],
    ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'PmtId', 'TxId'],
    ['CdtTrfTxInf', '0', 'PmtId', 'TxId'],
    ['PmtId', 'TxId'],
  ]);
  if (typeof txId !== 'string' || !txId) return null;

  const fromAddress =
    pick(raw, [
      ['from_address'], ['fromAddress'], ['sender'],
      ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'Dbtr', 'Acct', 'Id', 'Othr', 'Id'],
      ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'DbtrAcct', 'Id', 'Othr', 'Id'],
      ['CdtTrfTxInf', '0', 'DbtrAcct', 'Id', 'Othr', 'Id'],
    ]) as string | undefined;

  const fromName = pick(raw, [
    ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'Dbtr', 'Nm'],
    ['CdtTrfTxInf', '0', 'Dbtr', 'Nm'],
    ['Dbtr', 'Nm'],
  ]) as string | undefined;

  // Amount — pull from PACS.008's IntrBkSttlmAmt.$value (FTC) and
  // convert to micro-FTC. Fall back to amount_raw (satoshi-ish) if
  // present; the chain mostly returns satoshi, where 1 FTC = 10^8.
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
      // 1 FTC = 100_000_000 satoshi = 1_000_000 µFTC → µFTC = sat / 100
      const n = typeof sat === 'string' ? Number(sat) : sat;
      if (Number.isFinite(n)) amountMicroFtc = BigInt(Math.round(n / 100));
    }
  }

  const remittanceRaw = pick(raw, [
    ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'RmtInf', 'Ustrd'],
    ['CdtTrfTxInf', '0', 'RmtInf', 'Ustrd'],
    ['RmtInf', 'Ustrd'],
  ]);
  const remittance = Array.isArray(remittanceRaw)
    ? remittanceRaw.filter(s => typeof s === 'string').join(' ')
    : typeof remittanceRaw === 'string' ? remittanceRaw : undefined;

  // Timestamp — `CreDtTm` ISO string, or `block_timestamp_unix`, or
  // `received_at`. Fall back to "now" so the row at least sorts.
  let receivedAt = Date.now();
  const cre = pick(raw, [
    ['document', 'FIToFICstmrCdtTrf', 'GrpHdr', 'CreDtTm'],
    ['GrpHdr', 'CreDtTm'],
    ['CreDtTm'],
    ['received_at'],
    ['timestamp'],
  ]);
  if (typeof cre === 'string') {
    const t = Date.parse(cre);
    if (Number.isFinite(t)) receivedAt = t;
  } else if (typeof cre === 'number') {
    receivedAt = cre < 1e12 ? cre * 1000 : cre; // unix-sec vs ms
  }

  const blockHeight = pick(raw, [['block_height'], ['blockHeight']]);

  return {
    txId,
    toAddress: myAddress,
    fromAddress: typeof fromAddress === 'string' ? fromAddress : '',
    fromName: typeof fromName === 'string' ? fromName : undefined,
    amountMicroFtc,
    remittance,
    receivedAt,
    blockHeight: typeof blockHeight === 'number' ? blockHeight : undefined,
    // Keep the raw JSON for debugging until the chain's response is
    // stable. The detail view can show it on a long-press.
    rawJson: JSON.stringify(raw),
  };
}
