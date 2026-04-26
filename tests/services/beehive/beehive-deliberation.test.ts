/**
 * beehive-deliberation.test.ts — guard-rail tests on round-management
 * authorisation + state-transition rejections.
 *
 * The full deliberation engine makes LLM calls (autoGenerate);
 * we focus on the deterministic guard rails that fire BEFORE any LLM
 * is invoked.
 */

import { describe, it, expect } from 'vitest';
import { createBeehiveDeliberation } from '../../../server/services/beehive/beehive-deliberation.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';
import type { Hive, HiveStatus } from '../../../server/services/beehive/types.js';

interface SqlCall { sql: string; args: unknown[]; }

function mkHive(over: Partial<Hive> & Pick<Hive, 'id' | 'created_by' | 'status'>): Hive {
  return {
    id: over.id,
    name: over.name ?? 'H',
    question: over.question ?? 'Q',
    description: over.description ?? null,
    type: over.type ?? 'deliberation',
    status: over.status,
    governance: over.governance ?? { consensus_mode: 'majority', max_rounds: 5, convergence_threshold: 0.7, allow_late_join: false },
    created_by: over.created_by,
    max_participants: over.max_participants ?? 12,
    ttl_hours: over.ttl_hours ?? null,
    current_round: over.current_round ?? 0,
    consensus_temperature: over.consensus_temperature ?? 0,
    created_at: over.created_at ?? '',
    concluded_at: over.concluded_at ?? null,
    updated_at: over.updated_at ?? '',
  };
}

function makeMockDb(opts: { hive?: Hive | null; participants?: unknown[]; rounds?: unknown[] }): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  return {
    get: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      // hive lookup query — beehive-state uses SELECT FROM beehive_sessions
      if (sql.includes('beehive_sessions') && sql.includes('WHERE id')) {
        if (!opts.hive) return undefined;
        return {
          id: opts.hive.id, name: opts.hive.name, question: opts.hive.question,
          description: opts.hive.description, type: opts.hive.type, status: opts.hive.status,
          governance: JSON.stringify(opts.hive.governance),
          created_by: opts.hive.created_by, max_participants: opts.hive.max_participants,
          ttl_hours: opts.hive.ttl_hours, current_round: opts.hive.current_round,
          consensus_temperature: opts.hive.consensus_temperature,
          created_at: opts.hive.created_at, concluded_at: opts.hive.concluded_at, updated_at: opts.hive.updated_at,
        };
      }
      // identity lookup for signing
      if (sql.includes('community_identity')) {
        return { contact_hash: 'ANTON-AAAA-AAAA-AAAA-AAAA', private_key_encrypted: null };
      }
      return undefined;
    },
    all: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (sql.includes('beehive_rounds')) return opts.rounds ?? [];
      if (sql.includes('beehive_participants')) return opts.participants ?? [];
      return [];
    },
    run: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); },
    exec: async () => {},
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

describe('startNextRound — authorisation', () => {
  it('throws when hive not found', async () => {
    const svc = await createBeehiveDeliberation(makeMockDb({ hive: null }));
    await expect(svc.startNextRound('nope', 'h_alice')).rejects.toThrow(/not found/i);
  });

  it('throws when caller is not the Queen', async () => {
    const hive = mkHive({ id: 'h1', created_by: 'h_alice', status: 'forming' });
    const svc = await createBeehiveDeliberation(makeMockDb({ hive }));
    await expect(svc.startNextRound('h1', 'h_bob')).rejects.toThrow(/only the queen/i);
  });
});

describe('startNextRound — state-transition rejections', () => {
  for (const blockedStatus of ['concluded', 'archived'] as HiveStatus[]) {
    it(`rejects when hive is ${blockedStatus}`, async () => {
      const hive = mkHive({ id: 'h1', created_by: 'h_alice', status: blockedStatus });
      const svc = await createBeehiveDeliberation(makeMockDb({ hive }));
      await expect(svc.startNextRound('h1', 'h_alice')).rejects.toThrow(new RegExp(`cannot start.*${blockedStatus}`, 'i'));
    });
  }

  it('rejects when hive is converging (must conclude instead)', async () => {
    const hive = mkHive({ id: 'h1', created_by: 'h_alice', status: 'converging' });
    const svc = await createBeehiveDeliberation(makeMockDb({ hive }));
    await expect(svc.startNextRound('h1', 'h_alice')).rejects.toThrow(/conclude instead/i);
  });
});
