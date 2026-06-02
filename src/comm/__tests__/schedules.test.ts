/**
 * schedules.test.ts — recurrence math + schedule→pay-URI synthesis
 * (#79 Phase 6). Pure functions only; no IDB / notification plugin.
 */
import { describe, expect, it } from 'vitest';
import { nextFireFrom, describeRecurrence, type Schedule } from '../services/schedules';
import { scheduleToPayUri } from '../services/schedule-to-payment';

const baseSchedule = (over: Partial<Schedule> = {}): Schedule => ({
  id: 'sched_abcdef0123',
  payeeAddress: 'fc_Payee0000000000000000000000000000',
  payeeLabel: 'Landlord',
  amountMicroFtc: 1_500_000n,
  recurrence: { kind: 'monthly', dayOfMonth: 1 },
  nextFireAt: 0,
  lastFiredAt: null,
  createdAt: 0,
  active: true,
  ...over,
});

describe('nextFireFrom', () => {
  const now = Date.UTC(2026, 5, 2, 12, 0, 0); // a fixed reference instant
  it('daily → strictly after `after`', () => {
    expect(nextFireFrom({ kind: 'daily', interval: 1 }, now)).toBeGreaterThan(now);
  });
  it('weekly → lands on the requested weekday', () => {
    const ts = nextFireFrom({ kind: 'weekly', interval: 1, dayOfWeek: 3 }, now); // Wed
    expect(ts).toBeGreaterThan(now);
    expect(new Date(ts).getDay()).toBe(3);
  });
  it('monthly → future + correct day-of-month (clamped to ≤28)', () => {
    const ts = nextFireFrom({ kind: 'monthly', dayOfMonth: 1 }, now);
    expect(ts).toBeGreaterThan(now);
    expect(new Date(ts).getDate()).toBe(1);
  });
  it('yearly → future', () => {
    const ts = nextFireFrom({ kind: 'yearly', month: 1, dayOfMonth: 1 }, now);
    expect(ts).toBeGreaterThan(now);
  });
});

describe('describeRecurrence', () => {
  it('renders each kind', () => {
    expect(describeRecurrence({ kind: 'daily', interval: 1 })).toBe('Every day');
    expect(describeRecurrence({ kind: 'monthly', dayOfMonth: -1 })).toBe('Last day of each month');
    expect(describeRecurrence({ kind: 'monthly', dayOfMonth: 15 })).toContain('15');
  });
});

describe('scheduleToPayUri', () => {
  it('emits a futurechain:pay URI carrying to/amount/sched', () => {
    const uri = scheduleToPayUri(baseSchedule(), 1_700_000_000_000);
    expect(uri.startsWith('futurechain:pay?')).toBe(true);
    const p = new URLSearchParams(uri.split('?')[1]);
    expect(p.get('to')).toBe('fc_Payee0000000000000000000000000000');
    expect(p.get('amount')).toBe('1500000');
    expect(p.get('sched')).toBe('sched_abcdef0123');
    expect(p.get('cn')).toBe('Landlord'); // payeeLabel → creditor name
    expect(p.get('ref')).toBeTruthy();
  });
  it('uses the explicit ref when the schedule carries one', () => {
    const uri = scheduleToPayUri(baseSchedule({ ref: 'INV-42' }), 1_700_000_000_000);
    const p = new URLSearchParams(uri.split('?')[1]);
    expect(p.get('ref')).toBe('INV-42');
  });
  it('same schedule + different fire ts → distinct order refs', () => {
    const a = new URLSearchParams(scheduleToPayUri(baseSchedule(), 1).split('?')[1]).get('ref');
    const b = new URLSearchParams(scheduleToPayUri(baseSchedule(), 2).split('?')[1]).get('ref');
    expect(a).not.toBe(b);
  });
});
