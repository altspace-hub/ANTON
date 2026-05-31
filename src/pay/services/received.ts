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
import { listPayments } from './payment';
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
  const fresh: ReceivedRecord[] = [];

  // ── 1) LIGHT path — UTXOs (+ /transaction for the sender) ───────────
  // Unspent outputs to our address ARE the "money is here now" receipts
  // that back the balance. Each carries an amount in satoshi; a cheap
  // /transaction lookup yields the sending wallet. These are PUBLIC reads,
  // so they work even when the hub has ISO storage disabled — this is the
  // reliable inbound signal that makes a just-received payment visible.
  try {
    const rpc = await getRpc();
    // Load our OWN outgoing payments so we can exclude their change
    // outputs: a send pays the recipient AND returns change to our own
    // address, which would otherwise show up here as a phantom "received".
    const [utxos, ownPayments] = await Promise.all([
      rpc.getUtxos(meta.address),
      listPayments().catch(() => []),
    ]);
    const ownTxIds = new Set(ownPayments.map((p) => p.txId).filter(Boolean));
    // One tx can pay several outputs to us — aggregate the amount per tx.
    const byTx = new Map<string, { amountSat: number; block?: number }>();
    for (const u of utxos) {
      // Skip change from our own sends — the tx is one we submitted, not
      // an inbound payment. (Authoritative: we know every tx we signed.)
      if (ownTxIds.has(u.tx_id)) continue;
      const prev = byTx.get(u.tx_id) ?? { amountSat: 0, block: u.block_height };
      prev.amountSat += u.amount;
      if (u.block_height) prev.block = u.block_height;
      byTx.set(u.tx_id, prev);
    }
    for (const [txId, agg] of byTx) {
      if (await hasReceivedTxId(txId)) continue;
      let fromAddress = '';
      let receivedAt = Date.now();
      try {
        const tx = await rpc.getTransaction(txId);
        const s = extractSender(tx); if (s) fromAddress = s;
        const t = extractTime(tx); if (t) receivedAt = t;
      } catch { /* sender/time best-effort — amount + receipt are still solid */ }
      // Defence-in-depth: a resolvable self-send (sender == us) is never
      // an inbound payment either.
      if (fromAddress && fromAddress === meta.address) continue;
      // 1 FTC = 100_000_000 satoshi = 1_000_000 µFTC → µFTC = sat / 100.
      const rec: ReceivedRecord = {
        txId,
        toAddress: meta.address,
        fromAddress,
        amountMicroFtc: BigInt(Math.round(agg.amountSat / 100)),
        receivedAt,
        blockHeight: agg.block,
        rawJson: JSON.stringify({ source: 'utxo', txId, amountSat: agg.amountSat, blockHeight: agg.block }),
      };
      await putReceived(rec);
      fresh.push(rec);
    }
  } catch {
    // Light path unreachable (offline / hub error) — fall through to ISO.
  }

  // ── 2) FULL ISO path — credentialed /iso_received ──────────────────
  // The whole PACS.008 envelope: remittance, debtor name, structured
  // references, AND spent receipts that no longer appear as UTXOs (full
  // receive history). The SDK sends the per-install credentials on this
  // endpoint. Best-effort — the hub may have ISO storage disabled (405),
  // in which case the light path above already captured the live receipts.
  try {
    const rpc = await getRpc();
    const raw = await rpc.getIsoReceived(meta.address);
    const items = extractItems(raw);
    for (const item of items) {
      const rec = normaliseItem(item, meta.address);
      if (!rec) continue;
      // Dedupe by txId (UETR-derived chain hash; stable across re-fetches).
      // The light path may already hold this tx — keep its data and skip.
      if (await hasReceivedTxId(rec.txId)) continue;
      await putReceived(rec);
      fresh.push(rec);
    }
  } catch {
    // ISO endpoint down / disabled / unauthorised → no-op; light path
    // already covers the live (unspent) funds.
  }

  return fresh;
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

/** Best-effort sender extraction from a `/transaction` response — tries
 *  UTXO-style inputs and PACS.008 debtor account paths. Returns undefined
 *  when no recognisable sender field is present (the amount + receipt are
 *  still captured; the row just shows no "from" until ISO data fills it). */
function extractSender(tx: unknown): string | undefined {
  const v = pick(tx, [
    ['inputs', '0', 'address'],
    ['vin', '0', 'address'],
    ['from_address'], ['fromAddress'], ['sender'], ['originator_address'],
    ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'DbtrAcct', 'Id', 'Othr', 'Id'],
    ['CdtTrfTxInf', '0', 'DbtrAcct', 'Id', 'Othr', 'Id'],
  ]);
  return typeof v === 'string' && v ? v : undefined;
}

/** Best-effort timestamp (ms) from a `/transaction` response. */
function extractTime(tx: unknown): number | undefined {
  const v = pick(tx, [
    ['timestamp'], ['block_timestamp'], ['block_timestamp_unix'], ['received_at'],
    ['CreDtTm'],
    ['document', 'FIToFICstmrCdtTrf', 'GrpHdr', 'CreDtTm'],
  ]);
  if (typeof v === 'number' && v > 0) return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : undefined; }
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
