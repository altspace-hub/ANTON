/**
 * db.ts — expo-sqlite handle + schema migration.
 *
 * One database (`anton_business.db`) for all persisted records that
 * need queryability. Currently just receipts; transactions cache,
 * refund chain, and SIE export staging will live here too.
 *
 * Migrations are idempotent — `CREATE TABLE IF NOT EXISTS` patterns
 * suffice for v0. Real numbered migrations land if/when we need to
 * mutate columns.
 */
import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync('anton_business.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS receipts (
        kvitto_number      INTEGER PRIMARY KEY,
        order_id           TEXT    NOT NULL,
        merchant_id        TEXT    NOT NULL,
        mode               TEXT    NOT NULL CHECK (mode IN ('simple', 'extended')),
        purpose            TEXT    NOT NULL,
        amount_sek         REAL    NOT NULL,
        amount_micro_ftc   TEXT    NOT NULL,
        ftc_per_sek        REAL    NOT NULL,
        vat_sek            REAL    NOT NULL DEFAULT 0,
        discount_sek       REAL    NOT NULL DEFAULT 0,
        item_count         INTEGER NOT NULL DEFAULT 1,
        lines_json         TEXT,
        vat_breakdown_json TEXT    NOT NULL,
        qr_uri             TEXT    NOT NULL,
        ref                TEXT    NOT NULL,
        uetr               TEXT,
        status             TEXT    NOT NULL DEFAULT 'confirmed'
                           CHECK (status IN ('pending', 'confirmed', 'voided')),
        created_at         INTEGER NOT NULL,
        confirmed_at       INTEGER
      );
      CREATE INDEX IF NOT EXISTS receipts_created_idx
        ON receipts (created_at DESC);
      CREATE INDEX IF NOT EXISTS receipts_status_idx
        ON receipts (status);
    `);
    return db;
  })();
  return dbPromise;
}

/** For tests + dev reset only. */
export async function wipeDb(): Promise<void> {
  const db = await openDb();
  await db.execAsync('DELETE FROM receipts;');
}
