/**
 * category-travel.ts — Life pillar / Travel area service.
 *
 * Phase B.3 build-out. Trip + itinerary + country-intel + packing-list
 * queries extracted from server/routes/travel.ts. The country-intel
 * generation pipeline (LLM call) stays in the route file; this service
 * handles read paths and pure helpers (budget rollups, day-count, etc).
 */

import type { DatabaseAdapter } from '../db/database.js';

export interface TravelTrip {
  id: string;
  user_id: string;
  title: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  budget_total: number | null;
  currency: string;
  status: 'planning' | 'booked' | 'in_progress' | 'completed' | 'cancelled';
  notes: string | null;
  cover_emoji: string;
  created_at: string;
}

export interface TravelItineraryItem {
  id: string;
  trip_id: string;
  day_number: number;
  time_slot: string | null;
  title: string;
  description: string | null;
  location: string | null;
  cost: number | null;
  category: 'activity' | 'meal' | 'transport' | 'lodging' | 'event' | 'other';
  confirmed: number;
}

export interface TravelCountryIntel {
  id: string;
  country_code: string;
  country_name: string;
  generated_at: string;
  culture_notes: string | null;
  safety_level: 'low' | 'moderate' | 'high' | 'extreme';
  safety_notes: string | null;
  visa_info: string | null;
  currency_info: string | null;
  language_tips: string | null;
  transport_info: string | null;
  food_guide: string | null;
  scam_alerts: string;
  best_months: string;
  budget_estimate: string;
}

// ── Pure helpers ─────────────────────────────────────────────────────

/**
 * Compute the trip duration in days, inclusive of both endpoints.
 * Returns 0 if either date is missing or if end < start.
 */
export function tripDurationDays(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return 0;
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
  const ms = e.getTime() - s.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Roll up itinerary item costs into a per-day budget summary.
 * Returns one entry per day in the trip; days with no items get cost 0.
 */
export function budgetByDay(
  items: TravelItineraryItem[],
  totalDays: number,
): Array<{ day: number; cost: number; itemCount: number }> {
  const days: Array<{ day: number; cost: number; itemCount: number }> = [];
  for (let d = 1; d <= totalDays; d++) {
    const dayItems = items.filter(i => i.day_number === d);
    const cost = dayItems.reduce((sum, i) => sum + (i.cost ?? 0), 0);
    days.push({ day: d, cost: Math.round(cost * 100) / 100, itemCount: dayItems.length });
  }
  return days;
}

/**
 * Detect a trip-budget overrun: actual planned spend (sum of itemised costs)
 * versus the trip's budget_total. Returns positive number = over budget,
 * negative = under, 0 = exactly on. Null when no budget is set.
 */
export function budgetVariance(trip: TravelTrip, items: TravelItineraryItem[]): number | null {
  if (trip.budget_total == null) return null;
  const itemised = items.reduce((sum, i) => sum + (i.cost ?? 0), 0);
  return Math.round((itemised - trip.budget_total) * 100) / 100;
}

/**
 * Suggest a packing list size: conservative cabin-bag-only threshold.
 * Pure heuristic, not a recommendation.
 */
export function suggestBagSize(durationDays: number, climate: 'tropical' | 'temperate' | 'cold' | 'mixed'): 'cabin' | 'medium' | 'large' {
  if (durationDays <= 5 && climate !== 'cold') return 'cabin';
  if (durationDays <= 10 && climate !== 'cold' && climate !== 'mixed') return 'cabin';
  if (durationDays <= 14) return 'medium';
  return 'large';
}

// ── DB-bound functions ────────────────────────────────────────────────

export function createTravelCategoryService(db: DatabaseAdapter) {

  async function listTrips(userId = 'default', filter?: { status?: TravelTrip['status'] }): Promise<TravelTrip[]> {
    const conds: string[] = ['user_id = ?'];
    const args: unknown[] = [userId];
    if (filter?.status) { conds.push('status = ?'); args.push(filter.status); }
    return await db.all<TravelTrip>(
      `SELECT * FROM travel_trips WHERE ${conds.join(' AND ')} ORDER BY created_at DESC`,
      ...args,
    );
  }

  async function getTrip(tripId: string): Promise<TravelTrip | null> {
    return (await db.get<TravelTrip>('SELECT * FROM travel_trips WHERE id = ?', tripId)) ?? null;
  }

  async function getTripWithItinerary(tripId: string): Promise<{
    trip: TravelTrip;
    items: TravelItineraryItem[];
    durationDays: number;
    budgetByDay: Array<{ day: number; cost: number; itemCount: number }>;
    budgetVariance: number | null;
  } | null> {
    const trip = await getTrip(tripId);
    if (!trip) return null;
    const items = await db.all<TravelItineraryItem>(
      'SELECT * FROM travel_itinerary_items WHERE trip_id = ? ORDER BY day_number, time_slot NULLS LAST',
      tripId,
    );
    const dur = tripDurationDays(trip.start_date, trip.end_date);
    return {
      trip,
      items,
      durationDays: dur,
      budgetByDay: budgetByDay(items, dur),
      budgetVariance: budgetVariance(trip, items),
    };
  }

  async function getCountryIntel(countryCode: string): Promise<TravelCountryIntel | null> {
    return (await db.get<TravelCountryIntel>(
      'SELECT * FROM travel_country_intel WHERE country_code = ? ORDER BY generated_at DESC LIMIT 1',
      countryCode.toUpperCase(),
    )) ?? null;
  }

  return {
    listTrips,
    getTrip,
    getTripWithItinerary,
    getCountryIntel,
  };
}

export type TravelCategoryService = ReturnType<typeof createTravelCategoryService>;
