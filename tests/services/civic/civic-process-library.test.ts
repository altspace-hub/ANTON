/**
 * civic-process-library.test.ts — pack-loader SQL composition tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createCivicProcessLibrary, type CivicProcessPack } from '../../../server/services/civic-process-library.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

function makeMockDb(rows: unknown[] = []): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  return {
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return rows; },
    get: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return rows[0]; },
    run: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); },
    exec: async () => { /* no-op */ },
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

let mockDb: ReturnType<typeof makeMockDb>;

beforeEach(() => { mockDb = makeMockDb(); });

describe('listPacks', () => {
  it('always filters by is_active = TRUE', async () => {
    const lib = await createCivicProcessLibrary(mockDb);
    await lib.listPacks();
    expect(mockDb.calls[0].sql).toContain('is_active = TRUE');
  });

  it('appends jurisdiction filter', async () => {
    const lib = await createCivicProcessLibrary(mockDb);
    await lib.listPacks({ jurisdiction: 'SE' });
    expect(mockDb.calls[0].sql).toContain('jurisdiction = ?');
    expect(mockDb.calls[0].args).toEqual(['SE']);
  });

  it('appends domain filter', async () => {
    const lib = await createCivicProcessLibrary(mockDb);
    await lib.listPacks({ domain: 'tax' });
    expect(mockDb.calls[0].sql).toContain('domain = ?');
    expect(mockDb.calls[0].args).toEqual(['tax']);
  });

  it('combines both filters in declared order', async () => {
    const lib = await createCivicProcessLibrary(mockDb);
    await lib.listPacks({ jurisdiction: 'SE', domain: 'tax' });
    expect(mockDb.calls[0].args).toEqual(['SE', 'tax']);
  });
});

describe('getPack', () => {
  it('binds id', async () => {
    const lib = await createCivicProcessLibrary(mockDb);
    await lib.getPack('pack_se_tax');
    expect(mockDb.calls[0].sql).toContain('WHERE id = ?');
    expect(mockDb.calls[0].args).toEqual(['pack_se_tax']);
  });

  it('returns null when missing', async () => {
    const lib = await createCivicProcessLibrary(makeMockDb([]));
    const r = await lib.getPack('nope');
    expect(r).toBeNull();
  });
});

describe('activatePack', () => {
  it('counts active rules for the pack', async () => {
    const stub = makeMockDb([{ id: 'r1', rule_code: 'A' }, { id: 'r2', rule_code: 'B' }, { id: 'r3', rule_code: 'C' }]);
    const lib = await createCivicProcessLibrary(stub);
    const r = await lib.activatePack('pack_1', 'eng_1');
    expect(r.rulesApplied).toBe(3);
    expect(stub.calls[0].sql).toContain('FROM civic_eligibility_rules WHERE pack_id = ? AND is_active = TRUE');
    expect(stub.calls[0].args).toEqual(['pack_1']);
  });

  it('returns 0 when pack has no active rules', async () => {
    const lib = await createCivicProcessLibrary(makeMockDb([]));
    const r = await lib.activatePack('empty', 'eng_x');
    expect(r.rulesApplied).toBe(0);
  });
});

describe('importPack — upsert semantics', () => {
  it('uses INSERT … ON CONFLICT … DO UPDATE', async () => {
    const lib = await createCivicProcessLibrary(mockDb);
    await lib.importPack({
      id: 'pack_test', name: 'Test', description: null,
      jurisdiction: 'SE', authority: null, domain: null,
      version: '1.0', source_url: null,
    });
    const sql = mockDb.calls[0].sql;
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE SET');
    expect(sql).toContain('name = EXCLUDED.name');
    expect(sql).toContain('version = EXCLUDED.version');
  });

  it('defaults is_active to true when omitted', async () => {
    const lib = await createCivicProcessLibrary(mockDb);
    await lib.importPack({
      id: 'pack_test', name: 'Test', description: null,
      jurisdiction: 'SE', authority: null, domain: null,
      version: '1.0', source_url: null,
    });
    // is_active is the last bind position
    const args = mockDb.calls[0].args;
    expect(args[args.length - 1]).toBe(true);
  });

  it('respects explicit is_active=false', async () => {
    const lib = await createCivicProcessLibrary(mockDb);
    await lib.importPack({
      id: 'pack_test', name: 'Test', description: null,
      jurisdiction: 'SE', authority: null, domain: null,
      version: '1.0', source_url: null, is_active: false,
    });
    const args = mockDb.calls[0].args;
    expect(args[args.length - 1]).toBe(false);
  });
});
