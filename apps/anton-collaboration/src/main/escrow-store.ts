/**
 * escrow-store.ts — durable store for EscrowRecords, one per agreement, under
 * escrow.v1.rows. Single promise-mutex serialises mutations (same discipline as
 * fulfilment-store / agreement-store). The one-shot terminal lock (a record can
 * never be both released and refunded) is enforced by the engine's status-gated
 * transitions; this layer is plain durable persistence.
 */
import type { StorageBackend } from './storage.js';
import type { EscrowRecord } from './escrow-core.js';

const ROWS_KEY = 'escrow.v1.rows';
const MAX_ROWS = 100_000; // escrow records ARE the custody evidence — don't evict.

export class EscrowStore {
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: StorageBackend) {}

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(fn, fn);
    this.writeChain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async load(): Promise<EscrowRecord[]> {
    let raw: string | null = null;
    try { raw = await this.storage.get(ROWS_KEY); } catch { return []; }
    if (!raw) return [];
    try {
      const arr: unknown = JSON.parse(raw);
      return Array.isArray(arr) ? (arr as EscrowRecord[]) : [];
    } catch { return []; }
  }

  private async persist(rows: EscrowRecord[]): Promise<void> {
    await this.storage.set(ROWS_KEY, JSON.stringify(rows.slice(-MAX_ROWS)));
  }

  async get(agreementId: string): Promise<EscrowRecord | null> {
    return (await this.load()).find((r) => r.agreementId === agreementId) ?? null;
  }

  put(record: EscrowRecord): Promise<void> {
    return this.enqueue(async () => {
      const rows = await this.load();
      const i = rows.findIndex((r) => r.agreementId === record.agreementId);
      if (i >= 0) rows[i] = record; else rows.push(record);
      await this.persist(rows);
    });
  }

  /** ATOMIC load → mutate → persist inside the write-mutex (the TOCTOU guard for
   *  the build→pending transition). `mutate` runs serialised against every other
   *  store write; throwing aborts with no write; returning null leaves it
   *  unchanged. This is what makes the funded→release_pending / →refund_pending
   *  flip single-CAS so two concurrent builds can't both pass the policy check. */
  compareAndSwap(
    agreementId: string,
    mutate: (current: EscrowRecord | null) => Promise<EscrowRecord | null>,
  ): Promise<EscrowRecord | null> {
    return this.enqueue(async () => {
      const rows = await this.load();
      const i = rows.findIndex((r) => r.agreementId === agreementId);
      const current = i >= 0 ? rows[i]! : null;
      const next = await mutate(current);
      if (next === null) return current;
      if (i >= 0) rows[i] = next; else rows.push(next);
      await this.persist(rows);
      return next;
    });
  }

  async list(): Promise<EscrowRecord[]> {
    return this.load();
  }
}
