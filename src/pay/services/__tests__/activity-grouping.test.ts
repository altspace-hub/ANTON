/**
 * activity-grouping.test.ts — pure-logic coverage for
 * groupActivityByDay(). Mirrors payment.test.ts: deterministic time is
 * injected (no real `Date.now()`), so the Today / Yesterday boundaries
 * are stable regardless of when the suite runs.
 */
import { describe, expect, it } from 'vitest';
import { groupActivityByDay, type GroupLabeler } from '../activity';
import type { Activity, PaymentRecord, ReceivedRecord } from '../types';

/** "Now" anchored mid-afternoon so same-day rows earlier and later in
 *  the day both fall inside the Today bucket. */
const NOW = Date.parse('2026-05-16T15:00:00');

const LABELER: GroupLabeler = {
  today: 'Today',
  yesterday: 'Yesterday',
  // Deterministic explicit-date label — the YYYY-MM-DD key, so the test
  // never depends on the host locale's toLocaleString output.
  formatDate: (ms) => {
    const d = new Date(ms);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  },
};

/** Minimal sent Activity at a given timestamp. Only `at` matters for
 *  grouping; the record carries an id so we can assert ordering. */
function sentAt(at: number, id: string): Activity {
  const record = { id, paidAt: at } as unknown as PaymentRecord;
  return { direction: 'sent', at, record };
}

/** Minimal received Activity at a given timestamp. */
function receivedAt(at: number, txId: string): Activity {
  const record = { txId, receivedAt: at } as unknown as ReceivedRecord;
  return { direction: 'received', at, record };
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('groupActivityByDay', () => {
  it('returns no groups for an empty input', () => {
    expect(groupActivityByDay([], LABELER, NOW)).toEqual([]);
  });

  it('labels the current calendar day "Today"', () => {
    const groups = groupActivityByDay([sentAt(NOW, 'a')], LABELER, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].dayKey).toBe('2026-05-16');
  });

  it('labels the previous calendar day "Yesterday"', () => {
    const groups = groupActivityByDay([sentAt(NOW - DAY, 'a')], LABELER, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Yesterday');
    expect(groups[0].dayKey).toBe('2026-05-15');
  });

  it('labels older days with the explicit formatted date', () => {
    const groups = groupActivityByDay([sentAt(NOW - 3 * DAY, 'a')], LABELER, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('2026-05-13');
  });

  it('buckets rows into one group per calendar day', () => {
    const groups = groupActivityByDay([
      sentAt(NOW, 'today-1'),
      sentAt(NOW - 2 * HOUR, 'today-2'),
      sentAt(NOW - DAY, 'yest-1'),
      sentAt(NOW - 3 * DAY, 'old-1'),
    ], LABELER, NOW);
    expect(groups.map((g) => g.dayKey)).toEqual([
      '2026-05-16', '2026-05-15', '2026-05-13',
    ]);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
    expect(groups[2].items).toHaveLength(1);
  });

  it('orders days newest-first and items newest-first within a day', () => {
    // Intentionally shuffled input — the helper must not assume sorted.
    const groups = groupActivityByDay([
      sentAt(NOW - DAY, 'yest'),
      sentAt(NOW - 2 * HOUR, 'today-older'),
      sentAt(NOW, 'today-newest'),
    ], LABELER, NOW);
    expect(groups[0].label).toBe('Today');
    const ids = groups[0].items.map((a) => (a.record as PaymentRecord).id);
    expect(ids).toEqual(['today-newest', 'today-older']);
    expect(groups[1].label).toBe('Yesterday');
  });

  it('separates two rows straddling local midnight into different days', () => {
    const lateNight = Date.parse('2026-05-16T23:30:00'); // same day as NOW
    const earlyMorning = Date.parse('2026-05-17T00:30:00'); // next day
    const groups = groupActivityByDay([
      receivedAt(lateNight, 'tx-late'),
      receivedAt(earlyMorning, 'tx-early'),
    ], LABELER, earlyMorning);
    expect(groups.map((g) => g.dayKey)).toEqual(['2026-05-17', '2026-05-16']);
    expect(groups[0].label).toBe('Today');
    expect(groups[1].label).toBe('Yesterday');
  });

  it('mixes sent and received rows within the same day bucket', () => {
    const groups = groupActivityByDay([
      sentAt(NOW, 's'),
      receivedAt(NOW - HOUR, 'r'),
    ], LABELER, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].items[0].direction).toBe('sent');
    expect(groups[0].items[1].direction).toBe('received');
  });
});
