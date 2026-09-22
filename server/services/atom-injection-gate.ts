/**
 * atom-injection-gate.ts — inject memory only when it has earned its place
 * (Wave 4 track B, 2026-09-17).
 *
 * The verified state of this instance on 2026-09-16: 2,959 knowledge atoms of
 * which 70 came from real module work (the rest are Coding Studio lint), 482
 * retrieval_feedback rows and not one of them ever rated. A September FCP run
 * still received five March/May open-chat boilerplate atoms labelled
 * "supporting evidence". The owner decision: the general atom layer stays OFF
 * for Work until the memory has 100 module atoms and 30 ratings behind it;
 * collection keeps running, Coding Studio project lessons are untouched, and
 * the thumbs stay visible so the ratings can accrue. Ratings of answers count
 * as well as ratings of memory (see ATOM_INJECTION_GATE_SQL.ratings).
 *
 * This module is the single place that decides. The mode lives in
 * app_settings ('auto' | 'on' | 'off', missing row = 'auto'); the counts are
 * read live and cached for a minute because the prompt path is hot. A broken
 * read never injects: the gate answers applies=false with a reason.
 */

import type { DatabaseAdapter } from '../db/database.js';

export const ATOM_INJECTION_MODE_SETTING_KEY = 'atom_injection_mode';
export const ATOM_INJECTION_MIN_MODULE_ATOMS = 100;
export const ATOM_INJECTION_MIN_RATINGS = 30;

export type AtomInjectionMode = 'auto' | 'on' | 'off';

export interface AtomInjectionStatus {
  mode: AtomInjectionMode;
  /** Both thresholds met. */
  ready: boolean;
  /** Whether the general atom layer is injected: on, or auto and ready. */
  applies: boolean;
  /** Active atoms learned from a module run (not Coding Studio, not lint). */
  moduleAtoms: number;
  /** retrieval_feedback rows a human has rated either way. */
  ratings: number;
  thresholds: { moduleAtoms: number; ratings: number };
  /** One plain sentence the UI shows verbatim. */
  reason: string;
}

/** The statements, exported so a fake adapter can answer them by identity. */
export const ATOM_INJECTION_GATE_SQL = {
  mode: 'SELECT value FROM app_settings WHERE key = ?',
  moduleAtoms:
    'SELECT COUNT(*) AS c FROM knowledge_atoms WHERE is_active = 1 AND source_module_id IS NOT NULL AND coding_project_id IS NULL AND atom_origin IS NULL',
  // Memory ratings alone could never reach the threshold: retrieval_feedback
  // rows exist only when atoms were injected, and injection waits for the
  // ratings (2026-09-22 Work QA: 482 rows, 0 rated). The ratings people give
  // are on the answer — the verdict / rating form (output_feedback) and the
  // stars (post_market_events) — so those count too.
  ratings:
    "SELECT (SELECT COUNT(*) FROM retrieval_feedback WHERE was_relevant IS NOT NULL)"
    + " + (SELECT COUNT(*) FROM output_feedback)"
    + " + (SELECT COUNT(*) FROM post_market_events WHERE event_type = 'quality_rating') AS c",
  upsertMode: 'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
} as const;

const CACHE_TTL_MS = 60_000;
const THRESHOLDS = { moduleAtoms: ATOM_INJECTION_MIN_MODULE_ATOMS, ratings: ATOM_INJECTION_MIN_RATINGS } as const;

let cache: { at: number; status: AtomInjectionStatus } | null = null;

/** Drop the 60 s cache (tests, and after a mode change). */
export function resetAtomInjectionGateCache(): void {
  cache = null;
}

export function isAtomInjectionMode(value: unknown): value is AtomInjectionMode {
  return value === 'auto' || value === 'on' || value === 'off';
}

function parseMode(raw: unknown): AtomInjectionMode {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return isAtomInjectionMode(v) ? v : 'auto';
}

function describe(mode: AtomInjectionMode, ready: boolean, moduleAtoms: number, ratings: number): string {
  if (mode === 'off') return 'Switched off in Settings';
  if (mode === 'on') return 'Forced on in Settings';
  if (ready) {
    return `Ready: ${moduleAtoms} module atoms (threshold ${THRESHOLDS.moduleAtoms}), ${ratings} ratings (threshold ${THRESHOLDS.ratings})`;
  }
  return `Collecting: ${moduleAtoms} of ${THRESHOLDS.moduleAtoms} module atoms, ${ratings} of ${THRESHOLDS.ratings} ratings`;
}

function unavailable(): AtomInjectionStatus {
  return {
    mode: 'auto', ready: false, applies: false, moduleAtoms: 0, ratings: 0,
    thresholds: { ...THRESHOLDS }, reason: 'gate unavailable',
  };
}

/**
 * The gate's current answer. Cached for a minute unless `fresh` is set (the
 * dashboard asks fresh; the prompt path takes the cache). A database error is
 * never cached and never injects.
 */
export async function getAtomInjectionStatus(
  db: DatabaseAdapter,
  opts: { fresh?: boolean } = {},
): Promise<AtomInjectionStatus> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.status;
  try {
    const modeRow = await db.get<{ value: string }>(ATOM_INJECTION_GATE_SQL.mode, ATOM_INJECTION_MODE_SETTING_KEY);
    const mode = parseMode(modeRow?.value);
    const atomsRow = await db.get<{ c: number | string }>(ATOM_INJECTION_GATE_SQL.moduleAtoms);
    const ratingsRow = await db.get<{ c: number | string }>(ATOM_INJECTION_GATE_SQL.ratings);
    const moduleAtoms = Number(atomsRow?.c ?? 0) || 0;
    const ratings = Number(ratingsRow?.c ?? 0) || 0;
    const ready = moduleAtoms >= THRESHOLDS.moduleAtoms && ratings >= THRESHOLDS.ratings;
    const applies = mode === 'on' || (mode === 'auto' && ready);
    const status: AtomInjectionStatus = {
      mode, ready, applies, moduleAtoms, ratings,
      thresholds: { ...THRESHOLDS },
      reason: describe(mode, ready, moduleAtoms, ratings),
    };
    cache = { at: Date.now(), status };
    return status;
  } catch (err) {
    console.warn(`[atom-injection-gate] status read failed: ${err instanceof Error ? err.message : 'db error'}`);
    return unavailable();
  }
}

/** Persist the mode (validated) and forget the cached answer. */
export async function setAtomInjectionMode(db: DatabaseAdapter, mode: AtomInjectionMode): Promise<void> {
  if (!isAtomInjectionMode(mode)) throw new Error(`invalid atom injection mode: ${String(mode)}`);
  await db.run(ATOM_INJECTION_GATE_SQL.upsertMode, ATOM_INJECTION_MODE_SETTING_KEY, mode);
  resetAtomInjectionGateCache();
}
