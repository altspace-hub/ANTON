/**
 * embedding-pin.ts — the embedding provider is pinned (Wave 6, track I).
 *
 * The embedding provider is chosen by environment (EMBEDDING_PROVIDER, or
 * whichever of VOYAGE / OPENAI / OLLAMA is configured), and each provider has
 * its own vector space and dimension: OpenAI 1536, Ollama 768 / 1024, Voyage
 * 512. Changing the environment silently invalidated every stored vector —
 * the cosine of two vectors from different spaces is meaningless, and of two
 * different lengths is 0 — and nothing recorded which provider produced the
 * rows the instance already had.
 *
 * This module records the ACTIVE provider / model / dimension in app_settings
 * the first time an embedding is produced (`ensureEmbeddingPin`), and on every
 * later use compares the active adapter with that pin (`checkEmbeddingPin`):
 * a mismatch logs one clear warning per process, and the vector search only
 * scores rows the active adapter produced (hybrid-search.ts passes the active
 * model to the store — see there). Rows from an earlier provider stay
 * keyword-searchable and can be brought over with
 * POST /api/embeddings/reembed-mismatched, after which the pin follows the
 * active adapter (`repinToActive`).
 *
 * Nothing here throws on a settings read: a search must never break because
 * app_settings is unreachable — the pin is then treated as absent for the call.
 */

import type { DatabaseAdapter } from '../db/database.js';
import type { EmbeddingAdapter } from './embedding-adapter.js';

/** app_settings keys. Plain values, not secrets. */
export const EMBEDDING_PIN_KEYS = {
  provider: 'embedding_provider',
  model: 'embedding_model',
  dimension: 'embedding_dimension',
} as const;

export interface EmbeddingPin {
  provider: string;
  model: string;
  dimension: number;
}

export interface EmbeddingPinStatus {
  /** What the running adapter embeds with right now. */
  active: EmbeddingPin;
  /** What app_settings says the instance's vectors were produced with; null before the first embedding. */
  pinned: EmbeddingPin | null;
  /** A pin exists and the active adapter differs from it (model or dimension). */
  mismatch: boolean;
  /** This call wrote the pin (first embedding on this instance). */
  pinnedNow: boolean;
}

/** Row counts per (model, dimension) in the embeddings table. */
export interface EmbeddingRowGroup {
  embedding_model: string;
  embedding_dimension: number;
  count: number;
}

/** undefined = not loaded yet; null = loaded, no pin persisted. */
let cachedPin: EmbeddingPin | null | undefined;
let warnedMismatch: string | null = null;

export function activePin(adapter: Pick<EmbeddingAdapter, 'provider' | 'model' | 'dimensions'>): EmbeddingPin {
  return { provider: adapter.provider, model: adapter.model, dimension: adapter.dimensions };
}

/** Model + dimension decide compatibility; the provider label is informational. */
export function pinsMatch(a: EmbeddingPin, b: EmbeddingPin): boolean {
  return a.model === b.model && a.dimension === b.dimension;
}

export function describeMismatch(pinned: EmbeddingPin, active: EmbeddingPin): string {
  return `[embedding-pin] Embedding provider changed: stored vectors were produced by `
    + `${pinned.provider}/${pinned.model} (${pinned.dimension}d) but the active adapter is `
    + `${active.provider}/${active.model} (${active.dimension}d). Rows from the old provider are `
    + `excluded from vector scoring (keyword search still finds them) until they are re-embedded: `
    + `POST /api/embeddings/reembed-mismatched (dryRun defaults to true).`;
}

async function readPin(db: DatabaseAdapter): Promise<EmbeddingPin | null> {
  try {
    const rows = await db.all<{ key: string; value: string }>(
      'SELECT key, value FROM app_settings WHERE key IN (?, ?, ?)',
      EMBEDDING_PIN_KEYS.provider, EMBEDDING_PIN_KEYS.model, EMBEDDING_PIN_KEYS.dimension,
    );
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const model = byKey.get(EMBEDDING_PIN_KEYS.model);
    const dimension = Number(byKey.get(EMBEDDING_PIN_KEYS.dimension));
    if (!model || !Number.isFinite(dimension) || dimension <= 0) return null;
    return { provider: byKey.get(EMBEDDING_PIN_KEYS.provider) ?? 'unknown', model, dimension };
  } catch (err) {
    console.warn(`[embedding-pin] could not read the embedding pin: ${err instanceof Error ? err.message : 'db error'}`);
    return null;
  }
}

async function writePin(db: DatabaseAdapter, pin: EmbeddingPin): Promise<void> {
  const entries: Array<[string, string]> = [
    [EMBEDDING_PIN_KEYS.provider, pin.provider],
    [EMBEDDING_PIN_KEYS.model, pin.model],
    [EMBEDDING_PIN_KEYS.dimension, String(pin.dimension)],
  ];
  for (const [key, value] of entries) {
    await db.run(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key, value,
    );
  }
}

async function loadPin(db: DatabaseAdapter): Promise<EmbeddingPin | null> {
  if (cachedPin === undefined) cachedPin = await readPin(db);
  return cachedPin;
}

function warnOnce(pinned: EmbeddingPin, active: EmbeddingPin): void {
  const key = `${pinned.model}/${pinned.dimension}->${active.model}/${active.dimension}`;
  if (warnedMismatch === key) return;
  warnedMismatch = key;
  console.warn(describeMismatch(pinned, active));
}

/**
 * Compare the active adapter with the pin. Read-only — never writes a pin —
 * so a search on a fresh instance does not pin a provider nothing has
 * embedded with yet. Warns once per process per distinct mismatch.
 */
export async function checkEmbeddingPin(db: DatabaseAdapter, adapter: EmbeddingAdapter): Promise<EmbeddingPinStatus> {
  const active = activePin(adapter);
  const pinned = await loadPin(db);
  const mismatch = pinned !== null && !pinsMatch(pinned, active);
  if (mismatch && pinned) warnOnce(pinned, active);
  return { active, pinned, mismatch, pinnedNow: false };
}

/**
 * Called when an embedding has just been produced and stored: writes the pin
 * the first time, compares (and warns once) every time after. Never throws.
 */
export async function ensureEmbeddingPin(db: DatabaseAdapter, adapter: EmbeddingAdapter): Promise<EmbeddingPinStatus> {
  const active = activePin(adapter);
  const pinned = await loadPin(db);
  if (pinned === null) {
    try {
      await writePin(db, active);
      cachedPin = active;
      console.log(`[embedding-pin] pinned embedding provider: ${active.provider}/${active.model} (${active.dimension}d)`);
      return { active, pinned: active, mismatch: false, pinnedNow: true };
    } catch (err) {
      console.warn(`[embedding-pin] could not write the embedding pin: ${err instanceof Error ? err.message : 'db error'}`);
      return { active, pinned: null, mismatch: false, pinnedNow: false };
    }
  }
  const mismatch = !pinsMatch(pinned, active);
  if (mismatch) warnOnce(pinned, active);
  return { active, pinned, mismatch, pinnedNow: false };
}

/** Move the pin to the active adapter — after every mismatched row has been re-embedded. */
export async function repinToActive(db: DatabaseAdapter, adapter: EmbeddingAdapter): Promise<EmbeddingPin> {
  const active = activePin(adapter);
  await writePin(db, active);
  cachedPin = active;
  warnedMismatch = null;
  console.log(`[embedding-pin] re-pinned embedding provider: ${active.provider}/${active.model} (${active.dimension}d)`);
  return active;
}

/** Row counts per (model, dimension), largest group first. */
export async function countEmbeddingRowsByModel(db: DatabaseAdapter): Promise<EmbeddingRowGroup[]> {
  const rows = await db.all<{ embedding_model: string; embedding_dimension: number | string; count: number | string }>(
    `SELECT embedding_model, embedding_dimension, COUNT(*) AS count
       FROM embeddings
      GROUP BY embedding_model, embedding_dimension
      ORDER BY count DESC`,
  );
  return rows.map((r) => ({
    embedding_model: r.embedding_model,
    embedding_dimension: Number(r.embedding_dimension),
    count: Number(r.count),
  }));
}

/** Rows whose model or dimension differ from `active` — what reembed-mismatched would touch. */
export async function countMismatchedEmbeddingRows(db: DatabaseAdapter, active: EmbeddingPin): Promise<number> {
  const row = await db.get<{ c: number | string }>(
    'SELECT COUNT(*) AS c FROM embeddings WHERE embedding_model <> ? OR embedding_dimension <> ?',
    active.model, active.dimension,
  );
  return Number(row?.c ?? 0);
}

/** The groups in `rows` that do not match `active`. */
export function mismatchedGroups(rows: EmbeddingRowGroup[], active: EmbeddingPin): EmbeddingRowGroup[] {
  return rows.filter((r) => r.embedding_model !== active.model || r.embedding_dimension !== active.dimension);
}

/** Test hook — reset module state between tests. */
export function resetEmbeddingPinForTests(): void {
  cachedPin = undefined;
  warnedMismatch = null;
}
