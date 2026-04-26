/**
 * fc-budget-service.test.ts — Payments / FC budget-rule + spending-state
 * tests using a mock DatabaseAdapter.
 *
 * Focus: the checkSpending() logic — limits, daily/monthly resets,
 * approve/blocked/requires_approval verdicts.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createFCBudgetService } from '../../../server/services/fc-budget-service.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

interface SqlCall { sql: string; args: unknown[]; }

interface MockState {
  rules: Record<string, number> | null;
  state: Record<string, string | number> | null;
}

function makeMockDb(initial: MockState): DatabaseAdapter & { calls: SqlCall[]; state: MockState } {
  const calls: SqlCall[] = [];
  const data = { ...initial };
  return {
    get: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (sql.includes('fc_budget_rules')) return data.rules ?? undefined;
      if (sql.includes('fc_spending_state')) return data.state ?? undefined;
      return undefined;
    },
    all: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); return []; },
    run: async (sql: string, ...args: unknown[]) => { calls.push({ sql, args }); },
    exec: async () => { /* no-op */ },
    calls,
    state: data,
  } as unknown as DatabaseAdapter & { calls: SqlCall[]; state: MockState };
}

const today = new Date().toISOString().slice(0, 10);
const month = new Date().toISOString().slice(0, 7);

const standardRules = {
  max_per_transaction_ftc: 100,
  max_daily_transactions: 10,
  max_daily_spend_ftc: 500,
  max_monthly_spend_ftc: 5000,
  require_approval_above_ftc: 50,
};

let mockDb: ReturnType<typeof makeMockDb>;

beforeEach(() => {
  mockDb = makeMockDb({
    rules: { ...standardRules },
    state: {
      transactions_today: 2,
      total_spent_today_ftc: 50,
      total_spent_month_ftc: 200,
      last_daily_reset: today,
      last_monthly_reset: month,
    },
  });
});

describe('checkSpending — auto-approve', () => {
  it('approves a small amount under all thresholds', async () => {
    const svc = await createFCBudgetService(mockDb);
    const r = await svc.checkSpending(10);
    expect(r.result).toBe('approved');
  });

  it('returns approved when no rules / no state are set', async () => {
    const empty = makeMockDb({ rules: null, state: null });
    const svc = await createFCBudgetService(empty);
    const r = await svc.checkSpending(99999);
    expect(r.result).toBe('approved');
  });
});

describe('checkSpending — blocked outcomes', () => {
  it('blocks when amount exceeds per-transaction limit', async () => {
    const svc = await createFCBudgetService(mockDb);
    const r = await svc.checkSpending(150);
    expect(r.result).toBe('blocked');
    expect(r.reason).toContain('per-transaction');
  });

  it('blocks when daily transaction count reached', async () => {
    mockDb.state.state!.transactions_today = 10;  // == limit
    const svc = await createFCBudgetService(mockDb);
    const r = await svc.checkSpending(5);
    expect(r.result).toBe('blocked');
    expect(r.reason).toContain('Daily transaction');
  });

  it('blocks when daily spend would exceed cap', async () => {
    mockDb.state.state!.total_spent_today_ftc = 480;
    const svc = await createFCBudgetService(mockDb);
    const r = await svc.checkSpending(30);  // 480 + 30 > 500
    expect(r.result).toBe('blocked');
    expect(r.reason).toContain('daily spend');
  });

  it('blocks when monthly spend would exceed cap', async () => {
    mockDb.state.state!.total_spent_month_ftc = 4980;
    const svc = await createFCBudgetService(mockDb);
    const r = await svc.checkSpending(30);  // 4980 + 30 > 5000
    expect(r.result).toBe('blocked');
    expect(r.reason).toContain('monthly');
  });
});

describe('checkSpending — requires_approval', () => {
  it('asks for approval when amount > require_approval_above_ftc but ≤ per-tx limit', async () => {
    const svc = await createFCBudgetService(mockDb);
    // require_approval_above_ftc = 50, max_per_tx = 100 → amount 75 → requires_approval
    const r = await svc.checkSpending(75);
    expect(r.result).toBe('requires_approval');
    expect(r.reason).toContain('auto-approve threshold');
  });
});

describe('updateRules — column allow-list', () => {
  it('only updates whitelisted columns', async () => {
    const svc = await createFCBudgetService(mockDb);
    await svc.updateRules({
      max_per_transaction_ftc: 200,
      malicious_column: 'haxxor',
    });
    // Find the UPDATE call (the mock filters get/all/run by SQL prefix)
    const update = mockDb.calls.find(c => c.sql.startsWith('UPDATE fc_budget_rules'));
    expect(update).toBeTruthy();
    expect(update!.sql).toContain('max_per_transaction_ftc = ?');
    expect(update!.sql).not.toContain('malicious_column');
  });

  it('does not issue UPDATE when no whitelisted fields supplied', async () => {
    const svc = await createFCBudgetService(mockDb);
    await svc.updateRules({ rogue_field: 'x' });
    expect(mockDb.calls.find(c => c.sql.startsWith('UPDATE fc_budget_rules'))).toBeUndefined();
  });
});

describe('checkSpending — daily reset', () => {
  it('resets daily counters when last_daily_reset is stale', async () => {
    mockDb.state.state!.last_daily_reset = '2020-01-01';
    const svc = await createFCBudgetService(mockDb);
    await svc.checkSpending(10);
    const reset = mockDb.calls.find(c => c.sql.includes('transactions_today = 0'));
    expect(reset).toBeTruthy();
  });

  it('does not reset when last_daily_reset is today', async () => {
    const svc = await createFCBudgetService(mockDb);
    await svc.checkSpending(10);
    const reset = mockDb.calls.find(c => c.sql.includes('transactions_today = 0'));
    expect(reset).toBeUndefined();
  });
});
