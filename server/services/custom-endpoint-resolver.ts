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
