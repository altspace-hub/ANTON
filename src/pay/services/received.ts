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
import { putReceived, getAllReceived, hasReceivedTxId, deleteReceived } from './db';
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

  // ── PRIMARY: full ISO receive history (rich PACS.008, keyed by UETR) ─
  // The hub serves GET /iso_received with sender name, remittance + the
  // structured refs — the COMPLETE receive history (spent + unspent). When
  // it works it is the source of truth, so we skip the UTXO fallback.
  let isoOk = false;
  try {
    const rpc = await getRpc();
    const raw = await rpc.getIsoReceived(meta.address);
    const items = extractItems(raw);
    isoOk = true;   // the call succeeded → ISO is authoritative this poll
    for (const item of items) {
      const rec = normaliseItem(item, meta.address);
      if (!rec) continue;
      if (await hasReceivedTxId(rec.txId)) continue;
      await putReceived(rec);
      fresh.push(rec);
    }
  } catch {
    isoOk = false;   // hub down / endpoint disabled → fall back to UTXOs
  }

  if (isoOk) {
    // Purge stale UTXO-fallback rows: they are the SAME payments keyed by
    // chain-tx-id (a different id than the UETR the ISO rows use), i.e.
    // duplicates. Once ISO is the source of truth they must go — and the
    // fallback below won't run to re-create them.
    try {
      for (const r of await getAllReceived()) {
        if (isUtxoSourced(r)) await deleteReceived(r.txId);
      }
    } catch { /* best-effort cleanup */ }
    return fresh;
  }

  // ── FALLBACK: UTXO light path (ONLY when ISO is unavailable) ────────
  // Unspent outputs back the balance; a cheap /transaction lookup yields
  // the sender. Public reads — they work even if the hub's ISO endpoint is
  // down, so a just-received payment is still visible while ISO recovers.
  try {
    const rpc = await getRpc();
    // Exclude our OWN sends' change outputs (they'd look like inbound).
    const [utxos, ownPayments] = await Promise.all([
      rpc.getUtxos(meta.address),
      listPayments().catch(() => []),
    ]);
    const ownTxIds = new Set(ownPayments.map((p) => p.txId).filter(Boolean));
    const byTx = new Map<string, { amountSat: number; block?: number }>();
    for (const u of utxos) {
      if (ownTxIds.has(u.tx_id)) continue;   // our own change, not inbound
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
      if (fromAddress && fromAddress === meta.address) continue;   // self-send
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
    // Offline / hub error — nothing to add this tick.
  }

  return fresh;
}

/** A row created by the UTXO fallback (keyed by chain-tx-id), vs an ISO
 *  row (keyed by UETR). Used to purge dupes once ISO is the source. */
function isUtxoSourced(r: ReceivedRecord): boolean {
  return typeof r.rawJson === 'string' && r.rawJson.includes('"source":"utxo"');
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
