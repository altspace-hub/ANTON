// ═══════════════════════════════════════════════════════════
// Custom-endpoint resolver — server-side lookup for OpenAI-
// compatible custom endpoints (compat:<slug>:<model> ids).
//
// Lifted out of routes/custom-model-endpoints.ts (2026-07-29):
// the resolver was value-imported by unified-llm-client,
// provider-router and context-budget, which meant the LLM core
// transitively linked Express and the RBAC middleware at module
// load. The route file keeps the CRUD surface and calls
// invalidateCustomEndpointCache() on every write, exactly as
// before. Behaviour is unchanged.
//
// Cached in-process for the lifetime of the process; cleared on
// any write through the route layer (and by the seed services).
// ═══════════════════════════════════════════════════════════

import type { DatabaseAdapter } from '../db/database.js';
import { decrypt } from './credential-vault.js';

/** Row shape as read from custom_model_endpoints (resolver subset). */
interface EndpointRow {
  slug: string;
  base_url: string;
  api_key_encrypted: string | null;
  default_model: string | null;
  context_window: number | null;
  extra_headers: Record<string, string>;
  enabled: boolean;
  // Migration 288 — absent on a database that has not run it yet.
  extra_body?: Record<string, unknown> | null;
  allowed_models?: unknown;
  max_output_tokens?: number | null;
  model_meta?: Record<string, unknown> | null;
  input_price_per_million?: number | null;
  output_price_per_million?: number | null;
}

export interface ResolvedEndpoint {
  slug: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string | null;
  /** Optional per-endpoint context window (informational column from
   *  migration 215) — consumed by context-budget.ts for compat: models. */
  contextWindow: number | null;
  extraHeaders: Record<string, string>;
  enabled: boolean;
  /** Migration 288: merged into every request body (OpenRouter provider routing, …). */
  extraBody: Record<string, unknown>;
  /** Migration 288: when non-empty, the only bare model ids that may run here. */
  allowedModels: string[];
  /** Migration 288: ceiling for max_tokens on this endpoint. */
  maxOutputTokens: number | null;
  /** Migration 288: per bare model id, what the endpoint's /models reported
   *  (shape: compat-endpoint.ts CompatModelMeta). */
  modelMeta: Record<string, unknown>;
  /** Migration 288: admin prices, USD per million tokens (null = none set). */
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finiteOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

let endpointCache: Map<string, ResolvedEndpoint> | null = null;
let cacheLoadingPromise: Promise<void> | null = null;

export async function resolveCustomEndpoint(
  db: DatabaseAdapter,
  slug: string,
): Promise<ResolvedEndpoint | null> {
  if (!endpointCache) {
    if (!cacheLoadingPromise) {
      cacheLoadingPromise = (async () => {
        const rows = (await db.all(
          'SELECT * FROM custom_model_endpoints WHERE enabled = TRUE',
        )) as EndpointRow[];
        const map = new Map<string, ResolvedEndpoint>();
        for (const r of rows) {
          map.set(r.slug, {
            slug: r.slug,
            baseUrl: r.base_url,
            apiKey: r.api_key_encrypted ? decrypt(r.api_key_encrypted) : undefined,
            defaultModel: r.default_model,
            contextWindow: r.context_window,
            extraHeaders: r.extra_headers ?? {},
            enabled: r.enabled,
            extraBody: isPlainObject(r.extra_body) ? r.extra_body : {},
            allowedModels: Array.isArray(r.allowed_models)
              ? r.allowed_models.filter((m): m is string => typeof m === 'string' && m.length > 0)
              : [],
            maxOutputTokens: finiteOrNull(r.max_output_tokens),
            modelMeta: isPlainObject(r.model_meta) ? r.model_meta : {},
            inputPricePerMillion: finiteOrNull(r.input_price_per_million),
            outputPricePerMillion: finiteOrNull(r.output_price_per_million),
          });
        }
        endpointCache = map;
      })();
    }
    await cacheLoadingPromise;
    cacheLoadingPromise = null;
  }
  return endpointCache?.get(slug) ?? null;
}

export function invalidateCustomEndpointCache(): void {
  endpointCache = null;
  cacheLoadingPromise = null;
}
