/**
 * area-default-model-store.ts — per-AREA soft default model
 * (ANTON Studio P0, CODING_STUDIO_DESIGN §C-req7 / §D.8 / §F P0).
 *
 * A new precedence rung between the user/enforce override and the
 * product-wide default: an *area* can declare its headline default model
 * (the Coding area defaults to Mistral Large to validate the
 * "smaller-model-with-scaffolding" thesis). Stored in `app_settings` under
 * `area_default_model:<areaId>` (a plain value, NOT a secret).
 *
 * Precedence in claude.ts (highest first):
 *   user override (session `model`) > compliance enforce_model >
 *   AREA default (this store) > product default (default-model-store) > env.
 *
 * The Coding area ships with a SEED default of `mistral-large-latest` even
 * when no row is persisted, so Studio runs on Mistral out of the box; a
 * persisted row (set later from Settings) overrides the seed. Other areas
 * have no seed (returns undefined → falls through to the product default).
 *
 * Sync-read pattern mirrors default-model-store.ts: the resolver is called
 * from sync paths, so all persisted rows are cached in-memory, primed at
 * boot and updated synchronously on every save.
 */

import type { DatabaseAdapter } from '../db/database.js';

const KEY_PREFIX = 'area_default_model:';

/** Seed defaults applied when no row is persisted for an area. */
export const AREA_DEFAULT_MODEL_SEEDS: Record<string, string> = {
  coding: 'mistral-large-latest',
};

/** undefined = not loaded yet. Map of areaId → persisted model id. */
let cache: Map<string, string> | undefined;
let loading: Promise<void> | null = null;
let dbRef: DatabaseAdapter | null = null;

async function loadFromDb(db: DatabaseAdapter): Promise<void> {
  try {
    const rows = await db.all<{ key: string; value: string }>(
      "SELECT key, value FROM app_settings WHERE key LIKE ?",
      `${KEY_PREFIX}%`,
    );
    const next = new Map<string, string>();
    for (const row of rows) {
      if (!row?.key || !row.value) continue;
      const areaId = row.key.slice(KEY_PREFIX.length);
      if (areaId.length > 0) next.set(areaId, row.value);
    }
    cache = next;
  } catch (err) {
    console.warn(
      `[area-default-model-store] could not load area defaults: ${err instanceof Error ? err.message : 'db error'}`,
    );
    cache = new Map();
  }
}

/** Prime the cache at boot. Safe to call multiple times. */
export function initAreaDefaultModelStore(db: DatabaseAdapter): void {
  dbRef = db;
  if (cache === undefined && !loading) {
    loading = loadFromDb(db).finally(() => { loading = null; });
  }
}

/**
 * The effective area default model for an area:
 *   persisted `area_default_model:<areaId>` → seed default → undefined.
 * Returns undefined while the first load is in flight if no seed applies
 * (same degraded-first-call contract as getPersistedDefaultModelSync).
 */
export function getAreaDefaultModelSync(areaId: string | null | undefined): string | undefined {
  if (!areaId) return undefined;
  if (cache === undefined) {
    if (dbRef && !loading) loading = loadFromDb(dbRef).finally(() => { loading = null; });
    // First load in flight: still honour the seed so Studio runs on Mistral
    // immediately at boot (the seed is a constant, not DB state).
    return AREA_DEFAULT_MODEL_SEEDS[areaId];
  }
  return cache.get(areaId) ?? AREA_DEFAULT_MODEL_SEEDS[areaId];
}

/** Persist (or clear, with null/empty) an area default model. Updates the cache synchronously. */
export async function setAreaDefaultModel(
  db: DatabaseAdapter,
  areaId: string,
  model: string | null,
): Promise<void> {
  dbRef = db;
  if (cache === undefined) cache = new Map();
  const key = `${KEY_PREFIX}${areaId}`;
  if (model === null || model.length === 0) {
    await db.run('DELETE FROM app_settings WHERE key = ?', key);
    cache.delete(areaId);
    return;
  }
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    model,
  );
  cache.set(areaId, model);
}

/** Test hook — reset module state between tests. */
export function resetAreaDefaultModelStoreForTests(): void {
  cache = undefined;
  loading = null;
  dbRef = null;
}
