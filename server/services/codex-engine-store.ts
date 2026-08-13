/**
 * codex-engine-store.ts — server-side persistence for the Settings
 * "ChatGPT via Codex" execution-engine toggle.
 *
 * Exact sibling of sdk-engine-store.ts (the Claude engine's toggle): the
 * Codex engine needs no API key — the subprocess authenticates with the
 * machine's ChatGPT sign-in (~/.codex/auth.json, created by `codex login`) —
 * so enablement is an explicit toggle, persisted in app_settings
 * (key 'codex_engine_enabled') with env CODEX_ENGINE_ENABLED as the
 * operator fallback. See default-model-store.ts for why env-only knobs are
 * not an option here.
 */

import type { DatabaseAdapter } from '../db/database.js';

const SETTING_KEY = 'codex_engine_enabled';

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
      `[codex-engine-store] could not load persisted toggle: ${err instanceof Error ? err.message : 'db error'}`,
    );
    cachedValue = null;
  }
}

/** Prime the cache at boot (called from createSettingsRoutes). Safe to call repeatedly. */
export function initCodexEngineStore(db: DatabaseAdapter): void {
  dbRef = db;
  if (cachedValue === undefined && !loading) {
    loading = loadFromDb(db).finally(() => { loading = null; });
  }
}

/**
 * Whether the Codex execution engine is enabled.
 * Persisted Settings toggle → env CODEX_ENGINE_ENABLED → false.
 * Returns the env fallback while the initial load is in flight.
 */
export function isCodexEngineEnabled(): boolean {
  if (cachedValue === undefined) {
    if (dbRef && !loading) loading = loadFromDb(dbRef).finally(() => { loading = null; });
    return process.env.CODEX_ENGINE_ENABLED === 'true';
  }
  if (cachedValue === null) return process.env.CODEX_ENGINE_ENABLED === 'true';
  return cachedValue;
}

/** Persist the toggle. Cache updates synchronously — next resolver call sees it. */
export async function setCodexEngineEnabled(db: DatabaseAdapter, enabled: boolean): Promise<void> {
  dbRef = db;
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    SETTING_KEY,
    enabled ? 'true' : 'false',
  );
  cachedValue = enabled;
}

/** Test hook — reset module state between tests. */
export function resetCodexEngineStoreForTests(): void {
  cachedValue = undefined;
  loading = null;
  dbRef = null;
}
