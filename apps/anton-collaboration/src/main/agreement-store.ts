/**
 * agreement-store.ts — durable store for signed agreements + the persistent
 * replay-nonce guard, the Node/StorageBackend analogue of the Comm IndexedDB
 * stores (STORE_AGREEMENTS / STORE_AGREEMENT_NONCES).
 *
 * Rows live as one JSON array under `agreement.v1.rows`; nonces as one array
 * under `agreement.v1.nonces`. A single promise-mutex serialises every mutation
 * so a concurrent put + consumeNonce can't lose a write in the load→modify→
 * persist window (same discipline as agent-pay's ledger).
 */
import type { StorageBackend } from './storage.js';
import { type Agreement, type AgreementStatus, isActionable } from './agreement-core.js';

const ROWS_KEY = 'agreement.v1.rows';
const NONCES_KEY = 'agreement.v1.nonces';
/** Hard cap so a long-lived agent doesn't grow the file without bound. Drops
 *  the OLDEST rows (by createdAt) first. */
const MAX_ROWS = 2000;
const MAX_NONCES = 10000;

export interface AgreementStatusPatch {
  status: AgreementStatus;
  acceptorPubkey?: string;
  acceptorSig?: string;
  respondedAt?: number;
  linkedTxHash?: string;
  seq?: number;
  counterDecision?: string;
  counterTerms?: string;
  counterAmountMicroFtc?: string;
  parentProposalHash?: string;
  proposalHash?: string;
}

export class AgreementStore {
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: StorageBackend) {}

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(fn, fn);
    this.writeChain = run.then(() => undefined, () => undefined);
    return run;
  }

  // ── Rows ──────────────────────────────────────────────────────────────────

  private async loadRows(): Promise<Agreement[]> {
    let raw: string | null = null;
    try { raw = await this.storage.get(ROWS_KEY); } catch { return []; }
    if (!raw) return [];
    try {
      const arr: unknown = JSON.parse(raw);
      return Array.isArray(arr) ? (arr as Agreement[]) : [];
    } catch { return []; }
  }

  private async persistRows(rows: Agreement[]): Promise<void> {
    const capped = rows.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ROWS);
    await this.storage.set(ROWS_KEY, JSON.stringify(capped));
  }

  put(a: Agreement): Promise<void> {
    return this.enqueue(async () => {
      const rows = await this.loadRows();
      const i = rows.findIndex((r) => r.id === a.id);
      if (i >= 0) rows[i] = a; else rows.push(a);
      await this.persistRows(rows);
    });
  }

  async get(id: string): Promise<Agreement | null> {
    return (await this.loadRows()).find((r) => r.id === id) ?? null;
  }

  async getByProposalHash(proposalHash: string): Promise<Agreement | null> {
    return (await this.loadRows()).find((r) => r.proposalHash === proposalHash) ?? null;
  }

  /** Newest-first. */
  async list(): Promise<Agreement[]> {
    return (await this.loadRows()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Agreements awaiting MY response (the inbox tray analogue). */
  async listActionable(): Promise<Agreement[]> {
    return (await this.list()).filter((a) => isActionable(a));
  }

  /** Patch a row's status + response fields. Caller does the terminal-guard /
   *  signature checks BEFORE calling. Returns the updated row, or null if gone. */
  updateStatus(id: string, patch: AgreementStatusPatch): Promise<Agreement | null> {
    return this.enqueue(async () => {
      const rows = await this.loadRows();
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) return null;
      const next: Agreement = { ...rows[i]!, ...patch, status: patch.status };
      rows[i] = next;
      await this.persistRows(rows);
      return next;
    });
  }

  // ── Replay nonces ─────────────────────────────────────────────────────────

  private async loadNonces(): Promise<string[]> {
    let raw: string | null = null;
    try { raw = await this.storage.get(NONCES_KEY); } catch { return []; }
    if (!raw) return [];
    try {
      const arr: unknown = JSON.parse(raw);
      return Array.isArray(arr) ? (arr as string[]).filter((x) => typeof x === 'string') : [];
    } catch { return []; }
  }

  /** Atomically claim a response nonce. True if newly claimed, false if already
   *  used (a replay — reject the response). Survives restart, unlike an
   *  in-memory cache. */
  consumeNonce(nonce: string): Promise<boolean> {
    return this.enqueue(async () => {
      const nonces = await this.loadNonces();
      if (nonces.includes(nonce)) return false;
      nonces.push(nonce);
      // Keep the newest MAX_NONCES; an evicted-old nonce reappearing is
      // implausible (nonces are random + single-use within an agreement's life).
      const capped = nonces.slice(-MAX_NONCES);
      await this.storage.set(NONCES_KEY, JSON.stringify(capped));
      return true;
    });
  }
}
