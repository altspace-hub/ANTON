/**
 * prompt-current-date.test.ts — every composed prompt tells the model what day it is.
 *
 * 2026-09-22. No layer of the composer carried the current date. The API engine never
 * sent one, and the subscription engine passes the composed prompt as a plain
 * `systemPrompt` string, which replaces Claude Code's default prompt — including the
 * environment block that normally carries the date. A module run left the model to
 * infer "now" from its training, which for a model trained to mid-2026 is BEFORE the
 * dates this catalogue turns on: Directive (EU) 2024/825 applies from 27 September
 * 2026, and the Cyber Resilience Act reporting duty from 11 September 2026.
 *
 * What this protects:
 *   1. The date is in the prompt, in both a readable and an ISO form, with a weekday.
 *   2. It is the LOCAL date, not UTC — around midnight the two differ, and ANTON is
 *      local-first, so the server's clock is the user's.
 *   3. It sits in the DYNAMIC half and never the static one, so the cached block is
 *      byte-identical from one day to the next. This is the property that matters
 *      for cost: a date in the static part would miss the prompt cache every midnight.
 *   4. It is the first dynamic part, so on the subscription engine — which sends
 *      static + dynamic as one string — the stable prefix still leads.
 */
import { describe, it, expect } from 'vitest';
import {
  composeSystemPromptParts,
  currentDateBlock,
  type PromptComposerConfig,
} from '../../server/services/prompt-composer.js';

const base: PromptComposerConfig = {
  creativity: 'balanced',
  thinking: 'think',
  // An override keeps the test independent of the module files on disk.
  systemPromptOverride: '## MODULE\nYou review environmental claims.',
  moduleId: 'green-claims-review',
  areaId: 'marketing',
};

/** The date the implementation SHOULD print for an instant: its local components. */
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('currentDateBlock', () => {
  it('states the date readably, as ISO, and with the weekday', () => {
    // Constructed from LOCAL components, so it is the 22nd wherever the test runs.
    const block = currentDateBlock(new Date(2026, 8, 22, 14, 0));
    expect(block).toContain('## CURRENT DATE');
    expect(block).toContain('Today is Tuesday 22 September 2026 (2026-09-22).');
  });

  it('tells the model to judge date-dependent rules against today, not its training', () => {
    const block = currentDateBlock(new Date(2026, 8, 22));
    expect(block).toMatch(/compare it against today, not against when your training ended/);
    expect(block).toMatch(/may already be in force/);
  });

  it('uses the LOCAL date around midnight, where it differs from UTC', () => {
    // The instants that matter are the ones either side of a local midnight. Whatever
    // the machine's timezone, the block must match the local calendar date — and on
    // any machine not on UTC, at least one of these differs from toISOString().
    const instants = [
      new Date(2026, 8, 27, 0, 30),   // 00:30 local on the day 2024/825 applies
      new Date(2026, 8, 26, 23, 30),  // 23:30 local the evening before
      new Date(2026, 8, 11, 0, 5),    // just after midnight on the CRA reporting date
    ];
    for (const d of instants) {
      expect(currentDateBlock(d), `local date for ${d.toString()}`).toContain(`(${localIso(d)})`);
    }
  });

  it('handles the turn of a month and a year', () => {
    expect(currentDateBlock(new Date(2026, 11, 31))).toContain('Thursday 31 December 2026 (2026-12-31)');
    expect(currentDateBlock(new Date(2027, 0, 1))).toContain('Friday 1 January 2027 (2027-01-01)');
    expect(currentDateBlock(new Date(2028, 1, 29))).toContain('Tuesday 29 February 2028 (2028-02-29)');
  });
});

describe('the composed prompt carries the date', () => {
  it('is in the full prompt of a module run', async () => {
    const r = await composeSystemPromptParts({ ...base, now: new Date(2026, 8, 28, 10, 0) });
    expect(r.full).toContain('Today is Monday 28 September 2026 (2026-09-28).');
    expect(r.parts.filter((p) => p.key === 'layer0_current_date')).toHaveLength(1);
  });

  it('defaults to the server clock when no instant is supplied', async () => {
    const before = new Date();
    const r = await composeSystemPromptParts(base);
    const after = new Date();
    // Either side of a midnight that falls during the call, one of these matches.
    const ok = [localIso(before), localIso(after)].some((iso) => r.full.includes(`(${iso})`));
    expect(ok, 'the composed prompt should carry today\'s local date').toBe(true);
  });

  it('is present on a plain chat with no module too', async () => {
    const r = await composeSystemPromptParts({
      creativity: 'balanced',
      thinking: 'quick',
      now: new Date(2026, 8, 22),
    });
    expect(r.full).toContain('(2026-09-22)');
  });
});

describe('the date never disturbs the prompt cache', () => {
  it('lives in the dynamic half and never the static one', async () => {
    const r = await composeSystemPromptParts({ ...base, now: new Date(2026, 8, 22) });
    const part = r.parts.find((p) => p.key === 'layer0_current_date');
    expect(part?.cacheable).toBe(false);
    expect(r.staticPart).not.toContain('CURRENT DATE');
    expect(r.staticPart).not.toContain('2026-09-22');
    expect(r.dynamicPart).toContain('2026-09-22');
  });

  it('leaves the cached block byte-identical from one day to the next', async () => {
    // The property that decides cost: on consecutive days, only the dynamic half moves.
    const monday = await composeSystemPromptParts({ ...base, now: new Date(2026, 8, 21) });
    const tuesday = await composeSystemPromptParts({ ...base, now: new Date(2026, 8, 22) });
    expect(tuesday.staticPart).toBe(monday.staticPart);
    expect(tuesday.dynamicPart).not.toBe(monday.dynamicPart);
  });

  it('is the first dynamic part, so the stable prefix leads on the single-string engine', async () => {
    const r = await composeSystemPromptParts({
      ...base,
      now: new Date(2026, 8, 22),
      userProfile: { name: 'Anna', role: 'Marketing lead', company: 'Nordbrand' },
    });
    const dynamicKeys = r.parts.filter((p) => !p.cacheable).map((p) => p.key);
    expect(dynamicKeys[0]).toBe('layer0_current_date');
    expect(r.full.indexOf('CURRENT DATE')).toBeGreaterThan(r.staticPart.length);
  });
});
