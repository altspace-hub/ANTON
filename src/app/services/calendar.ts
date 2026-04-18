/**
 * calendar.ts — typed companion-app client for /api/app/org/:orgId/calendar/*.
 */

import { activeServerBase, activeAuthHeaders } from './instances';

export type CalendarSource = 'anton' | 'work' | 'personal' | 'family';
export type CalendarColor  = 'teal' | 'blue' | 'gold' | 'plum' | 'red';

export interface CalendarSourceMeta {
  id: CalendarSource;
  label: string;
  count: number;
  color: CalendarColor;
}

export interface CalendarEvent {
  id: string;
  time: string;
  duration_minutes: number;
  title: string;
  location: string;
  source: CalendarSource;
  source_label: string;
  color: CalendarColor;
  anton: boolean;
  ext: boolean;
  personal: boolean;
  anton_prep: string | null;
  deep_link: string | null;
}

export interface CalendarToday {
  date: string;
  sources: CalendarSourceMeta[];
  events: CalendarEvent[];
  prep: { title: string; note: string } | null;
}

export async function getCalendarToday(orgId: string, isoDate?: string): Promise<CalendarToday> {
  const base = activeServerBase();
  const headers = await activeAuthHeaders();
  const url = `${base}/api/app/org/${encodeURIComponent(orgId)}/calendar/today${isoDate ? `?date=${encodeURIComponent(isoDate)}` : ''}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json() as Promise<CalendarToday>;
}
