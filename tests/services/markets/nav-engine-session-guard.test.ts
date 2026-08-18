import { describe, it, expect } from 'vitest';
import { createMarketNavEngine } from '../../../server/services/market-nav-engine.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

/**
 * 2026-08-17: the daily NAV ran at 09:39 (boot catch-up) while the broad price
 * fetch lands at 16:00. Every US holding was therefore priced from Friday's
 * bar, so five of six indexes recorded an exactly 0.000% Monday — and that
 * phantom row then became the baseline the real Monday move was measured
 * against. Two invariants keep that from recurring:
 *
 *   1. No bar dated on/after the session → no NAV row at all.
 *   2. The daily return is measured against the previous SESSION, never
 *      against the same-day row this upsert is about to replace.
 */

type NavRow = { nav_date: string; nav_value: number };

interface Harness {
  db: DatabaseAdapter;
  inserts: Array<{ navDate: string; navValue: number; dailyReturn: number | null }>;
  deletes: string[];
  /** SQL of every write that touches "current" state (holdings / index rows). */
  currentStateWrites: string[];
}

/**
 * @param barDate  trading date of the only price bar on offer (published_at)
 * @param barClose close on that bar
 * @param history  pre-existing NAV rows for the index
 */
function harness(barDate: string, barClose: number, history: NavRow[]): Harness {
  const inserts: Harness['inserts'] = [];
  const deletes: string[] = [];
  const currentStateWrites: string[] = [];

  const db = {
    all: async (sql: string) => {
      if (sql.includes('market_index_holdings')) {
        // one holding, 10 shares, carried-forward price of 100
        return [{ id: 'h1', symbol: 'AAPL', shares: 10, entry_price: 100, current_price: 100 }];
      }
      return [];
    },
    get: async (sql: string, ...params: unknown[]) => {
      if (sql.includes("data_type = 'price'")) {
        const upperBound = String(params[1]); // navDate
        // mimic `published_at < navDate + 1 day`
        if (barDate > upperBound) return undefined;
        return { content: JSON.stringify({ close: barClose }), published_at: `${barDate} 00:00:00+02` };
      }
      if (sql.includes("data_type = 'event'")) return undefined;
      if (sql.includes('MAX(nav_value)')) {
        const before = history.filter(r => r.nav_date < String(params[1]));
        return { peak: before.length ? Math.max(...before.map(r => r.nav_value)) : 0 };
      }
      if (sql.includes('market_index_nav_history')) {
        const navDate = String(params[1]);
        if (sql.includes('nav_date > ?')) {
          // "is there a newer session on record?" probe
          return history.find(r => r.nav_date > navDate);
        }
        if (sql.includes('nav_date < ?')) {
          // prevNav — strictly earlier sessions, newest first
          const before = history.filter(r => r.nav_date < navDate).sort((a, b) => (a.nav_date < b.nav_date ? 1 : -1));
          return before[0];
        }
        // inception — earliest row up to and including navDate
        const upto = history.filter(r => r.nav_date <= navDate).sort((a, b) => (a.nav_date < b.nav_date ? -1 : 1));
        return upto[0];
      }
      return undefined;
    },
    run: async (sql: string, ...params: unknown[]) => {
      if (sql.includes('UPDATE market_index_holdings') || sql.includes('UPDATE market_indexes')) {
        currentStateWrites.push(sql.trim());
      }
      if (sql.includes('DELETE FROM market_index_nav_history')) deletes.push(String(params[1]));
      if (sql.includes('INSERT INTO market_index_nav_history')) {
        inserts.push({
          navDate: String(params[1]),
          navValue: Number(params[2]),
          dailyReturn: params[3] === null ? null : Number(params[3]),
        });
      }
      return undefined;
    },
  } as unknown as DatabaseAdapter;

  return { db, inserts, deletes, currentStateWrites };
}

describe('NAV engine — stale-session guard', () => {
  it('writes no NAV row when every price is carried forward from an earlier session', async () => {
    // Session 2026-08-17, but the newest bar on hand is Friday's.
    const h = harness('2026-08-14', 100, [{ nav_date: '2026-08-14', nav_value: 1000 }]);
    const engine = await createMarketNavEngine(h.db);

    const result = await engine.calculateDailyNav('idx1', '2026-08-17');

    expect(result.written).toBe(false);
    expect(h.inserts).toHaveLength(0);
    expect(h.deletes).toHaveLength(0);
  });

  it('writes the session once a bar dated that session exists', async () => {
    const h = harness('2026-08-17', 110, [{ nav_date: '2026-08-14', nav_value: 1000 }]);
    const engine = await createMarketNavEngine(h.db);

    const result = await engine.calculateDailyNav('idx1', '2026-08-17');

    expect(result.written).toBe(true);
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0].navDate).toBe('2026-08-17');
    expect(h.inserts[0].navValue).toBeCloseTo(1100, 6); // 10 shares x 110
  });

  it('never prices a session from a later session\'s bar', async () => {
    // A Monday bar exists, but we are recomputing Friday.
    const h = harness('2026-08-17', 110, [{ nav_date: '2026-08-13', nav_value: 1000 }]);
    const engine = await createMarketNavEngine(h.db);

    const result = await engine.calculateDailyNav('idx1', '2026-08-14');

    // Monday's bar is out of bounds for a Friday NAV → nothing fresh → no write.
    expect(result.written).toBe(false);
    expect(h.inserts).toHaveLength(0);
  });
});

describe('NAV engine — daily return baseline', () => {
  it('measures against the previous session, not the row being replaced', async () => {
    // The bogus flat row for 08-17 is already present. Recomputing 08-17 must
    // compare against 08-14 (1000), not against the 08-17 row (1000 as well but
    // conceptually its own output) — i.e. the real +10% move must surface.
    const h = harness('2026-08-17', 110, [
      { nav_date: '2026-08-14', nav_value: 1000 },
      { nav_date: '2026-08-17', nav_value: 1000 }, // phantom flat row
    ]);
    const engine = await createMarketNavEngine(h.db);

    const result = await engine.calculateDailyNav('idx1', '2026-08-17');

    expect(result.written).toBe(true);
    expect(h.deletes).toEqual(['2026-08-17']);          // upsert replaced it
    expect(result.dailyReturn).toBeCloseTo(0.10, 6);    // 1000 -> 1100
    expect(h.inserts[0].dailyReturn).toBeCloseTo(0.10, 6);
  });

  it('is idempotent — a second recompute of the same session yields the same return', async () => {
    const history: NavRow[] = [
      { nav_date: '2026-08-14', nav_value: 1000 },
      { nav_date: '2026-08-17', nav_value: 1100 }, // already repaired once
    ];
    const h = harness('2026-08-17', 110, history);
    const engine = await createMarketNavEngine(h.db);

    const result = await engine.calculateDailyNav('idx1', '2026-08-17');

    // Without the `nav_date < ?` bound this would read its own 1100 row and
    // report 0.000% — the exact way a repair erases the move it is fixing.
    expect(result.dailyReturn).toBeCloseTo(0.10, 6);
  });
});

describe('NAV engine — backfill does not rewrite current state', () => {
  it('repairing the newest session still updates current prices and current_nav', async () => {
    const h = harness('2026-08-17', 110, [
      { nav_date: '2026-08-14', nav_value: 1000 },
      { nav_date: '2026-08-17', nav_value: 1000 },
    ]);
    const engine = await createMarketNavEngine(h.db);

    await engine.calculateDailyNav('idx1', '2026-08-17');

    expect(h.currentStateWrites.some(w => w.includes('UPDATE market_index_holdings'))).toBe(true);
    expect(h.currentStateWrites.some(w => w.includes('UPDATE market_indexes'))).toBe(true);
  });

  it('repairing an older session leaves current prices and current_nav alone', async () => {
    // 08-17 is already on record, so recomputing 08-14 is pure history: writing
    // Friday's price into holdings.current_price would make the live view stale
    // until the next scheduled run.
    const h = harness('2026-08-14', 110, [
      { nav_date: '2026-08-13', nav_value: 1000 },
      { nav_date: '2026-08-17', nav_value: 1200 },
    ]);
    const engine = await createMarketNavEngine(h.db);

    const result = await engine.calculateDailyNav('idx1', '2026-08-14');

    expect(result.written).toBe(true);            // history IS rewritten
    expect(h.inserts[0].navDate).toBe('2026-08-14');
    expect(h.currentStateWrites).toEqual([]);     // ...but nothing "current" moved
  });
});
