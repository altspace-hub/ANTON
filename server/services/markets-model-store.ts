/**
 * markets-model-store.ts — the Markets pillar's own AI model setting.
 *
 * Markets automation makes hundreds of background LLM calls per week
 * (atom extraction, theses, why-chains, analyst notes, consuls, the
 * prediction verifier). Which model pays for that volume is a deliberate
 * choice — e.g. `sdk:claude-opus-5` runs the whole pillar on this
 * machine's Claude subscription instead of a metered API key.
 *
 * Storage: app_settings key 'markets_model' (plain model id, not a
 * secret). Unset → every call site falls back to the provider-routed
 * utility model, which is exactly the pre-existing behaviour.
 * Mirrors utility-model.ts (boot-primed TTL cache).
 */

import type { DatabaseAdapter } from '../db/database.js';
import { getRoutedUtilityModel, isValidUtilityModelId } from './utility-model.js';

const SETTING_KEY = 'markets_model';
const CACHE_TTL_MS = 60_000;

/** undefined = never loaded; null = loaded, no row persisted. */
let cachedValue: string | null | undefined;
let cachedAt = 0;
let inflight: Promise<void> | null = null;

async function refresh(db: DatabaseAdapter): Promise<void> {
  try {
    const row = await db.get<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      SETTING_KEY,
    );
    cachedValue = row?.value && row.value.length > 0 ? row.value : null;
  } catch (err) {
    // Table missing / DB down — keep the last known value. Markets calls
    // must never break on a settings read.
    console.warn(
      `[markets-model] could not load persisted markets model: ${err instanceof Error ? err.message : 'db error'}`,
    );
    if (cachedValue === undefined) cachedValue = null;
  }
  cachedAt = Date.now();
}

/** Prime the cache at boot. Safe to call multiple times. */
export function initMarketsModelStore(db: DatabaseAdapter): void {
  if (cachedValue === undefined && !inflight) {
    inflight = refresh(db).finally(() => { inflight = null; });
  }
}

/** The raw persisted choice (null = unset → utility-model fallback applies). */
export async function getMarketsModelSetting(db: DatabaseAdapter): Promise<string | null> {
  const fresh = cachedValue !== undefined && Date.now() - cachedAt < CACHE_TTL_MS;
  if (!fresh) {
    if (!inflight) inflight = refresh(db).finally(() => { inflight = null; });
    await inflight;
  }
  return cachedValue ?? null;
}

/**
 * The model every markets LLM call should use: the explicit Settings
 * choice when set, else the provider-routed utility model (the
 * pre-existing behaviour of all markets call sites).
 */
export async function getMarketsModel(db: DatabaseAdapter): Promise<string> {
  return (await getMarketsModelSetting(db)) ?? await getRoutedUtilityModel(db);
}

/** Same rule as the utility model: registry id or dynamic ollama:/compat:/azure:/sdk:/codex: id. */
export const isValidMarketsModelId = isValidUtilityModelId;

/** Persist (or clear with null/empty) the markets model. Cache updated synchronously. */
export async function setMarketsModel(db: DatabaseAdapter, model: string | null): Promise<void> {
  if (model === null || model.length === 0) {
    await db.run('DELETE FROM app_settings WHERE key = ?', SETTING_KEY);
    cachedValue = null;
    cachedAt = Date.now();
    return;
  }
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    SETTING_KEY,
    model,
  );
  cachedValue = model;
  cachedAt = Date.now();
}

/** Test hook — reset module state between tests. */
export function resetMarketsModelStoreForTests(): void {
  cachedValue = undefined;
  cachedAt = 0;
  inflight = null;
}
