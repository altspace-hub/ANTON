/**
 * coding-atom-owner-fail-closed.test.ts — mintCodingAtom never writes a coding
 * lesson it cannot attribute on a team server (team-isolation round 2).
 *
 * An unowned atom is shared with every user of a team server. When the coding
 * project's owner cannot be resolved (no row, or the lookup fails) the project
 * itself is admin-only there, so its lesson must not become everyone's: no
 * INSERT at all. Solo has no ownership rule and mints exactly as before.
 *
 * The attribution itself (owner = projects.user_id) is proven against the real
 * schema in tests/db/attribute-coding-atlas-atoms.db.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

vi.mock('../../server/services/hybrid-search.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/hybrid-search.js')>();
  return { ...actual, embedAndStore: vi.fn(async () => undefined) };
});

import {
  createCodingIntegration, CODING_ATOM_OWNER_SQL, CODING_ATOM_TYPES, CODING_ATOM_ORIGINS,
} from '../../server/services/coding-integration.js';

function fakeDb(owner: { owner_user_id: string | null } | undefined | Error) {
  const inserts: unknown[][] = [];
  const db = {
    dialect: 'postgresql',
    async get<T>(sql: string): Promise<T | undefined> {
      if (sql === CODING_ATOM_OWNER_SQL) {
        if (owner instanceof Error) throw owner;
        return owner as T | undefined;
      }
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (sql.includes('INSERT INTO knowledge_atoms')) inserts.push(params);
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  };
  return { db: db as unknown as DatabaseAdapter, inserts };
}

const mint = async (db: DatabaseAdapter) => (await createCodingIntegration(db)).mintCodingAtom({
  projectId: 'cp-1', type: CODING_ATOM_TYPES.TEST_FAILED, origin: CODING_ATOM_ORIGINS.TEST_FAILURE, text: 'the suite fails',
});

describe('mintCodingAtom owner attribution', () => {
  const saved = process.env.DEPLOYMENT_MODE;
  beforeEach(() => { delete process.env.DEPLOYMENT_MODE; });
  afterEach(() => { if (saved === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = saved; });

  it('writes the resolved owner as the last bound value', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const { db, inserts } = fakeDb({ owner_user_id: 'u-alice' });
    expect(await mint(db)).toBeTruthy();
    expect(inserts).toHaveLength(1);
    expect(inserts[0][inserts[0].length - 1]).toBe('u-alice');
  });

  it('team mode: no owner row → no atom', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const { db, inserts } = fakeDb(undefined);
    expect(await mint(db)).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  it('team mode: a failed owner lookup → no atom', async () => {
    process.env.DEPLOYMENT_MODE = 'team';
    const { db, inserts } = fakeDb(new Error('db down'));
    expect(await mint(db)).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  it('solo negative control: an unresolvable owner still mints, unowned, as before', async () => {
    const { db, inserts } = fakeDb(undefined);
    expect(await mint(db)).toBeTruthy();
    expect(inserts).toHaveLength(1);
    expect(inserts[0][inserts[0].length - 1]).toBeNull();
  });
});
