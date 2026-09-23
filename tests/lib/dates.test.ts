/**
 * dates.test.ts — a calendar day from the API keeps its day in the browser.
 *
 * The API sends a DATE as 'YYYY-MM-DD'. `new Date('2027-03-31')` is UTC
 * midnight, which west of Greenwich is 30 March — so src/lib/dates.ts reads a
 * bare day in local time.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { parseDay, formatDay } from '../../src/lib/dates';

const saved = process.env.TZ;
afterEach(() => { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; });

describe('parseDay', () => {
  it.each(['America/New_York', 'America/Los_Angeles', 'Europe/Stockholm', 'Asia/Tokyo', 'UTC'])('keeps the day in %s', (tz) => {
    process.env.TZ = tz;
    const d = parseDay('2027-03-31')!;
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2027, 3, 31]);
  });

  it('is needed: the plain Date reading loses the day west of UTC', () => {
    process.env.TZ = 'America/New_York';
    expect(new Date('2027-03-31').getDate()).toBe(30);
  });

  it('reads a full timestamp as Date does, and refuses nonsense', () => {
    expect(parseDay('2027-03-31T12:00:00Z')?.toISOString()).toBe('2027-03-31T12:00:00.000Z');
    expect(parseDay('not a date')).toBeNull();
    expect(parseDay(null)).toBeNull();
    expect(formatDay('')).toBe('');
  });
});
