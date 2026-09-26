/**
 * demo-owner-data.db.test.ts — the boot check for the owner's data in a demo
 * database (services/demo-owner-data.ts) runs against the real schema: each of
 * its four queries succeeds, so none is reported as unchecked. What it finds
 * depends on the test database's contents, so only the shape is asserted;
 * demo-owner-data.test.ts covers what it finds and what it logs.
 *
 * Read-only: the org context, the identities and the shared atoms are
 * instance-wide rows other test files may read, so this file writes none.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { findDemoOwnerData } from '../../server/services/demo-owner-data.js';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

d('findDemoOwnerData on the real schema', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 1 });
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  it('runs every check (the tables and columns it reads exist)', async () => {
    const report = await findDemoOwnerData(db);
    expect(report.unchecked).toEqual([]);
    expect(Array.isArray(report.found)).toBe(true);
  });
});
