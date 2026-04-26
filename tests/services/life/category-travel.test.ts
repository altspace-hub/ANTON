/**
 * category-travel.test.ts — pure-function unit tests for Life / Travel
 * helpers. No DB.
 */

import { describe, it, expect } from 'vitest';
import {
  tripDurationDays,
  budgetByDay,
  budgetVariance,
  suggestBagSize,
  type TravelTrip,
  type TravelItineraryItem,
} from '../../../server/services/category-travel.js';

describe('tripDurationDays', () => {
  it('returns 0 when either date is missing', () => {
    expect(tripDurationDays(null, '2026-05-10')).toBe(0);
    expect(tripDurationDays('2026-05-01', null)).toBe(0);
    expect(tripDurationDays(null, null)).toBe(0);
  });

  it('returns 0 when end < start', () => {
    expect(tripDurationDays('2026-05-10', '2026-05-05')).toBe(0);
  });

  it('counts inclusive days', () => {
    // 1st → 5th = 5 days inclusive
    expect(tripDurationDays('2026-05-01', '2026-05-05')).toBe(5);
    // same day = 1 day
    expect(tripDurationDays('2026-05-01', '2026-05-01')).toBe(1);
  });

  it('handles month + year boundaries', () => {
    expect(tripDurationDays('2026-12-30', '2027-01-02')).toBe(4);
  });

  it('returns 0 on garbage input', () => {
    expect(tripDurationDays('not-a-date', '2026-05-10')).toBe(0);
  });
});

describe('budgetByDay', () => {
  const items: TravelItineraryItem[] = [
    { id: 'i1', trip_id: 't', day_number: 1, time_slot: null, title: 'Lunch',  description: null, location: null, cost: 25,  category: 'meal',     confirmed: 1 },
    { id: 'i2', trip_id: 't', day_number: 1, time_slot: null, title: 'Museum', description: null, location: null, cost: 18,  category: 'activity', confirmed: 0 },
    { id: 'i3', trip_id: 't', day_number: 3, time_slot: null, title: 'Train',  description: null, location: null, cost: 90,  category: 'transport', confirmed: 1 },
  ];

  it('sums costs per day, with zero entries for empty days', () => {
    const out = budgetByDay(items, 4);
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ day: 1, cost: 43, itemCount: 2 });
    expect(out[1]).toEqual({ day: 2, cost: 0,  itemCount: 0 });
    expect(out[2]).toEqual({ day: 3, cost: 90, itemCount: 1 });
    expect(out[3]).toEqual({ day: 4, cost: 0,  itemCount: 0 });
  });

  it('treats null cost as 0', () => {
    const withNull: TravelItineraryItem[] = [
      { ...items[0], cost: null },
      items[1],
    ];
    const out = budgetByDay(withNull, 1);
    expect(out[0].cost).toBe(18);
  });

  it('returns an empty array when totalDays = 0', () => {
    expect(budgetByDay(items, 0)).toEqual([]);
  });
});

describe('budgetVariance', () => {
  const trip = (budget: number | null): TravelTrip => ({
    id: 't1', user_id: 'u', title: 'T', destination: 'X',
    start_date: '2026-05-01', end_date: '2026-05-05',
    budget_total: budget, currency: 'EUR', status: 'planning',
    notes: null, cover_emoji: '✈️', created_at: '',
  });

  it('returns null when no budget set', () => {
    expect(budgetVariance(trip(null), [])).toBeNull();
  });

  it('returns positive when over budget', () => {
    const items = [{ id: 'a', trip_id: 't', day_number: 1, time_slot: null, title: 'X', description: null, location: null, cost: 600, category: 'lodging' as const, confirmed: 1 }];
    expect(budgetVariance(trip(500), items)).toBe(100);
  });

  it('returns negative when under budget', () => {
    const items = [{ id: 'a', trip_id: 't', day_number: 1, time_slot: null, title: 'X', description: null, location: null, cost: 300, category: 'lodging' as const, confirmed: 1 }];
    expect(budgetVariance(trip(500), items)).toBe(-200);
  });

  it('returns 0 when on budget', () => {
    const items = [{ id: 'a', trip_id: 't', day_number: 1, time_slot: null, title: 'X', description: null, location: null, cost: 500, category: 'lodging' as const, confirmed: 1 }];
    expect(budgetVariance(trip(500), items)).toBe(0);
  });
});

describe('suggestBagSize', () => {
  it('cabin for short tropical/temperate trips', () => {
    expect(suggestBagSize(3, 'tropical')).toBe('cabin');
    expect(suggestBagSize(5, 'temperate')).toBe('cabin');
  });

  it('cabin extends to 10 days for tropical/temperate', () => {
    expect(suggestBagSize(10, 'tropical')).toBe('cabin');
    expect(suggestBagSize(10, 'temperate')).toBe('cabin');
  });

  it('medium for cold short trips and mid-length mixed', () => {
    expect(suggestBagSize(5, 'cold')).toBe('medium');
    expect(suggestBagSize(10, 'mixed')).toBe('medium');
  });

  it('large for any trip beyond 14 days', () => {
    expect(suggestBagSize(15, 'tropical')).toBe('large');
    expect(suggestBagSize(30, 'temperate')).toBe('large');
  });
});
