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
import { getActiveWalletMeta } from './wallets';
import { getRpc } from './fc-rpc';
import { listTxs, recordTx, type WalletTx } from './transactions';

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
  try {
    const rpc = await getRpc();
    const raw = await rpc.getIsoReceived(meta.address);
    const items = extractItems(raw);
    const existing = await listTxs(2000);
    const knownHashes = new Set<string>(
      existing.map(t => t.txHash).filter((h): h is string => !!h),
    );
    const fresh: FreshIncoming[] = [];
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
        ref: normalised.remittance ?? null,
        txHash: normalised.txHash,
        jurisdictionAtTx: null,
        ts: normalised.receivedAt,
      });
      knownHashes.add(normalised.txHash);
      fresh.push({ tx, fromName: normalised.fromName });
    }
    return fresh;
  } catch {
    return [];
  }
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
  };
}
