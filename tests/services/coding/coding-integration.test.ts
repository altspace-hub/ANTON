/**
 * coding-integration.test.ts — version + history SQL composition tests
 * for coding-integration.
 *
 * The integration service is mostly a thin wrapper around the `versions`
 * table with sub-service composition. We verify the version-numbering
 * semantics and SQL bind args.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createCodingIntegration } from '../../../server/services/coding-integration.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

interface MockState {
  maxVersion: number | null;
  versions: Map<string, { content: string }>;  // key = `${entity_type}:${entity_id}:${version_number}`
}

function makeMockDb(initial?: Partial<MockState>): DatabaseAdapter & {
  calls: SqlCall[]; storage: MockState;
} {
  const calls: SqlCall[] = [];
  const storage: MockState = {
    maxVersion: initial?.maxVersion ?? null,
    versions: initial?.versions ?? new Map(),
  };
  return {
    get: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (sql.includes('MAX(version_number)')) {
        return { max_ver: storage.maxVersion };
      }
      if (sql.includes('SELECT content FROM versions')) {
        const key = `${args[0]}:${args[1]}:${args[2]}`;
        const v = storage.versions.get(key);
        return v ? { content: v.content } : undefined;
      }
      if (sql.includes('pg_catalog.pg_tables')) return undefined;  // tableExists → false
      return undefined;
    },
    all: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      return [];
    },
    run: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      return { lastInsertRowid: 42, changes: 1 } as never;
    },
    exec: async () => { /* no-op */ },
    calls,
    storage,
  } as unknown as DatabaseAdapter & { calls: SqlCall[]; storage: MockState };
}

let mockDb: ReturnType<typeof makeMockDb>;

beforeEach(() => { mockDb = makeMockDb(); });

describe('saveVersion', () => {
  it('starts at version 1 when no prior versions exist', async () => {
    const svc = await createCodingIntegration(mockDb);
    const r = await svc.saveVersion('module', 'mod_1', 'content v1');
    expect(r.version_number).toBe(1);
    expect(r.label).toBeNull();
    expect(r.id).toBe(42);
  });

  it('increments past max_ver', async () => {
    mockDb.storage.maxVersion = 7;
    const svc = await createCodingIntegration(mockDb);
    const r = await svc.saveVersion('module', 'mod_1', 'content v8');
    expect(r.version_number).toBe(8);
  });

  it('issues SELECT MAX then INSERT', async () => {
    const svc = await createCodingIntegration(mockDb);
    await svc.saveVersion('module', 'mod_1', 'c');
    expect(mockDb.calls[0].sql).toContain('SELECT MAX(version_number)');
    expect(mockDb.calls[1].sql).toContain('INSERT INTO versions');
  });

  it('passes label through, defaulting to null when omitted', async () => {
    const svc = await createCodingIntegration(mockDb);
    await svc.saveVersion('module', 'mod_1', 'c');
    expect(mockDb.calls[1].args[3]).toBeNull();   // 4th bind = label

    mockDb.calls.length = 0;
    await svc.saveVersion('module', 'mod_1', 'c', 'pre-release');
    expect(mockDb.calls[1].args[3]).toBe('pre-release');
  });
});

describe('getVersionHistory', () => {
  it('selects with entity filter, orders DESC, applies limit', async () => {
    const svc = await createCodingIntegration(mockDb);
    await svc.getVersionHistory('module', 'mod_1');
    const call = mockDb.calls[0];
    expect(call.sql).toContain('WHERE entity_type = ? AND entity_id = ?');
    expect(call.sql).toContain('ORDER BY version_number DESC');
    expect(call.sql).toContain('LIMIT ?');
    // Default limit = 20
    expect(call.args).toEqual(['module', 'mod_1', 20]);
  });

  it('respects custom limit', async () => {
    const svc = await createCodingIntegration(mockDb);
    await svc.getVersionHistory('module', 'mod_1', 5);
    expect(mockDb.calls[0].args).toEqual(['module', 'mod_1', 5]);
  });

  it('returns LENGTH(content) instead of full content', async () => {
    const svc = await createCodingIntegration(mockDb);
    await svc.getVersionHistory('module', 'mod_1');
    expect(mockDb.calls[0].sql).toContain('LENGTH(content) as content_length');
  });
});

describe('diffVersions', () => {
  it('returns null when either version is missing', async () => {
    const svc = await createCodingIntegration(mockDb);
    const r = await svc.diffVersions('module', 'mod_1', 1, 2);
    expect(r).toBeNull();
  });

  it('selects content for both v1 and v2 by entity_type + entity_id', async () => {
    mockDb.storage.versions.set('module:mod_1:1', { content: 'old content' });
    mockDb.storage.versions.set('module:mod_1:2', { content: 'new content' });
    const svc = await createCodingIntegration(mockDb);
    const r = await svc.diffVersions('module', 'mod_1', 1, 2);
    expect(r).not.toBeNull();
    // Two SELECTs: one per version
    expect(mockDb.calls.filter(c => c.sql.includes('SELECT content FROM versions')).length).toBe(2);
    expect(r!.summary).toBeDefined();
    expect(Array.isArray(r!.chunks)).toBe(true);
  });
});
