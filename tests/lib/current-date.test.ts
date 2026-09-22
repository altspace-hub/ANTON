/**
 * current-date.test.ts — the shared date block and the helpers both routers use.
 *
 * See server/lib/current-date.ts. The properties here are the ones a caller relies
 * on without looking: the date lands at the END (so a cached prefix is untouched),
 * it is never stated twice, and an opt-out really does leave the prompt byte-exact.
 */
import { describe, it, expect } from 'vitest';
import {
  CURRENT_DATE_HEADING,
  appendCurrentDate,
  currentDateBlock,
  hasCurrentDate,
  withCurrentDate,
} from '../../server/lib/current-date.js';

const TUESDAY = new Date(2026, 8, 22, 9, 0);   // local components: the 22nd everywhere
const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

describe('appendCurrentDate', () => {
  it('appends the block at the END, leaving the original prompt as an exact prefix', () => {
    const system = 'You are the hardware photo identifier.\nReturn JSON.';
    const out = appendCurrentDate(system, TUESDAY);
    expect(out.startsWith(system)).toBe(true);
    expect(out.endsWith(currentDateBlock(TUESDAY))).toBe(true);
    expect(out).toContain('Today is Tuesday 22 September 2026 (2026-09-22).');
  });

  it('separates the block from the prompt with the composer\'s own separator', () => {
    expect(appendCurrentDate('sys', TUESDAY)).toBe(`sys\n\n---\n\n${currentDateBlock(TUESDAY)}`);
  });

  it('is idempotent — a prompt that already states the date is returned unchanged', () => {
    const once = appendCurrentDate('sys', TUESDAY);
    expect(appendCurrentDate(once, new Date(2027, 0, 1))).toBe(once);
    expect(count(appendCurrentDate(once, TUESDAY), CURRENT_DATE_HEADING)).toBe(1);
  });

  it('gives an empty prompt just the block', () => {
    expect(appendCurrentDate('', TUESDAY)).toBe(currentDateBlock(TUESDAY));
    expect(appendCurrentDate('   \n', TUESDAY)).toBe(currentDateBlock(TUESDAY));
  });
});

describe('hasCurrentDate', () => {
  it('recognises the heading and nothing else', () => {
    expect(hasCurrentDate(currentDateBlock(TUESDAY))).toBe(true);
    expect(hasCurrentDate('Today is a good day to review the policy.')).toBe(false);
    expect(hasCurrentDate(undefined)).toBe(false);
    expect(hasCurrentDate(null)).toBe(false);
  });
});

describe('withCurrentDate — what both routers apply at their entry points', () => {
  it('adds the date to `system`', () => {
    const out = withCurrentDate({ system: 'sys' }, TUESDAY);
    expect(out.system).toContain('(2026-09-22)');
  });

  it('never touches `staticSystemPrompt`, the cached half', () => {
    const cfg = { system: 'dynamic', staticSystemPrompt: 'STATIC BLOCK' };
    const out = withCurrentDate(cfg, TUESDAY);
    expect(out.staticSystemPrompt).toBe('STATIC BLOCK');
    expect(out.system).toContain('CURRENT DATE');
  });

  it('defers to a date already in the dynamic half (a composed Work run)', () => {
    const composed = { system: `${currentDateBlock(TUESDAY)}\n\n---\n\n## PROFILE` };
    expect(withCurrentDate(composed, new Date(2030, 0, 1))).toBe(composed);
  });

  it('defers to a date already in the static half too', () => {
    const cfg = { system: 'dynamic', staticSystemPrompt: `prefix\n\n${currentDateBlock(TUESDAY)}` };
    expect(withCurrentDate(cfg, TUESDAY)).toBe(cfg);
  });

  it('returns the config untouched when the caller opts out, for byte-exact replay', () => {
    const stored = { system: 'the stored prompt, exactly as the original run sent it', currentDate: false };
    const out = withCurrentDate(stored, TUESDAY);
    expect(out).toBe(stored);
    expect(out.system).toBe('the stored prompt, exactly as the original run sent it');
  });

  it('does not mutate the caller\'s object', () => {
    const cfg = { system: 'sys' };
    withCurrentDate(cfg, TUESDAY);
    expect(cfg.system).toBe('sys');
  });
});
