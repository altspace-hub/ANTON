/**
 * sdk-engine-store.ts — server-side persistence for the Settings
 * "Claude via SDK" execution-engine toggle.
 *
 * The SDK engine (claude-sdk-client.ts) runs Anthropic models through the
 * Claude Agent SDK subprocess instead of the Messages API. Its whole point
 * is that it needs NO API key — the subprocess authenticates with the
 * machine's Claude Code login (subscription). That also means there is no
 * key whose presence could act as the enable signal, so enablement is an
 * explicit toggle.
 *
 * Persistence follows default-model-store.ts exactly (and for the same
 * reason — its header records how an env-only knob split-brained the
 * default model): the Settings choice is written through to `app_settings`
 * (key 'sdk_engine_enabled', plain 'true'/'false' — NOT a secret) and
 * cached in-memory for the sync resolvers; env SDK_ENGINE_ENABLED=true is
 * only a fallback for operators who configure by .env.
 */

import type { DatabaseAdapter } from '../db/database.js';

const SETTING_KEY = 'sdk_engine_enabled';

/** undefined = not loaded yet; null = loaded, no row persisted. */
let cachedValue: boolean | null | undefined;
let loading: Promise<void> | null = null;
let dbRef: DatabaseAdapter | null = null;

async function loadFromDb(db: DatabaseAdapter): Promise<void> {
  try {
    const row = await db.get<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      SETTING_KEY,
    );
    cachedValue = row ? row.value === 'true' : null;
  } catch (err) {
    console.warn(
      `[sdk-engine-store] could not load persisted toggle: ${err instanceof Error ? err.message : 'db error'}`,
    );
    cachedValue = null;
  }
}

/** Prime the cache at boot (called from createSettingsRoutes). Safe to call repeatedly. */
export function initSdkEngineStore(db: DatabaseAdapter): void {
  dbRef = db;
  if (cachedValue === undefined && !loading) {
    loading = loadFromDb(db).finally(() => { loading = null; });
  }
}

/**
 * Whether the SDK execution engine is enabled.
 * Persisted Settings toggle → env SDK_ENGINE_ENABLED → false.
 * Returns false while the initial load is in flight (same degraded-first-call
 * contract as getPersistedDefaultModelSync — a request racing boot falls back
 * to the env value rather than blocking).
 */
export function isSdkEngineEnabled(): boolean {
  if (cachedValue === undefined) {
    if (dbRef && !loading) loading = loadFromDb(dbRef).finally(() => { loading = null; });
    return process.env.SDK_ENGINE_ENABLED === 'true';
  }
  if (cachedValue === null) return process.env.SDK_ENGINE_ENABLED === 'true';
  return cachedValue;
}

/** Persist the toggle. Cache updates synchronously — next resolver call sees it. */
export async function setSdkEngineEnabled(db: DatabaseAdapter, enabled: boolean): Promise<void> {
  dbRef = db;
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    SETTING_KEY,
    enabled ? 'true' : 'false',
  );
  cachedValue = enabled;
}

/** Test hook — reset module state between tests. */
export function resetSdkEngineStoreForTests(): void {
  cachedValue = undefined;
  loading = null;
  dbRef = null;
}
