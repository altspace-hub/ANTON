import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteAdapter } from '../../server/db/adapters/sqlite-adapter.js';

describe('SqliteAdapter', () => {
  let rawDb: Database.Database;
  let db: SqliteAdapter;

  beforeEach(() => {
    rawDb = new Database(':memory:');
    rawDb.exec(`
      CREATE TABLE test_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE test_kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    db = new SqliteAdapter(rawDb);
  });

  afterEach(async () => {
    await db.close();
  });

  it('reports dialect as sqlite', () => {
    expect(db.dialect).toBe('sqlite');
  });

  it('exposes raw database handle', () => {
    expect(db.raw).toBe(rawDb);
  });

  describe('run', () => {
    it('inserts a row and returns changes + lastInsertRowid', async () => {
      const result = await db.run(
        'INSERT INTO test_items (name, value) VALUES (?, ?)',
        'item1', 42.5,
      );
      expect(result.changes).toBe(1);
      expect(Number(result.lastInsertRowid)).toBe(1);
    });

    it('updates rows and returns changes count', async () => {
      await db.run('INSERT INTO test_items (name, value) VALUES (?, ?)', 'a', 1);
      await db.run('INSERT INTO test_items (name, value) VALUES (?, ?)', 'b', 2);
      const result = await db.run('UPDATE test_items SET value = value + 10');
      expect(result.changes).toBe(2);
    });
  });

  describe('get', () => {
    it('returns a single row', async () => {
      await db.run('INSERT INTO test_items (name, value) VALUES (?, ?)', 'item1', 10);
      const row = await db.get<{ name: string; value: number }>('SELECT * FROM test_items WHERE name = ?', 'item1');
      expect(row).toBeDefined();
      expect(row!.name).toBe('item1');
      expect(row!.value).toBe(10);
    });

    it('returns undefined for no match', async () => {
      const row = await db.get('SELECT * FROM test_items WHERE name = ?', 'nonexistent');
      expect(row).toBeUndefined();
    });
  });

  describe('all', () => {
    it('returns all matching rows', async () => {
      await db.run('INSERT INTO test_items (name, value) VALUES (?, ?)', 'a', 1);
      await db.run('INSERT INTO test_items (name, value) VALUES (?, ?)', 'b', 2);
      await db.run('INSERT INTO test_items (name, value) VALUES (?, ?)', 'c', 3);
      const rows = await db.all<{ name: string }>('SELECT name FROM test_items ORDER BY name');
      expect(rows).toHaveLength(3);
      expect(rows.map(r => r.name)).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array for no matches', async () => {
      const rows = await db.all('SELECT * FROM test_items WHERE value > ?', 9999);
      expect(rows).toEqual([]);
    });
  });

  describe('exec', () => {
    it('executes raw DDL', async () => {
      await db.exec('CREATE TABLE temp_test (id INTEGER PRIMARY KEY)');
      const row = await db.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='temp_test'");
      expect(row?.name).toBe('temp_test');
    });
  });

  describe('transaction', () => {
    it('commits on success', async () => {
      await db.transaction(async (tx) => {
        await tx.run('INSERT INTO test_items (name, value) VALUES (?, ?)', 'tx1', 100);
        await tx.run('INSERT INTO test_items (name, value) VALUES (?, ?)', 'tx2', 200);
      });
      const rows = await db.all('SELECT * FROM test_items');
      expect(rows).toHaveLength(2);
    });

    it('rolls back on error', async () => {
      try {
        await db.transaction(async (tx) => {
          await tx.run('INSERT INTO test_items (name, value) VALUES (?, ?)', 'tx1', 100);
          throw new Error('Intentional rollback');
        });
      } catch {
        // Expected
      }
      const rows = await db.all('SELECT * FROM test_items');
      expect(rows).toHaveLength(0);
    });

    it('returns the callback result', async () => {
      const result = await db.transaction(async (tx) => {
        await tx.run('INSERT INTO test_kv (key, value) VALUES (?, ?)', 'k', 'v');
        return 'done';
      });
      expect(result).toBe('done');
    });
  });

  describe('param flattening', () => {
    it('accepts params as spread args', async () => {
      await db.run('INSERT INTO test_items (name, value) VALUES (?, ?)', 'spread', 42);
      const row = await db.get<{ name: string }>('SELECT * FROM test_items WHERE name = ?', 'spread');
      expect(row?.name).toBe('spread');
    });

    it('accepts params as a single array', async () => {
      await db.run('INSERT INTO test_items (name, value) VALUES (?, ?)', ['array', 99]);
      const row = await db.get<{ name: string }>('SELECT * FROM test_items WHERE name = ?', ['array']);
      expect(row?.name).toBe('array');
    });
  });
});
