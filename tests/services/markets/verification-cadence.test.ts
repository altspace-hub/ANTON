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
