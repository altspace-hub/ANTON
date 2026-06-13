// ── ANTON Studio — Coding Model ROLE Resolver (Studio P0) ──────────────────
// Resolves the concrete model for each Studio *role* (the user's locked
// ROLE-based mapping, CODING_STUDIO_DESIGN §D.8 / decision 4):
//
//   orchestrator → Mistral Large 3   (PM / lead reasoning / architecture /
//                                      panel-chair synthesis / workshop)
//   expert       → Mistral Medium 3.5 (the 7-expert panel personas)
//   codegen      → Devstral 2 Medium  (the edit / code-generation step)
//   utility      → Mistral Small 4    (extraction / classification / auto-fix)
//
// Structure + provider-remap follow
// `server/services/missions/mission-model-resolver.ts`: the role default is
// routed through the provider router so it works on whatever provider is
// configured. On Mistral (the role defaults' native provider) the literal
// CODING_ROLE_MODELS id is kept (so codegen stays on devstral); on any other
// provider the role's coarse TIER is resolved for that provider — a Claude
// user gets Large→Opus, Medium→Sonnet, Small→Haiku, and codegen (a medium
// tier, since there is no Claude code-specialist) → Sonnet. The headline area
// default (`area_default_model:coding`) governs the module-run model in
// claude.ts; THIS resolver governs the per-role steps inside the Studio
// orchestrator.
//
// Resolution order per role (highest first):
//   1. An explicit user override (`opts.override`) — a concrete model id the
//      user pinned for this step. Honoured when resolvable.
//   2. A stored `coding_model_strategy` (app_settings, JSON role→model map) —
//      the user-editable role mapping; honoured per role when set, not 'auto',
//      and resolvable.
//   3. The ROLE default from CODING_ROLE_MODELS, mapped through
//      `mapModelToProvider` so it lands on the configured provider.
//
// ── DEVSTRAL / CODESTRAL CAVEAT (load-bearing) ─────────────────────────────
// devstral-medium-latest and codestral-latest have `supportsThinking:false`
// (modelAdapter REGISTRY_SUPPLEMENT) AND are NOT in `resolveMistralThinking`'s
// generalist→Magistral swap map (provider-router.ts ~:229 only swaps
// mistral-large/medium/small-latest). So a thinking/reasoning request routed
// to the codegen model SILENTLY runs WITHOUT reasoning. Therefore:
//   • the `codegen` role must be gated to NON-thinking code-gen steps;
//   • any step that needs reasoning must escalate to the `orchestrator`
//     role (Mistral Large), which DOES swap to Magistral for investigate+.
// `codingRoleSupportsThinking(role)` exposes this so callers can assert it.

import { resolveModel, getConfiguredProvider, type ModelTier } from './provider-router.js';
import { getProviderFromModelId } from './model-adapter.js';
import { MODEL_REGISTRY } from '../types/modelAdapter.js';
import { isResolvableModelId } from './missions/mission-model-resolver.js';
import type { DatabaseAdapter } from '../db/database.js';

// ── Roles ──────────────────────────────────────────────────────────────────

export type CodingRole = 'orchestrator' | 'expert' | 'codegen' | 'utility';

/** The user's locked ROLE → default-model mapping (Mistral-tiered). */
export const CODING_ROLE_MODELS: Record<CodingRole, string> = {
  orchestrator: 'mistral-large-latest',   // PM / lead reasoning / architecture / panel-chair / workshop
  expert: 'mistral-medium-latest',        // the 7-expert panel personas
  codegen: 'devstral-medium-latest',      // the edit / code-gen step (NON-thinking only — see caveat)
  utility: 'mistral-small-latest',        // extraction / classification / auto-fix
};

/**
 * Role → coarse capability tier (CODING_STUDIO_DESIGN §D.8). Used to remap the
 * role default for a NON-Mistral provider (a Claude user gets Opus/Sonnet/Haiku
 * by tier). On Mistral itself the literal CODING_ROLE_MODELS id is kept, so
 * `codegen` stays on devstral rather than collapsing to the generic medium.
 */
const CODING_ROLE_TIERS: Record<CodingRole, ModelTier> = {
  orchestrator: 'large',
  expert: 'medium',
  codegen: 'medium',
  utility: 'small',
};

const CODING_ROLES: readonly CodingRole[] = ['orchestrator', 'expert', 'codegen', 'utility'];

export function isCodingRole(value: unknown): value is CodingRole {
  return typeof value === 'string' && (CODING_ROLES as readonly string[]).includes(value);
}

/**
 * Whether a role's model can carry extended-thinking/reasoning. The codegen
 * role (devstral/codestral) cannot — see the caveat at the top of this file.
 * Reasoning steps must use `orchestrator` (Large → Magistral on investigate+).
 */
export function codingRoleSupportsThinking(role: CodingRole): boolean {
  return role !== 'codegen';
}

// ── Stored strategy (app_settings: coding_model_strategy) ───────────────────
// A JSON object { orchestrator, expert, codegen, utility } of model ids (or
// 'auto'). Read sync from an in-memory cache primed at boot, mirroring
// default-model-store.ts so the sync resolver never blocks. The cache is
// updated synchronously on every save.

const STRATEGY_KEY = 'coding_model_strategy';

export type CodingModelStrategy = Partial<Record<CodingRole, string>>;

/** undefined = not loaded yet; null = loaded, no row persisted. */
let cachedStrategy: CodingModelStrategy | null | undefined;
let loading: Promise<void> | null = null;
let dbRef: DatabaseAdapter | null = null;

function parseStrategyValue(value: string | undefined | null): CodingModelStrategy | null {
  if (!value || value.length === 0) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const out: CodingModelStrategy = {};
    for (const role of CODING_ROLES) {
      const v = (parsed as Record<string, unknown>)[role];
      if (typeof v === 'string' && v.length > 0) out[role] = v;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

async function loadStrategyFromDb(db: DatabaseAdapter): Promise<void> {
  try {
    const row = await db.get<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      STRATEGY_KEY,
    );
    cachedStrategy = parseStrategyValue(row?.value);
  } catch (err) {
    console.warn(
      `[coding-model-resolver] could not load coding_model_strategy: ${err instanceof Error ? err.message : 'db error'}`,
    );
    cachedStrategy = null;
  }
}

/** Prime the strategy cache at boot. Safe to call multiple times. */
export function initCodingModelStrategy(db: DatabaseAdapter): void {
  dbRef = db;
  if (cachedStrategy === undefined && !loading) {
    loading = loadStrategyFromDb(db).finally(() => { loading = null; });
  }
}

/** Sync accessor for the persisted strategy (undefined while first load is in flight). */
export function getCodingModelStrategySync(): CodingModelStrategy | undefined {
  if (cachedStrategy === undefined) {
    if (dbRef && !loading) loading = loadStrategyFromDb(dbRef).finally(() => { loading = null; });
    return undefined;
  }
  return cachedStrategy ?? undefined;
}

/** Persist (or clear, with null) the coding_model_strategy. Updates the cache synchronously. */
export async function setCodingModelStrategy(
  db: DatabaseAdapter,
  strategy: CodingModelStrategy | null,
): Promise<void> {
  dbRef = db;
  if (strategy === null || Object.keys(strategy).length === 0) {
    await db.run('DELETE FROM app_settings WHERE key = ?', STRATEGY_KEY);
    cachedStrategy = null;
    return;
  }
  const value = JSON.stringify(strategy);
  await db.run(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    STRATEGY_KEY,
    value,
  );
  cachedStrategy = parseStrategyValue(value);
}

/** Test hook — reset module state between tests. */
export function resetCodingModelStrategyForTests(): void {
  cachedStrategy = undefined;
  loading = null;
  dbRef = null;
}

// ── Resolver ────────────────────────────────────────────────────────────────

export interface ResolveCodingModelOptions {
  /** An explicit user override for this step — highest precedence when resolvable. */
  override?: string | null;
  /**
   * The stored role→model strategy. When omitted, the in-memory cache
   * (getCodingModelStrategySync) is consulted, so callers on sync paths need
   * not pass it. Pass an explicit object to bypass the cache (e.g. in tests).
   */
  strategy?: CodingModelStrategy | null;
}

/**
 * Resolve the concrete model id for a Studio coding role.
 *
 * Precedence: explicit override > stored coding_model_strategy > role default
 * (mapped through the configured provider).
 *
 * A typo'd / unknown override or strategy entry is ignored (falls through to
 * the next tier) — mirrors mission-model-resolver's `isResolvableModelId`
 * guard so a stale config never wedges a run.
 */
export function resolveCodingModel(
  role: CodingRole,
  opts?: ResolveCodingModelOptions,
): string {
  // 1. Explicit user override.
  const override = opts?.override;
  if (override && override !== 'auto' && isResolvableModelId(override)) {
    return override;
  }

  // 2. Stored strategy (explicit arg, else the cached app_settings value).
  const strategy = opts?.strategy !== undefined ? opts.strategy : getCodingModelStrategySync();
  const fromStrategy = strategy?.[role];
  if (fromStrategy && fromStrategy !== 'auto' && isResolvableModelId(fromStrategy)) {
    return fromStrategy;
  }

  // 3. Role default, remapped to the configured provider.
  return resolveCodingRoleDefault(role);
}

/**
 * The role default for the configured provider:
 *   • on Mistral (the role defaults' native provider) → the literal
 *     CODING_ROLE_MODELS id, so `codegen` keeps the devstral code-specialist
 *     instead of collapsing to the generic medium tier;
 *   • on any other provider → the role's TIER resolved for that provider
 *     (a Claude user gets Opus/Sonnet/Haiku; an Ollama/compat user gets their
 *     single configured default — resolveModel handles those).
 *
 * (We don't pass the Mistral id through mapModelToProvider because that maps
 * only *Claude* ids by tier — a non-Claude id falls to the generic medium.)
 */
function resolveCodingRoleDefault(role: CodingRole): string {
  const provider = getConfiguredProvider();
  if (provider === 'mistral') return CODING_ROLE_MODELS[role];
  return resolveModel(CODING_ROLE_TIERS[role]);
}

/**
 * Provider slug for a resolved coding model id — recorded on Studio step rows
 * so the activity log shows the real provider. Mirrors
 * mission-model-resolver.providerForModel.
 */
export function providerForCodingModel(modelId: string): string {
  try { return getProviderFromModelId(modelId); } catch { return 'anthropic'; }
}

/**
 * Verify the four role-default models are present in MODEL_REGISTRY. Used by a
 * boot self-check / test so a registry rename can't silently break the
 * role mapping. Returns the list of missing ids ([] = all present).
 */
export function missingCodingRoleModels(): string[] {
  return CODING_ROLES
    .map((r) => CODING_ROLE_MODELS[r])
    .filter((id) => !MODEL_REGISTRY[id]);
}
