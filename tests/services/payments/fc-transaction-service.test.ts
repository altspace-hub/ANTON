/**
 * fc-transaction-service.test.ts — pure helper + transaction CRUD tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createFCTransactionService } from '../../../server/services/fc-transaction-service.js';
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

describe('buildRemittance', () => {
  it('formats P:purpose N:nature G:goal', async () => {
    const svc = await createFCTransactionService(mockDb);
    expect(svc.buildRemittance('SERV', 'payment', 'consulting'))
      .toBe('P:SERV N:payment G:consulting');
  });

  it('appends T:taskRef when provided', async () => {
    const svc = await createFCTransactionService(mockDb);
    expect(svc.buildRemittance('SERV', 'payment', 'work', 'task_42'))
      .toBe('P:SERV N:payment G:work T:task_42');
  });

  it('truncates to 140 chars max (ISO 20022 remittance limit)', async () => {
    const svc = await createFCTransactionService(mockDb);
    const long = 'x'.repeat(200);
    const out = svc.buildRemittance(long, long, long, long);
    expect(out.length).toBeLessThanOrEqual(140);
  });
});

describe('buildTransaction', () => {
  it('inserts a draft tx with raw amount × 1e8 (8 decimals)', async () => {
    const svc = await createFCTransactionService(mockDb);
    const r = await svc.buildTransaction({
      fromAddress: 'fc_a', toAddress: 'fc_b', amountFtc: 1.5, walletType: 'human',
    });
    expect(r.status).toBe('draft');
    expect(r.id).toMatch(/^fctx_\d+_/);
    const args = mockDb.calls[0].args;
    expect(args[3]).toBe(1.5);                  // amount_ftc
    expect(args[4]).toBe(150_000_000);          // amount_raw = 1.5 * 1e8
    expect(args[5]).toBe('human');              // wallet_type
  });

  it('uses sensible default purpose/nature/goal', async () => {
    const svc = await createFCTransactionService(mockDb);
    await svc.buildTransaction({
      fromAddress: 'fc_a', toAddress: 'fc_b', amountFtc: 5, walletType: 'agent',
    });
    // remittance_raw is the 8th bind position (after pacs008_fields json)
    const args = mockDb.calls[0].args;
    const remittance = args[7];
    expect(remittance).toContain('P:OTHR');
    expect(remittance).toContain('N:payment');
    expect(remittance).toContain('G:service');
  });

  it('passes taskRef into the remittance + the task_ref column', async () => {
    const svc = await createFCTransactionService(mockDb);
    await svc.buildTransaction({
      fromAddress: 'fc_a', toAddress: 'fc_b', amountFtc: 2, walletType: 'human',
      taskRef: 'task_99',
    });
    const args = mockDb.calls[0].args;
    expect(args[7]).toContain('T:task_99');
    expect(args[8]).toBe('task_99');
  });
});

describe('submitTransaction', () => {
  it('updates status → confirmed in stub mode', async () => {
    const svc = await createFCTransactionService(mockDb);
    const r = await svc.submitTransaction('fctx_1');
    expect(r.status).toBe('confirmed');
    expect(r.txId).toMatch(/^STUB_TX_/);
    const sql = mockDb.calls[0].sql;
    expect(sql).toContain("status = 'confirmed'");
    expect(sql).toContain("submission_method = 'stub'");
  });
});

describe('listTransactions', () => {
  it('no filter → no status WHERE, default LIMIT 50', async () => {
    const svc = await createFCTransactionService(mockDb);
    await svc.listTransactions();
    const call = mockDb.calls[0];
    expect(call.sql).toContain('WHERE 1=1');
    expect(call.sql).not.toContain('status = ?');
    expect(call.args).toEqual([50]);
  });

  it('status filter is applied', async () => {
    const svc = await createFCTransactionService(mockDb);
    await svc.listTransactions({ status: 'confirmed', limit: 25 });
    const call = mockDb.calls[0];
    expect(call.sql).toContain('AND status = ?');
    expect(call.args).toEqual(['confirmed', 25]);
  });
});

describe('getTransaction', () => {
  it('binds id', async () => {
    const svc = await createFCTransactionService(mockDb);
    await svc.getTransaction('fctx_x');
    expect(mockDb.calls[0].args).toEqual(['fctx_x']);
  });
});
