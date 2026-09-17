/**
 * market-calendar.ts — which days the US market actually trades.
 *
 * ── Why this is a module and not a constant ──────────────────────────────────
 *
 * The list below already existed, privately, inside market-backtest-runner.ts. So the
 * SIMULATION path knew about market holidays and the LIVE scheduler did not: every
 * markets phase is cron'd `* * 1-5`, which excludes weekends and nothing else. On
 * 2026-09-07 (Labor Day) phase2-pre-open ran for twenty-six minutes against a market
 * that never opened and produced no predictions, because there was no new price data to
 * predict against — and phase3, phase5, phase6 and five intraday price refreshes were
 * queued to do the same.
 *
 * Roughly nine or ten holidays a year, times the session-bound phases. The fix is not
 * new knowledge; it is giving the live path the knowledge the backtester already had.
 *
 * ── The part that needs care: the calendar runs out ──────────────────────────
 *
 * A hardcoded holiday list has an end date. This one stops at 2026-12-25, and the
 * obvious implementation — `!HOLIDAYS.has(d)` — quietly answers "trading day" for every
 * holiday after that, resuming the waste with no signal. `tradingDayStatus` reports
 * `unknown-year` instead, so a caller can decide rather than be misled.
 *
 * The scheduler's decision, made in server/index.ts, is to RUN on an unknown year. A
 * scheduler must fail open: running a phase needlessly on ten days costs some tokens,
 * whereas failing closed would silently stop the market-hours work for an entire year.
 * That is the opposite of the fail-closed rule for a security guard, and deliberately so
 * — the question here is "should this work happen", not "may this caller do it".
 */

/**
 * NYSE/Nasdaq full-day closures. Half-days (the 1pm closes around Thanksgiving and
 * Christmas) are NOT here: the market does trade, and a phase that runs against a short
 * session is producing real if thinner data.
 *
 * Lifted verbatim from market-backtest-runner.ts, which now imports it, so the
 * simulation and the live scheduler can no longer disagree about what a trading day is.
 */
export const US_MARKET_HOLIDAYS: ReadonlySet<string> = new Set([
  '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27', '2024-06-19', '2024-07-04', '2024-09-02', '2024-11-28', '2024-12-25',
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26', '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
]);

/** Years the list above actually covers. Outside these, it knows nothing. */
export const CALENDAR_YEARS: ReadonlySet<number> = new Set([2024, 2025, 2026]);

export type TradingDayStatus = 'trading' | 'weekend' | 'holiday' | 'unknown-year';

/** `YYYY-MM-DD` for a date, in the market's own terms rather than the server's locale. */
export function toCalendarDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  // en-CA renders ISO-shaped dates, and the timeZone keeps a 23:00 CET slot from
  // rolling into tomorrow — the scheduler's slots are New York-relative.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/**
 * Why a date is or is not a trading day.
 *
 * Reports `unknown-year` rather than guessing past the end of the list — see the header.
 * Weekends are answered before the year check, because Saturday is Saturday in any year
 * and that half needs no calendar.
 */
export function tradingDayStatus(d: Date | string): TradingDayStatus {
  const date = toCalendarDate(d);
  // Parsed as UTC noon so a timezone offset cannot shift the weekday.
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (day === 0 || day === 6) return 'weekend';
  const year = Number(date.slice(0, 4));
  if (!CALENDAR_YEARS.has(year)) return 'unknown-year';
  return US_MARKET_HOLIDAYS.has(date) ? 'holiday' : 'trading';
}

/**
 * True when the market trades — and, past the end of the calendar, when it PROBABLY
 * does. Callers that need to distinguish the two should use `tradingDayStatus`.
 */
export function isTradingDay(d: Date | string): boolean {
  const status = tradingDayStatus(d);
  return status === 'trading' || status === 'unknown-year';
}
