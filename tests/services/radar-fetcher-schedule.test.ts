/**
 * radar-fetcher-schedule.test.ts — a scheduled radar scan honours the switches
 * that are meant to stop it, wherever it is started from.
 *
 * Before: RADAR_AUTOMATION_DISABLED was read once, at boot, in index.ts. A
 * PUT /api/radar/settings at runtime called startAutoScan() directly and the
 * timer started anyway — background model calls on an instance whose operator
 * had turned them off. The interval was taken as given, so 0 hours (or any
 * figure past setInterval's ~24.8-day ceiling, which Node turns into 1 ms)
 * scanned back to back.
 *
 * Now startAutoScan() refuses, and returns false, while
 * RADAR_AUTOMATION_DISABLED=true or DEMO_MODE=true, and clamps the interval to
 * [1 h, MAX_AUTO_SCAN_INTERVAL_HOURS]. Negative controls: with neither flag the
 * timer starts at the interval asked for; the flags only read 'true'.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';

vi.mock('../../server/services/provider-router.js', () => ({
  callChat: vi.fn(async () => { throw new Error('no model calls in this test'); }),
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: async () => 'claude-haiku-4-5',
}));

import {
  createRadarFetcher,
  isRadarAutomationDisabled,
  clampAutoScanIntervalHours,
  radarCronIsAtMostHourly,
  MAX_AUTO_SCAN_INTERVAL_HOURS,
} from '../../server/services/radar-fetcher.js';

const fakeDb = {
  dialect: 'postgresql',
  async get() { return undefined; },
  async all() { return []; },
  async run() { return { changes: 0, lastInsertRowid: 0 }; },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(fakeDb as unknown as DatabaseAdapter); },
  async close() { /* noop */ },
} as unknown as DatabaseAdapter;

const saved = { radar: process.env.RADAR_AUTOMATION_DISABLED, demo: process.env.DEMO_MODE };
const HOUR = 3_600_000;

beforeEach(() => {
  delete process.env.RADAR_AUTOMATION_DISABLED;
  delete process.env.DEMO_MODE;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (saved.radar === undefined) delete process.env.RADAR_AUTOMATION_DISABLED; else process.env.RADAR_AUTOMATION_DISABLED = saved.radar;
  if (saved.demo === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = saved.demo;
});

async function started(hours: number): Promise<{ ok: boolean; delays: number[]; config: { enabled: boolean; intervalHours: number } }> {
  const spy = vi.spyOn(globalThis, 'setInterval');
  const fetcher = await createRadarFetcher(fakeDb);
  const ok = fetcher.startAutoScan(hours);
  const delays = spy.mock.calls.map((c) => Number(c[1]));
  const config = fetcher.getAutoScanConfig();
  fetcher.stopAutoScan();
  spy.mockRestore();
  return { ok, delays, config };
}

describe('startAutoScan honours the automation switches', () => {
  it('RADAR_AUTOMATION_DISABLED=true: nothing is scheduled, and it says so', async () => {
    process.env.RADAR_AUTOMATION_DISABLED = 'true';
    const r = await started(6);
    expect(r.ok).toBe(false);
    expect(r.delays).toEqual([]);
    expect(r.config.enabled).toBe(false);
  });

  it('DEMO_MODE=true: nothing is scheduled either', async () => {
    process.env.DEMO_MODE = 'true';
    const r = await started(6);
    expect(r.ok).toBe(false);
    expect(r.delays).toEqual([]);
  });

  it('negative control: with neither flag the timer starts at the interval asked for', async () => {
    process.env.RADAR_AUTOMATION_DISABLED = 'false';
    const r = await started(6);
    expect(r.delays).toEqual([6 * HOUR]);
    expect(r.config).toEqual({ enabled: true, intervalHours: 6 });
  });

  it('reports true when it did schedule', async () => {
    expect((await started(6)).ok).toBe(true);
  });

  it('isRadarAutomationDisabled reads only "true" (any case)', () => {
    expect(isRadarAutomationDisabled({ RADAR_AUTOMATION_DISABLED: 'TRUE' })).toBe(true);
    expect(isRadarAutomationDisabled({ DEMO_MODE: 'true' })).toBe(true);
    expect(isRadarAutomationDisabled({ RADAR_AUTOMATION_DISABLED: '1' })).toBe(false);
    expect(isRadarAutomationDisabled({})).toBe(false);
  });
});

describe('the auto-scan interval is clamped', () => {
  it('0 hours becomes 1 hour, not a back-to-back loop', async () => {
    const r = await started(0);
    expect(r.delays).toEqual([HOUR]);
    expect(r.config.intervalHours).toBe(1);
  });

  it('a figure past setInterval\'s ceiling becomes the maximum, not 1 ms', async () => {
    const r = await started(100_000);
    expect(r.delays).toEqual([MAX_AUTO_SCAN_INTERVAL_HOURS * HOUR]);
    expect(MAX_AUTO_SCAN_INTERVAL_HOURS * HOUR).toBeLessThanOrEqual(2 ** 31 - 1);
  });

  it('NaN (a bad stored value) falls back to 24 hours', () => {
    expect(clampAutoScanIntervalHours(Number.NaN)).toBe(24);
    expect(clampAutoScanIntervalHours(12)).toBe(12);
  });
});

describe('radarCronIsAtMostHourly', () => {
  it('accepts fixed-minute schedules', () => {
    for (const ok of ['0 * * * *', '15 */6 * * *', '0 9 * * 1-5', '0 0 * * * *']) {
      expect(radarCronIsAtMostHourly(ok), ok).toBe(true);
    }
  });
  it('refuses anything that can fire more than once an hour', () => {
    for (const bad of ['* * * * *', '*/5 * * * *', '0,30 * * * *', '0-10 * * * *', '* 0 * * * *', '*/10 0 * * * *', 'nonsense']) {
      expect(radarCronIsAtMostHourly(bad), bad).toBe(false);
    }
  });
});
