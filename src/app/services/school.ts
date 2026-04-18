/**
 * school.ts — typed companion-app client for /api/app/org/:orgId/school/*.
 */

import { activeServerBase, activeAuthHeaders } from './instances';

export interface UpNextItem {
  id: string;
  kind: 'watch' | 'practice' | 'homework' | 'ask';
  title: string;
  subtitle: string;
  color: 'red' | 'blue' | 'gold' | 'teal' | 'green';
  icon: string;
  due?: boolean;
}

export interface TodayLesson {
  title: string;
  subtitle: string;
  duration_minutes: number;
  progress_steps: number;
  completed_steps: number;
  offline_ready: boolean;
  audio_available: boolean;
}

export interface SchoolFeed {
  streak: number;
  day_label: string;
  course_label: string;
  today_lesson: TodayLesson | null;
  up_next: UpNextItem[];
}

export async function getSchoolFeed(orgId: string): Promise<SchoolFeed> {
  const base = activeServerBase();
  const headers = await activeAuthHeaders();
  const r = await fetch(`${base}/api/app/org/${encodeURIComponent(orgId)}/school/today`, { headers });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json() as Promise<SchoolFeed>;
}
