/**
 * llm-spend-caps.test.ts — the daily USD caps on priced model calls
 * (server/services/llm-spend.ts) and the request context they read the user
 * from (server/lib/request-context.ts).
 *
 * Before 2026-09-25 a compat (OpenRouter) run recorded a NULL cost and nothing
 * in ANTON capped what it spent per day or per visitor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import {
  assertSpendAllowed,
  readSpendCaps,
  utcDayStart,
  SpendCapError,
  INSTANCE_CAP_MESSAGE,
  USER_CAP_MESSAGE,
  recordSpend,
} from '../../server/services/llm-spend.js';
import { setRouterDb } from '../../server/services/compat-endpoint.js';
import { runWithRequestContext, requestContextMiddleware, currentRequestContext } from '../../server/lib/request-context.js';

const KEYS = ['LLM_DAILY_SPEND_CAP_USD', 'LLM_USER_DAILY_SPEND_CAP_USD'] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => { saved = {}; for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } setRouterDb(null); });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } setRouterDb(null); });

/** A ledger db answering SUM queries: instance total, and per user. */
function ledger(instanceUsd: number, perUser: Record<string, number> = {}) {
  const get = vi.fn(async (sql: string, ...args: unknown[]) => {
    if (sql.includes('user_id = ?')) return { total: perUser[String(args[0])] ?? 0 };
    return { total: instanceUsd };
  });
  return { db: { get, all: vi.fn(), run: vi.fn(async () => ({ changes: 1 })) } as unknown as DatabaseAdapter, get };
}

describe('readSpendCaps', () => {
  it('reads positive numbers and treats unset, zero or junk as no cap', () => {
    expect(readSpendCaps({ LLM_DAILY_SPEND_CAP_USD: '3', LLM_USER_DAILY_SPEND_CAP_USD: '0.25' })).toEqual({ instanceDailyUsd: 3, userDailyUsd: 0.25 });
    expect(readSpendCaps({ LLM_DAILY_SPEND_CAP_USD: '0', LLM_USER_DAILY_SPEND_CAP_USD: 'abc' })).toEqual({ instanceDailyUsd: null, userDailyUsd: null });
    expect(readSpendCaps({})).toEqual({ instanceDailyUsd: null, userDailyUsd: null });
  });

  it('counts the day from midnight UTC', () => {
    expect(utcDayStart(new Date('2026-09-25T23:30:00-05:00')).toISOString()).toBe('2026-09-26T00:00:00.000Z');
  });
});

describe('assertSpendAllowed', () => {
  it('does nothing — not even a query — when no cap is set', async () => {
    const { db, get } = ledger(1_000);
    await expect(assertSpendAllowed({ db })).resolves.toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it('refuses once the instance has spent its daily cap, and allows below it', async () => {
    process.env.LLM_DAILY_SPEND_CAP_USD = '2';
    const over = await assertSpendAllowed({ db: ledger(2.0).db }).catch((e: unknown) => e);
    expect(over).toBeInstanceOf(SpendCapError);
    expect((over as SpendCapError).message).toBe(INSTANCE_CAP_MESSAGE);
    expect((over as SpendCapError).status).toBe(402);
    await expect(assertSpendAllowed({ db: ledger(1.99).db })).resolves.toBeUndefined();
  });

  it('refuses a user who has spent their own cap, taking the user from the request context', async () => {
    process.env.LLM_USER_DAILY_SPEND_CAP_USD = '0.10';
    const { db } = ledger(5, { alice: 0.11, bob: 0.01 });
    const alice = await runWithRequestContext({ userId: 'alice', role: 'analyst' }, () => assertSpendAllowed({ db }).catch((e: unknown) => e));
    expect((alice as SpendCapError).scope).toBe('user');
    expect((alice as SpendCapError).message).toBe(USER_CAP_MESSAGE);
    await expect(runWithRequestContext({ userId: 'bob', role: 'analyst' }, () => assertSpendAllowed({ db }))).resolves.toBeUndefined();
  });

  it('exempts admins from the per-user cap only', async () => {
    process.env.LLM_USER_DAILY_SPEND_CAP_USD = '0.10';
    const { db } = ledger(0, { owner: 99 });
    await expect(assertSpendAllowed({ db, userId: 'owner', role: 'admin' })).resolves.toBeUndefined();
    process.env.LLM_DAILY_SPEND_CAP_USD = '1';
    await expect(assertSpendAllowed({ db: ledger(1).db, userId: 'owner', role: 'admin' })).rejects.toBeInstanceOf(SpendCapError);
  });

  it('fails closed when a cap is set and no ledger can be read', async () => {
    process.env.LLM_DAILY_SPEND_CAP_USD = '5';
    await expect(assertSpendAllowed()).rejects.toBeInstanceOf(SpendCapError);
    const broken = { get: vi.fn(async () => { throw new Error('relation "llm_spend_ledger" does not exist'); }) } as unknown as DatabaseAdapter;
    await expect(assertSpendAllowed({ db: broken })).rejects.toBeInstanceOf(SpendCapError);
  });

  it('uses the database registered at boot when none is passed', async () => {
    process.env.LLM_DAILY_SPEND_CAP_USD = '1';
    setRouterDb(ledger(0.5).db);
    await expect(assertSpendAllowed()).resolves.toBeUndefined();
  });
});

describe('recordSpend', () => {
  it('writes the request context\'s user and session when the caller names none', async () => {
    const { db } = ledger(0);
    await runWithRequestContext({ userId: 'visitor-1', sessionId: 'sess-9' }, () =>
      recordSpend({ model: 'compat:or:m', costUsd: 0.002, source: 'reported' }, db));
    const args = (db.run as ReturnType<typeof vi.fn>).mock.calls[0].slice(1);
    expect(args[0]).toBe('visitor-1');
    expect(args[8]).toBe('sess-9');
  });

  it('never throws on a failed write', async () => {
    const db = { run: vi.fn(async () => { throw new Error('down'); }) } as unknown as DatabaseAdapter;
    await expect(recordSpend({ model: 'm', costUsd: 1, source: 'reported', userId: null }, db)).resolves.toBe(false);
  });
});

describe('requestContextMiddleware', () => {
  it('makes the signed-in user visible to everything the request awaits', async () => {
    const req = { user: { id: 'u-7', role: 'analyst' }, body: { sessionId: 's-1' }, query: {} };
    let seen: ReturnType<typeof currentRequestContext>;
    await new Promise<void>((resolve) => {
      requestContextMiddleware(req as never, {} as never, () => {
        void (async () => {
          await new Promise((r) => setTimeout(r, 1));
          seen = currentRequestContext();
          resolve();
        })();
      });
    });
    expect(seen!).toEqual({ userId: 'u-7', role: 'analyst', sessionId: 's-1' });
    // Outside a request there is no context (background jobs).
    expect(currentRequestContext()).toBeUndefined();
  });
});
