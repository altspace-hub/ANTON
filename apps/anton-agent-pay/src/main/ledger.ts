/**
 * ledger.ts — a durable transaction ledger for Agent Pay.
 *
 * Why: the proposal store (proposals.ts) is in-memory + TTL-reaped, so the
 * ONLY record of a payment the agent sent was lost on restart, and the
 * receive view (chain.fetchRecentTransactions → getIsoReceived) is pull-only
 * + returns [] on any RPC error. So "see my sent / incoming transactions"
 * was unreliable. This ledger is the durable source of truth:
 *
 *   - recordSent()    persists every broadcast payment immediately, so the
 *                     agent's outgoing history survives restart + node
 *                     outages (the proposal record is the approval lifecycle;
 *                     this is the permanent receipt).
 *   - mergeFetched()  folds best-effort fetched rows (received deliveries)
 *                     into the same store, deduped by txId, so received
 *                     history accumulates + survives the next outage too.
 *   - list()/getByTxId() the durable read the JSON-RPC/MCP listTransactions
 *                     verb returns — always available even when the node is
 *                     unreachable (it returns whatever's already persisted).
 *
 * Backed by the same pluggable StorageBackend the wallet uses (file-backed
 * in production, in-memory in tests), under its own `ledger.v1` key so it
 * never collides with the `wallet.*` namespace.
 */
import type { StorageBackend } from './wallet/storage.js';

export interface LedgerEntry {
  txId: string;
  direction: 'in' | 'out';
  /** FTC for sent rows; the raw chain amount the node reported (via
   *  getIsoReceived) for received rows. */
  amount: number;
  counterparty: string;
  ts: number;
  confirmed: boolean;
  /** Free-text reference attached to a sent payment (the PACS.008 Ustrd). */
  reference?: string;
  /** Network fee in FTC for a sent payment. */
  feeFtc?: number;
}

/** A row from chain.fetchRecentTransactions — a LedgerEntry without the
 *  sent-only fields. Kept structural so the ledger doesn't import chain.ts
 *  (which would pull @futurechain/sdk into the ledger's module graph). */
export type FetchedRow = Pick<LedgerEntry, 'txId' | 'direction' | 'amount' | 'counterparty' | 'ts' | 'confirmed'>;

const KEY_PREFIX = 'ledger.v1';
/** Hard cap — a long-lived agent shouldn't grow this file without bound.
 *  The cap drops the OLDEST rows (newest-first persistence). */
const MAX_ENTRIES = 1000;

export class TransactionLedger {
  /** Serialises mutating ops so a concurrent recordSent + mergeFetched
   *  can't lose a write in the load→modify→persist window. Reads
   *  (list/getByTxId) are not queued — a read mid-write returns either the
   *  before- or after-state, both valid. */
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: StorageBackend,
    /** Resolves the ACTIVE wallet address so history is keyed PER WALLET —
     *  a re-imported / different wallet never sees the previous wallet's
     *  history (the store may outlive a wallet delete+reimport). null (no
     *  wallet yet) → a shared "_nowallet" bucket. */
    private readonly walletAddress: () => Promise<string | null>,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(fn, fn);
    // Swallow on the chain so one failed write doesn't poison the next.
    this.writeChain = run.then(() => undefined, () => undefined);
    return run;
  }

  /** Per-wallet storage key — `ledger.v1.<address>`, or a shared bucket
   *  before any wallet exists. */
  private async resolveKey(): Promise<string> {
    let addr: string | null = null;
    try { addr = await this.walletAddress(); } catch { addr = null; }
    return addr ? `${KEY_PREFIX}.${addr}` : `${KEY_PREFIX}._nowallet`;
  }

  private async load(key: string): Promise<LedgerEntry[]> {
    let raw: string | null = null;
    try { raw = await this.storage.get(key); } catch { return []; }
    if (!raw) return [];
    try {
      const arr: unknown = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(isLedgerEntry) : [];
    } catch { return []; }
  }

  private async persist(key: string, entries: LedgerEntry[]): Promise<void> {
    const capped = entries.slice().sort((a, b) => b.ts - a.ts).slice(0, MAX_ENTRIES);
    await this.storage.set(key, JSON.stringify(capped));
  }

  /** Record a just-broadcast outgoing payment. Idempotent on txId — a
   *  re-record updates the existing row rather than duplicating it. */
  recordSent(e: {
    txId: string; amount: number; counterparty: string;
    reference?: string; feeFtc?: number; confirmed?: boolean;
  }): Promise<void> {
    return this.enqueue(async () => {
      const entry: LedgerEntry = {
        txId: e.txId, direction: 'out', amount: e.amount,
        counterparty: e.counterparty, ts: this.now(), confirmed: e.confirmed ?? false,
        ...(e.reference !== undefined ? { reference: e.reference } : {}),
        ...(e.feeFtc !== undefined ? { feeFtc: e.feeFtc } : {}),
      };
      const key = await this.resolveKey();
      const entries = await this.load(key);
      const i = entries.findIndex((x) => x.txId === entry.txId);
      if (i >= 0) entries[i] = { ...entries[i]!, ...entry };
      else entries.push(entry);
      await this.persist(key, entries);
    });
  }

  /** Fold best-effort fetched rows into the ledger. Dedup by txId: an
   *  existing row keeps its richer locally-recorded fields (reference / fee /
   *  the authoritative 'out' direction we recorded), only letting `confirmed`
   *  flip true once the chain confirms it. New rows are added with their own
   *  direction. A no-op (no persist) when nothing changed. */
  mergeFetched(rows: readonly FetchedRow[]): Promise<void> {
    if (rows.length === 0) return Promise.resolve();
    return this.enqueue(async () => {
      const key = await this.resolveKey();
      const entries = await this.load(key);
      let changed = false;
      for (const r of rows) {
        const i = entries.findIndex((x) => x.txId === r.txId);
        if (i >= 0) {
          if (r.confirmed && !entries[i]!.confirmed) {
            entries[i] = { ...entries[i]!, confirmed: true };
            changed = true;
          }
        } else {
          entries.push({
            txId: r.txId, direction: r.direction, amount: r.amount,
            counterparty: r.counterparty, ts: r.ts, confirmed: r.confirmed,
          });
          changed = true;
        }
      }
      if (changed) await this.persist(key, entries);
    });
  }

  /** Newest-first, capped at `limit`. Always available — returns whatever
   *  is persisted even when the chain is unreachable. */
  async list(limit: number): Promise<LedgerEntry[]> {
    const entries = await this.load(await this.resolveKey());
    return entries.sort((a, b) => b.ts - a.ts).slice(0, Math.max(0, limit));
  }

  async getByTxId(txId: string): Promise<LedgerEntry | null> {
    return (await this.load(await this.resolveKey())).find((x) => x.txId === txId) ?? null;
  }
}

function isLedgerEntry(x: unknown): x is LedgerEntry {
  if (typeof x !== 'object' || x === null) return false;
  const e = x as Record<string, unknown>;
  return typeof e.txId === 'string'
    && (e.direction === 'in' || e.direction === 'out')
    && typeof e.amount === 'number'
    && typeof e.counterparty === 'string'
    && typeof e.ts === 'number'
    && typeof e.confirmed === 'boolean';
}
