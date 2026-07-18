/**
 * verifier-model.ts — the "double-check" (four-eyes) control settings.
 *
 * A double-check runs a SECOND, independent model over a primary AI's output to
 * flag no-go items / prompt-injection / anomalies (see four-eyes-review.ts). It is
 * OFF by default. This module is the single source of truth for two settings,
 * mirroring utility-model.ts (boot-primed cache + stale-while-revalidate sync reads):
 *
 *   - `double_check_enabled` (app_settings) — 'true' | 'false', default 'false'.
 *   - `verifier_model`       (app_settings) — the model id to review WITH,
 *                                              default the utility Haiku.
 *
 * The verifier id is provider-routed the same way as the utility model, so a
 * `compat:apeapi:<model>` id (ApeAPI bundle) passes through untouched and a bare
 * `claude-…` id is mapped to whatever provider the install is configured for.
 *
 * Neither value is a secret (the id is a plain string; the ApeAPI/compat API key
 * lives encrypted in custom_model_endpoints). Reads must never break a hot path,
 * so a DB error keeps the last-known value (or the safe defaults: OFF + Haiku).
 */

import type { DatabaseAdapter } from '../db/database.js';
import { DEFAULT_UTILITY_MODEL, routeUtilityModel, isValidUtilityModelId } from './utility-model.js';

/** The verifier defaults to the same cheap Haiku the utility passes use. */
export const DEFAULT_VERIFIER_MODEL = DEFAULT_UTILITY_MODEL;

const ENABLED_KEY = 'double_check_enabled';
const MODEL_KEY = 'verifier_model';
const CACHE_TTL_MS = 60_000;

interface VerifierSettings {
  enabled: boolean;
  /** null = no row persisted → the default applies. */
  model: string | null;
}

/** undefined = never loaded. */
let cached: VerifierSettings | undefined;
let cachedAt = 0;
let dbRef: DatabaseAdapter | null = null;
let inflight: Promise<void> | null = null;

async function refresh(db: DatabaseAdapter): Promise<void> {
  try {
    const rows = await db.all<{ key: string; value: string }>(
      'SELECT key, value FROM app_settings WHERE key IN (?, ?)',
      ENABLED_KEY,
      MODEL_KEY,
    );
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    cached = {
      enabled: byKey.get(ENABLED_KEY) === 'true',
      model: (byKey.get(MODEL_KEY)?.length ?? 0) > 0 ? (byKey.get(MODEL_KEY) as string) : null,
    };
  } catch (err) {
    // Table missing / DB down — keep the last known value, else safe defaults.
    console.warn(
      `[verifier-model] could not load double-check settings: ${err instanceof Error ? err.message : 'db error'}`,
    );
    if (cached === undefined) cached = { enabled: false, model: null };
  }
  cachedAt = Date.now();
}

/** Prime the cache at boot. Safe to call multiple times. */
export function initVerifierStore(db: DatabaseAdapter): void {
  dbRef = db;
  if (cached === undefined && !inflight) {
    inflight = refresh(db).finally(() => { inflight = null; });
  }
}

async function load(db: DatabaseAdapter): Promise<VerifierSettings> {
  dbRef = db;
  const fresh = cached !== undefined && Date.now() - cachedAt < CACHE_TTL_MS;
  if (!fresh) {
    if (!inflight) inflight = refresh(db).finally(() => { inflight = null; });
    await inflight;
  }
  return cached ?? { enabled: false, model: null };
}

function loadSync(): VerifierSettings {
  if (dbRef && !inflight && (cached === undefined || Date.now() - cachedAt >= CACHE_TTL_MS)) {
    inflight = refresh(dbRef).finally(() => { inflight = null; });
  }
  return cached ?? { enabled: false, model: null };
}

/** Is the double-check turned on? (async — fresh read) */
export async function isDoubleCheckEnabled(db: DatabaseAdapter): Promise<boolean> {
  return (await load(db)).enabled;
}

/** Is the double-check turned on? (sync — stale-while-revalidate) */
export function isDoubleCheckEnabledSync(): boolean {
  return loadSync().enabled;
}

/** The configured verifier model id (Settings choice → default Haiku), un-routed. */
export async function getVerifierModel(db: DatabaseAdapter): Promise<string> {
  return (await load(db)).model ?? DEFAULT_VERIFIER_MODEL;
}

/** Sync variant of getVerifierModel. */
export function getVerifierModelSync(): string {
  return loadSync().model ?? DEFAULT_VERIFIER_MODEL;
}

/** Verifier model id, provider-routed — the standard accessor for the four-eyes call. */
export function getRoutedVerifierModelSync(): string {
  return routeUtilityModel(getVerifierModelSync());
}

/** Async provider-routed accessor. */
export async function getRoutedVerifierModel(db: DatabaseAdapter): Promise<string> {
  return routeUtilityModel(await getVerifierModel(db));
}

/** Reuse the utility-model validation rule (registry id or dynamic ollama:/compat:/azure:). */
export const isValidVerifierModelId = isValidUtilityModelId;

/** Persist the enabled toggle. Cache updated synchronously so the next read sees it. */
export async function setDoubleCheckEnabled(db: DatabaseAdapter, enabled: boolean): Promise<void> {
  dbRef = db;
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ENABLED_KEY,
    enabled ? 'true' : 'false',
  );
  cached = { enabled, model: cached?.model ?? null };
  cachedAt = Date.now();
}

/** Persist (or clear with null/empty) the verifier model. */
export async function setVerifierModel(db: DatabaseAdapter, model: string | null): Promise<void> {
  dbRef = db;
  if (model === null || model.length === 0) {
    await db.run('DELETE FROM app_settings WHERE key = ?', MODEL_KEY);
    cached = { enabled: cached?.enabled ?? false, model: null };
    cachedAt = Date.now();
    return;
  }
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    MODEL_KEY,
    model,
  );
  cached = { enabled: cached?.enabled ?? false, model };
  cachedAt = Date.now();
}

/** Test hook — reset module state between tests. */
export function resetVerifierStoreForTests(): void {
  cached = undefined;
  cachedAt = 0;
  dbRef = null;
  inflight = null;
}
