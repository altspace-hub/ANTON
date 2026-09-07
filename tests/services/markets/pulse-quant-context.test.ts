/**
 * pulse-quant-context.test.ts
 *
 * The weekly pulse builds a "QUANTITATIVE INDICATORS" block for its prompt. It
 * never reached a single prompt.
 *
 * The line read `JSON.stringify(mo.macd).slice(0, 200)`. momentum_indicators
 * returns no `macd` key — it returns rsi, rsi_signal, bollinger,
 * rate_of_change and stochastic — so JSON.stringify returned the VALUE
 * undefined and .slice() threw. The throw landed in an enclosing
 * `catch { /* non-fatal — quant context is enrichment *\/ }`, so quantContext
 * stayed empty, no error surfaced, and every prediction this system has ever
 * made was formed with no indicator context at all.
 *
 * It also swallowed the GARCH block added on 2026-08-20, which sat after it:
 * a feature wired in, typechecked, unit-tested, and dead on arrival because an
 * unrelated line above it threw.
 *
 * These tests run the real template and assert against its real output.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createMarketComputationService } from '../../../server/services/market-computation-service.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

const db = { run: async () => undefined, get: async () => undefined, all: async () => [] } as unknown as DatabaseAdapter;
const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../server/services/market-workflow-orchestrator.ts'),
  'utf8',
);

let svc: Awaited<ReturnType<typeof createMarketComputationService>>;
beforeAll(async () => { svc = await createMarketComputationService(db); });

/** A rising series with enough points for both templates. */
const closes = Array.from({ length: 30 }, (_, i) => 700 + Math.sin(i / 3) * 25 + i * 1.5);

describe('momentum_indicators output contract', () => {
  it('does not return the macd key the pulse used to read', async () => {
    const r = await svc.runTemplate('momentum_indicators', { prices: closes }, 'contract-test');
    expect(r.success).toBe(true);
    const mo = r.output as Record<string, unknown>;
    expect(mo.macd, 'if macd ever returns, the reader should be revisited deliberately').toBeUndefined();
  });

  it('returns the fields the pulse now reads', async () => {
    const r = await svc.runTemplate('momentum_indicators', { prices: closes }, 'contract-test');
    const mo = r.output as Record<string, unknown>;
    expect(typeof mo.rsi).toBe('number');
    expect(typeof mo.rate_of_change).toBe('number');
    expect(mo.bollinger).toBeTypeOf('object');
    expect(mo.stochastic).toBeTypeOf('object');
  });
});

describe('quant context formatting', () => {
  /** The formatter as the pulse now applies it. */
  function format(mo: Record<string, unknown>): string {
    const m = mo as {
      rsi?: number; rsi_signal?: string; rate_of_change?: number;
      bollinger?: { pct_b?: number; width?: number };
      stochastic?: { k?: number; d?: number; signal?: string };
    };
    const n = (v: unknown, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : 'N/A');
    return [
      `- RSI(14): ${n(m.rsi)}${m.rsi_signal ? ` (${m.rsi_signal})` : ''}`,
      `- Rate of change: ${n(m.rate_of_change, 2)}%`,
      `- Bollinger %B: ${n(m.bollinger?.pct_b, 2)} (band width ${n(m.bollinger?.width, 3)})`,
      `- Stochastic: %K ${n(m.stochastic?.k)} / %D ${n(m.stochastic?.d)}${m.stochastic?.signal ? ` (${m.stochastic.signal})` : ''}`,
    ].join('\n');
  }

  it('produces real numbers from a real template run', async () => {
    const r = await svc.runTemplate('momentum_indicators', { prices: closes }, 'contract-test');
    const out = format(r.output as Record<string, unknown>);
    expect(out).toMatch(/RSI\(14\): \d/);
    expect(out).not.toMatch(/N\/A/);
  });

  it('cannot throw when a field is missing', () => {
    // The exact failure: a formatter that assumes a key is present.
    expect(() => format({})).not.toThrow();
    expect(format({})).toMatch(/N\/A/);
  });
});

describe('the pulse no longer swallows this', () => {
  it('reads only fields the template actually returns', () => {
    const start = src.indexOf("runTemplate('momentum_indicators', { prices: closes }, 'weekly-pulse')");
    const block = src.slice(start, start + 1800);
    expect(block).not.toMatch(/JSON\.stringify\(\(mo as \{ macd/);
    expect(block).not.toMatch(/\.macd\)\.slice/);
    expect(block).toMatch(/rate_of_change/);
    expect(block).toMatch(/bollinger/);
  });

  it('isolates GARCH so a momentum failure cannot skip it', () => {
    const momIdx = src.indexOf("runTemplate('momentum_indicators', { prices: closes }, 'weekly-pulse')");
    const garchIdx = src.indexOf("'garch_volatility'", momIdx);
    const between = src.slice(momIdx, garchIdx);
    expect(between, 'GARCH must sit inside its own try').toMatch(/try \{/);
  });

  it('says something when the context comes out empty', () => {
    // Silence is what let this run for months.
    expect(src).toMatch(/quant context is EMPTY/);
    expect(src).toMatch(/console\.warn\('\[weekly-pulse\] GARCH context failed:/);
  });
});
