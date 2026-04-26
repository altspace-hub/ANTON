/**
 * fc-wallet-service.test.ts — wallet CRUD + filter tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createFCWalletService } from '../../../server/services/fc-wallet-service.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

function makeMockDb(): DatabaseAdapter & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];
  return {
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return []; },
    get: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return undefined; },
    run: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); },
    exec: async () => { /* no-op */ },
    calls,
  } as unknown as DatabaseAdapter & { calls: SqlCall[] };
}

let mockDb: ReturnType<typeof makeMockDb>;

beforeEach(() => { mockDb = makeMockDb(); });

describe('getWallets', () => {
  it('lists active wallets ordered by wallet_type, created_at', async () => {
    const svc = await createFCWalletService(mockDb);
    await svc.getWallets();
    expect(mockDb.calls[0].sql).toContain("WHERE is_active = TRUE");
    expect(mockDb.calls[0].sql).toContain('ORDER BY wallet_type, created_at');
  });
});

describe('getHumanWallet / getAgentWallet', () => {
  it('getHumanWallet filters wallet_type = human', async () => {
    const svc = await createFCWalletService(mockDb);
    await svc.getHumanWallet();
    expect(mockDb.calls[0].sql).toContain("wallet_type = 'human'");
  });

  it('getAgentWallet filters wallet_type = agent', async () => {
    const svc = await createFCWalletService(mockDb);
    await svc.getAgentWallet();
    expect(mockDb.calls[0].sql).toContain("wallet_type = 'agent'");
  });
});

describe('createWallet', () => {
  it('creates a human wallet with demo balance 100', async () => {
    const svc = await createFCWalletService(mockDb);
    const r = await svc.createWallet({ name: 'My Wallet', walletType: 'human' });
    expect(r.walletType).toBe('human');
    expect(r.id).toMatch(/^fcw_\d+_/);
    expect(r.address).toMatch(/^fc_STUB_/);
    // Last bind position is balance_ftc — 100 for human
    const args = mockDb.calls[0].args;
    expect(args[args.length - 1]).toBe(100.0);
  });

  it('creates an agent wallet with demo balance 10', async () => {
    const svc = await createFCWalletService(mockDb);
    const r = await svc.createWallet({ name: 'Agent Wallet', walletType: 'agent', agentId: 'agt_1' });
    expect(r.walletType).toBe('agent');
    const args = mockDb.calls[0].args;
    expect(args[args.length - 1]).toBe(10.0);
    // agent_id should be passed
    expect(args[6]).toBe('agt_1');
  });

  it('normalises wallet_file_name to snake-case lowercase', async () => {
    const svc = await createFCWalletService(mockDb);
    await svc.createWallet({ name: 'My  Big   Wallet', walletType: 'human' });
    // Position 2 is wallet_file_name
    expect(mockDb.calls[0].args[2]).toBe('my_big_wallet');
  });

  it('passes ownerAddress when provided, else null', async () => {
    const svc = await createFCWalletService(mockDb);
    await svc.createWallet({ name: 'A', walletType: 'agent', ownerAddress: 'fc_owner123' });
    expect(mockDb.calls[0].args[5]).toBe('fc_owner123');

    mockDb.calls.length = 0;
    await svc.createWallet({ name: 'B', walletType: 'agent' });
    expect(mockDb.calls[0].args[5]).toBeNull();
  });
});

describe('refreshBalances', () => {
  it('updates balance_updated_at on all active wallets', async () => {
    const svc = await createFCWalletService(mockDb);
    await svc.refreshBalances();
    expect(mockDb.calls[0].sql).toContain('UPDATE fc_wallets SET balance_updated_at = NOW()');
    expect(mockDb.calls[0].sql).toContain('WHERE is_active = TRUE');
    // After UPDATE, getWallets is called
    expect(mockDb.calls[1].sql).toContain('SELECT * FROM fc_wallets');
  });
});
