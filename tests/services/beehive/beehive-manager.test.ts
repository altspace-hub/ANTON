/**
 * beehive-manager.test.ts — input-validation tests for the manager layer.
 *
 * Focuses on the createHive validation surface (required-field checks,
 * default governance application). Mutations require a real DB; we
 * confirm the validation gates fire before any DB call.
 */

import { describe, it, expect } from 'vitest';
import { createBeehiveManager } from '../../../server/services/beehive/beehive-manager.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';
import type { CreateHiveInput } from '../../../server/services/beehive/types.js';

interface SqlCall { sql: string; args: unknown[]; }

function makeMockDb(): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  return {
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return []; },
    get: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      // After addParticipant INSERT, beehive-state does a SELECT to load the row.
      // Return a stub so createHive() can complete its Queen-as-participant flow.
      if (
        typeof sql === 'string' &&
        sql.includes('SELECT') &&
        sql.includes('beehive_participants') &&
        sql.includes('hive_id') &&
        sql.includes('anton_contact_hash')
      ) {
        return {
          id: 1,
          hive_id: args[0],
          anton_contact_hash: args[1],
          display_name: 'Q',
          role: 'queen',
          disclosure_policy: '{"level":"reasoning_only","excluded_clients":[],"excluded_tags":[],"redact_names":false,"max_atoms_shared":50,"require_human_approval":false}',
          invitation_status: 'joined',
          status: 'active',
          contribution_count: 0,
          invited_at: '2026-04-26T00:00:00Z',
          joined_at: '2026-04-26T00:00:00Z',
          last_active_at: null,
        };
      }
      return undefined;
    },
    run: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); },
    exec: async () => {},
    transaction: async <T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> => {
      return await fn(makeMockDb() as unknown as DatabaseAdapter);
    },
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

const baseInput: CreateHiveInput = {
  name: 'Test Hive',
  question: 'How should we approach X?',
  type: 'deliberation',
};

describe('createHive — input validation', () => {
  it('rejects empty name', async () => {
    const svc = createBeehiveManager(makeMockDb());
    await expect(svc.createHive({ ...baseInput, name: '' }, 'h1', 'Q')).rejects.toThrow(/name is required/i);
  });

  it('rejects whitespace-only name', async () => {
    const svc = createBeehiveManager(makeMockDb());
    await expect(svc.createHive({ ...baseInput, name: '   ' }, 'h1', 'Q')).rejects.toThrow(/name is required/i);
  });

  it('rejects empty question', async () => {
    const svc = createBeehiveManager(makeMockDb());
    await expect(svc.createHive({ ...baseInput, question: '' }, 'h1', 'Q')).rejects.toThrow(/question is required/i);
  });

  it('rejects missing type', async () => {
    const svc = createBeehiveManager(makeMockDb());
    await expect(
      svc.createHive({ ...baseInput, type: undefined as unknown as CreateHiveInput['type'] }, 'h1', 'Q'),
    ).rejects.toThrow(/type is required/i);
  });

  it('rejects empty queenContactHash', async () => {
    const svc = createBeehiveManager(makeMockDb());
    await expect(svc.createHive(baseInput, '', 'Q')).rejects.toThrow(/contact hash is required/i);
  });
});

describe('createHive — defaults + side effects', () => {
  it('produces a hive with status forming + current_round 0', async () => {
    const svc = createBeehiveManager(makeMockDb());
    const r = await svc.createHive(baseInput, 'h_alice', 'Alice');
    expect(r.status).toBe('forming');
    expect(r.current_round).toBe(0);
    expect(r.consensus_temperature).toBe(0);
    expect(r.created_by).toBe('h_alice');
  });

  it('applies default max_participants = 12', async () => {
    const svc = createBeehiveManager(makeMockDb());
    const r = await svc.createHive(baseInput, 'h1', 'Q');
    expect(r.max_participants).toBe(12);
  });

  it('respects supplied max_participants', async () => {
    const svc = createBeehiveManager(makeMockDb());
    const r = await svc.createHive({ ...baseInput, max_participants: 5 }, 'h1', 'Q');
    expect(r.max_participants).toBe(5);
  });

  it('trims whitespace from name + question + description', async () => {
    const svc = createBeehiveManager(makeMockDb());
    const r = await svc.createHive(
      { ...baseInput, name: '  trimmed  ', question: '  q  ', description: '  d  ' },
      'h1', 'Q',
    );
    expect(r.name).toBe('trimmed');
    expect(r.question).toBe('q');
    expect(r.description).toBe('d');
  });

  it('description defaults to null when not supplied', async () => {
    const svc = createBeehiveManager(makeMockDb());
    const r = await svc.createHive(baseInput, 'h1', 'Q');
    expect(r.description).toBeNull();
  });

  it('id follows hive_<ts>_<uuid> pattern', async () => {
    const svc = createBeehiveManager(makeMockDb());
    const r = await svc.createHive(baseInput, 'h1', 'Q');
    expect(r.id).toMatch(/^hive_\d+_[a-f0-9]+$/);
  });
});
