/**
 * fulfilment-store.ts — durable store for FulfilmentRecords, one per agreement,
 * the Node/StorageBackend analogue of the agreement store. Rows live as one JSON
 * array under `fulfilment.v1.rows`; a single promise-mutex serialises every
 * mutation (same discipline as agreement-store / the ledger).
 */
import type { StorageBackend } from './storage.js';
import type { FulfilmentRecord } from './fulfilment-core.js';

const ROWS_KEY = 'fulfilment.v1.rows';
// Fulfilment records ARE the trust evidence (shipment/delivery signatures), so
// the cap is high — silently evicting one would make a delivered order read
// 'awaiting' again. A single operator won't approach this; relevance-based
// retention is a follow-on if it ever matters.
const MAX_ROWS = 100_000;

export class FulfilmentStore {
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: StorageBackend) {}

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeChain.then(fn, fn);
    this.writeChain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async load(): Promise<FulfilmentRecord[]> {
    let raw: string | null = null;
    try { raw = await this.storage.get(ROWS_KEY); } catch { return []; }
    if (!raw) return [];
    try {
      const arr: unknown = JSON.parse(raw);
      return Array.isArray(arr) ? (arr as FulfilmentRecord[]) : [];
    } catch { return []; }
  }

  private async persist(rows: FulfilmentRecord[]): Promise<void> {
    await this.storage.set(ROWS_KEY, JSON.stringify(rows.slice(-MAX_ROWS)));
  }

  async get(agreementId: string): Promise<FulfilmentRecord | null> {
    return (await this.load()).find((r) => r.agreementId === agreementId) ?? null;
  }

  /** Upsert by agreementId. */
  put(record: FulfilmentRecord): Promise<void> {
    return this.enqueue(async () => {
      const rows = await this.load();
      const i = rows.findIndex((r) => r.agreementId === record.agreementId);
      if (i >= 0) rows[i] = record; else rows.push(record);
      await this.persist(rows);
    });
  }

  async list(): Promise<FulfilmentRecord[]> {
    return this.load();
  }
}
