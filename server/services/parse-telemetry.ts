/**
 * parse-telemetry.ts — JSON-parse success/failure counters per model
 * (Core Experience Review 2026-06, Wave 3 items 3.1 + 3.8).
 *
 * The learning layer (atom extraction, relationship detection, quality
 * scoring, structured extraction) asks small models for strict JSON.
 * Small/local models fail that contract far more often than Haiku, and
 * before this module those failures were swallowed silently — an
 * Ollama-only install could be capturing zero atoms with no signal
 * anywhere (the Markets lesson: claims of intelligence must be
 * measurable).
 *
 * Counters are aggregated per (service, model) and persisted as a JSON
 * blob in `app_settings` (key 'llm_parse_stats') so a single query — or
 * the GET /api/settings/parse-stats endpoint — answers "what is the
 * parse success rate of the configured utility model?". Recording is
 * strictly best-effort: a telemetry failure must never break a run.
 *
 * Shape:
 *   { [service]: { [model]: { ok, fail, last_error, updated_at } } }
 */

import type { DatabaseAdapter } from '../db/database.js';

const SETTING_KEY = 'llm_parse_stats';
const MAX_ERROR_LEN = 300;

export interface ParseStatEntry {
  ok: number;
  fail: number;
  last_error: string | null;
  updated_at: string;
}

/** service → model → counters */
export type ParseStats = Record<string, Record<string, ParseStatEntry>>;

/** undefined = never loaded. */
let stats: ParseStats | undefined;

async function load(db: DatabaseAdapter): Promise<void> {
  try {
    const row = await db.get<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      SETTING_KEY,
    );
    if (row?.value) {
      const parsed: unknown = JSON.parse(row.value);
      stats = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        ? parsed as ParseStats
        : {};
    } else {
      stats = {};
    }
  } catch {
    // Unreadable blob / DB down — start fresh in memory; persistence
    // will be retried on the next record.
    stats = {};
  }
}

/**
 * Record one JSON-parse outcome for a utility LLM call. Never throws.
 * Failures additionally log a console warning so persistent breakage on
 * a given model is visible in server logs without querying the DB.
 */
export async function recordParseOutcome(
  db: DatabaseAdapter,
  service: string,
  model: string,
  ok: boolean,
  error?: string,
): Promise<void> {
  try {
    if (stats === undefined) await load(db);
    const byModel = (stats as ParseStats)[service] ?? ((stats as ParseStats)[service] = {});
    const entry = byModel[model] ?? (byModel[model] = { ok: 0, fail: 0, last_error: null, updated_at: '' });
    if (ok) {
      entry.ok += 1;
    } else {
      entry.fail += 1;
      entry.last_error = (error ?? 'unparseable output').slice(0, MAX_ERROR_LEN);
      console.warn(`[parse-telemetry] ${service}: JSON parse FAILED on model ${model} (${entry.fail} total failures): ${entry.last_error}`);
    }
    entry.updated_at = new Date().toISOString();
    await db.run(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      SETTING_KEY,
      JSON.stringify(stats),
    );
  } catch (err) {
    // Telemetry must never break the calling run.
    console.warn('[parse-telemetry] could not record parse outcome:', err instanceof Error ? err.message : err);
  }
}

/** Aggregated counters (loads from app_settings on first call). */
export async function getParseStats(db: DatabaseAdapter): Promise<ParseStats> {
  if (stats === undefined) await load(db);
  return stats ?? {};
}

/** Test hook — reset module state between tests. */
export function resetParseTelemetryForTests(): void {
  stats = undefined;
}
