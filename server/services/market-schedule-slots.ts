/**
 * market-schedule-slots.ts
 * Turns a cron expression into the instant of its most recent due slot.
 *
 * 2026-09-03: three markets phases had gone dark — phase1-morning-intelligence
 * last fired 09-02 07:00, phase4-midday-intelligence 09-01 18:00,
 * phase6-post-market 09-01 23:00 — while their neighbours ran normally. That
 * framing was itself misleading: those three fire once a day, so one lost slot
 * makes their "last run" look ancient, while intraday-price-refresh recovers
 * its timestamp five times a day. Counted properly, 12 of 54 due slots were
 * missed over four days and EIGHT of the ten phases lost at least one.
 *
 * The misses cluster by time, not by phase. The decisive control: 18:00 is
 * claimed by two separate registrations (phase4 and intraday-price-refresh),
 * and they are co-fated on all four days — no per-phase defect can do that.
 *
 * Causes, in descending order of certainty:
 *
 *   1. The host froze. Windows Modern Standby 09-02 16:30:23 -> 19:08:27
 *      (Kernel-Power 506/507) took that day's 18:00; the 25H2 update reboots
 *      took 09-03's. Modern Standby is not governed by the lid-close and
 *      idle-sleep settings, so finding those correct proves nothing.
 *   2. node-cron 4.2.1 never replays a missed slot. Its runner advances past
 *      any occurrence whose timer callback lands even a second late and then
 *      matches on the exact second, leaving only a console warning.
 *   3. Six misses remain unexplained: 09-02 12:30, 14:00, 14:30, 15:00, 15:45
 *      and 09-03 07:00 all happened while an independent 30-minute node-cron
 *      heartbeat in the same process fired within 290 ms of those very minutes,
 *      and the markets phases left no rows, no fetches and no atoms.
 *
 * The point of this module is that the fix must not depend on resolving (3).
 * Asking "what slot was due, and has it run?" on a plain setInterval is correct
 * whether the cause is a suspend, a dropped timer, a restart straddling the
 * slot, or something still unidentified — all of them present as an unclaimed
 * slot. It is the conclusion the free half of the loop already reached on
 * 2026-08-21 ("stop asking is it 12:00 and start asking is there outstanding
 * work"), applied to the spending half, which was left on wall-clock cron and
 * is the half that generates predictions.
 *
 * Deliberately a narrow cron subset: a single minute, an hour list or range,
 * and a day-of-week list or range. That covers every markets expression, and
 * an expression outside it throws rather than being silently mis-scheduled —
 * the caller then leaves that phase on cron alone rather than guessing at its
 * schedule.
 */

/** A cron expression reduced to the fields this scheduler actually uses. */
export interface ParsedSchedule {
  /** Minute of the hour, 0-59. */
  minute: number;
  /** Hours of the day the job runs, ascending, 0-23. */
  hours: number[];
  /** Days of week the job runs, ascending, 0-6 with Sunday = 0. */
  daysOfWeek: number[];
}

const MINUTE_MS = 60_000;

/** Expand `*`, `a`, `a,b`, `a-b` (and combinations) into a sorted unique list. */
function expandField(field: string, min: number, max: number, label: string): number[] {
  if (field === '*') {
    const all: number[] = [];
    for (let v = min; v <= max; v++) all.push(v);
    return all;
  }
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from < min || to > max || from > to) throw new Error(`unsupported ${label} range "${part}"`);
      for (let v = from; v <= to; v++) out.add(v);
      continue;
    }
    if (!/^\d+$/.test(part)) throw new Error(`unsupported ${label} value "${part}"`);
    const v = Number(part);
    if (v < min || v > max) throw new Error(`${label} value ${v} out of range ${min}-${max}`);
    out.add(v);
  }
  if (out.size === 0) throw new Error(`empty ${label} field`);
  return [...out].sort((a, b) => a - b);
}

/**
 * Parse the supported cron subset. Throws on anything outside it — including
 * step values (`*​/5`) and day-of-month constraints — so an expression this
 * module cannot reason about can never produce a wrong "due" answer.
 */
export function parseSchedule(expr: string): ParsedSchedule {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`expected 5 cron fields, got ${fields.length} in "${expr}"`);
  }
  const [minuteField, hourField, domField, monthField, dowField] = fields;

  if (!/^\d+$/.test(minuteField)) throw new Error(`only a single literal minute is supported, got "${minuteField}"`);
  const minute = Number(minuteField);
  if (minute < 0 || minute > 59) throw new Error(`minute ${minute} out of range`);

  if (domField !== '*') throw new Error(`day-of-month constraints are not supported, got "${domField}"`);
  if (monthField !== '*') throw new Error(`month constraints are not supported, got "${monthField}"`);

  const hours = expandField(hourField, 0, 23, 'hour');
  // cron allows both 0 and 7 for Sunday; normalise 7 to 0 before validating.
  const dowRaw = expandField(dowField, 0, 7, 'day-of-week');
  const daysOfWeek = [...new Set(dowRaw.map((d) => (d === 7 ? 0 : d)))].sort((a, b) => a - b);

  return { minute, hours, daysOfWeek };
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The wall-clock reading in `timeZone` at a given instant. */
function wallClockAt(instantMs: number, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(new Date(instantMs));
  const field = (type: string): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  return {
    year: field('year'),
    month: field('month'),
    day: field('day'),
    hour: field('hour'),
    minute: field('minute'),
  };
}

/** Offset of `timeZone` at `instantMs`, in ms (local minus UTC). */
function offsetMsAt(instantMs: number, timeZone: string): number {
  const w = wallClockAt(instantMs, timeZone);
  const asIfUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return asIfUtc - Math.floor(instantMs / MINUTE_MS) * MINUTE_MS;
}

/**
 * The instant at which `timeZone` reads the given wall-clock time, or null when
 * that reading does not exist (the hour skipped by a spring-forward).
 *
 * Evaluating real instants rather than doing arithmetic on local time is what
 * makes this DST-correct: the offset is measured at the candidate instant, then
 * re-measured once in case the first guess landed on the far side of a
 * transition, and the result is only accepted if it reads back exactly.
 */
export function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number | null {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let instant = wall - offsetMsAt(wall, timeZone);
  instant = wall - offsetMsAt(instant, timeZone);
  const back = wallClockAt(instant, timeZone);
  if (
    back.year !== year || back.month !== month || back.day !== day ||
    back.hour !== hour || back.minute !== minute
  ) {
    return null;
  }
  return instant;
}

/**
 * The most recent instant at or before `now` at which `schedule` was due, or
 * null if there is none within `lookbackMinutes`.
 *
 * Candidates are generated newest-first, so the first match is the answer and
 * the walk stops as soon as it passes the lookback horizon. A slot whose local
 * time does not exist (spring-forward) is skipped rather than approximated.
 */
export function previousSlot(
  schedule: ParsedSchedule,
  now: Date,
  timeZone: string,
  lookbackMinutes: number,
): Date | null {
  const nowMs = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS;
  const horizonMs = nowMs - lookbackMinutes * MINUTE_MS;
  const hoursDescending = [...schedule.hours].sort((a, b) => b - a);
  // One extra day so a lookback that ends mid-day still reaches the day before.
  const daysToWalk = Math.ceil(lookbackMinutes / 1440) + 1;

  for (let dayOffset = 0; dayOffset <= daysToWalk; dayOffset++) {
    // Step back a whole day at a time from the local calendar date of `now`.
    // Probing at local noon keeps the date arithmetic clear of DST edges, which
    // move clocks by an hour at most.
    const local = wallClockAt(nowMs, timeZone);
    const dateProbe = Date.UTC(local.year, local.month - 1, local.day) - dayOffset * 86_400_000;
    const probe = new Date(dateProbe);
    const year = probe.getUTCFullYear();
    const month = probe.getUTCMonth() + 1;
    const day = probe.getUTCDate();
    const dayOfWeek = probe.getUTCDay();

    if (!schedule.daysOfWeek.includes(dayOfWeek)) continue;

    for (const hour of hoursDescending) {
      const instant = zonedTimeToInstant(year, month, day, hour, schedule.minute, timeZone);
      if (instant === null) continue; // local time does not exist on this date
      if (instant > nowMs) continue; // still in the future
      if (instant < horizonMs) return null; // past the horizon, and only older follows
      return new Date(instant);
    }
  }
  return null;
}

/**
 * Convenience wrapper: parse and resolve in one call. Returns null when the
 * expression is outside the supported subset, so a caller can fall back to
 * leaving the phase on cron alone instead of failing.
 */
export function previousSlotFor(
  expr: string,
  now: Date,
  timeZone: string,
  lookbackMinutes: number,
): Date | null {
  let schedule: ParsedSchedule;
  try {
    schedule = parseSchedule(expr);
  } catch {
    return null;
  }
  return previousSlot(schedule, now, timeZone, lookbackMinutes);
}

/** One registered phase, as the catch-up tick sees it. */
export interface CatchUpEntry {
  expr: string;
  phase: string;
  /** How stale a missed slot may be and still be worth running, in minutes. */
  catchUpWithinMin: number;
  /** Optional: has this phase's work already happened by another route? */
  alreadyDone?: () => Promise<boolean>;
}

export interface CatchUpSelection<T extends CatchUpEntry = CatchUpEntry> {
  /** The single phase to run on this tick, or null when nothing is due. */
  chosen: { entry: T; slot: Date } | null;
  /** Missed slots whose work had already happened, so they were not run. */
  skippedAlreadyDone: Array<{ phase: string; slot: Date }>;
  /** Overdue phases left for later ticks (one is run per tick, deliberately). */
  alsoOverdue: number;
}

/**
 * Decide what, if anything, the catch-up tick should run.
 *
 * Split out of the scheduler for the same reason the recorder was: the
 * scheduler cannot be exercised in a test, and this is the part with the
 * judgement in it. Everything here is decided from injected inputs — the
 * clock, the claim check, the already-done predicate — so the whole decision
 * table can be pinned without a cron, a server or a real clock.
 *
 * Exactly one phase is returned per tick. A machine that wakes to several
 * overdue phases would otherwise start them together, and the SDK engine caps
 * concurrency at 2 and throws over the cap, so a stampede would not merely be
 * expensive — it would fail. Oldest slot first, so a backlog drains in the
 * order it accumulated.
 */
export async function selectCatchUpPhase<T extends CatchUpEntry>(
  entries: readonly T[],
  now: Date,
  timeZone: string,
  isSlotClaimed: (phase: string, slot: Date) => Promise<boolean>,
): Promise<CatchUpSelection<T>> {
  const skippedAlreadyDone: Array<{ phase: string; slot: Date }> = [];
  const overdue: Array<{ entry: T; slot: Date }> = [];

  for (const entry of entries) {
    const slot = previousSlotFor(entry.expr, now, timeZone, entry.catchUpWithinMin);
    // Either nothing has been due yet, or the newest due slot is old enough
    // that redoing it buys nothing.
    if (!slot) continue;
    if (await isSlotClaimed(entry.phase, slot)) continue;
    if (entry.alreadyDone && (await entry.alreadyDone())) {
      skippedAlreadyDone.push({ phase: entry.phase, slot });
      continue;
    }
    overdue.push({ entry, slot });
  }

  if (overdue.length === 0) return { chosen: null, skippedAlreadyDone, alsoOverdue: 0 };
  overdue.sort((a, b) => a.slot.getTime() - b.slot.getTime());
  return { chosen: overdue[0], skippedAlreadyDone, alsoOverdue: overdue.length - 1 };
}
