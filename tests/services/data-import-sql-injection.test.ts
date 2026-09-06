/**
 * data-import-sql-injection.test.ts
 *
 * The import/export path builds SQL by concatenation in three places, because table and
 * column names cannot be bound as parameters. All three took their identifiers from
 * untrusted input:
 *
 *   1. dataset-store.save()  — CREATE TABLE / INSERT built from a CSV header row.
 *      No attacker needed: data-transformer.inferSchema takes Object.entries(firstRow)
 *      keys verbatim, so a spreadsheet header of  x"); DROP TABLE users; --  became SQL.
 *   2. data-importer.importFromDatabase() — ran a request-body query string on ANTON's
 *      OWN DatabaseAdapter (routes/data.ts injected it), ignoring the connectionId the
 *      step's UI collects.
 *   3. data-importer.exportToDatabase() — INSERT INTO <body.tableName> (<csv headers>).
 *
 * All three statements carry no bind values for the identifier portion, and a pg query
 * with no values goes over the SIMPLE protocol — which executes stacked statements. So
 * these were live, not theoretical.
 *
 * The tests below drive the real code with a recording DatabaseAdapter and assert on the
 * SQL text that reaches the driver, because that is the only place the failure is
 * visible: a joined-text assertion on the returned Dataset would pass either way.
 */
import { describe, it, expect, vi } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import { createDatasetStore } from '../../server/services/dataset-store.js';
import { createDataset } from '../../server/services/data-transformer.js';
import { importData, exportData } from '../../server/services/data-importer.js';
import {
  isSqlIdentifier,
  assertSqlIdentifier,
  quoteSqlIdentifier,
  toSqlIdentifier,
  uniqueSqlIdentifiers,
} from '../../server/lib/sql-identifier.js';

/** The exact header an operator gets from a hostile spreadsheet. */
const EVIL_HEADER = 'x"); DROP TABLE users; --';

/**
 * The db-drivers registry resolves drivers with `import(\`./${name}-driver.js\`)`, which
 * Vite refuses to bundle ("Unknown variable dynamic import") — a harness limitation, not
 * a product one; the same call works under tsx/node, which is how every other connection
 * path runs. Stubbing it also makes the assertion sharper: we can see the exact config
 * and SQL handed to the external driver.
 */
const driverStub = vi.hoisted(() => ({ calls: [] as Array<{ host: unknown; sql: string }> }));

vi.mock('../../server/services/db-drivers/driver-registry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/db-drivers/driver-registry.js')>();
  return {
    ...actual,
    getDriver: async (name: string) => ({
      name,
      displayName: name,
      defaultPort: 0,
      test: async () => ({ ok: true, message: 'stub' }),
      query: async (cfg: Record<string, unknown>, sql: string) => {
        driverStub.calls.push({ host: cfg.host, sql });
        return { rows: [{ id: 1, amount: 100 }], rowCount: 1 };
      },
    }),
  };
});

// ── A DatabaseAdapter that records every statement it is asked to run ────────

interface Executed { sql: string; params: unknown[] }

function recordingDb(rows: Record<string, unknown>[] = []): DatabaseAdapter & { executed: Executed[] } {
  const executed: Executed[] = [];
  const db: DatabaseAdapter & { executed: Executed[] } = {
    executed,
    dialect: 'postgresql',
    async get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      executed.push({ sql, params });
      return rows[0] as T | undefined;
    },
    async all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
      executed.push({ sql, params });
      return rows as T[];
    },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      executed.push({ sql, params });
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec(sql: string): Promise<void> {
      executed.push({ sql, params: [] });
    },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> {
      return fn(db);
    },
    async close(): Promise<void> { /* no pool */ },
  };
  return db;
}

/** Statements that build DDL/DML text — the ones an injected identifier would land in. */
function ddlAndDml(db: { executed: Executed[] }): string[] {
  return db.executed.map((e) => e.sql);
}

// ── 1. The identifier helper itself ─────────────────────────────────────────

describe('sql-identifier', () => {
  it('rejects the hostile spreadsheet header outright', () => {
    expect(isSqlIdentifier(EVIL_HEADER)).toBe(false);
    expect(() => assertSqlIdentifier(EVIL_HEADER, 'column name')).toThrow(/Unsafe SQL column name/);
    expect(() => quoteSqlIdentifier(EVIL_HEADER)).toThrow(/Unsafe SQL/);
  });

  it('rejects every separator that would open a second statement', () => {
    for (const bad of ['a;b', 'a"b', "a'b", 'a b', 'a)b', 'a--b', 'a\nb', '']) {
      expect(isSqlIdentifier(bad)).toBe(false);
    }
  });

  it('refuses a name past PostgreSQL NAMEDATALEN rather than letting it be truncated', () => {
    // A silently truncated identifier is a collision waiting to happen: two 70-char
    // columns can become the same 63-char column.
    expect(isSqlIdentifier('a'.repeat(63))).toBe(true);
    expect(isSqlIdentifier('a'.repeat(64))).toBe(false);
  });

  it('normalises a hostile header into something inert instead of failing the import', () => {
    const safe = toSqlIdentifier(EVIL_HEADER, 'column_1');
    expect(isSqlIdentifier(safe)).toBe(true);
    expect(safe).not.toMatch(/[";)-]/);
  });

  it('normalises the ordinary messy headers a spreadsheet actually has', () => {
    expect(toSqlIdentifier('First Name', 'c1')).toBe('First_Name');
    expect(toSqlIdentifier('2024 total', 'c1')).toBe('c_2024_total');
    expect(toSqlIdentifier('   ', 'column_3')).toBe('column_3');
    expect(toSqlIdentifier('Belopp (SEK)', 'c1')).toBe('Belopp__SEK_');
  });

  it('keeps a normalised header row collision-free', () => {
    // 'first name' and 'first-name' both normalise to first_name; a duplicate column
    // would make CREATE TABLE fail, which would fail the whole import.
    expect(uniqueSqlIdentifiers(['first name', 'first-name', 'first name'])).toEqual([
      'first_name', 'first_name_2', 'first_name_3',
    ]);
  });
});

// ── 2. dataset-store.save — the CSV-header → CREATE TABLE path ──────────────

describe('dataset-store.save with a hostile CSV header', () => {
  it('never emits the header text into DDL or DML', async () => {
    const db = recordingDb();
    const store = await createDatasetStore(db);

    // Exactly what importCSV + inferSchema produce from a spreadsheet whose first
    // header cell is the payload.
    const dataset = createDataset([{ [EVIL_HEADER]: 'v1', amount: 10 }], 'file:evil.csv');
    expect(dataset.columns[0].name).toBe(EVIL_HEADER); // the payload really is in the schema

    await store.save(dataset, { name: 'evil', sourceType: 'import', userId: 'u1' });

    const create = ddlAndDml(db).find((s) => s.includes('CREATE TABLE'));
    expect(create).toBeDefined();
    expect(create).not.toContain(EVIL_HEADER);
    expect(create).not.toContain('DROP TABLE'); // the token sequence can no longer form

    // Nothing dangerous outside a quoted identifier, in any statement the save issues.
    // Stripping the quoted identifiers is the point: whatever is left of the payload
    // (`DROP_TABLE_users`) survives only as part of one column NAME, where it is inert.
    for (const sql of ddlAndDml(db)) {
      if (sql.includes('INSERT INTO datasets')) continue; // the metadata insert is fully parameterised
      const outsideIdentifiers = sql.replace(/"(?:[^"]|"")*"/g, '""');
      expect(outsideIdentifiers).not.toContain(';');
      expect(outsideIdentifiers).not.toContain('--');
      expect(outsideIdentifiers.toUpperCase()).not.toContain('DROP');
    }
  });

  it('still stores the row, under a generated column name', async () => {
    const db = recordingDb();
    const store = await createDatasetStore(db);
    const dataset = createDataset([{ [EVIL_HEADER]: 'v1' }], 'file:evil.csv');

    await store.save(dataset, { name: 'evil', sourceType: 'import', userId: 'u1' });

    const insert = ddlAndDml(db).find((s) => s.startsWith('INSERT INTO dataset_'));
    expect(insert).toBeDefined();
    // The value is still bound, so the data survives the rename.
    const row = db.executed.find((e) => e.sql === insert);
    expect(row!.params).toEqual([JSON.stringify('v1')]);
  });

  it('round-trips the ORIGINAL column name back out of load()', async () => {
    // The physical column is renamed; the user must still see their own header. This is
    // what the persisted storageName mapping buys.
    const db = recordingDb();
    const store = await createDatasetStore(db);
    const dataset = createDataset([{ 'First Name': 'Ada' }], 'file:people.csv');
    await store.save(dataset, { name: 'people', sourceType: 'import', userId: 'u1' });

    expect(ddlAndDml(db).find((s) => s.includes('CREATE TABLE'))).toContain('"First_Name" TEXT');

    // Replay the metadata row the save wrote, then load it back.
    const metaInsert = db.executed.find((e) => e.sql.includes('INSERT INTO datasets'))!;
    const schemaJson = metaInsert.params[3] as string;
    const storagePath = metaInsert.params[13] as string;

    const loadDb = recordingDb([{ First_Name: JSON.stringify('Ada') }]);
    const original = loadDb.get.bind(loadDb);
    loadDb.get = async <T,>(sql: string, ...params: unknown[]): Promise<T | undefined> => {
      if (sql.includes('FROM datasets')) {
        return {
          id: 'd1', name: 'people', schema: schemaJson, row_count: 1, size_bytes: 1,
          created_by: 'u1', source_type: 'import', created_at: 'now', access_count: 0,
          storage_type: 'sqlite', storage_path: storagePath,
        } as unknown as T;
      }
      return original<T>(sql, ...params);
    };

    const loaded = await (await createDatasetStore(loadDb)).load('d1');
    expect(loaded!.rows[0]).toEqual({ 'First Name': 'Ada' });
  });
});

// ── 3. exportToDatabase — INSERT INTO <body.tableName> (<csv headers>) ──────

describe('exportToDatabase identifier handling', () => {
  it('refuses a request-body table name that is not an identifier, running no SQL', async () => {
    const db = recordingDb();
    const dataset = createDataset([{ a: 1 }], 'test');

    await expect(exportData(dataset, {
      destination: 'database',
      db,
      tableName: 'users; DROP TABLE sessions; --',
    })).rejects.toThrow(/Unsafe SQL table name/);

    expect(db.executed).toHaveLength(0);
  });

  it('refuses a hostile column name, running no SQL', async () => {
    const db = recordingDb();
    const dataset = createDataset([{ [EVIL_HEADER]: 1 }], 'file:evil.csv');

    await expect(exportData(dataset, {
      destination: 'database', db, tableName: 'reports',
    })).rejects.toThrow(/Unsafe SQL column name/);

    expect(db.executed).toHaveLength(0);
  });

  it('still exports a well-formed dataset unchanged (names are validated, not quoted)', async () => {
    // Quoting here would change an unquoted-and-therefore-folded target table into a
    // different object and break a working export, so the fix must be validate-only.
    const db = recordingDb();
    const dataset = createDataset([{ id: 1, amount: 5 }], 'test');

    const msg = await exportData(dataset, {
      destination: 'database', db, tableName: 'reports', insertMode: 'upsert',
    });

    expect(msg).toBe('Inserted 1 rows into reports');
    expect(db.executed[0].sql).toBe(
      'INSERT INTO reports (id, amount) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount'
    );
    expect(db.executed[0].params).toEqual([1, 5]);
  });
});

// ── 4. importFromDatabase — must never run the caller's SQL on ANTON's DB ───

describe('database import source', () => {
  it("refuses to run a body-supplied query against ANTON's own database", async () => {
    const db = recordingDb();

    await expect(importData({
      source: 'database',
      query: "SELECT 1; DROP TABLE sessions; --",
      db, // what routes/data.ts injects
    })).rejects.toThrow(/connectionId is required/);

    // The proof: the injected handle never saw the query.
    expect(db.executed).toHaveLength(0);
  });

  it('resolves the query against the configured connection, not the internal handle', async () => {
    const db = recordingDb([]); // no such connection row
    await expect(importData({
      source: 'database', connectionId: 'conn-1', query: 'SELECT 1', db,
    })).rejects.toThrow(/Connection not found/);

    // The only statement issued is the parameterised connection lookup.
    expect(db.executed).toHaveLength(1);
    expect(db.executed[0].sql).toContain('FROM connections WHERE id = ?');
    expect(db.executed[0].params).toEqual(['conn-1']);
  });

  it('applies the connection read-only guard to the imported query', async () => {
    const db = recordingDb([connectionRow({ driver: 'sqlite', host: ':memory:' }, [])]);

    await expect(importData({
      source: 'database', connectionId: 'conn-1', db,
      query: 'DELETE FROM invoices',
    })).rejects.toThrow(/Only SELECT queries are permitted/);
  });

  it('sends the query to the connection\'s own driver, with the connection\'s config', async () => {
    driverStub.calls.length = 0;
    const db = recordingDb([connectionRow({ driver: 'postgresql', host: 'warehouse.internal' }, [])]);

    const dataset = await importData({
      source: 'database', connectionId: 'conn-1', db,
      query: 'SELECT id, amount FROM invoices ORDER BY id',
    });

    // Where the query went: the external connection's driver, not ANTON's adapter.
    expect(driverStub.calls).toEqual([
      { host: 'warehouse.internal', sql: 'SELECT id, amount FROM invoices ORDER BY id' },
    ]);
    expect(db.executed.map((e) => e.sql)).toEqual([
      expect.stringContaining('FROM connections WHERE id = ?'),
    ]);

    // And the rows still become a dataset, so the step keeps working.
    expect(dataset.rows).toEqual([{ id: 1, amount: 100 }]);
    expect(dataset.metadata.source).toBe('db:External warehouse');
  });
});

/** The shape connection-manager.get() reads out of the `connections` table. */
function connectionRow(config: Record<string, unknown>, permissions: string[]): Record<string, unknown> {
  return {
    id: 'conn-1',
    display_name: 'External warehouse',
    type: 'database',
    config: JSON.stringify(config),
    permissions: JSON.stringify(permissions),
    created_by: 'u1',
    approved_by: null,
    approved_at: null,
    status: 'active',
    last_tested: null,
    last_test_result: null,
    created_at: 'now',
    updated_at: 'now',
  };
}

/**
 * The table name must be VALIDATED but not QUOTED — a distinction that looks
 * cosmetic and is not.
 *
 * `save()` generates `dataset_${nanoid(12)}`, and nanoid's default alphabet is
 * mixed-case, so almost every generated name contains capitals. An unquoted
 * CREATE lets PostgreSQL fold the identifier to lowercase, and the equally
 * unquoted SELECT in `load()` folds the same way and matches. Quote it and the
 * SELECT asks for the mixed-case name verbatim: correct for tables created
 * afterwards, and `42P01 relation "dataset_AbC" does not exist` for every
 * dataset saved before the change.
 *
 * That regression was introduced by the injection fix itself and was caught in
 * review against a real PostgreSQL — never by CI, because the dev database has
 * no dataset rows for the suite to trip over. These tests are cheap; the failure
 * mode is a silent 500 on someone else's existing data.
 *
 * Column names ARE quoted, and must stay so: they come from a CSV header and are
 * genuinely attacker-influenced. There is no folding asymmetry for them because
 * they are written and read in the same statement shapes.
 */
describe('table-name identifier: validated, not quoted', () => {
  it('emits the generated table name unquoted, so PostgreSQL folds it consistently', async () => {
    const db = recordingDb();
    const store = await createDatasetStore(db);
    await store.save(createDataset([{ Name: 'a' }], 'file:people.csv'), { name: 'people', sourceType: 'import', userId: 'u1' });

    const create = ddlAndDml(db).find((s) => s.startsWith('CREATE TABLE'));
    expect(create).toBeDefined();
    expect(create).toMatch(/^CREATE TABLE dataset_[A-Za-z0-9_]+ \(/);
    expect(create!.slice(0, 40)).not.toContain('"dataset_');
  });

  it('still quotes the column names, which is where the untrusted text is', async () => {
    const db = recordingDb();
    const store = await createDatasetStore(db);
    await store.save(createDataset([{ Name: 'a' }], 'file:people.csv'), { name: 'people', sourceType: 'import', userId: 'u1' });

    const create = ddlAndDml(db).find((s) => s.startsWith('CREATE TABLE'));
    expect(create).toContain('"Name" TEXT');
  });

  it('refuses a storage_path that is not an identifier instead of quoting round it', () => {
    // The guard is still a guard: validation replaces quoting, it does not
    // remove the check. A hostile storage_path throws rather than executing.
    expect(() => assertSqlIdentifier('dataset_x"; DROP TABLE users; --', 'dataset table name'))
      .toThrow();
    expect(() => assertSqlIdentifier('dataset_AbC123', 'dataset table name')).not.toThrow();
  });
});
