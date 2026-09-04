/**
 * market-prompt-slot.test.ts
 *
 * The defect these exist for cost a full day of market intelligence on
 * 2026-09-04, and — per the dead-letter table — 18 days before that.
 *
 * A step that fails pushes `{ step, status: 'error', error }` with no `output`
 * key, so a later step reading `stepResults.find(...)?.output` gets `undefined`.
 * `JSON.stringify(undefined)` returns the VALUE `undefined`, not a string, so
 * the `.slice(0, n)` applied at every such call site throws. In Auto Thesis
 * Generation that expression sits inside the prompt's template literal, so the
 * step died while building the string — before any model call — and the run
 * still reported `completed`.
 *
 * The first test is the negative control: it reproduces the exact production
 * TypeError against the old expression, so the rest of the file is demonstrably
 * testing a real failure rather than an imagined one.
 */

import { describe, it, expect } from 'vitest';
import { promptSlot, promptSlotObject, absentSlot } from '../../server/services/market-prompt-slot.js';

describe('the defect being fixed', () => {
  it('reproduces the production TypeError from the old expression', () => {
    const stepResults: Array<{ step: string; status: string; output?: unknown; error?: string }> = [
      // Exactly what market-workflow-orchestrator.ts:348 pushes on failure.
      { step: 'Signal Scanner', status: 'error', error: 'Step "Signal Scanner" timed out after 300000ms' },
    ];
    const signalOutput = stepResults.find((s) => s.step === 'Signal Scanner')?.output;

    // JSON.stringify(undefined) is the VALUE undefined, not the string "undefined".
    expect(JSON.stringify(signalOutput)).toBeUndefined();
    expect(() => JSON.stringify(signalOutput)!.slice(0, 1500)).toThrowError(
      /Cannot read properties of undefined \(reading 'slice'\)/,
    );

    // The guard turns the same input into a usable prompt slot.
    expect(() => promptSlot(signalOutput, 1500, 'Signal Scanner')).not.toThrow();
  });
});

describe('promptSlot', () => {
  it('renders a present value as truncated JSON', () => {
    expect(promptSlot({ summary: 'VIX elevated' }, 1000, 'Signal Scanner'))
      .toBe('{"summary":"VIX elevated"}');
  });

  it('truncates to the requested length', () => {
    const long = { summary: 'x'.repeat(500) };
    expect(promptSlot(long, 50, 'Signal Scanner')).toHaveLength(50);
  });

  it('names the missing producer instead of returning an empty string', () => {
    // This is the load-bearing choice. An empty slot reads to the model as a
    // statement about the MARKET — "the scan found nothing" — when the truth is
    // a statement about the PIPELINE. The model would then reason confidently
    // from an absence it believes is evidence.
    const rendered = promptSlot(undefined, 1500, 'Signal Scanner');
    expect(rendered).not.toBe('');
    expect(rendered).toContain('Signal Scanner');
    expect(rendered).toContain('unavailable');
    expect(rendered).toContain('missing rather than empty');
  });

  it('treats null the same as undefined', () => {
    // runTemplate returns `output: null` (not undefined) when a computation
    // fails, so null reaches these slots too — and would render as the bare
    // string "null", which a model cannot distinguish from a real value.
    expect(promptSlot(null, 100, 'Prediction Accuracy Stats')).toBe(absentSlot('Prediction Accuracy Stats'));
  });

  it('never throws on a circular structure', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => promptSlot(circular, 100, 'Compute Indicators')).not.toThrow();
    expect(promptSlot(circular, 100, 'Compute Indicators')).toBe(absentSlot('Compute Indicators'));
  });

  it('never throws when stringify yields undefined for a non-JSON value', () => {
    // The other way JSON.stringify declines to produce a string.
    expect(promptSlot(() => 1, 100, 'Signal Scanner')).toBe(absentSlot('Signal Scanner'));
    expect(promptSlot(Symbol('x'), 100, 'Signal Scanner')).toBe(absentSlot('Signal Scanner'));
  });

  it('renders falsy-but-real values rather than calling them absent', () => {
    // 0, false and '' are legitimate outputs; only undefined/null are absence.
    expect(promptSlot(0, 100, 'p')).toBe('0');
    expect(promptSlot(false, 100, 'p')).toBe('false');
    expect(promptSlot('', 100, 'p')).toBe('""');
  });
});

describe('promptSlotObject', () => {
  it('keeps a missing input visible instead of dropping the key', () => {
    // JSON.stringify({a: undefined}) omits `a` entirely. That is crash-safe and
    // therefore easy to miss: on 2026-09-04 all four consuls received
    // {"date":"2026-09-04"} with no indication two inputs were gone.
    const rendered = promptSlotObject({
      signals: { value: undefined, producer: 'Signal Scanner' },
      macroBrief: { value: undefined, producer: 'AI Macro Brief' },
      date: { value: '2026-09-04', producer: 'clock' },
    }, 6000);

    const parsed = JSON.parse(rendered) as Record<string, string>;
    expect(Object.keys(parsed).sort()).toEqual(['date', 'macroBrief', 'signals']);
    expect(parsed.signals).toContain('Signal Scanner');
    expect(parsed.macroBrief).toContain('AI Macro Brief');
    expect(parsed.date).toBe('2026-09-04');
  });

  it('negative control: the old object literal really did drop the keys', () => {
    const old = JSON.stringify({
      signals: undefined,
      macroBrief: undefined,
      date: '2026-09-04',
    });
    expect(old).toBe('{"date":"2026-09-04"}');
    expect(JSON.parse(old)).not.toHaveProperty('signals');
  });

  it('passes present values through unchanged', () => {
    const rendered = promptSlotObject({
      signals: { value: { summary: 'ok' }, producer: 'Signal Scanner' },
    }, 6000);
    expect(JSON.parse(rendered)).toEqual({ signals: { summary: 'ok' } });
  });

  it('truncates the whole blob to the cap', () => {
    const rendered = promptSlotObject({
      big: { value: { s: 'y'.repeat(9000) }, producer: 'p' },
    }, 500);
    expect(rendered).toHaveLength(500);
  });
});
