/**
 * market-data-provider-refusal.test.ts — a refused account must not read as a success.
 *
 * ── What happened ────────────────────────────────────────────────────────────
 *
 * EODHD's free tier allows 20 API requests a day. The two EODHD sources ask for exactly
 * 20 symbols (10 European + 10 OMX Stockholm), so the first fetch cycle of the day spent
 * the whole quota and every later cycle got HTTP 402 for all twenty. The adapter's
 * per-symbol loop does `console.warn(...); continue;`, so it returned 0 without
 * throwing, and fetchFromSource recorded:
 *
 *     last_fetch_status = 'success'    last_fetch_error = NULL    last_fetch_at = now()
 *
 * Both sources sat like that for two days — healthy by every field the product can
 * query — while European and Nordic prices went stale. The only trace was a console
 * line nobody is watching at 14:30.
 *
 * ── Why a shared tracker rather than a fix in fetchEODHD ─────────────────────
 *
 * Because this is the third instance of the shape in one file, and the previous two are
 * both commemorated in comments there: a feed that "reported success daily" while its
 * newest bar aged two and a half weeks, and a 404 that "read as a successful zero-item
 * fetch forever". The per-symbol `continue` is correct for one delisted ticker and
 * wrong for an account-level refusal, and nothing in the code distinguished the two.
 *
 * ── What these cases pin ─────────────────────────────────────────────────────
 *
 * The assertion is on what lands in market_data_sources, not on whether the adapter
 * threw. A test that only checked for a thrown error would pass against a version that
 * threw somewhere the wrapper swallows, which is precisely the bug being fixed.
 *
 * The partial case matters as much as the refused one: a fetch where SOME symbols were
 * refused and others returned data must stay a success, because the data that arrived
 * is real and failing the whole source would discard it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const SOURCE_ID = 'src-eodhd-test';

/** Records what fetchFromSource writes back to market_data_sources. */
function makeDb(sourceRow: Record<string, unknown>) {
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string): Promise<T | undefined> {
      if (sql.includes('FROM market_data_sources')) return sourceRow as T;
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      writes.push({ sql, params });
      return { changes: 1, lastInsertRowid: 0 };
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db); },
    async close() { /* noop */ },
  };
  return { db, writes };
}

/** The status/error actually persisted for the source. */
function statusWrite(writes: Array<{ sql: string; params: unknown[] }>) {
  const w = writes.find((x) => x.sql.includes('UPDATE market_data_sources') && x.sql.includes('last_fetch_status'));
  if (!w) return null;
  return {
    status: /last_fetch_status = 'success'/.test(w.sql) ? 'success'
      : /last_fetch_status = 'error'/.test(w.sql) ? 'error' : 'unknown',
    params: w.params,
  };
}

const EODHD_SOURCE = {
  id: SOURCE_ID,
  name: 'EODHD OMX Stockholm',
  source_type: 'api',
  provider: 'eodhd',
  is_active: 1,
  config: JSON.stringify({
    api_key_env: 'EODHD_API_KEY',
    exchange: 'ST',
    symbols: ['VOLV-B.ST', 'ERIC-B.ST', 'AZN.ST'],
  }),
};

let fetchMock: ReturnType<typeof vi.fn>;
let originalKey: string | undefined;

beforeEach(() => {
  originalKey = process.env.EODHD_API_KEY;
  process.env.EODHD_API_KEY = 'test-key';
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.EODHD_API_KEY;
  else process.env.EODHD_API_KEY = originalKey;
});

/** A 402, exactly as EODHD answers an exhausted free-tier quota. */
const refused = () => ({ ok: false, status: 402, json: async () => ({}) });
/** One day of bars, in EODHD's ascending order. */
const delivered = () => ({
  ok: true,
  status: 200,
  json: async () => [{ date: '2026-09-04', open: 1, high: 2, low: 1, close: 2, adjusted_close: 2, volume: 10 }],
});

describe('a provider that refuses every request is recorded as an error', () => {
  it('does NOT write last_fetch_status = success when all symbols 402', async () => {
    fetchMock.mockResolvedValue(refused());
    const { db, writes } = makeDb(EODHD_SOURCE);
    const { createMarketDataService } = await import('../../server/services/market-data-service.js');
    const svc = await createMarketDataService(db);

    const result = await svc.fetchFromSource(SOURCE_ID);

    expect(result.itemsIngested).toBe(0);
    const s = statusWrite(writes);
    expect(s?.status, 'a fully refused fetch was recorded as a success').toBe('error');
  });

  it('records the status code and the count, so the cause is readable without the console', async () => {
    fetchMock.mockResolvedValue(refused());
    const { db, writes } = makeDb(EODHD_SOURCE);
    const { createMarketDataService } = await import('../../server/services/market-data-service.js');
    const svc = await createMarketDataService(db);

    await svc.fetchFromSource(SOURCE_ID);

    const message = String(statusWrite(writes)?.params?.[0] ?? '');
    expect(message).toMatch(/EODHD/);
    expect(message).toMatch(/402/);
    expect(message, 'the count of refusals is what distinguishes a quota from one bad symbol').toMatch(/x3/);
    expect(message).toMatch(/quota|plan/i);
  });

  it('leaves the source active, because a daily quota resets on its own', async () => {
    // A source that deactivates itself needs a human to turn it back on; this one
    // recovers at midnight UTC without intervention.
    fetchMock.mockResolvedValue(refused());
    const { db, writes } = makeDb(EODHD_SOURCE);
    const { createMarketDataService } = await import('../../server/services/market-data-service.js');
    const svc = await createMarketDataService(db);

    await svc.fetchFromSource(SOURCE_ID);

    expect(writes.some((w) => /is_active\s*=\s*0/.test(w.sql))).toBe(false);
  });
});

describe('a PARTIAL refusal is still a success', () => {
  it('keeps the data that did arrive when only some symbols are refused', async () => {
    // The failure mode of over-correcting: treating any refusal as fatal would throw
    // away two good symbols because the third was rate-limited.
    fetchMock
      .mockResolvedValueOnce(delivered())
      .mockResolvedValueOnce(refused())
      .mockResolvedValueOnce(delivered());
    const { db, writes } = makeDb(EODHD_SOURCE);
    const { createMarketDataService } = await import('../../server/services/market-data-service.js');
    const svc = await createMarketDataService(db);

    const result = await svc.fetchFromSource(SOURCE_ID);

    expect(result.itemsIngested).toBeGreaterThan(0);
    expect(statusWrite(writes)?.status).toBe('success');
  });

  it('a plain 404 on every symbol is NOT a refusal — that is a bad symbol list', async () => {
    // 404 means the tickers are wrong, not that the account was refused. Reporting it
    // as a quota problem would send the operator to the billing page for a typo.
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const { db, writes } = makeDb(EODHD_SOURCE);
    const { createMarketDataService } = await import('../../server/services/market-data-service.js');
    const svc = await createMarketDataService(db);

    await svc.fetchFromSource(SOURCE_ID);

    expect(statusWrite(writes)?.status).toBe('success');
  });
});
