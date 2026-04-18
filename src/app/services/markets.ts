/**
 * markets.ts — typed companion-app client for /api/app/markets/*.
 *
 * Server-side adapter pulls from the existing markets pillar tables
 * (market_indexes/_holdings, market_data_raw, market_predictions,
 * market_narratives) and reshapes the data for MarketsScreen — morning
 * briefing hero + watchlist tape + Monte-Carlo prediction card.
 */

import { activeServerBase, activeAuthHeaders } from './instances';

export interface MarketBriefing {
  available: boolean;
  narrative_type?: string;
  momentum?: string;
  strength?: number;
  headline: string | null;
  blurb: string;
  citations: number;
  portfolio_size: number;
  flags: number;
  updated_at: string | null;
}

export interface TapeRow {
  symbol: string;
  name: string | null;
  price: number | null;
  change_pct: number | null;
  spark: number[] | null;
}

export interface PredictionBucket {
  label: string;
  pct: number;
  color: 'accent' | 'gold' | 'red';
}

export interface MarketPrediction {
  available: boolean;
  id?: string;
  title?: string;
  target_symbol?: string | null;
  prediction_type?: string;
  deadline?: string | null;
  buckets?: PredictionBucket[];
}

async function authedGet<T>(path: string): Promise<T> {
  const base = activeServerBase();
  const headers = await activeAuthHeaders();
  const r = await fetch(`${base}${path}`, { headers });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export async function getMarketBriefing(): Promise<MarketBriefing> {
  return authedGet<MarketBriefing>('/api/app/markets/briefing');
}

export async function getMarketTape(limit = 8): Promise<TapeRow[]> {
  const data = await authedGet<{ tape: TapeRow[] }>(`/api/app/markets/tape?limit=${limit}`);
  return data.tape ?? [];
}

export async function getMarketPrediction(): Promise<MarketPrediction> {
  return authedGet<MarketPrediction>('/api/app/markets/prediction');
}
