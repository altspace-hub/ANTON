/**
 * market-schedule-slots.test.ts
 *
 * Pins the slot arithmetic the spending-phase catch-up depends on.
 *
 * The incident these exist for: over 2026-08-31..09-03, 12 of 54 due slots
 * never fired. Four are explained by the host freezing (Modern Standby
 * 09-02 16:30->19:08, then the 25H2 update reboots) and node-cron never
 * replaying a slot it missed. The other six — 09-02 12:30, 14:00, 14:30,
 * 15:00, 15:45 and 09-03 07:00 — happened while an independent 30-minute
 * node-cron heartbeat in the same process fired within 290 ms of those exact
 * minutes, and remain unexplained.
 *
 * The catch-up that fixes it asks "what slot was due, and did it run?", which
 * is cause-agnostic by construction. So if this arithmetic is wrong the repair
 * is worse than the bug, either re-running phases that already ran or staying
 * quiet while they are missed.
 *
 * Europe/Stockholm throughout, because that is MARKET_TZ and because a
 * summer/winter offset change is exactly where naive local-time arithmetic
 * breaks.
 */

import { describe, it, expect } from 'vitest';
import {
  parseSchedule,
  previousSlot,
  previousSlotFor,
  selectCatchUpPhase,
  zonedTimeToInstant,
  type CatchUpEntry,
} from '../../server/services/market-schedule-slots.js';

const TZ = 'Europe/Stockholm';

/** The ten markets expressions actually registered in server/index.ts. */
const REAL_EXPRESSIONS = [
  '0 7 * * 1-5',            // phase1-morning-intelligence
  '30 14 * * 1-5',          // phase2-pre-open
  '45 15 * * 1-5',          // phase3-market-open
  '0 18 * * 1-5',           // phase4-midday-intelligence
  '15 22 * * 1-5',          // phase5-market-close (NAV)
  '0 23 * * 1-5',           // phase6-post-market
  '0 10 * * 6,0',           // phase7-weekend-deep-dive
  '0 9 * * 1,4',            // phase8-weekly-pulse
  '0 14,16,18,20,22 * * 1-5', // intraday-price-refresh
  '30 12 * * 1-5',          // midday-extraction-topup
  '0 8,15,21 * * 1-5',      // news-fetch
];

describe('parseSchedule', () => {
  it('parses every expression the markets scheduler actually registers', () => {
    for (const expr of REAL_EXPRESSIONS) {
      expect(() => parseSchedule(expr), expr).not.toThrow();
    }
  });

  it('expands hour lists and day-of-week ranges', () => {
    expect(parseSchedule('0 14,16,18,20,22 * * 1-5')).toEqual({
      minute: 0,
      hours: [14, 16, 18, 20, 22],
      daysOfWeek: [1, 2, 3, 4, 5],
    });
  });

  it('treats cron day-of-week 7 as Sunday, without duplicating 0', () => {
    expect(parseSchedule('0 10 * * 0,6,7').daysOfWeek).toEqual([0, 6]);
  });

  it('refuses expressions it cannot reason about rather than guessing', () => {
    // A wrong "due" answer is worse than no answer: it would either re-run a
    // phase that already ran or mask one that never did.
    expect(() => parseSchedule('*/5 * * * *')).toThrow();      // step values
    expect(() => parseSchedule('0 7 1 * *')).toThrow();        // day-of-month
    expect(() => parseSchedule('0 7 * 3 *')).toThrow();        // month
    expect(() => parseSchedule('0 7 * *')).toThrow();          // too few fields
    expect(() => parseSchedule('0-5 7 * * *')).toThrow();      // minute range
    expect(() => parseSchedule('0 25 * * *')).toThrow();       // hour out of range
  });

  it('previousSlotFor returns null instead of throwing on an unsupported expression', () => {
    expect(previousSlotFor('*/5 * * * *', new Date('2026-09-03T09:30:00+02:00'), TZ, 1440)).toBeNull();
  });
});

describe('previousSlot', () => {
  const at = (iso: string): Date => new Date(iso);

  it('finds the slot earlier the same day', () => {
    // Thursday 2026-09-03, 09:30 local. phase1 is due at 07:00.
    const slot = previousSlot(parseSchedule('0 7 * * 1-5'), at('2026-09-03T09:30:00+02:00'), TZ, 6 * 60);
    expect(slot?.toISOString()).toBe('2026-09-03T05:00:00.000Z'); // 07:00 +02:00
  });

  it('is the exact regression from the incident: 07:00 due, checked at 09:30, never ran', () => {
    // phase1-morning-intelligence did not fire on 2026-09-03 while the host was
    // awake. A catch-up tick at 09:30 must identify 07:00 that day as the due
    // slot — not the previous day's, which would double-count.
    const slot = previousSlot(parseSchedule('0 7 * * 1-5'), at('2026-09-03T09:30:00+02:00'), TZ, 6 * 60);
    expect(slot?.toISOString()).toBe('2026-09-03T05:00:00.000Z');
    expect(slot?.toISOString()).not.toBe('2026-09-02T05:00:00.000Z');
  });

  it('picks the newest matching hour from a list', () => {
    // intraday runs 14,16,18,20,22; at 19:05 the due slot is 18:00, not 20:00.
    const slot = previousSlot(
      parseSchedule('0 14,16,18,20,22 * * 1-5'),
      at('2026-09-03T19:05:00+02:00'),
      TZ,
      6 * 60,
    );
    expect(slot?.toISOString()).toBe('2026-09-03T16:00:00.000Z'); // 18:00 +02:00
  });

  it('does not return a slot that has not happened yet', () => {
    // 06:00 local, before the 07:00 slot: the newest due slot is the day before.
    const slot = previousSlot(parseSchedule('0 7 * * 1-5'), at('2026-09-03T06:00:00+02:00'), TZ, 48 * 60);
    expect(slot?.toISOString()).toBe('2026-09-02T05:00:00.000Z');
  });

  it('skips days the expression excludes', () => {
    // Sunday 2026-09-06, 12:00. A Mon-Fri job's last slot is Friday the 4th.
    const slot = previousSlot(parseSchedule('0 7 * * 1-5'), at('2026-09-06T12:00:00+02:00'), TZ, 5 * 1440);
    expect(slot?.toISOString()).toBe('2026-09-04T05:00:00.000Z');
  });

  it('handles a weekend-only expression', () => {
    // phase7 runs Sat+Sun 10:00. Checked Monday 2026-09-07 09:00 -> Sunday the 6th.
    const slot = previousSlot(parseSchedule('0 10 * * 6,0'), at('2026-09-07T09:00:00+02:00'), TZ, 3 * 1440);
    expect(slot?.toISOString()).toBe('2026-09-06T08:00:00.000Z'); // 10:00 +02:00
  });

  it('returns null when the newest due slot is older than the lookback horizon', () => {
    // This is the guard that stops a machine woken at midnight from firing a
    // stale morning phase. 07:00 due, checked at 20:00, 6h window -> too old.
    const slot = previousSlot(parseSchedule('0 7 * * 1-5'), at('2026-09-03T20:00:00+02:00'), TZ, 6 * 60);
    expect(slot).toBeNull();
  });

  it('returns the slot when it is inside the horizon', () => {
    const slot = previousSlot(parseSchedule('0 7 * * 1-5'), at('2026-09-03T12:30:00+02:00'), TZ, 6 * 60);
    expect(slot?.toISOString()).toBe('2026-09-03T05:00:00.000Z');
  });
});

describe('daylight saving', () => {
  // Europe/Stockholm: +02:00 in summer, +01:00 in winter. DST ends on the last
  // Sunday of October (2026-10-25, 03:00 -> 02:00) and resumes on the last
  // Sunday of March (2027-03-28, 02:00 -> 03:00).

  it('resolves a slot to the right instant on either side of the autumn change', () => {
    // Friday 2026-10-23 is still summer time: 22:15 local = 20:15Z.
    const summer = previousSlot(
      parseSchedule('15 22 * * 1-5'),
      new Date('2026-10-23T23:00:00+02:00'),
      TZ,
      6 * 60,
    );
    expect(summer?.toISOString()).toBe('2026-10-23T20:15:00.000Z');

    // Monday 2026-10-26 is winter time: the same 22:15 local = 21:15Z.
    const winter = previousSlot(
      parseSchedule('15 22 * * 1-5'),
      new Date('2026-10-26T23:00:00+01:00'),
      TZ,
      6 * 60,
    );
    expect(winter?.toISOString()).toBe('2026-10-26T21:15:00.000Z');
  });

  it('keeps the local hour fixed across the change rather than the UTC hour', () => {
    // The point of doing this in the zone: a job scheduled at 07:00 local must
    // stay at 07:00 local, which is a DIFFERENT UTC instant in the two halves
    // of the year. Naive UTC arithmetic drifts by an hour every autumn.
    const before = previousSlot(parseSchedule('0 7 * * 1-5'), new Date('2026-10-23T08:00:00+02:00'), TZ, 60 * 6);
    const after = previousSlot(parseSchedule('0 7 * * 1-5'), new Date('2026-10-26T08:00:00+01:00'), TZ, 60 * 6);
    expect(before?.toISOString()).toBe('2026-10-23T05:00:00.000Z'); // 07:00 +02:00
    expect(after?.toISOString()).toBe('2026-10-26T06:00:00.000Z');  // 07:00 +01:00
  });

  it('reports a local time that does not exist as unresolvable', () => {
    // 2027-03-28 jumps 02:00 -> 03:00, so 02:30 never happens in Stockholm.
    expect(zonedTimeToInstant(2027, 3, 28, 2, 30, TZ)).toBeNull();
    // The hour on either side does exist.
    expect(zonedTimeToInstant(2027, 3, 28, 1, 30, TZ)).not.toBeNull();
    expect(zonedTimeToInstant(2027, 3, 28, 3, 30, TZ)).not.toBeNull();
  });

  it('skips a slot lost to the spring-forward instead of inventing one', () => {
    // A hypothetical 02:30 job on the transition day has no instant that day;
    // the newest real slot is the day before.
    const slot = previousSlot(parseSchedule('30 2 * * *'), new Date('2027-03-28T12:00:00+02:00'), TZ, 3 * 1440);
    expect(slot?.toISOString()).toBe('2027-03-27T01:30:00.000Z'); // 02:30 +01:00
  });
});

describe('selectCatchUpPhase', () => {
  const claimNone = async (): Promise<boolean> => false;
  const claimAll = async (): Promise<boolean> => true;

  const entry = (over: Partial<CatchUpEntry> & { phase: string; expr: string }): CatchUpEntry => ({
    catchUpWithinMin: 6 * 60,
    ...over,
  });

  it('runs nothing when every due slot has already been claimed', async () => {
    const phases = [entry({ expr: '0 7 * * 1-5', phase: 'phase1' })];
    const sel = await selectCatchUpPhase(phases, new Date('2026-09-03T09:30:00+02:00'), TZ, claimAll);
    expect(sel.chosen).toBeNull();
    expect(sel.alsoOverdue).toBe(0);
  });

  it('picks an unclaimed slot', async () => {
    const phases = [entry({ expr: '0 7 * * 1-5', phase: 'phase1' })];
    const sel = await selectCatchUpPhase(phases, new Date('2026-09-03T09:30:00+02:00'), TZ, claimNone);
    expect(sel.chosen?.entry.phase).toBe('phase1');
    expect(sel.chosen?.slot.toISOString()).toBe('2026-09-03T05:00:00.000Z');
  });

  it('runs ONE phase per tick, oldest slot first, and reports the rest', async () => {
    // The SDK engine caps concurrency at 2 and throws over the cap, so a
    // machine waking to several overdue phases must not start them together.
    // Wide windows on all three so this tests the ORDERING and nothing else —
    // with the 6h default, 07:00 would be excluded as stale at 16:00 and the
    // test would silently be asserting something weaker.
    const phases = [
      entry({ expr: '0 15 * * 1-5', phase: 'later', catchUpWithinMin: 12 * 60 }),   // 15:00
      entry({ expr: '0 7 * * 1-5', phase: 'earliest', catchUpWithinMin: 12 * 60 }), // 07:00
      entry({ expr: '30 12 * * 1-5', phase: 'middle', catchUpWithinMin: 12 * 60 }), // 12:30
    ];
    const sel = await selectCatchUpPhase(phases, new Date('2026-09-03T16:00:00+02:00'), TZ, claimNone);
    expect(sel.chosen?.entry.phase).toBe('earliest');
    expect(sel.alsoOverdue).toBe(2);
  });

  it('each phase window is applied independently, not globally', async () => {
    // Same three phases at the same instant, but on their own windows: 07:00 is
    // 9h old and drops out, so the oldest SURVIVOR is 12:30.
    const phases = [
      entry({ expr: '0 15 * * 1-5', phase: 'later' }),
      entry({ expr: '0 7 * * 1-5', phase: 'earliest' }),
      entry({ expr: '30 12 * * 1-5', phase: 'middle' }),
    ];
    const sel = await selectCatchUpPhase(phases, new Date('2026-09-03T16:00:00+02:00'), TZ, claimNone);
    expect(sel.chosen?.entry.phase).toBe('middle');
    expect(sel.alsoOverdue).toBe(1);
  });

  it('ignores a slot older than that phase own window', async () => {
    // intraday runs every two hours; rescuing the 14:00 fetch at 20:00 buys
    // nothing and spends an API call.
    const phases = [entry({ expr: '0 14,16,18,20,22 * * 1-5', phase: 'intraday', catchUpWithinMin: 90 })];
    const sel = await selectCatchUpPhase(phases, new Date('2026-09-03T19:50:00+02:00'), TZ, claimNone);
    expect(sel.chosen).toBeNull(); // 18:00 was 110 min ago, past the 90-min window
  });

  it('skips a missed slot whose work already ran, and says so', async () => {
    // The guard that stops a rescued phase4 from minting a second batch of
    // predictions over the same symbols.
    const phases = [entry({
      expr: '0 18 * * 1-5',
      phase: 'phase4-midday-intelligence',
      alreadyDone: async () => true,
    })];
    const sel = await selectCatchUpPhase(phases, new Date('2026-09-03T19:50:00+02:00'), TZ, claimNone);
    expect(sel.chosen).toBeNull();
    expect(sel.skippedAlreadyDone.map((s) => s.phase)).toEqual(['phase4-midday-intelligence']);
  });

  it('runs the missed slot when its work has NOT already happened', async () => {
    const phases = [entry({
      expr: '0 18 * * 1-5',
      phase: 'phase4-midday-intelligence',
      alreadyDone: async () => false,
    })];
    const sel = await selectCatchUpPhase(phases, new Date('2026-09-03T19:50:00+02:00'), TZ, claimNone);
    expect(sel.chosen?.entry.phase).toBe('phase4-midday-intelligence');
    expect(sel.skippedAlreadyDone).toEqual([]);
  });

  it('reproduces the real 2026-09-03 19:59 state: rescue nothing, and say why', async () => {
    // The live registry as it stood the evening the catch-up was written, with
    // the claims exactly as the database held them. Everything that ran is
    // claimed; phase4's 18:00 was genuinely missed but daily intelligence had
    // already run at 12:21 via the boot catch-up; everything else is stale.
    // The correct answer is to do nothing at all — a catch-up whose first act
    // is a duplicate LLM cycle would be worse than the bug it fixes.
    const claimedSlots = new Set([
      'news-fetch@2026-09-03T06:00:00.000Z',           // 08:00
      'phase8-weekly-pulse@2026-09-03T07:00:00.000Z',  // 09:00
      'midday-extraction-topup@2026-09-03T10:30:00.000Z', // 12:30
      'phase2-pre-open@2026-09-03T12:30:00.000Z',      // 14:30
      'phase3-market-open@2026-09-03T13:45:00.000Z',   // 15:45
      'intraday-price-refresh@2026-09-03T14:00:00.000Z', // 16:00
    ]);
    const isClaimed = async (phase: string, slot: Date): Promise<boolean> =>
      claimedSlots.has(`${phase}@${slot.toISOString()}`);

    const registry: CatchUpEntry[] = [
      entry({ expr: '0 7 * * 1-5', phase: 'phase1-morning-intelligence' }),
      entry({ expr: '30 14 * * 1-5', phase: 'phase2-pre-open' }),
      entry({ expr: '45 15 * * 1-5', phase: 'phase3-market-open' }),
      entry({ expr: '0 18 * * 1-5', phase: 'phase4-midday-intelligence', alreadyDone: async () => true }),
      entry({ expr: '15 22 * * 1-5', phase: 'phase5-market-close', catchUpWithinMin: 12 * 60 }),
      entry({ expr: '0 23 * * 1-5', phase: 'phase6-post-market' }),
      entry({ expr: '0 10 * * 6,0', phase: 'phase7-weekend-deep-dive', catchUpWithinMin: 26 * 60 }),
      entry({ expr: '0 9 * * 1,4', phase: 'phase8-weekly-pulse', alreadyDone: async () => true }),
      entry({ expr: '0 14,16,18,20,22 * * 1-5', phase: 'intraday-price-refresh', catchUpWithinMin: 90 }),
      entry({ expr: '30 12 * * 1-5', phase: 'midday-extraction-topup' }),
      entry({ expr: '0 8,15,21 * * 1-5', phase: 'news-fetch', catchUpWithinMin: 4 * 60 }),
    ];

    const sel = await selectCatchUpPhase(registry, new Date('2026-09-03T19:59:00+02:00'), TZ, isClaimed);
    expect(sel.chosen).toBeNull();
    expect(sel.skippedAlreadyDone.map((s) => s.phase)).toEqual(['phase4-midday-intelligence']);
  });

  it('rescues the 07:00 slot the morning after, which is the whole point', async () => {
    // 2026-09-03 07:00 was missed on a live, awake machine. With the catch-up
    // in place, the 07:05 tick finds it unclaimed and inside its window.
    const registry = [entry({ expr: '0 7 * * 1-5', phase: 'phase1-morning-intelligence' })];
    const sel = await selectCatchUpPhase(registry, new Date('2026-09-03T07:05:00+02:00'), TZ, claimNone);
    expect(sel.chosen?.entry.phase).toBe('phase1-morning-intelligence');
    expect(sel.chosen?.slot.toISOString()).toBe('2026-09-03T05:00:00.000Z');
  });
});
