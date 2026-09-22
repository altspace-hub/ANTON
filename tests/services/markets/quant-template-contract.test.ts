/**
 * quant-template-contract.test.ts
 *
 * GARCH and Kelly were wired into the live loop on 2026-08-20. Both read named
 * fields out of a Python template's JSON, and on the first attempt every one of
 * those names was wrong — guessed from the template description rather than
 * from a run. GARCH was read for `forecast`, `alpha` and `beta`; it actually
 * returns `forecast_1d`, `persistence` and a nested `params` object. Kelly was
 * read for `kelly_fraction` and `growth_rate`; it returns `half_kelly` and
 * `expected_growth`.
 *
 * Nothing would have failed. The prompt line would have read "N/A" and the
 * sizing field would have been null, forever, silently — the same shape as the
 * bugs this pillar spent a week finding. These tests execute the real templates
 * and assert the field names the callers actually read, so template drift
 * breaks a test instead of quietly emptying a signal.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createMarketComputationService } from '../../../server/services/market-computation-service.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

/** The service only writes an audit row; no reads are needed for a run. */
const db = { run: async () => undefined, get: async () => undefined, all: async () => [] } as unknown as DatabaseAdapter;

let svc: Awaited<ReturnType<typeof createMarketComputationService>>;
beforeAll(async () => { svc = await createMarketComputationService(db); });

/** A deterministic return series with volatility clustering, so GARCH has structure to find. */
function syntheticReturns(n = 120): number[] {
  const out: number[] = [];
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  for (let i = 0; i < n; i++) {
    const regime = i > n / 2 ? 0.02 : 0.006;   // volatility steps up halfway
    out.push(rnd() * regime);
  }
  return out;
}

describe('garch_volatility output contract', () => {
  it('returns the fields the pulse reads', async () => {
    const r = await svc.runTemplate('garch_volatility', { returns: syntheticReturns(), p: 1, q: 1 }, 'contract-test');
    expect(r.success, JSON.stringify(r).slice(0, 300)).toBe(true);
    const o = r.output as Record<string, unknown>;

    // Exactly the names market-workflow-orchestrator destructures.
    expect(Array.isArray(o.conditional_volatility)).toBe(true);
    expect((o.conditional_volatility as number[]).length).toBeGreaterThan(0);
    expect(typeof o.forecast_1d).toBe('number');
    expect(typeof o.forecast_20d).toBe('number');
    expect(typeof o.persistence).toBe('number');
    expect(typeof o.half_life).toBe('number');
  });

  it('does not expose the names that were guessed', async () => {
    // If a future template revision reintroduces `forecast` or a top-level
    // `alpha`, the reader should be revisited rather than silently preferred.
    const r = await svc.runTemplate('garch_volatility', { returns: syntheticReturns(), p: 1, q: 1 }, 'contract-test');
    const o = r.output as Record<string, unknown>;
    expect(o.forecast).toBeUndefined();
    expect(o.alpha).toBeUndefined();
  });

  it('needs returns, not prices — a price series is not a variance series', async () => {
    // Feeding prices is the plausible mistake: it runs, and models the level.
    const prices = Array.from({ length: 120 }, (_, i) => 500 + i);
    const onPrices = await svc.runTemplate('garch_volatility', { returns: prices, p: 1, q: 1 }, 'contract-test');
    const onReturns = await svc.runTemplate('garch_volatility', { returns: syntheticReturns(), p: 1, q: 1 }, 'contract-test');
    const volOf = (r: unknown) => {
      const cv = (r as { output?: { conditional_volatility?: number[] } }).output?.conditional_volatility ?? [];
      return cv[cv.length - 1] ?? 0;
    };
    // Orders of magnitude apart — the two inputs are not interchangeable.
    expect(volOf(onPrices)).toBeGreaterThan(volOf(onReturns) * 10);
  });
});

describe('kelly_criterion output contract', () => {
  const base = { win_amount: 0.02, loss_amount: 0.02, bankroll: 100_000_000, fraction_kelly: 0.5 };

  it('returns the fields the shadow rebalancer reads', async () => {
    const r = await svc.runTemplate('kelly_criterion', { ...base, win_probability: 0.60 }, 'contract-test');
    expect(r.success, JSON.stringify(r).slice(0, 300)).toBe(true);
    const o = r.output as Record<string, unknown>;
    for (const k of ['full_kelly', 'half_kelly', 'position_size', 'expected_growth', 'ruin_probability', 'edge']) {
      expect(typeof o[k], `${k} must be a number`).toBe('number');
    }
  });

  it('sizes a positive edge and refuses a negative one', async () => {
    const good = await svc.runTemplate('kelly_criterion', { ...base, win_probability: 0.60 }, 'contract-test');
    const bad = await svc.runTemplate('kelly_criterion', { ...base, win_probability: 0.40 }, 'contract-test');
    const f = (r: unknown) => (r as { output?: { half_kelly?: number } }).output?.half_kelly ?? -1;

    expect(f(good)).toBeGreaterThan(0);
    // 40% at symmetric payoff is a negative edge. Sizing it at all would be the
    // dangerous failure — this is exactly the case UNH hit on the first live run.
    expect(f(bad)).toBeLessThanOrEqual(0);
  });

  it('half Kelly is half of full Kelly', async () => {
    const r = await svc.runTemplate('kelly_criterion', { ...base, win_probability: 0.60 }, 'contract-test');
    const o = r.output as { full_kelly: number; half_kelly: number };
    expect(o.half_kelly).toBeCloseTo(o.full_kelly / 2, 6);
  });
});
