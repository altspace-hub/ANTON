/**
 * default-model-store.ts — server-side persistence for the Settings
 * "Default model" choice.
 *
 * Before this module existed there were TWO disconnected default-model
 * knobs: the Settings chips wrote only to localStorage
 * ('openexpert-default-model', read by the frontend session composer),
 * while every server-side resolver (provider-router's
 * getConfiguredProvider / mapModelToProvider, missions, agents,
 * renderers, the structured extractor, …) read only env DEFAULT_MODEL.
 * A Mistral user therefore got Mistral for module runs but Claude (or
 * key errors) everywhere else. This store closes that gap: the Settings
 * choice is written through to `app_settings` (key 'default_model' —
 * plain value, NOT a secret) and consulted by the server-side resolvers.
 *
 * Precedence (highest first):
 *   1. An explicit model passed by the caller (module runs already pass
 *      the session model — unchanged by this store).
 *   2. The persisted Settings choice (app_settings 'default_model').
 *   3. env DEFAULT_MODEL (.env operator default).
 *   4. Provider env-key priority (Anthropic > Mistral > OpenAI > Google)
 *      — implemented in provider-router's getConfiguredProvider.
 *
 * Sync-read pattern mirrors getCustomModelConfigsSync in
 * model-adapter.ts: the resolvers are sync and called from sync paths,
 * so the value is cached in-memory. The cache is primed at route-factory
 * construction (createSettingsRoutes → initDefaultModelStore) and
 * updated synchronously on every save, so steady-state reads never miss.
 */

import type { DatabaseAdapter } from '../db/database.js';

const SETTING_KEY = 'default_model';

/** undefined = not loaded yet; null = loaded, no row persisted. */
let cachedModel: string | null | undefined;
let loading: Promise<void> | null = null;
let dbRef: DatabaseAdapter | null = null;

async function loadFromDb(db: DatabaseAdapter): Promise<void> {
  try {
    const row = await db.get<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      SETTING_KEY,
    );
    cachedModel = row?.value && row.value.length > 0 ? row.value : null;
  } catch (err) {
    // Table missing / DB down — fall back to env precedence. Log the
    // event only (no values are secret here, but keep logs terse).
    console.warn(
      `[default-model-store] could not load persisted default model: ${err instanceof Error ? err.message : 'db error'}`,
    );
    cachedModel = null;
  }
}

/**
 * Prime the cache at boot (called from createSettingsRoutes, which runs
 * during server start). Safe to call multiple times.
 */
export function initDefaultModelStore(db: DatabaseAdapter): void {
  dbRef = db;
  if (cachedModel === undefined && !loading) {
    loading = loadFromDb(db).finally(() => { loading = null; });
  }
}

/**
 * Sync accessor for the persisted Settings default model. Returns
 * undefined while the initial load is in flight (callers fall through to
 * env DEFAULT_MODEL — same degraded-first-call contract as
 * getCustomModelConfigsSync).
 */
export function getPersistedDefaultModelSync(): string | undefined {
  if (cachedModel === undefined) {
    if (dbRef && !loading) loading = loadFromDb(dbRef).finally(() => { loading = null; });
    return undefined;
  }
  return cachedModel ?? undefined;
}

/**
 * The effective product-wide default model id:
 * persisted Settings choice → env DEFAULT_MODEL → undefined.
 */
export function getEffectiveDefaultModel(): string | undefined {
  return getPersistedDefaultModelSync() ?? process.env.DEFAULT_MODEL ?? undefined;
}

/**
 * Persist (or clear, with null/empty) the Settings default model. The
 * in-memory cache is updated synchronously so the very next resolver
 * call sees the new value — no restart, no async race.
 */
export async function setPersistedDefaultModel(
  db: DatabaseAdapter,
  model: string | null,
): Promise<void> {
  dbRef = db;
  if (model === null || model.length === 0) {
    await db.run('DELETE FROM app_settings WHERE key = ?', SETTING_KEY);
    cachedModel = null;
    return;
  }
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    SETTING_KEY,
    model,
  );
  cachedModel = model;
}

/** Test hook — reset module state between tests. */
export function resetDefaultModelStoreForTests(): void {
  cachedModel = undefined;
  loading = null;
  dbRef = null;
}
