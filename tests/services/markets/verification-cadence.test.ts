import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * 2026-08-18: twelve predictions sat past their deadline ungraded. The free,
 * price-graded verifier was scheduled `0 12 * * 1-5` — one shot per weekday.
 * Two consequences, both regressions worth pinning:
 *
 *   • Weekends were blind. The tactical band (1-3 day horizons) resolves on
 *     Fridays and Saturdays, so those calls waited until Monday.
 *   • A single missed slot cost a full day. This workstation was in Modern
 *     Standby across 12:00 that Monday; node-cron skips slots rather than
 *     replaying them, so nothing graded at all.
 *
 * Grading is a price comparison over predictions already past their horizon —
 * it costs a query when nothing is due, so frequency is close to free.
 */

const src = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../server/index.ts'),
  'utf8',
);

/** The cron expression the verification pass is registered under. */
function verificationCronExpr(): string {
  const m = src.match(/cron\.schedule\(\s*'([^']+)'\s*,\s*\(\)\s*=>\s*\{\s*void runVerificationPass\(/);
  expect(m, 'runVerificationPass must be registered on a cron schedule').toBeTruthy();
  return m![1];
}

/** Expand a cron field ("8,12", "1-5", "*") to the set of values it fires on. */
function expand(field: string, min: number, max: number): Set<number> {
  if (field === '*') return new Set(Array.from({ length: max - min + 1 }, (_, i) => min + i));
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      for (let v = Number(range[1]); v <= Number(range[2]); v++) out.add(v);
    } else {
      out.add(Number(part));
    }
  }
  return out;
}

describe('markets prediction verification cadence', () => {
  it('runs every day of the week, weekends included', () => {
    const [, , , , dow] = verificationCronExpr().split(/\s+/);
    const days = expand(dow, 0, 6);
    // 0/7 = Sunday, 6 = Saturday
    expect(days.has(6) || days.has(7), 'must fire on Saturday').toBe(true);
    expect(days.has(0) || days.has(7), 'must fire on Sunday').toBe(true);
    for (let d = 1; d <= 5; d++) expect(days.has(d), `must fire on weekday ${d}`).toBe(true);
  });

  it('runs more than once a day so one missed slot is not a lost day', () => {
    const [, hours] = verificationCronExpr().split(/\s+/);
    expect(expand(hours, 0, 23).size).toBeGreaterThan(1);
  });

  it('has a monotonic safety net for slots the host sleeps through', () => {
    // node-cron is wall-clock and skips missed slots; setInterval is monotonic
    // and fires once on resume. The gap check is what converts that into a pass.
    expect(src).toMatch(/setInterval\([\s\S]{0,400}?runVerificationPass\('gap-catchup'\)/);
    expect(src).toMatch(/VERIFY_MAX_GAP_MS/);
  });

  it('grades anything already overdue on boot', () => {
    expect(src).toMatch(/runVerificationPass\('boot-catchup'\)/);
  });
});

describe('markets catch-up on host resume', () => {
  it('recovers missed phases on resume, not only at startup', () => {
    // node-cron resolves the NEXT wall-clock slot and never replays ones the
    // host slept through, so Phase 4 (18:00), Phase 5 (22:15 NAV) and Phase 6
    // (23:00) simply vanished on a night this workstation was in Modern
    // Standby. Boot catch-up covered a restart; nothing covered a resume.
    expect(src).toMatch(/async function runMarketsCatchUp\(/);
    expect(src).toMatch(/runMarketsCatchUp\('startup'\)/);
    expect(src).toMatch(/runMarketsCatchUp\('resume'\)/);
  });

  it('detects resume from wall-clock drift on a short interval', () => {
    // A 60s interval that fires far later than 60s means wall-clock time
    // passed while the process was frozen or suspended.
    expect(src).toMatch(/DRIFT_TICK_MS/);
    expect(src).toMatch(/DRIFT_THRESHOLD_MS/);
    expect(src).toMatch(/setInterval\([\s\S]{0,600}?runMarketsCatchUp\('resume'\)/);
  });

  it('will not run two catch-ups concurrently', () => {
    // Startup + an immediate resume must not double-run the paid steps.
    expect(src).toMatch(/catchUpRunning/);
  });
});

describe('markets investigate leg cadence', () => {
  /** The cron expression the investigation pass is registered under. */
  function investigationCronExpr(): string {
    const m = src.match(/cron\.schedule\(\s*'([^']+)'\s*,\s*\(\)\s*=>\s*\{\s*void runInvestigationPass\(/);
    expect(m, 'runInvestigationPass must be registered on a cron schedule').toBeTruthy();
    return m![1];
  }

  it('runs every day, not only on the weekly validation day', () => {
    // Dispatch + why-chains used to live only inside runPredictionValidation
    // (Saturdays), so a missed Saturday cost a week and the chain queue drained
    // at 10 per weekly run.
    const [, , dom, month, dow] = investigationCronExpr().split(/\s+/);
    expect(dom).toBe('*');
    expect(month).toBe('*');
    expect(dow).toBe('*');
  });

  it('runs after the verification pass so same-day grades are dispatched', () => {
    const invHour = Number(investigationCronExpr().split(/\s+/)[1]);
    const verifyHours = expandHours();
    expect(verifyHours.some(h => h < invHour), 'a verification slot must precede it').toBe(true);
  });

  it('has a monotonic net and a boot pass, like verification', () => {
    expect(src).toMatch(/setInterval\([\s\S]{0,400}?runInvestigationPass\('gap-catchup'\)/);
    expect(src).toMatch(/runInvestigationPass\('boot-catchup'\)/);
  });

  it('gates only the paid half on the LLM opt-in', () => {
    // Dispatch is pure DB work and both creators are idempotent, so it must not
    // be gated; only the why-chain execution is.
    expect(src).toMatch(/runInvestigationSweep\(\{ allowLLM: marketsLlmOn \}\)/);
  });
});

/** Hours the verification cron fires on. */
function expandHours(): number[] {
  const m = src.match(/cron\.schedule\(\s*'([^']+)'\s*,\s*\(\)\s*=>\s*\{\s*void runVerificationPass\(/);
  const field = m![1].split(/\s+/)[1];
  return field === '*' ? Array.from({ length: 24 }, (_, i) => i) : field.split(',').map(Number);
}

describe('missed scheduled pulse recovery', () => {
  it('retries a pulse that failed on its own scheduled day', () => {
    // The pulse runs Mon+Thu — a 3.5-day cadence — so a "> 4 days since the
    // last success" test can only fire after TWO consecutive misses. On
    // 2026-08-20 the Thursday run failed at 09:00, this saw three days since
    // Monday, called it healthy, and the day's predictions were lost.
    expect(src).toMatch(/const isPulseDay = dayOfWeek === 1 \|\| dayOfWeek === 4/);
    expect(src).toMatch(/missedTodaysPulse/);
    expect(src).toMatch(/daysSincePulse > 4 \|\| missedTodaysPulse/);
  });

  it('counts only SUCCESSFUL runs when deciding whether today is covered', () => {
    // A failed run sitting in the table must not read as "the pulse ran".
    const i = src.indexOf('const pulseToday');
    const q = src.slice(i, i + 400);
    expect(q).toMatch(/status IN \('completed', 'success'\)/);
    expect(q).toMatch(/started_at >= CURRENT_DATE/);
  });
});
