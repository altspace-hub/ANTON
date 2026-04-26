/**
 * fc-marketplace-service.test.ts — FC Marketplace listing CRUD tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createFCMarketplaceService } from '../../../server/services/fc-marketplace-service.js';
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

describe('listServices', () => {
  it('default: filters by is_active = TRUE', async () => {
    const svc = await createFCMarketplaceService(mockDb);
    await svc.listServices();
    expect(mockDb.calls[0].sql).toContain('WHERE is_active = TRUE');
  });

  it('activeOnly=false drops the WHERE filter', async () => {
    const svc = await createFCMarketplaceService(mockDb);
    await svc.listServices(false);
    expect(mockDb.calls[0].sql).not.toContain('WHERE');
  });

  it('orders by total_completions DESC, created_at DESC', async () => {
    const svc = await createFCMarketplaceService(mockDb);
    await svc.listServices();
    expect(mockDb.calls[0].sql).toContain('ORDER BY total_completions DESC, created_at DESC');
  });
});

describe('createService', () => {
  it('inserts with provided fields + sensible defaults', async () => {
    const svc = await createFCMarketplaceService(mockDb);
    const id = await svc.createService({
      moduleId: 'mod_1', title: 'My Service', description: 'desc', priceFtc: 25,
    });
    expect(id).toMatch(/^fcs_\d+_[a-z0-9]{6,}$/);
    const insert = mockDb.calls[0];
    expect(insert.sql).toContain('INSERT INTO fc_service_listings');
    // Defaults: pricing_model='fixed', quality_thresholds 8.0/6.0, partial_pct=50, turnaround=24
    expect(insert.args[5]).toBe('fixed');
    expect(insert.args[6]).toBe(8.0);
    expect(insert.args[7]).toBe(6.0);
    expect(insert.args[8]).toBe(50);
    expect(insert.args[9]).toBe(24);
  });

  it('respects supplied non-default values', async () => {
    const svc = await createFCMarketplaceService(mockDb);
    await svc.createService({
      moduleId: 'mod_1', title: 'X', description: 'd', priceFtc: 100,
      pricingModel: 'token_based',
      qualityThresholdFull: 9.5, qualityThresholdPartial: 7.0,
      partialPayPercent: 75, maxTurnaroundHours: 48,
    });
    const args = mockDb.calls[0].args;
    expect(args[5]).toBe('token_based');
    expect(args[6]).toBe(9.5);
    expect(args[8]).toBe(75);
    expect(args[9]).toBe(48);
  });
});

describe('toggleService / deleteService', () => {
  it('toggleService updates is_active + updated_at', async () => {
    const svc = await createFCMarketplaceService(mockDb);
    await svc.toggleService('fcs_x', false);
    const upd = mockDb.calls[0];
    expect(upd.sql).toContain('UPDATE fc_service_listings SET is_active = ?');
    expect(upd.sql).toContain('updated_at = NOW()');
    expect(upd.args).toEqual([false, 'fcs_x']);
  });

  it('deleteService deletes by id', async () => {
    const svc = await createFCMarketplaceService(mockDb);
    await svc.deleteService('fcs_x');
    expect(mockDb.calls[0].sql).toContain('DELETE FROM fc_service_listings WHERE id = ?');
    expect(mockDb.calls[0].args).toEqual(['fcs_x']);
  });
});

describe('recordCompletion', () => {
  it('updates rolling average quality + total revenue', async () => {
    const svc = await createFCMarketplaceService(mockDb);
    await svc.recordCompletion('fcs_1', 9.0, 50);
    const sql = mockDb.calls[0].sql;
    expect(sql).toContain('total_completions = total_completions + 1');
    expect(sql).toContain('total_revenue_ftc = total_revenue_ftc + ?');
    expect(sql).toContain('avg_quality_score = COALESCE');
    expect(mockDb.calls[0].args).toEqual([9.0, 9.0, 50, 'fcs_1']);
  });
});
