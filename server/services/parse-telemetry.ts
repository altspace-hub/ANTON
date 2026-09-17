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

/** Writes are serialised in-process so two concurrent records cannot both
 *  read the row, each add their own outcome, and have the second write
 *  discard the first (merge-on-write, Wave 3 — the counters are the only
 *  evidence that a small model is failing its JSON contract). */
let writeChain: Promise<void> = Promise.resolve();

function parseBlob(value: string | undefined | null): ParseStats {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed as ParseStats : {};
  } catch {
    return {};
  }
}

async function readRow(db: DatabaseAdapter): Promise<ParseStats> {
  const row = await db.get<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    SETTING_KEY,
  );
  return parseBlob(row?.value);
}

async function load(db: DatabaseAdapter): Promise<void> {
  try {
    stats = await readRow(db);
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
 *
 * Merge-on-write: the (service, model) entry is applied on top of the row
 * as it is in the database at write time, not on top of the copy this
 * process loaded at boot. Before this, every record rewrote the whole blob
 * from the in-memory copy, so a second server process (or the migration
 * runner, or a test worker) sharing the database silently erased the other
 * writer's counters — and a process that had loaded an empty table wrote
 * `{}` plus its own single entry over everything.
 */
export async function recordParseOutcome(
  db: DatabaseAdapter,
  service: string,
  model: string,
  ok: boolean,
  error?: string,
): Promise<void> {
  const apply = async (): Promise<void> => {
    let current: ParseStats;
    try {
      current = await readRow(db);
    } catch {
      // Row unreadable — fall back to what this process knows rather than
      // dropping the outcome. The next successful read re-synchronises.
      current = stats ?? {};
    }
    const byModel = current[service] ?? (current[service] = {});
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
      JSON.stringify(current),
    );
    stats = current;
  };
  const turn = writeChain.then(apply, apply);
  writeChain = turn.catch(() => undefined);
  try {
    await turn;
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
