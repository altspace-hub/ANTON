/**
 * fc-connection-service.test.ts — connection-config CRUD + column allow-list.
 *
 * Does NOT exercise healthCheck() — that one calls fetch() against an
 * external URL and is appropriate for integration tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createFCConnectionService } from '../../../server/services/fc-connection-service.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

function makeMockDb(initialConfig?: Record<string, unknown>): DatabaseAdapter & {
  calls: SqlCall[]; storage: { config: Record<string, unknown> | undefined };
} {
  const calls: SqlCall[] = [];
  const storage = { config: initialConfig };
  return {
    get: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (sql.includes('fc_connection_config')) return storage.config;
      return undefined;
    },
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return []; },
    run: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      // Insert default if missing
      if (sql.includes("INSERT INTO fc_connection_config") && !storage.config) {
        storage.config = { id: 'default', node_url: null, stub_mode: true };
      }
    },
    exec: async () => { /* no-op */ },
    calls,
    storage,
  } as unknown as DatabaseAdapter & { calls: SqlCall[]; storage: { config: Record<string, unknown> | undefined } };
}

describe('getConfig', () => {
  it('returns existing config row when present', async () => {
    const db = makeMockDb({ id: 'default', node_url: 'http://x', stub_mode: false });
    const svc = await createFCConnectionService(db);
    const cfg = await svc.getConfig();
    expect(cfg).toEqual({ id: 'default', node_url: 'http://x', stub_mode: false });
  });

  it('inserts default row when no config exists', async () => {
    const db = makeMockDb(undefined);
    const svc = await createFCConnectionService(db);
    await svc.getConfig();
    const insert = db.calls.find(c => c.sql.includes('INSERT INTO fc_connection_config'));
    expect(insert).toBeTruthy();
  });
});

describe('updateConfig — column allow-list', () => {
  it('updates only whitelisted columns', async () => {
    const db = makeMockDb({ id: 'default' });
    const svc = await createFCConnectionService(db);
    await svc.updateConfig({
      node_url: 'http://new', cli_binary_path: '/usr/bin/fc',
      stub_mode: false, malicious: 'haxx',
    });
    const update = db.calls.find(c => c.sql.startsWith('UPDATE fc_connection_config'));
    expect(update).toBeTruthy();
    expect(update!.sql).toContain('node_url = ?');
    expect(update!.sql).toContain('cli_binary_path = ?');
    expect(update!.sql).toContain('stub_mode = ?');
    expect(update!.sql).not.toContain('malicious');
  });

  it('skips UPDATE entirely when no whitelisted fields supplied', async () => {
    const db = makeMockDb({ id: 'default' });
    const svc = await createFCConnectionService(db);
    await svc.updateConfig({ rogue: 'x' });
    expect(db.calls.find(c => c.sql.startsWith('UPDATE fc_connection_config'))).toBeUndefined();
  });

  it('returns the config after update', async () => {
    const db = makeMockDb({ id: 'default', stub_mode: true });
    const svc = await createFCConnectionService(db);
    const cfg = await svc.updateConfig({ node_url: 'http://x' });
    expect(cfg).toBeTruthy();
  });
});

describe('isStubMode', () => {
  it('defaults to true when no config exists yet', async () => {
    const db = makeMockDb(undefined);
    const svc = await createFCConnectionService(db);
    // After getConfig() inserts default with stub_mode = true
    const r = await svc.isStubMode();
    expect(r).toBe(true);
  });

  it('returns the stored value when config has stub_mode = false', async () => {
    const db = makeMockDb({ id: 'default', stub_mode: false });
    const svc = await createFCConnectionService(db);
    const r = await svc.isStubMode();
    expect(r).toBe(false);
  });

  it('returns true when stub_mode column is missing (legacy)', async () => {
    const db = makeMockDb({ id: 'default' });
    const svc = await createFCConnectionService(db);
    const r = await svc.isStubMode();
    expect(r).toBe(true);
  });
});
