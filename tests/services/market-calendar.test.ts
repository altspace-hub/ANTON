/**
 * market-calendar.test.ts — the trading-day calendar, and the catch-up interaction
 * that is the whole reason it needed wiring in two places.
 *
 * ── What was wrong ───────────────────────────────────────────────────────────
 *
 * Every markets phase is cron'd `* * 1-5`, which excludes weekends and nothing else. On
 * Labor Day 2026-09-07 phase2-pre-open ran twenty-six minutes against a closed market
 * and produced no predictions, and phase3, phase5, phase6 and five intraday price
 * refreshes were queued to do the same. A holiday calendar already existed — privately,
 * inside market-backtest-runner.ts — so the SIMULATION path knew about holidays and the
 * live scheduler did not.
 *
 * ── The half that is easy to get wrong ───────────────────────────────────────
 *
 * Skipping in cron alone achieves nothing. The catch-up tick looks for slots that were
 * due and never claimed, so a few minutes after a deliberate skip it would find the
 * unclaimed slot and "rescue" exactly the run that was skipped on purpose — and the
 * skip would read as a scheduler bug rather than a decision. Hence `shouldRunOnSlot`
 * on the catch-up entry, and hence the second half of this file.
 *
 * ── The calendar ends ────────────────────────────────────────────────────────
 *
 * The list stops at 2026-12-25. The obvious `!HOLIDAYS.has(d)` would answer "trading
 * day" for every holiday after that and silently resume the waste, so the status is
 * reported as `unknown-year` instead. The scheduler's response is to RUN and warn:
 * a scheduler must fail OPEN, because running needlessly on ten days is a far smaller
 * harm than silently stopping a year of market-hours work. That is the opposite of the
 * fail-closed rule for a security guard, and the asymmetry is deliberate.
 */
import { describe, it, expect } from 'vitest';
import {
  isTradingDay, tradingDayStatus, toCalendarDate, US_MARKET_HOLIDAYS, CALENDAR_YEARS,
} from '../../server/services/market-calendar.js';
import { selectCatchUpPhase, type CatchUpEntry } from '../../server/services/market-schedule-slots.js';

describe('tradingDayStatus', () => {
  it('calls Labor Day 2026 a holiday — the day that prompted this', () => {
    expect(tradingDayStatus('2026-09-07')).toBe('holiday');
    expect(isTradingDay('2026-09-07')).toBe(false);
  });

  it('calls an ordinary Monday a trading day', () => {
    expect(tradingDayStatus('2026-09-14')).toBe('trading');
    expect(isTradingDay('2026-09-14')).toBe(true);
  });

  it('answers weekends without needing the calendar at all', () => {
    // Asserted separately because the weekend half must keep working past the end of
    // the holiday list — a Saturday is a Saturday in any year.
    expect(tradingDayStatus('2026-09-05')).toBe('weekend'); // Saturday
    expect(tradingDayStatus('2026-09-06')).toBe('weekend'); // Sunday
    expect(tradingDayStatus('2031-06-07')).toBe('weekend'); // far outside the calendar
  });

  it('says unknown-year past the end of the list rather than guessing', () => {
    // 2027-01-01 IS a holiday, and a naive !HOLIDAYS.has(d) would call it a trading day.
    expect(CALENDAR_YEARS.has(2027)).toBe(false);
    expect(tradingDayStatus('2027-01-01')).toBe('unknown-year');
  });

  it('fails OPEN on an unknown year — a scheduler must not stop a year of work', () => {
    expect(isTradingDay('2027-01-01')).toBe(true);
  });

  it('judges a Date by the New York day, not the server day', () => {
    // 23:00 CET on Labor Day is still 17:00 in New York. A slot at the end of the CET
    // evening must not roll into the next day and lose its holiday.
    expect(toCalendarDate(new Date('2026-09-07T21:00:00Z'))).toBe('2026-09-07');
    expect(tradingDayStatus(new Date('2026-09-07T21:00:00Z'))).toBe('holiday');
  });

  it('covers every holiday in the list as a non-trading day', () => {
    // Guards the whole set rather than the one date above, and would catch a typo'd
    // entry (a malformed date would fall through as 'trading').
    for (const d of US_MARKET_HOLIDAYS) {
      expect(['holiday', 'weekend'], `${d} was classed as a trading day`).toContain(tradingDayStatus(d));
    }
  });
});

describe('the catch-up does not rescue a slot that was never owed', () => {
  // Slots at 14:30 New York time; the entry is due and unclaimed, so without the
  // predicate the catch-up would run it.
  const unclaimed = async () => false;
  const entry = (over: Partial<CatchUpEntry> = {}): CatchUpEntry => ({
    expr: '30 14 * * 1-5',
    phase: 'phase2-pre-open',
    catchUpWithinMin: 240,
    ...over,
  });

  it('rescues a missed slot on a normal trading day', async () => {
    // The control: without this passing, the case below proves nothing — it would be
    // green because nothing is ever rescued.
    const now = new Date('2026-09-14T19:00:00Z'); // Monday, ~15:00 New York
    const res = await selectCatchUpPhase([entry()], now, 'America/New_York', unclaimed);
    expect(res.chosen, 'a genuinely missed slot was not rescued').not.toBeNull();
  });

  it('skips the same slot when the phase is session-bound and the day is a holiday', async () => {
    const now = new Date('2026-09-07T19:00:00Z'); // Labor Day, ~15:00 New York
    const res = await selectCatchUpPhase(
      [entry({ shouldRunOnSlot: (slot) => isTradingDay(slot) })],
      now, 'America/New_York', unclaimed);

    expect(res.chosen, 'the catch-up rescued a run that cron skipped on purpose').toBeNull();
    expect(res.skippedNotOwed.map((s) => s.phase)).toEqual(['phase2-pre-open']);
  });

  it('still rescues a phase that is NOT session-bound on the same holiday', async () => {
    // News and extraction keep running on a holiday: the world does not stop publishing
    // because the NYSE is shut. Marking every phase market-hours-only would be the
    // over-correction, and this is what would catch it.
    const now = new Date('2026-09-07T19:00:00Z');
    const res = await selectCatchUpPhase(
      [entry({ phase: 'news-fetch' })], now, 'America/New_York', unclaimed);

    expect(res.chosen?.entry.phase).toBe('news-fetch');
    expect(res.skippedNotOwed).toEqual([]);
  });

  it('reports the skip rather than dropping it silently', async () => {
    // A silent skip is indistinguishable from a scheduler that failed to fire, which is
    // the exact ambiguity the slot work was done to remove.
    const now = new Date('2026-09-07T19:00:00Z');
    const res = await selectCatchUpPhase(
      [entry({ shouldRunOnSlot: (slot) => isTradingDay(slot) })],
      now, 'America/New_York', unclaimed);

    expect(res.skippedNotOwed).toHaveLength(1);
    expect(res.skippedNotOwed[0].slot).toBeInstanceOf(Date);
  });
});
