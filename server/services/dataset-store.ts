/**
 * dataset-store.ts
 * Service for persisting and loading datasets to/from SQLite.
 * Supports session-scoped and global datasets with TTL expiration.
 */

import { randomUUID } from 'crypto';
import { nanoid } from 'nanoid';
import type { Database } from 'better-sqlite3';
import type { Dataset } from './data-transformer.js';

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

export function createDatasetStore(db: Database) {
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

      // Create table for dataset rows
      const columnDefs = dataset.columns.map(col => `${col.name} TEXT`).join(', ');
      db.prepare(`CREATE TABLE ${tableName} (${columnDefs})`).run();

      // Insert rows
      if (dataset.rows.length > 0) {
        const columnNames = dataset.columns.map(col => col.name).join(', ');
        const placeholders = dataset.columns.map(() => '?').join(', ');
        const insertStmt = db.prepare(`INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders})`);

        const insertMany = db.transaction((rows: Array<Record<string, unknown>>) => {
          for (const row of rows) {
            const values = dataset.columns.map(col => {
              const val = row[col.name];
              return val === null || val === undefined ? null : JSON.stringify(val);
            });
            insertStmt.run(...values);
          }
        });

        insertMany(dataset.rows);
      }

      // Calculate size
      const sizeBytes = JSON.stringify(dataset.rows).length;

      // Save metadata (store columns as "schema" for backward compatibility)
      db.prepare(`
        INSERT INTO datasets
          (id, name, description, schema, row_count, size_bytes, created_by, session_id, workflow_id,
           source_type, created_at, expires_at, storage_type, storage_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        options.name,
        options.description || null,
        JSON.stringify(dataset.columns),
        dataset.rows.length,
        sizeBytes,
        options.userId,
        options.sessionId || null,
        options.workflowId || null,
        options.sourceType,
        now,
        expiresAt,
        'sqlite',
        tableName
      );

      return this.get(id)!;
    },

    /**
     * Get dataset metadata by ID.
     */
    get(id: string): StoredDataset | null {
      const row = db.prepare('SELECT * FROM datasets WHERE id = ?').get(id);
      return row ? (row as StoredDataset) : null;
    },

    /**
     * Get dataset by name.
     */
    getByName(name: string): StoredDataset | null {
      const row = db.prepare('SELECT * FROM datasets WHERE name = ?').get(name);
      return row ? (row as StoredDataset) : null;
    },

    /**
     * Load a dataset back into memory as a Dataset object.
     * Updates access tracking.
     */
    load(id: string): Dataset | null {
      const meta = this.get(id);
      if (!meta) return null;

      // Check expiration
      if (meta.expires_at && new Date(meta.expires_at) < new Date()) {
        console.warn(`[dataset-store] Dataset ${id} has expired`);
        return null;
      }

      // Load rows from storage table
      const rows = db.prepare(`SELECT * FROM ${meta.storage_path}`).all() as Array<Record<string, string | null>>;

      // Deserialize JSON-encoded values
      const columns = JSON.parse(meta.schema);
      const deserializedRows = rows.map((row: Record<string, string | null>) => {
        const obj: Record<string, unknown> = {};
        for (const col of columns) {
          const val = row[col.name];
          obj[col.name] = val ? JSON.parse(val) : null;
        }
        return obj;
      });

      // Update access tracking
      db.prepare(`
        UPDATE datasets
        SET last_accessed_at = datetime('now'), access_count = access_count + 1
        WHERE id = ?
      `).run(id);

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
    list(userId: string, sessionId?: string): StoredDataset[] {
      let query = `
        SELECT * FROM datasets
        WHERE created_by = ?
          AND (expires_at IS NULL OR expires_at > datetime('now'))
      `;

      const params: unknown[] = [userId];

      if (sessionId) {
        query += ' AND (session_id IS NULL OR session_id = ?)';
        params.push(sessionId);
      } else {
        query += ' AND session_id IS NULL';
      }

      query += ' ORDER BY created_at DESC';

      return db.prepare(query).all(...params) as StoredDataset[];
    },

    /**
     * Delete a dataset (metadata + storage table).
     */
    delete(id: string): boolean {
      const meta = this.get(id);
      if (!meta) return false;

      // Drop storage table
      try {
        db.prepare(`DROP TABLE IF EXISTS ${meta.storage_path}`).run();
      } catch (err) {
        console.error(`[dataset-store] Failed to drop table ${meta.storage_path}:`, err);
      }

      // Delete metadata
      db.prepare('DELETE FROM datasets WHERE id = ?').run(id);

      return true;
    },

    /**
     * Cleanup expired datasets (run periodically).
     */
    cleanupExpired(): number {
      const expired = db.prepare(`
        SELECT id, storage_path FROM datasets
        WHERE expires_at IS NOT NULL AND expires_at < datetime('now')
      `).all() as Array<{ id: string; storage_path: string }>;

      let deleted = 0;

      for (const ds of expired) {
        try {
          db.prepare(`DROP TABLE IF EXISTS ${ds.storage_path}`).run();
          db.prepare('DELETE FROM datasets WHERE id = ?').run(ds.id);
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
    nameExists(name: string): boolean {
      const row = db.prepare('SELECT 1 FROM datasets WHERE name = ?').get(name);
      return !!row;
    },

    /**
     * Update dataset description or TTL.
     */
    update(id: string, updates: { description?: string; ttlDays?: number }): boolean {
      const meta = this.get(id);
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
      db.prepare(`UPDATE datasets SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      return true;
    },
  };
}

export type DatasetStore = ReturnType<typeof createDatasetStore>;

/**
 * Start background cleanup job for expired datasets.
 * Runs every hour.
 */
export function startDatasetCleanup(db: Database): NodeJS.Timeout {
  const store = createDatasetStore(db);

  const cleanup = () => {
    try {
      store.cleanupExpired();
    } catch (err) {
      console.error('[dataset-cleanup] Error during cleanup:', err);
    }
  };

  // Run once on startup
  cleanup();

  // Then every hour
  return setInterval(cleanup, 60 * 60 * 1000);
}
