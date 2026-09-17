/**
 * GARCH and Kelly are only useful if they are actually reached. These pin the
 * wiring — that GARCH feeds the prediction prompt, and that Kelly sizes only
 * where there is enough resolved history to size against.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const orch = readFileSync(resolve(here, '../../../server/services/market-workflow-orchestrator.ts'), 'utf8');
const reb = readFileSync(resolve(here, '../../../server/services/market-index-rebalance-service.ts'), 'utf8');

describe('GARCH in the prediction path', () => {
  it('runs inside the weekly pulse, not as an unused template', () => {
    expect(orch).toMatch(/runTemplate\(\s*\n?\s*'garch_volatility'/);
    expect(orch).toMatch(/'weekly-pulse'/);
  });

  it('passes the derived returns, not the price series', () => {
    // Building `returns` and then handing the template `closes` anyway is the
    // failure this guards: it runs, produces a plausible number, and models the
    // price level instead of the variance. Assert the ARGUMENT, not just that
    // the array was constructed somewhere above it.
    const start = orch.indexOf('const returns: number[] = []');
    expect(start, 'returns must be derived, not assumed').toBeGreaterThan(-1);
    const body = orch.slice(start, start + 300);
    expect(body).toMatch(/closes\[i\] - prev\) \/ prev/);

    const callIdx = orch.indexOf("'garch_volatility'");
    const call = orch.slice(callIdx, callIdx + 160);
    expect(call).toMatch(/\{ returns, p: 1, q: 1 \}/);
    expect(call).not.toMatch(/returns: closes/);
    expect(call).not.toMatch(/returns: prices/);
  });

  it('reaches the prompt through quantContext', () => {
    const start = orch.indexOf("quantContext += `- GARCH");
    expect(start, 'GARCH output must be appended to the prompt context').toBeGreaterThan(-1);
    const line = orch.slice(start, start + 900);
    // Volatility is only actionable if the model is told what to do with it.
    expect(line).toMatch(/LOWER half/);
  });

  it('will not run on too short a series', () => {
    expect(orch).toMatch(/returns\.length >= 20/);
  });
});

describe('Kelly in shadow sizing', () => {
  it('runs inside the shadow rebalance', () => {
    expect(reb).toMatch(/runTemplate\('kelly_criterion'/);
    expect(reb).toMatch(/'shadow-rebalance'/);
  });

  it('refuses to size on too few resolved predictions', () => {
    // Kelly on a win rate estimated from two outcomes is a confident
    // instruction to bet the book.
    expect(reb).toMatch(/if \(n < 5\) \{[\s\S]{0,120}kelly = null; continue; \}/);
  });

  it('uses half Kelly, not full', () => {
    expect(reb).toMatch(/fraction_kelly: 0\.5/);
    expect(reb).toMatch(/suggestedFraction: out\.half_kelly/);
  });

  it('derives the win rate from resolved predictions on that symbol', () => {
    // Anchor inside the Kelly block: the file has several queries against
    // market_predictions and the first one is not this one.
    const kellyStart = reb.indexOf('Kelly sizing, recorded alongside');
    expect(kellyStart, 'Kelly block must exist').toBeGreaterThan(-1);
    const q = reb.slice(kellyStart, reb.indexOf("runTemplate('kelly_criterion'", kellyStart));
    expect(q).toMatch(/was_correct = 1/);
    expect(q).toMatch(/was_correct IS NOT NULL/);
    expect(q).toMatch(/target_symbol = \?/);
  });

  it('never lets a sizing failure cost the proposal', () => {
    // Sizing is advisory; the rebalance proposal is the thing being recorded.
    const start = reb.indexOf("runTemplate('kelly_criterion'");
    const after = reb.slice(start, start + 1800);
    expect(after).toMatch(/catch \{[\s\S]{0,200}kelly = null;/);
  });
});
