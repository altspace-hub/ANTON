/**
 * received.ts — Comm App inbound transaction polling.
 *
 * Calls `GET /iso_received/<addr>` for the active wallet, normalises
 * the chain's PACS.008 envelope, dedupes against the local
 * transactions ledger (transactions.ts), and writes new arrivals as
 * `kind: 'receive'` rows. The fresh rows are returned so the caller
 * (App-level poller) can fire a local notification per row.
 *
 * Why we write into the existing tax-engine ledger rather than a
 * separate store: Comm already feeds WalletHistoryScreen + the tax
 * engine from transactions.ts, and adding a parallel store would
 * fork that pipeline. The trade-off: WalletTx requires `fiatValueAtTx`
 * + `fiatCurrency` which are unknown at receipt time on the chain
 * side. We stamp them as `0 / 'FTC'` for now — the user (or a future
 * "set my fiat rate" prompt) can update them via WalletHistoryScreen
 * if they want accurate tax reporting on received funds.
 *
 * Parser parity with src/pay/services/received.ts so the chain shape
 * tuning stays in one mental model.
 */
import { pacs008 } from '@futurechain/sdk';
import { getActiveWalletMeta } from './wallets';
import { getRpc } from './fc-rpc';
import { listTxs, recordTx, deleteTx, type WalletTx } from './transactions';
import { PAYMENT_TYPES, paymentTypeMeta, type PaymentType } from './payment-type';

export interface FreshIncoming {
  /** The WalletTx row that was persisted. */
  tx: WalletTx;
  /** Best-effort sender display name (PACS.008 Dbtr.Nm) if present. */
  fromName?: string;
}

/** Poll the chain once. Returns fresh inbound rows (records that
 *  weren't in the local ledger yet) in arrival order. Never throws —
 *  the caller treats any error as "try again on the next tick." */
export async function pollIncomingOnce(): Promise<FreshIncoming[]> {
  const meta = await getActiveWalletMeta();
  if (!meta) return [];
  const fresh: FreshIncoming[] = [];
  const existing = await listTxs(2000).catch(() => [] as WalletTx[]);
  const knownHashes = new Set<string>(
    existing.map(t => t.txHash).filter((h): h is string => !!h),
  );

  // ── PRIMARY: full ISO receive history (rich PACS.008, keyed by UETR) ─
  // The whole envelope (remittance, debtor name, structured refs) + the
  // COMPLETE receive history (spent + unspent). When it works it is the
  // source of truth, so we skip the UTXO fallback below.
  let isoOk = false;
  try {
    const rpc = await getRpc();
    const raw = await rpc.getIsoReceived(meta.address);
    const items = extractItems(raw);
    isoOk = true; // the call succeeded → ISO is authoritative this poll
    for (const item of items) {
      const normalised = normaliseItem(item, meta.address);
      if (!normalised) continue;
      if (knownHashes.has(normalised.txHash)) continue;
      const tx = await recordTx({
        kind: 'receive',
        counterparty: normalised.fromAddress || (normalised.fromName ?? '—'),
        amountMicroFtc: normalised.amountMicroFtc.toString(),
        // Receiver-side fiat rate is unknown at chain ingest. The user
        // can edit it from the tx detail view if needed for tax.
        fiatValueAtTx: 0,
        fiatCurrency: 'FTC',
        // Keep the raw Ustrd summary as the ref only when there's no decoded
        // note — otherwise it just duplicates the note under "Reference".
        ref: normalised.note ? null : (normalised.remittance ?? null),
        txHash: normalised.txHash,
        jurisdictionAtTx: null,
        ts: normalised.receivedAt,
        walletAddress: meta.address, // the wallet that received it (the polled wallet)
        // #77 — file the inbound payment under the sender's classification so it
        // shows under the same Information/Contract filter on the recipient side.
        ...(normalised.paymentType
          ? { paymentType: normalised.paymentType, taxable: paymentTypeMeta(normalised.paymentType).taxable }
          : {}),
        ...(normalised.note ? { note: normalised.note } : {}),
      });
      knownHashes.add(normalised.txHash);
      fresh.push({ tx, fromName: normalised.fromName });
    }
  } catch { isoOk = false; /* hub down / endpoint disabled → fall back to UTXOs */ }

  if (isoOk) {
    // Purge stale provisional UTXO-fallback rows: the SAME payments keyed by
    // chain-tx-id (a different id than the UETR the ISO rows use), i.e.
    // duplicates that would double-count in the balance + tax ledger. Once
    // ISO is the source of truth they must go — and the fallback below won't
    // run to re-create them.
    try {
      for (const t of existing) {
        if (t.kind === 'receive' && t.provisional) await deleteTx(t.id);
      }
    } catch { /* best-effort cleanup */ }
    return fresh;
  }

  // ── FALLBACK: UTXO light path (ONLY when ISO is unavailable) ────────
  // Unspent outputs back the balance; a cheap /transaction lookup yields the
  // sender. Public reads — they work even if the hub's ISO endpoint is down,
  // so a just-received payment stays visible while ISO recovers. The shared
  // knownHashes set already contains our OWN sends (the unified ledger
  // records them), so their change outputs are naturally skipped here. Rows
  // are marked `provisional` so they're purged once ISO supersedes them.
  try {
    const rpc = await getRpc();
    const utxos = await rpc.getUtxos(meta.address);
    const byTx = new Map<string, number>();
    for (const u of utxos) byTx.set(u.tx_id, (byTx.get(u.tx_id) ?? 0) + u.amount);
    for (const [txId, amountSat] of byTx) {
      if (knownHashes.has(txId)) continue;
      let fromAddress = '';
      let receivedAt = Date.now();
      try {
        const t = await rpc.getTransaction(txId);
        const s = extractSender(t); if (s) fromAddress = s;
        const ts = extractTime(t); if (ts) receivedAt = ts;
      } catch { /* sender/time best-effort — amount + receipt are still solid */ }
      if (fromAddress && fromAddress === meta.address) continue; // defence-in-depth self-send
      // 1 FTC = 100_000_000 satoshi = 1_000_000 µFTC → µFTC = sat / 100.
      const tx = await recordTx({
        kind: 'receive',
        counterparty: fromAddress || '—',
        amountMicroFtc: BigInt(Math.round(amountSat / 100)).toString(),
        fiatValueAtTx: 0,
        fiatCurrency: 'FTC',
        ref: null,
        txHash: txId,
        jurisdictionAtTx: null,
        ts: receivedAt,
        walletAddress: meta.address,
        provisional: true,
      });
      knownHashes.add(txId);
      fresh.push({ tx });
    }
  } catch { /* light path unreachable (offline / hub error) — nothing to add */ }

  return fresh;
}

/** Best-effort sender extraction from a `/transaction` response. */
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

// ── Response parsing ────────────────────────────────────────────────

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
  fromAddress: string;
  fromName?: string;
  amountMicroFtc: bigint;
  remittance?: string;
  receivedAt: number;
  /** #77 — the sender's classification (Information / Contract / Gift),
   *  decoded from the ANTON-V1 remittance `meta.fcType`. Lets the recipient
   *  file the inbound payment under the same category as the sender. */
  paymentType?: PaymentType;
  /** #77 — the sender's free-text Information/Contract body, decoded from the
   *  remittance `message`. Cleaner than the raw Ustrd summary. */
  note?: string;
}

function isPaymentType(v: unknown): v is PaymentType {
  return typeof v === 'string' && (PAYMENT_TYPES as readonly string[]).includes(v);
}

function normaliseItem(raw: unknown, _myAddress: string): Normalised | null {
  const txHash = pick(raw, [
    ['tx_id'], ['txid'], ['id'],
    ['transaction', 'id'],
    ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'PmtId', 'TxId'],
    ['CdtTrfTxInf', '0', 'PmtId', 'TxId'],
    ['PmtId', 'TxId'],
  ]);
  if (typeof txHash !== 'string' || !txHash) return null;

  const fromAddress = pick(raw, [
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

  // #77 — decode the structured ANTON-V1 remittance (if the hub returned the
  // full RmtInf incl. Strd.AddtlRmtInf). meta.fcType carries the sender's
  // payment classification; message carries the Information/Contract text.
  // Degrades silently to the plain Ustrd `remittance` above when absent.
  const rmtInf = pick(raw, [
    ['document', 'FIToFICstmrCdtTrf', 'CdtTrfTxInf', '0', 'RmtInf'],
    ['CdtTrfTxInf', '0', 'RmtInf'],
    ['RmtInf'],
  ]);
  let paymentType: PaymentType | undefined;
  let note: string | undefined;
  if (rmtInf) {
    try {
      const decoded = pacs008.decodeRemittance(rmtInf);
      if (decoded) {
        const ft = decoded.meta?.fcType;
        if (isPaymentType(ft) && ft !== 'payment') paymentType = ft;
        const msg = decoded.message ?? decoded.decision ?? decoded.terms;
        if (typeof msg === 'string' && msg.trim()) note = msg.trim();
      }
    } catch { /* malformed envelope — keep the plain Ustrd remittance */ }
  }

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
    receivedAt = cre < 1e12 ? cre * 1000 : cre;
  }

  return {
    txHash,
    fromAddress: typeof fromAddress === 'string' ? fromAddress : '',
    fromName: typeof fromName === 'string' ? fromName : undefined,
    amountMicroFtc,
    remittance,
    receivedAt,
    paymentType,
    note,
  };
}
