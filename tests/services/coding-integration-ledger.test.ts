/**
 * coding-integration-ledger.test.ts — Wave 4b: the coding runner's ledger
 * tells the truth.
 *
 * extractKnowledge inserts its own workflow_outputs row and extracts atoms
 * directly, bypassing output-store's pipeline — so its rows sat at
 * learning_status 'pending' for ever and the hourly sweep re-extracted
 * them. It also gated on an Anthropic client no caller ever passed, so no
 * coding output was learned at all, and its table check was never awaited.
 * Against a fake adapter that answers the module's own statements by
 * identity (CODING_LEDGER_SQL) and a mocked extractor (no database, no
 * engine):
 *
 *   - a successful extraction marks the row 'learned' (+ learned_at,
 *     attempts + 1) with the row's own id;
 *   - a failed extraction marks it 'failed' with the reason capped at 500
 *     chars, and extractKnowledge still resolves (non-fatal);
 *   - a missing workflow_outputs table inserts nothing (the await fix);
 *   - no client is needed for extraction to run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';

const extractAtomsMock = vi.fn();
vi.mock('../../server/services/atom-extractor.js', () => ({
  createAtomExtractor: async () => ({ extractAtoms: (id: string) => extractAtomsMock(id) }),
}));

import { createCodingIntegration, CODING_LEDGER_SQL } from '../../server/services/coding-integration.js';

const CONTENT = 'Plan: split the ingest worker from the API process; add a retry queue with exponential backoff; the integration test for the webhook signature must run against the staging secret, not a fixture.';

interface Fake { db: DatabaseAdapter; runs: Array<{ sql: string; args: unknown[] }> }

function makeDb(opts: { tableExists?: boolean } = {}): Fake {
  const runs: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    get: async (sql: string, ...args: unknown[]) => {
      if (sql.includes('pg_catalog.pg_tables')) {
        return (opts.tableExists ?? true) && args[0] === 'workflow_outputs' ? { tablename: 'workflow_outputs' } : undefined;
      }
      return undefined;
    },
    all: async () => [],
    run: async (sql: string, ...args: unknown[]) => {
      runs.push({ sql, args });
      return { changes: 1, lastInsertRowid: 0 };
    },
    exec: async () => undefined,
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) => fn(db as unknown as DatabaseAdapter),
    close: async () => undefined,
  };
  return { db: db as unknown as DatabaseAdapter, runs };
}

function insertedOutputId(runs: Fake['runs']): string {
  const insert = runs.find(r => r.sql.includes('INSERT INTO workflow_outputs'));
  expect(insert).toBeTruthy();
  expect(typeof insert!.args[0]).toBe('string');
  return insert!.args[0] as string;
}

beforeEach(() => {
  extractAtomsMock.mockReset();
  extractAtomsMock.mockResolvedValue({ atomsCreated: 2 });
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('extractKnowledge writes the ledger', () => {
  it("marks the row 'learned' after a successful direct extraction, without a client", async () => {
    const { db, runs } = makeDb();
    const svc = await createCodingIntegration(db);
    await svc.extractKnowledge(CONTENT, 'proj-1', 'plan', 'coding-plan');

    const outputId = insertedOutputId(runs);
    expect(extractAtomsMock).toHaveBeenCalledWith(outputId);

    const ledger = runs.filter(r => r.sql.startsWith('UPDATE workflow_outputs'));
    expect(ledger).toEqual([{ sql: CODING_LEDGER_SQL.markLearned, args: [outputId] }]);
    expect(CODING_LEDGER_SQL.markLearned).toContain("learning_status = 'learned'");
    expect(CODING_LEDGER_SQL.markLearned).toContain('learned_at = NOW()');
    expect(CODING_LEDGER_SQL.markLearned).toContain('learning_attempts = learning_attempts + 1');
  });

  it("marks the row 'failed' with the reason (≤ 500 chars) when extraction throws, and does not throw", async () => {
    const reason = 'SDK engine busy — '.repeat(60); // > 500 chars
    extractAtomsMock.mockRejectedValueOnce(new Error(reason));
    const { db, runs } = makeDb();
    const svc = await createCodingIntegration(db);
    await expect(svc.extractKnowledge(CONTENT, 'proj-1', 'build', 'coding-build')).resolves.toBeUndefined();

    const outputId = insertedOutputId(runs);
    const ledger = runs.filter(r => r.sql.startsWith('UPDATE workflow_outputs'));
    expect(ledger).toHaveLength(1);
    expect(ledger[0].sql).toBe(CODING_LEDGER_SQL.markFailed);
    expect(ledger[0].args[1]).toBe(outputId);
    expect(ledger[0].args[0]).toBe(reason.slice(0, 500));
    expect((ledger[0].args[0] as string).length).toBe(500);
    expect(CODING_LEDGER_SQL.markFailed).toContain("learning_status = 'failed'");
    expect(CODING_LEDGER_SQL.markFailed).toContain('learning_attempts = learning_attempts + 1');
  });

  it('inserts nothing when workflow_outputs does not exist (the check is awaited now)', async () => {
    const { db, runs } = makeDb({ tableExists: false });
    const svc = await createCodingIntegration(db);
    await svc.extractKnowledge(CONTENT, 'proj-1', 'plan', 'coding-plan');
    expect(runs).toHaveLength(0);
    expect(extractAtomsMock).not.toHaveBeenCalled();
  });
});
