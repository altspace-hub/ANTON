/**
 * dataset-store.ts
 * Service for persisting and loading datasets to/from SQLite.
 * Supports session-scoped and global datasets with TTL expiration.
 */

import { randomUUID } from 'crypto';
import { nanoid } from 'nanoid';
import type { DatabaseAdapter } from '../db/database.js';
import type { Column, Dataset } from './data-transformer.js';
import { assertSqlIdentifier, quoteSqlIdentifier, uniqueSqlIdentifiers } from '../lib/sql-identifier.js';

/**
 * A persisted column: the dataset's own (logical) name plus the physical column it
 * occupies in the storage table.
 *
 * The two differ because a dataset column name comes from a CSV header row and is
 * arbitrary text — `inferSchema` takes `Object.entries(firstRow)` keys verbatim — while
 * the physical name is concatenated into CREATE TABLE / INSERT and so must be a strict
 * identifier. Persisting the mapping is what lets `load()` return the user's original
 * headers after the table was created under a normalised name.
 *
 * `storageName` is optional so rows written before this mapping existed still load: for
 * them the logical name IS the physical name (see load()).
 */
interface StoredColumn extends Column {
  storageName?: string;
}

export interface StoredDataset {
  id: string;
  name: string;
  description?: string;
  schema: string;
  row_count: number;
  size_bytes: number;
  created_by: string;
  session_id?: string;
  workflow_id?: string;
  source_type: string;
  created_at: string;
  expires_at?: string;
  last_accessed_at?: string;
  access_count: number;
  storage_type: string;
  storage_path: string;
}

export interface SaveDatasetOptions {
  name: string;
  description?: string;
  sessionId?: string;
  workflowId?: string;
  sourceType: 'import' | 'transform' | 'merge';
  ttlDays?: number; // null = no expiration
  userId: string;
}

export async function createDatasetStore(db: DatabaseAdapter) {
  return {
    /**
     * Save a dataset to persistent storage.
     * Creates a new SQLite table and saves metadata.
     */
    async save(dataset: Dataset, options: SaveDatasetOptions): Promise<StoredDataset> {
      const id = randomUUID();
      const tableName = `dataset_${nanoid(12)}`.replace(/-/g, '_');
      const now = new Date().toISOString();

      // Calculate expiration date if TTL specified
      let expiresAt: string | null = null;
      if (options.ttlDays) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + options.ttlDays);
        expiresAt = expiry.toISOString();
      }

      // Map every dataset column onto a safe physical column name BEFORE any of it
      // reaches SQL. The names arrive from a spreadsheet header row, so a header of
      //   x"); DROP TABLE users; --
      // used to be concatenated straight into the CREATE TABLE below — and, because
      // these statements carry no bind values, pg dispatches them over the simple
      // protocol, which happily runs the stacked DROP. Normalising here (rather than
      // rejecting) keeps a messy spreadsheet importable.
      const storageNames = uniqueSqlIdentifiers(dataset.columns.map(col => col.name));
      const storedColumns: StoredColumn[] = dataset.columns.map((col, i) => ({
        ...col,
        storageName: storageNames[i],
      }));
      // VALIDATED, NOT QUOTED — and the difference is load-bearing.
      //
      // tableName is generated here as `dataset_${nanoid}` and nanoid's default
      // alphabet is mixed-case, so ~99.8% of these names contain capitals. An
      // unquoted CREATE lets PostgreSQL fold the identifier to lowercase, and the
      // equally-unquoted SELECT in load() folds the same way and matches. Quoting
      // it would ask for the mixed-case name verbatim — correct for tables created
      // AFTER the change, and a 42P01 "relation does not exist" for every dataset
      // saved before it. That regression was caught in review against a real
      // PostgreSQL, not in CI, because the dev database has no dataset rows.
      //
      // assertSqlIdentifier still refuses anything outside [A-Za-z_][A-Za-z0-9_]{0,62},
      // so no quote, semicolon, paren or comment introducer can reach the SQL and
      // the injection this file was hardened against stays closed. COLUMN names,
      // which come from a CSV header and are genuinely attacker-influenced, are
      // still quoted below — they are created and read in the same statement shapes,
      // so no folding asymmetry exists there.
      const quotedTable = assertSqlIdentifier(tableName, 'dataset table name');

      // Create table for dataset rows
      const columnDefs = storageNames.map(name => `${quoteSqlIdentifier(name, 'column name')} TEXT`).join(', ');
      await db.run(`CREATE TABLE ${quotedTable} (${columnDefs})`);

      // Insert rows
      if (dataset.rows.length > 0) {
        const columnNames = storageNames.map(name => quoteSqlIdentifier(name, 'column name')).join(', ');
        const placeholders = dataset.columns.map(() => '?').join(', ');
        await db.transaction(async (txDb) => {
          for (const row of dataset.rows) {
            const values = dataset.columns.map(col => {
              const val = row[col.name];
              return val === null || val === undefined ? null : JSON.stringify(val);
            });
            await txDb.run(`INSERT INTO ${quotedTable} (${columnNames}) VALUES (${placeholders})`, ...values);
          }
        });
      }

      // Calculate size
      const sizeBytes = JSON.stringify(dataset.rows).length;

      // Save metadata (store columns as "schema" for backward compatibility)
      await db.run(`
        INSERT INTO datasets
          (id, name, description, schema, row_count, size_bytes, created_by, session_id, workflow_id,
           source_type, created_at, expires_at, storage_type, storage_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id,
        options.name,
        options.description || null,
        JSON.stringify(storedColumns),
        dataset.rows.length,
        sizeBytes,
        options.userId,
        options.sessionId || null,
        options.workflowId || null,
        options.sourceType,
        now,
        expiresAt,
        'sqlite',
        tableName);

      return (await this.get(id))!;
    },

    /**
     * Get dataset metadata by ID.
     */
    async get(id: string): Promise<StoredDataset | null> {
      const row = await db.get('SELECT * FROM datasets WHERE id = ?', id);
      return row ? (row as unknown as StoredDataset) : null;
    },

    /**
     * Get dataset by name.
     */
    async getByName(name: string): Promise<StoredDataset | null> {
      const row = await db.get('SELECT * FROM datasets WHERE name = ?', name);
      return row ? (row as unknown as StoredDataset) : null;
    },

    /**
     * Load a dataset back into memory as a Dataset object.
     * Updates access tracking.
     */
    async load(id: string): Promise<Dataset | null> {
      const meta = await this.get(id);
      if (!meta) return null;

      // Check expiration
      if (meta.expires_at && new Date(meta.expires_at) < new Date()) {
        console.warn(`[dataset-store] Dataset ${id} has expired`);
        return null;
      }

      // Load rows from storage table. storage_path is generated by save() and is
      // always `dataset_<nanoid>`, but it round-trips through the database, so it is
      // re-validated here rather than trusted — quoteSqlIdentifier fails closed.
      const rows = await db.all(
        `SELECT * FROM ${assertSqlIdentifier(meta.storage_path, 'dataset table name')}`,
      ) as Array<Record<string, string | null>>;

      // Deserialize JSON-encoded values. Read each value by its PHYSICAL column name
      // and hand it back under the dataset's own name; rows written before the mapping
      // existed have no storageName, and for those the two are the same.
      const columns = JSON.parse(meta.schema) as StoredColumn[];
      const deserializedRows = rows.map((row: Record<string, string | null>) => {
        const obj: Record<string, unknown> = {};
        for (const col of columns) {
          const val = row[col.storageName ?? col.name];
          obj[col.name] = val ? JSON.parse(val) : null;
        }
        return obj;
      });

      // Update access tracking
      await db.run(`
        UPDATE datasets
        SET last_accessed_at = NOW(), access_count = access_count + 1
        WHERE id = ?
      `, id);

      return {
        id: meta.storage_path,
        columns,
        rows: deserializedRows,
        metadata: {
          rowCount: deserializedRows.length,
          source: meta.name,
          importedAt: meta.created_at,
        },
      };
    },

    /**
     * List datasets accessible to a user.
     * Includes global datasets (session_id IS NULL) and session-scoped for given sessionId.
     */
    async list(userId: string, sessionId?: string): Promise<StoredDataset[]> {
      let query = `
        SELECT * FROM datasets
        WHERE created_by = ?
          AND (expires_at IS NULL OR expires_at > NOW())
      `;

      const params: unknown[] = [userId];

      if (sessionId) {
        query += ' AND (session_id IS NULL OR session_id = ?)';
        params.push(sessionId);
      } else {
        query += ' AND session_id IS NULL';
      }

      query += ' ORDER BY created_at DESC';

      return await db.all(query, ...params) as unknown as StoredDataset[];
    },

    /**
     * Delete a dataset (metadata + storage table).
     */
    async delete(id: string): Promise<boolean> {
      const meta = await this.get(id);
      if (!meta) return false;

      // Drop storage table
      try {
        await db.run(`DROP TABLE IF EXISTS ${assertSqlIdentifier(meta.storage_path, 'dataset table name')}`);
      } catch (err) {
        console.error(`[dataset-store] Failed to drop table ${meta.storage_path}:`, err);
      }

      // Delete metadata
      await db.run('DELETE FROM datasets WHERE id = ?', id);

      return true;
    },

    /**
     * Cleanup expired datasets (run periodically).
     */
    async cleanupExpired(): Promise<number> {
      const expired = await db.all(`
        SELECT id, storage_path FROM datasets
        WHERE expires_at IS NOT NULL AND CAST(expires_at AS TIMESTAMP) < NOW()
      `) as Array<{ id: string; storage_path: string }>;

      let deleted = 0;

      for (const ds of expired) {
        try {
          await db.exec(`DROP TABLE IF EXISTS ${assertSqlIdentifier(ds.storage_path, 'dataset table name')}`);
          await db.run('DELETE FROM datasets WHERE id = ?', ds.id);
          deleted++;
        } catch (err) {
          console.error(`[dataset-store] Failed to delete expired dataset ${ds.id}:`, err);
        }
      }

      if (deleted > 0) {
        console.log(`[dataset-store] Cleaned up ${deleted} expired datasets`);
      }

      return deleted;
    },

    /**
     * Check if a dataset name already exists.
     */
    async nameExists(name: string): Promise<boolean> {
      const row = await db.get('SELECT 1 FROM datasets WHERE name = ?', name);
      return !!row;
    },

    /**
     * Update dataset description or TTL.
     */
    async update(id: string, updates: { description?: string; ttlDays?: number }): Promise<boolean> {
      const meta = await this.get(id);
      if (!meta) return false;

      const fields: string[] = [];
      const values: unknown[] = [];

      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
      }

      if (updates.ttlDays !== undefined) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + updates.ttlDays);
        fields.push('expires_at = ?');
        values.push(expiry.toISOString());
      }

      if (fields.length === 0) return false;

      values.push(id);
      await db.run(`UPDATE datasets SET ${fields.join(', ')} WHERE id = ?`, ...values);

      return true;
    },
  };
}

export type DatasetStore = ReturnType<typeof createDatasetStore>;

/**
 * Start background cleanup job for expired datasets.
 * Runs every hour.
 */
export async function startDatasetCleanup(db: DatabaseAdapter): Promise<NodeJS.Timeout> {
  const store = await createDatasetStore(db);

  const cleanup = async () => {
    try {
      await store.cleanupExpired();
    } catch (err) {
      console.error('[dataset-cleanup] Error during cleanup:', err);
    }
  };

  // Run once on startup
  cleanup();

  // Then every hour
  return setInterval(cleanup, 60 * 60 * 1000);
}
