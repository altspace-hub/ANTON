/**
 * utility-model.ts — one utility-model setting consumed everywhere
 * (Core Experience Review 2026-06, Wave 3 item 3.8).
 *
 * ~38 server files used to hardcode 'claude-haiku-4-5-20251001' for
 * background utility calls (extraction, scoring, naming, classification,
 * summarisation). This module is the single source of truth for that
 * model id: the Settings "Utility model" choice is persisted in
 * `app_settings` (key 'utility_model' — plain value, NOT a secret) and
 * read here with a short in-process TTL cache so the many call-sites
 * never hammer the DB.
 *
 * Precedence:
 *   1. The persisted Settings choice (app_settings 'utility_model').
 *   2. DEFAULT_UTILITY_MODEL ('claude-haiku-4-5-20251001') — exactly the
 *      previous hardcoded behaviour when unset.
 *
 * Composition with 3.1 (provider routing): `getRoutedUtilityModel` /
 * `getRoutedUtilityModelSync` additionally pass Claude ids through
 * provider-router's mapModelToProvider, so an Ollama/Mistral-only
 * install executes utility calls on its configured provider instead of
 * failing against a missing Anthropic key. Non-Claude ids (e.g.
 * 'mistral-small-latest', 'ollama:llama3.2', 'compat:groq:…') are used
 * as-is — an explicit user choice is never remapped.
 *
 * `getAnthropicUtilityModel*` exists for the handful of call-sites that
 * are hard-bound to the Anthropic SDK (raw client.messages.create, the
 * Anthropic-only web_search tool, claude-client.complete). Those honour
 * a Claude utility override but fall back to the default Haiku when the
 * configured utility model belongs to another provider — sending
 * 'mistral-small-latest' to the Anthropic API would just be an error.
 *
 * Sync-read pattern mirrors default-model-store.ts: the cache is primed
 * at boot (createSettingsRoutes → initUtilityModelStore) and updated
 * synchronously on save, so sync call-sites (renderers, parseCommand)
 * read stale-while-revalidate from memory.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { mapModelToProvider } from './provider-router.js';
import { MODEL_REGISTRY } from '../types/modelAdapter.js';

export const DEFAULT_UTILITY_MODEL = 'claude-haiku-4-5-20251001';
const SETTING_KEY = 'utility_model';
const CACHE_TTL_MS = 60_000;

/** undefined = never loaded; null = loaded, no row persisted. */
let cachedValue: string | null | undefined;
let cachedAt = 0;
let dbRef: DatabaseAdapter | null = null;
let inflight: Promise<void> | null = null;

async function refresh(db: DatabaseAdapter): Promise<void> {
  try {
    const row = await db.get<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      SETTING_KEY,
    );
    cachedValue = row?.value && row.value.length > 0 ? row.value : null;
  } catch (err) {
    // Table missing / DB down — keep the last known value (or fall back
    // to the default). Utility calls must never break on a settings read.
    console.warn(
      `[utility-model] could not load persisted utility model: ${err instanceof Error ? err.message : 'db error'}`,
    );
    if (cachedValue === undefined) cachedValue = null;
  }
  cachedAt = Date.now();
}

/** Prime the cache at boot. Safe to call multiple times. */
export function initUtilityModelStore(db: DatabaseAdapter): void {
  dbRef = db;
  if (cachedValue === undefined && !inflight) {
    inflight = refresh(db).finally(() => { inflight = null; });
  }
}

/**
 * The configured utility model id (Settings choice → default Haiku).
 * Cached in-process for CACHE_TTL_MS so the ~38 call-sites don't hammer
 * the DB.
 */
export async function getUtilityModel(db: DatabaseAdapter): Promise<string> {
  dbRef = db;
  const fresh = cachedValue !== undefined && Date.now() - cachedAt < CACHE_TTL_MS;
  if (!fresh) {
    if (!inflight) inflight = refresh(db).finally(() => { inflight = null; });
    await inflight;
  }
  return cachedValue ?? DEFAULT_UTILITY_MODEL;
}

/**
 * Sync accessor for call-sites without a DatabaseAdapter in scope
 * (renderers, parseCommand). Stale-while-revalidate: returns the cached
 * value immediately and refreshes in the background when the TTL has
 * elapsed and a db reference is known.
 */
export function getUtilityModelSync(): string {
  if (dbRef && !inflight && (cachedValue === undefined || Date.now() - cachedAt >= CACHE_TTL_MS)) {
    inflight = refresh(dbRef).finally(() => { inflight = null; });
  }
  return cachedValue ?? DEFAULT_UTILITY_MODEL;
}

/**
 * Provider-route a utility model id (3.1): Claude ids are mapped to the
 * configured provider's equivalent tier via mapModelToProvider; explicit
 * non-Claude choices pass through untouched.
 */
export function routeUtilityModel(model: string): string {
  return model.startsWith('claude-') ? mapModelToProvider(model) : model;
}

/** Utility model id, provider-routed — the standard accessor for callChat/streamChat sites. */
export async function getRoutedUtilityModel(db: DatabaseAdapter): Promise<string> {
  return routeUtilityModel(await getUtilityModel(db));
}

/** Sync variant of getRoutedUtilityModel for db-less call-sites. */
export function getRoutedUtilityModelSync(): string {
  return routeUtilityModel(getUtilityModelSync());
}

/**
 * For call-sites hard-bound to the Anthropic SDK (raw messages.create,
 * web_search tool): honour a Claude utility override, otherwise keep the
 * default Haiku — a non-Anthropic id would be rejected by that API.
 */
export async function getAnthropicUtilityModel(db: DatabaseAdapter): Promise<string> {
  const m = await getUtilityModel(db);
  return m.startsWith('claude-') ? m : DEFAULT_UTILITY_MODEL;
}

/** Sync variant of getAnthropicUtilityModel. */
export function getAnthropicUtilityModelSync(): string {
  const m = getUtilityModelSync();
  return m.startsWith('claude-') ? m : DEFAULT_UTILITY_MODEL;
}

/**
 * Validate a candidate utility-model id against the model registry.
 * Dynamic prefixes (ollama:/compat:/azure:) can't be statically
 * enumerated — they resolve against the DB / a remote endpoint at call
 * time — so they are accepted here (same rule as
 * missions/mission-model-resolver.isResolvableModelId).
 */
export function isValidUtilityModelId(model: string): boolean {
  if (MODEL_REGISTRY[model]) return true;
  return model.startsWith('ollama:') || model.startsWith('compat:') || model.startsWith('azure:')
    // Subscription execution engines (sdk:/codex:) — like the dynamic prefixes
    // above there is no static registry entry; the enabled gate applies at call time.
    || model.startsWith('sdk:') || model.startsWith('codex:');
}

/**
 * Persist (or clear, with null/empty) the utility model. The in-memory
 * cache is updated synchronously so the very next utility call sees the
 * new value — no restart, no TTL wait.
 */
export async function setUtilityModel(
  db: DatabaseAdapter,
  model: string | null,
): Promise<void> {
  dbRef = db;
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
export function resetUtilityModelStoreForTests(): void {
  cachedValue = undefined;
  cachedAt = 0;
  dbRef = null;
  inflight = null;
}
