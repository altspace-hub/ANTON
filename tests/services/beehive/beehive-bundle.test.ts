/**
 * beehive-bundle.test.ts — guard-rail tests on the .anton bundler.
 *
 * The bundler builds a ZIP archive — full integration is covered by
 * end-to-end tests. Here we verify the gating: it refuses to bundle
 * a non-existent hive or a hive without an output.
 */

import { describe, it, expect } from 'vitest';
import { createBeehiveBundler } from '../../../server/services/beehive/beehive-bundle.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

function makeMockDb(opts: { hive?: unknown; output?: unknown }): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  return {
    get: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (sql.includes('beehive_sessions') && sql.includes('WHERE id')) return opts.hive;
      if (sql.includes('beehive_outputs')) return opts.output;
      if (sql.includes('community_identity')) {
        return { contact_hash: 'ANTON-AAAA-AAAA-AAAA-AAAA', private_key_encrypted: null };
      }
      return undefined;
    },
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return []; },
    run: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); },
    exec: async () => {},
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

describe('bundleHiveOutput — guard rails', () => {
  it('throws when hive not found', async () => {
    const svc = await createBeehiveBundler(makeMockDb({ hive: null }));
    await expect(svc.bundleHiveOutput('nope')).rejects.toThrow(/not found/i);
  });

  it('throws when hive has no output yet (must conclude first)', async () => {
    const hiveRow = {
      id: 'h1', name: 'X', question: 'Q', description: null, type: 'deliberation',
      status: 'active', governance: '{}', created_by: 'h_alice',
      max_participants: 12, ttl_hours: null, current_round: 0,
      consensus_temperature: 0, created_at: '', concluded_at: null, updated_at: '',
    };
    const svc = await createBeehiveBundler(makeMockDb({ hive: hiveRow, output: null }));
    await expect(svc.bundleHiveOutput('h1')).rejects.toThrow(/no output yet/i);
  });
});

describe('createBeehiveBundler — factory', () => {
  it('constructs without errors when DB is available', async () => {
    const svc = await createBeehiveBundler(makeMockDb({}));
    expect(typeof svc).toBe('object');
    expect(typeof svc.bundleHiveOutput).toBe('function');
  });
});
