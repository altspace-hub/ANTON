/**
 * market-data-fmp-batch.test.ts — FMP prices in one request, and a refused
 * source that waits.
 *
 * 2026-09-10: the FMP plan was exhausted by mid-morning. The price fetch
 * pulled 30 days of history PER SYMBOL every cycle (~156 requests a cycle),
 * and a refused source retried the full list every cycle all day. Now: one
 * batch-quote request per 50 symbols, the history only as a capped backfill
 * for stale symbols, and a cooldown recorded on the source after an
 * account-level refusal.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const SOURCE_ID = 'src-fmp-test';
const SYMBOLS = Array.from({ length: 35 }, (_, i) => `SYM${i}`);

function makeDb(sourceRow: Record<string, unknown>, newestBars: Array<{ symbol: string; newest: string }> = []) {
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(sql: string): Promise<T | undefined> {
      if (sql.includes('FROM market_data_sources')) return sourceRow as T;
      return undefined;
    },
    async all<T>(sql: string): Promise<T[]> {
      if (sql.includes('FROM market_data_raw')) return newestBars as unknown as T[];
      return [];
    },
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

const source = (over: Record<string, unknown> = {}) => ({
  id: SOURCE_ID, name: 'FMP S&P test', source_type: 'api', provider: 'fmp', is_active: 1,
  config: JSON.stringify({ api_key_env: 'FMP_API_KEY', data_type: 'price', symbols: SYMBOLS, ...(over.config as Record<string, unknown> ?? {}) }),
  refused_until: null,
  ...over,
  ...(over.config ? { config: JSON.stringify({ api_key_env: 'FMP_API_KEY', data_type: 'price', symbols: SYMBOLS, ...(over.config as Record<string, unknown>) }) } : {}),
});

const today = new Date().toISOString().slice(0, 10);
const fresh = SYMBOLS.map((s) => ({ symbol: s, newest: today }));

const quotes = (symbols: string[]) => ({
  ok: true, status: 200,
  json: async () => symbols.map((s, i) => ({ symbol: s, price: 100 + i, open: 99, dayHigh: 101, dayLow: 98, volume: 1000, previousClose: 99.5, timestamp: Math.floor(Date.now() / 1000) })),
});
const history = () => ({ ok: true, status: 200, json: async () => [{ date: '2026-09-08', open: 1, high: 2, low: 1, close: 2, volume: 10 }] });
const refused = () => ({ ok: false, status: 429, json: async () => ({}) });

let fetchMock: ReturnType<typeof vi.fn>;
let originalKey: string | undefined;
beforeEach(() => {
  originalKey = process.env.FMP_API_KEY;
  process.env.FMP_API_KEY = 'test-key';
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.FMP_API_KEY; else process.env.FMP_API_KEY = originalKey;
});

const urlsCalled = () => fetchMock.mock.calls.map((c) => String(c[0]));

describe('FMP prices — one batch request, history only as backfill', () => {
  it('fetches 35 fresh symbols with ONE batch-quote request and replaces the day bar', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const m = url.match(/batch-quote\?symbols=([^&]+)/);
      return m ? quotes(decodeURIComponent(m[1]).split(',')) : refused();
    });
    const { db, writes } = makeDb(source(), fresh);
    const { createMarketDataService } = await import('../../server/services/market-data-service.js');
    const svc = await createMarketDataService(db);

    const result = await svc.fetchFromSource(SOURCE_ID);

    expect(urlsCalled()).toHaveLength(1);
    expect(urlsCalled()[0]).toMatch(/\/stable\/batch-quote\?symbols=SYM0%2CSYM1|\/stable\/batch-quote\?symbols=SYM0,SYM1/);
    expect(result.itemsIngested).toBe(35);
    // A price bar for a date already held is replaced, not ignored.
    const rawInsert = writes.find((w) => w.sql.includes('INSERT INTO market_data_raw'));
    expect(rawInsert?.sql).toMatch(/ON CONFLICT \(source_id, symbol, data_type, published_at\) DO UPDATE SET content = EXCLUDED.content/);
    const normInsert = writes.find((w) => w.sql.includes('INSERT INTO market_price_normalized'));
    expect(normInsert?.sql).toMatch(/DO UPDATE SET/);
    expect(JSON.parse(String(rawInsert?.params[5]))).toMatchObject({ close: 100, adjClose: 100, high: 101, low: 98 });
    expect(writes.some((w) => /last_fetch_status = 'success'/.test(w.sql))).toBe(true);
  });

  it('backfills only the stale symbols, capped per cycle', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const m = url.match(/batch-quote\?symbols=([^&]+)/);
      return m ? quotes(decodeURIComponent(m[1]).split(',')) : history();
    });
    // Five symbols have no bar in 3 days; the cap is 3 per cycle.
    const stale = new Set(['SYM1', 'SYM7', 'SYM12', 'SYM20', 'SYM33']);
    const bars = SYMBOLS.filter((s) => !stale.has(s)).map((s) => ({ symbol: s, newest: today }));
    const { db } = makeDb(source({ config: { backfill_max_per_cycle: 3 } }), bars);
    const { createMarketDataService } = await import('../../server/services/market-data-service.js');
    const svc = await createMarketDataService(db);

    await svc.fetchFromSource(SOURCE_ID);

    const historyCalls = urlsCalled().filter((u) => u.includes('historical-price-eod'));
    expect(urlsCalled().filter((u) => u.includes('batch-quote'))).toHaveLength(1);
    expect(historyCalls).toHaveLength(3);
    expect(historyCalls.every((u) => [...stale].some((s) => u.includes(`symbol=${s}&`)))).toBe(true);
  });

  it('falls back to per-symbol bounded history when batch-quote is not in the plan, and remembers it', async () => {
    // Live on 2026-09-16: batch-quote answered 402 "Restricted Endpoint" — the
    // plan, not the quota — while historical-price-eod with from/to worked.
    // Without the fallback the cycle ingested nothing, recorded a refusal and
    // put the source on a four-hour cooldown; prices moved only when the
    // backfill found a symbol stale enough.
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('batch-quote')) return { ok: false, status: 402, json: async () => ({}), text: async () => 'Restricted Endpoint: This endpoint is not available under your current subscription' };
      return history();
    });
    const stale = new Set(['SYM3']);
    const bars = SYMBOLS.filter((s) => !stale.has(s)).map((s) => ({ symbol: s, newest: today }));
    const { db, writes } = makeDb(source(), bars);
    const { createMarketDataService } = await import('../../server/services/market-data-service.js');
    const svc = await createMarketDataService(db);

    const first = await svc.fetchFromSource(SOURCE_ID);

    const historyCalls = urlsCalled().filter((u) => u.includes('historical-price-eod'));
    expect(urlsCalled().filter((u) => u.includes('batch-quote'))).toHaveLength(1);
    expect(historyCalls).toHaveLength(35);
    // Every request is bounded: a from/to window, one week for fresh symbols
    // and 45 days for the stale one.
    const from = (u: string) => new Date(u.match(/from=(\d{4}-\d{2}-\d{2})/)![1]).getTime();
    const dayMs = 86_400_000;
    expect(historyCalls.every((u) => /from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/.test(u))).toBe(true);
    const staleCall = historyCalls.find((u) => u.includes('symbol=SYM3&'))!;
    const freshCall = historyCalls.find((u) => u.includes('symbol=SYM4&'))!;
    expect(Date.now() - from(staleCall)).toBeGreaterThan(44 * dayMs);
    expect(Date.now() - from(freshCall)).toBeLessThan(8 * dayMs);
    expect(first.itemsIngested).toBe(35);
    expect(writes.some((w) => /last_fetch_status = 'success'/.test(w.sql))).toBe(true);
    expect(writes.some((w) => w.sql.includes('refused_until = ?'))).toBe(false);

    // The next cycle on the same service skips batch-quote altogether.
    fetchMock.mockClear();
    await svc.fetchFromSource(SOURCE_ID);
    expect(urlsCalled().some((u) => u.includes('batch-quote'))).toBe(false);
    expect(urlsCalled().filter((u) => u.includes('historical-price-eod'))).toHaveLength(35);
  });

  it('rolls the FMP daily counter over on the first call of a new day', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const m = url.match(/batch-quote\?symbols=([^&]+)/);
      return m ? quotes(decodeURIComponent(m[1]).split(',')) : refused();
    });
    const { db, writes } = makeDb(source(), fresh);
    const { createMarketDataService } = await import('../../server/services/market-data-service.js');
    const svc = await createMarketDataService(db);
    await svc.fetchFromSource(SOURCE_ID);
    const counter = writes.find((w) => w.sql.includes('UPDATE api_rate_limits'));
    expect(counter?.sql).toMatch(/CASE WHEN reset_date = \? THEN daily_calls \+ 1 ELSE 1 END/);
    expect(counter?.params[0]).toBe(today);
  });

  it('a non-price data type is untouched (news still goes one request per feed)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    const { db } = makeDb(source({ config: { data_type: 'news', symbols: [] } }), []);
    const { createMarketDataService } = await import('../../server/services/market-data-service.js');
    const svc = await createMarketDataService(db);
    await svc.fetchFromSource(SOURCE_ID);
    expect(urlsCalled().some((u) => u.includes('batch-quote'))).toBe(false);
  });
});

describe('a refused source cools down', () => {
  it('records refused_until on an account-level refusal and keeps the source active', async () => {
    fetchMock.mockResolvedValue(refused());
    const { db, writes } = makeDb(source(), fresh);
    const { createMarketDataService } = await import('../../server/services/market-data-service.js');
    const svc = await createMarketDataService(db);

    const result = await svc.fetchFromSource(SOURCE_ID);

    expect(result.error).toMatch(/429/);
    const w = writes.find((x) => x.sql.includes('refused_until = ?'));
    expect(w, 'the refusal must set a cooldown on the source').toBeDefined();
    const until = new Date(String(w!.params[1])).getTime();
    expect(until).toBeGreaterThan(Date.now() + 3.5 * 3_600_000);
    expect(until).toBeLessThan(Date.now() + 4.5 * 3_600_000);
    expect(String(w!.params[0])).toMatch(/Skipping this source until/);
    expect(writes.some((x) => /is_active\s*=\s*0/.test(x.sql))).toBe(false);
  });

  it('is skipped — no request, no status write — while the cooldown lasts, and fetched again after it', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const m = url.match(/batch-quote\?symbols=([^&]+)/);
      return m ? quotes(decodeURIComponent(m[1]).split(',')) : refused();
    });
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const { db, writes } = makeDb(source({ refused_until: future }), fresh);
    const { createMarketDataService } = await import('../../server/services/market-data-service.js');
    const svc = await createMarketDataService(db);

    const skipped = await svc.fetchFromSource(SOURCE_ID);
    expect(skipped.skipped).toBe(true);
    expect(skipped.error).toMatch(/waiting until/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writes.some((x) => x.sql.includes('UPDATE market_data_sources'))).toBe(false);

    const past = new Date(Date.now() - 60_000).toISOString();
    const again = await createMarketDataService(makeDb(source({ refused_until: past }), fresh).db);
    const result = await again.fetchFromSource(SOURCE_ID);
    expect(result.itemsIngested).toBe(35);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a plain 404 on the batch is not a refusal and sets no cooldown', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const { db, writes } = makeDb(source(), fresh);
    const { createMarketDataService } = await import('../../server/services/market-data-service.js');
    const svc = await createMarketDataService(db);
    await svc.fetchFromSource(SOURCE_ID);
    expect(writes.some((x) => x.sql.includes('refused_until = ?'))).toBe(false);
  });
});
