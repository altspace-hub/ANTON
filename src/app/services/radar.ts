/**
 * radar.ts — typed companion-app client for /api/app/radar/*.
 *
 * Server-side adapter wraps the existing regulatoryRadar service and
 * reshapes items for the new HorizonRadarScreen design (cat / src / blurb /
 * rel 0-100 / tone / tag).
 */

import { activeServerBase, activeAuthHeaders } from './instances';

export type RadarTone = 'red' | 'gold' | 'neutral' | 'teal';

export interface RadarSignal {
  id: string;
  cat: string;            // e.g. "Regulatory" / "Competitors" / "Trends"
  src: string;            // e.g. "EUR-LEX · Official"
  source_type: string;    // 'official' / 'news' / 'paper' / 'rss' / etc.
  title: string;
  blurb: string;          // ai_summary or summary, may be empty
  rel: number;            // 0-100 relevance
  tone: RadarTone;
  tag: string;            // 'HIGH RELEVANCE' / 'WATCHLIST' / 'ACTION SUGGESTED' / 'FYI'
  areas: string[];        // first 3 impact areas, may be empty
  url: string | null;
  published_at: string | null;
  fetched_at: string | null;
  status: string;
}

export interface RadarSummary {
  new_today: number;
  high_relevance: number;
  action_suggested: number;
  sources_active: number;
  scanned_today: number;
  category_counts: Array<{ category: string; count: number }>;
}

export interface RadarSource {
  id: string;
  label: string;
  type: string;
  category: string;
}

async function authedGet<T>(path: string): Promise<T> {
  const base = activeServerBase();
  const headers = await activeAuthHeaders();
  const r = await fetch(`${base}${path}`, { headers });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

async function authedPost<T>(path: string, body?: unknown): Promise<T> {
  const base = activeServerBase();
  const headers = await activeAuthHeaders();
  const r = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export async function getRadarSummary(): Promise<RadarSummary> {
  return authedGet<RadarSummary>('/api/app/radar/summary');
}

export async function getRadarItems(opts?: { category?: string; limit?: number }): Promise<RadarSignal[]> {
  const params = new URLSearchParams();
  if (opts?.category && opts.category !== 'All') params.set('category', opts.category.toLowerCase());
  if (opts?.limit) params.set('limit', String(opts.limit));
  const q = params.toString() ? `?${params.toString()}` : '';
  const data = await authedGet<{ items: RadarSignal[] }>(`/api/app/radar/items${q}`);
  return data.items ?? [];
}

export async function getRadarSources(): Promise<RadarSource[]> {
  const data = await authedGet<{ sources: RadarSource[] }>('/api/app/radar/sources');
  return data.sources ?? [];
}

export async function triggerRadarScan(category?: string): Promise<{ started: boolean }> {
  return authedPost<{ started: boolean }>('/api/app/radar/scan', category ? { category } : undefined);
}

/** Format an absolute timestamp as a short relative meta line ("2h ago" / "3d ago"). */
export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60)         return 'just now';
  if (sec < 3600)       return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)      return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7)  return `${Math.floor(sec / 86400)}d ago`;
  if (sec < 86400 * 30) return `${Math.floor(sec / (86400 * 7))}w ago`;
  return new Date(iso).toLocaleDateString();
}
