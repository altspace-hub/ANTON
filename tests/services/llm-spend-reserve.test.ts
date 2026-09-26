/**
 * llm-spend-reserve.test.ts — reservations and unreadable caps
 * (server/services/llm-spend.ts, llm-spend-cap-env.ts), 2026-09-25 review.
 *
 * C1/C9: the caps read only settled rows, so calls started together all passed
 * at the same total, and a call cut short never added a row. A priced call now
 * reserves its worst case first; the caps count every other call in flight.
 *
 * C2: a cap written "0,25", "$3" or "3 USD" read as no cap, without a word —
 * a public demo ran uncapped while its operator believed both caps were set.
 * Now it is logged, and in demo mode priced calls are refused until it is fixed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import {
  assertSpendAllowed,
  reserveSpend,
  settleSpend,
  releaseSpend,
  readSpendCaps,
  spendCapConfigWarnings,
  resetSpendCapWarningsForTests,
  SpendCapError,
  USER_CAP_MESSAGE,
  INSTANCE_CAP_MESSAGE,
} from '../../server/services/llm-spend.js';
import { parseSpendCap, invalidSpendCapVars } from '../../server/services/llm-spend-cap-env.js';
import { setRouterDb } from '../../server/services/compat-endpoint.js';

const KEYS = ['LLM_DAILY_SPEND_CAP_USD', 'LLM_USER_DAILY_SPEND_CAP_USD', 'DEMO_MODE'] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = {};
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  setRouterDb(null);
  resetSpendCapWarningsForTests();
});
afterEach(() => {
  for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  setRouterDb(null);
  vi.restoreAllMocks();
});

interface Row { id: number; userId: unknown; cost: number; source: string }

/** A ledger in memory, answering the SQL llm-spend.ts sends. */
function memoryLedger(seed: Array<{ userId: string | null; cost: number }> = []) {
  const rows: Row[] = seed.map((r, i) => ({ id: i + 1, userId: r.userId, cost: r.cost, source: 'reported' }));
  let nextId = rows.length + 1;
  const db = {
    get: vi.fn(async (sql: string, ...args: unknown[]) => {
      if (sql.includes('RETURNING id')) {
        const row = { id: nextId++, userId: args[0], cost: Number(args[2]), source: String(args[5]) };
        rows.push(row);
        return { id: row.id };
      }
      const perUser = sql.includes('user_id = ?');
      return { total: rows.filter((r) => !perUser || r.userId === args[0]).reduce((s, r) => s + r.cost, 0) };
    }),
    run: vi.fn(async (sql: string, ...args: unknown[]) => {
      if (sql.includes('UPDATE llm_spend_ledger')) {
        const row = rows.find((r) => r.id === args[5]);
        if (row) { row.cost = Number(args[0]); row.source = String(args[1]); }
        return { changes: row ? 1 : 0, lastInsertRowid: 0 };
      }
      if (sql.includes('DELETE FROM llm_spend_ledger')) {
        const i = rows.findIndex((r) => r.id === args[0] && r.source === 'reserved');
        if (i >= 0) rows.splice(i, 1);
        return { changes: i >= 0 ? 1 : 0, lastInsertRowid: 0 };
      }
      return { changes: 0, lastInsertRowid: 0 };
    }),
  } as unknown as DatabaseAdapter;
  return { db, rows };
}

describe('parseSpendCap (review C2)', () => {
  it('reads a plain dollar amount, and unset, empty or 0 as no cap', () => {
    expect(parseSpendCap('3')).toEqual({ value: 3, invalid: false });
    expect(parseSpendCap(' 0.25 ')).toEqual({ value: 0.25, invalid: false });
    expect(parseSpendCap('.5')).toEqual({ value: 0.5, invalid: false });
    expect(parseSpendCap('0')).toEqual({ value: null, invalid: false });
    expect(parseSpendCap('')).toEqual({ value: null, invalid: false });
    expect(parseSpendCap(undefined)).toEqual({ value: null, invalid: false });
  });

  it('marks a Swedish decimal, a currency sign or a unit as INVALID, not as no cap', () => {
    for (const raw of ['0,25', '3,00', '$3', '3 USD', '-1', 'abc', '0x10', 'Infinity']) {
      expect(parseSpendCap(raw), raw).toEqual({ value: null, invalid: true });
    }
  });

  it('names the variables that are set but unreadable — names only', () => {
    const env = { LLM_DAILY_SPEND_CAP_USD: '3,00', LLM_USER_DAILY_SPEND_CAP_USD: '0.25' };
    expect(invalidSpendCapVars(env)).toEqual(['LLM_DAILY_SPEND_CAP_USD']);
    const warnings = spendCapConfigWarnings(env);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/LLM_DAILY_SPEND_CAP_USD is not a number/);
    expect(warnings[0]).not.toContain('3,00');
    // readSpendCaps is unchanged for the valid one.
    expect(readSpendCaps(env)).toEqual({ instanceDailyUsd: null, userDailyUsd: 0.25 });
  });
});

describe('an unreadable cap (review C2)', () => {
  it('refuses priced calls in demo mode (fail closed)', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.LLM_USER_DAILY_SPEND_CAP_USD = '0,25';
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { db } = memoryLedger();
    await expect(assertSpendAllowed({ db })).rejects.toBeInstanceOf(SpendCapError);
    await expect(reserveSpend({ model: 'm', costUsd: 0.01 }, db)).rejects.toBeInstanceOf(SpendCapError);
  });

  it('outside demo mode is logged once and treated as no cap', async () => {
    process.env.LLM_DAILY_SPEND_CAP_USD = '$3';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { db } = memoryLedger([{ userId: null, cost: 1_000 }]);
    await expect(assertSpendAllowed({ db })).resolves.toBeUndefined();
    await expect(assertSpendAllowed({ db })).resolves.toBeUndefined();
    const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('LLM_DAILY_SPEND_CAP_USD'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/treated as no cap/);
  });

  it('negative control: a valid cap in demo mode still works as a cap', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.LLM_DAILY_SPEND_CAP_USD = '3';
    await expect(assertSpendAllowed({ db: memoryLedger([{ userId: null, cost: 1 }]).db })).resolves.toBeUndefined();
    await expect(assertSpendAllowed({ db: memoryLedger([{ userId: null, cost: 3 }]).db })).rejects.toBeInstanceOf(SpendCapError);
  });
});

describe('reserveSpend (review C1/C9)', () => {
  it('counts calls still in flight: a second call is refused while the first holds the rest of the cap', async () => {
    process.env.LLM_USER_DAILY_SPEND_CAP_USD = '0.25';
    const { db, rows } = memoryLedger([{ userId: 'v', cost: 0.20 }]);
    const first = await reserveSpend({ model: 'm', costUsd: 0.06, userId: 'v', role: 'analyst' }, db);
    expect(first).not.toBeNull();
    // Settled spend is 0.20 — under the cap — but 0.26 is committed with the first call in flight.
    const second = await reserveSpend({ model: 'm', costUsd: 0.06, userId: 'v', role: 'analyst' }, db).catch((e: unknown) => e);
    expect(second).toBeInstanceOf(SpendCapError);
    expect((second as SpendCapError).message).toBe(USER_CAP_MESSAGE);
    // The refused call's reservation is gone; the first one's stays.
    expect(rows.filter((r) => r.source === 'reserved')).toHaveLength(1);
    // assertSpendAllowed alone — the old check — would have let the second call through.
    await releaseSpend(first!);
    expect(rows.filter((r) => r.source === 'reserved')).toHaveLength(0);
  });

  it('negative control: a call\'s own reservation does not count against it', async () => {
    process.env.LLM_USER_DAILY_SPEND_CAP_USD = '0.25';
    const { db, rows } = memoryLedger([{ userId: 'v', cost: 0.20 }]);
    // Worst case 0.10 would take the day to 0.30; the call still runs, as it would have before.
    const r = await reserveSpend({ model: 'm', costUsd: 0.10, userId: 'v', role: 'analyst' }, db);
    expect(r).not.toBeNull();
    expect(rows).toHaveLength(2);
  });

  it('applies the instance cap to everyone, admins too; the per-user cap not to admins', async () => {
    process.env.LLM_USER_DAILY_SPEND_CAP_USD = '0.10';
    const { db } = memoryLedger([{ userId: 'owner', cost: 5 }]);
    await expect(reserveSpend({ model: 'm', costUsd: 0.01, userId: 'owner', role: 'admin' }, db)).resolves.not.toBeNull();
    process.env.LLM_DAILY_SPEND_CAP_USD = '5';
    const err = await reserveSpend({ model: 'm', costUsd: 0.01, userId: 'owner', role: 'admin' }, db).catch((e: unknown) => e);
    expect((err as SpendCapError).message).toBe(INSTANCE_CAP_MESSAGE);
  });

  it('fails closed when a cap is set and the reservation cannot be written', async () => {
    process.env.LLM_DAILY_SPEND_CAP_USD = '5';
    const broken = { get: vi.fn(async () => { throw new Error('down'); }), run: vi.fn() } as unknown as DatabaseAdapter;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(reserveSpend({ model: 'm', costUsd: 0.01 }, broken)).rejects.toBeInstanceOf(SpendCapError);
    // …and with no cap set the call runs unreserved rather than failing.
    delete process.env.LLM_DAILY_SPEND_CAP_USD;
    await expect(reserveSpend({ model: 'm', costUsd: 0.01 }, broken)).resolves.toBeNull();
  });

  it('settleSpend replaces the reserved cost with what the call came to', async () => {
    const { db, rows } = memoryLedger();
    const r = await reserveSpend({ model: 'm', costUsd: 0.05, userId: 'v' }, db);
    expect(await settleSpend(r!, { costUsd: 0.004, source: 'reported', inputTokens: 10, outputTokens: 5 })).toBe(true);
    expect(rows).toEqual([expect.objectContaining({ cost: 0.004, source: 'reported' })]);
  });
});
