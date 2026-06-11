/**
 * intelligence-health.ts — Wave 3.9: NGO degradation honesty.
 *
 * Cheap/local installs silently lose background intelligence:
 *   - embeddings: embedding-adapter returns ZERO VECTORS on failure (silent)
 *   - atom capture: the extractor needs an LLM provider with credentials
 *   - pack RAG: ChromaDB wants OPENAI_API_KEY
 *
 * This module composes REAL checks into one honest per-feature status:
 * { status: 'ok' | 'degraded' | 'off', reason }. No fake green — the
 * embeddings check actually embeds a probe string and inspects the vector.
 *
 * Served by GET /api/system/intelligence-health and surfaced on the
 * cost-effective-models Settings card + a Home banner when degraded.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { getEmbeddingAdapter, isZeroVector } from './embedding-adapter.js';
import { isChromaAvailable } from './chroma-client.js';
import { getConfiguredProvider } from './provider-router.js';
import { getParseStats, type ParseStats, type ParseStatEntry } from './parse-telemetry.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type FeatureStatus = 'ok' | 'degraded' | 'off';

export interface FeatureHealth {
  status: FeatureStatus;
  reason: string;
  provider?: string;
  model?: string;
  last_atom_at?: string | null;
}

export interface IntelligenceHealth {
  generated_at: string;
  overall: FeatureStatus;
  features: {
    embeddings: FeatureHealth;
    atom_extraction: FeatureHealth;
    pack_rag: FeatureHealth;
    utility_llm: FeatureHealth;
  };
}

// ── Injectable probes (real defaults; tests inject fakes) ───────────────────

export interface EmbedProbeResult {
  provider: string;
  model: string;
  /** true when the probe returned the all-zeros failure sentinel */
  zero: boolean;
}

export interface HealthProbes {
  /** Embed a test string with the configured adapter and inspect the vector. */
  embedProbe: () => Promise<EmbedProbeResult>;
  /** ChromaDB heartbeat (false also when no OPENAI_API_KEY → no embedder). */
  chromaProbe: () => Promise<boolean>;
  /** Newest knowledge_atoms.created_at, or null when none/table missing. */
  lastAtomAt: () => Promise<string | null>;
  /** Provider serving utility (tier-mapped) LLM calls. */
  utilityProvider: () => string;
  /** JSON-parse success/failure counters per (service, model) — parse-telemetry. */
  parseStats: () => Promise<ParseStats>;
  /** Environment (key presence checks). */
  env: Record<string, string | undefined>;
}

const EMBED_PROBE_TEXT = 'ANTON intelligence health probe';
const EMBED_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — probes cost one tiny API call

let embedProbeCache: { at: number; result: EmbedProbeResult } | null = null;

/** Test hook. */
export function resetIntelligenceHealthCache(): void {
  embedProbeCache = null;
}

async function defaultEmbedProbe(): Promise<EmbedProbeResult> {
  if (embedProbeCache && Date.now() - embedProbeCache.at < EMBED_CACHE_TTL_MS) {
    return embedProbeCache.result;
  }
  const adapter = getEmbeddingAdapter();
  const vec = await adapter.embed(EMBED_PROBE_TEXT);
  const result: EmbedProbeResult = {
    provider: adapter.provider,
    model: adapter.model,
    zero: isZeroVector(vec),
  };
  embedProbeCache = { at: Date.now(), result };
  return result;
}

function defaultProbes(db: DatabaseAdapter): HealthProbes {
  return {
    embedProbe: defaultEmbedProbe,
    chromaProbe: () => isChromaAvailable(),
    lastAtomAt: async () => {
      try {
        const row = await db.get(
          'SELECT created_at FROM knowledge_atoms ORDER BY created_at DESC LIMIT 1'
        ) as { created_at: string | Date } | undefined;
        if (!row?.created_at) return null;
        return row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
      } catch {
        return null;
      }
    },
    utilityProvider: () => getConfiguredProvider(),
    parseStats: () => getParseStats(db),
    env: process.env,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Does the given provider have usable credentials? (ollama/compat are keyless) */
function providerHasCredentials(provider: string, env: Record<string, string | undefined>): boolean {
  switch (provider) {
    case 'anthropic': return !!env.ANTHROPIC_API_KEY;
    case 'mistral': return !!env.MISTRAL_API_KEY;
    case 'openai': return !!env.OPENAI_API_KEY;
    case 'google': return !!env.GOOGLE_API_KEY;
    case 'ollama':
    case 'openai_compatible':
      return true; // local / per-endpoint credentials
    default: return false;
  }
}

function embeddingProviderConfigured(provider: string, env: Record<string, string | undefined>): boolean {
  switch (provider) {
    case 'openai': return !!env.OPENAI_API_KEY;
    case 'voyage': return !!env.VOYAGE_API_KEY;
    case 'ollama': return true; // local endpoint, no key
    default: return false;
  }
}

const STATUS_RANK: Record<FeatureStatus, number> = { ok: 0, degraded: 1, off: 2 };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Minimum recorded failures before parse telemetry can downgrade a feature. */
const PARSE_FAIL_MIN = 3;

/**
 * Parse-telemetry overlay (Wave 3.1): find a recently-active (service, model)
 * whose JSON parses are FAIL-dominant. Such a model is silently producing no
 * atoms even though credentials are fine and last_atom_at may still look
 * fresh (e.g. right after switching to a weaker utility model).
 */
function findRecentParseFailure(
  stats: ParseStats,
  services: string[],
): { service: string; model: string; entry: ParseStatEntry } | null {
  for (const service of services) {
    const byModel = stats[service];
    if (!byModel) continue;
    for (const [model, entry] of Object.entries(byModel)) {
      const updatedAt = Date.parse(entry.updated_at);
      const recent = Number.isFinite(updatedAt) && Date.now() - updatedAt <= SEVEN_DAYS_MS;
      if (recent && entry.fail >= PARSE_FAIL_MIN && entry.fail > entry.ok) {
        return { service, model, entry };
      }
    }
  }
  return null;
}

// ── Composition ──────────────────────────────────────────────────────────────

export async function computeIntelligenceHealth(
  db: DatabaseAdapter,
  probes?: Partial<HealthProbes>
): Promise<IntelligenceHealth> {
  const p: HealthProbes = { ...defaultProbes(db), ...probes };

  // ── Embeddings: actually embed a probe string ─────────────────────────────
  let embeddings: FeatureHealth;
  try {
    const probe = await p.embedProbe();
    if (!probe.zero) {
      embeddings = {
        status: 'ok',
        reason: `Embeddings live via ${probe.provider} (${probe.model})`,
        provider: probe.provider,
        model: probe.model,
      };
    } else if (!embeddingProviderConfigured(probe.provider, p.env)) {
      embeddings = {
        status: 'off',
        reason: 'embeddings unavailable (no embedding provider configured) — knowledge search falls back to keyword',
        provider: probe.provider,
        model: probe.model,
      };
    } else {
      embeddings = {
        status: 'degraded',
        reason: `embeddings unavailable (${probe.provider} returned a zero vector — provider unreachable or misconfigured) — knowledge search falls back to keyword`,
        provider: probe.provider,
        model: probe.model,
      };
    }
  } catch {
    embeddings = {
      status: 'off',
      reason: 'embeddings unavailable (probe failed) — knowledge search falls back to keyword',
    };
  }

  // ── Atom extraction: provider credentials + last capture recency ──────────
  // The extractor routes through the utility model / configured provider
  // (Wave 3.1, getRoutedUtilityModel); credentials for EITHER Anthropic or
  // the utility provider count as "can run".
  let atomExtraction: FeatureHealth;
  const utilityProvider = p.utilityProvider();
  const anthropicOk = providerHasCredentials('anthropic', p.env);
  const utilityOk = providerHasCredentials(utilityProvider, p.env);
  const lastAtomAt = await p.lastAtomAt();

  if (!anthropicOk && !utilityOk) {
    atomExtraction = {
      status: 'off',
      reason: 'atom capture off (no LLM provider credentials) — background insight capture is not running',
      provider: utilityProvider,
      last_atom_at: lastAtomAt,
    };
  } else if (!lastAtomAt) {
    atomExtraction = {
      status: 'degraded',
      reason: 'atom capture configured but no knowledge atoms captured yet — run a workflow or task to start building memory',
      provider: anthropicOk ? 'anthropic' : utilityProvider,
      last_atom_at: null,
    };
  } else if (Date.now() - new Date(lastAtomAt).getTime() > SEVEN_DAYS_MS) {
    atomExtraction = {
      status: 'degraded',
      reason: `atom capture configured but the last atom is older than 7 days (${lastAtomAt.substring(0, 10)}) — extraction may not be running`,
      provider: anthropicOk ? 'anthropic' : utilityProvider,
      last_atom_at: lastAtomAt,
    };
  } else {
    atomExtraction = {
      status: 'ok',
      reason: `Atom capture live (last atom ${lastAtomAt.substring(0, 10)})`,
      provider: anthropicOk ? 'anthropic' : utilityProvider,
      last_atom_at: lastAtomAt,
    };
  }

  // Parse-telemetry overlay (Wave 3.1): even with credentials + a fresh
  // last_atom_at, a model whose extraction JSON mostly fails to parse means
  // capture is silently dying — no fake green.
  if (atomExtraction.status === 'ok') {
    try {
      const failing = findRecentParseFailure(
        await p.parseStats(), ['atom-extractor', 'relationship-detector']);
      if (failing) {
        atomExtraction = {
          ...atomExtraction,
          status: 'degraded',
          reason: `atom capture configured but JSON parsing fails on model ${failing.model} ` +
            `(${failing.entry.fail} of ${failing.entry.ok + failing.entry.fail} recent ${failing.service} attempts) — ` +
            'background insight capture may be losing most outputs; consider a stronger utility model',
        };
      }
    } catch { /* telemetry must never break the health check */ }
  }

  // ── Pack RAG: ChromaDB reachability (needs OPENAI_API_KEY embedder) ───────
  let packRag: FeatureHealth;
  try {
    const chromaOk = await p.chromaProbe();
    if (chromaOk) {
      packRag = { status: 'ok', reason: 'Pack RAG (ChromaDB) reachable' };
    } else if (!p.env.OPENAI_API_KEY) {
      packRag = {
        status: 'off',
        reason: 'pack RAG off (ChromaDB requires OPENAI_API_KEY for embeddings) — pack search falls back to keyword',
      };
    } else {
      packRag = {
        status: 'degraded',
        reason: 'pack RAG unavailable (ChromaDB unreachable) — pack search falls back to keyword',
      };
    }
  } catch {
    packRag = {
      status: 'degraded',
      reason: 'pack RAG unavailable (ChromaDB check failed) — pack search falls back to keyword',
    };
  }

  // ── Utility LLM: which provider serves background/utility calls ───────────
  const utilityHasCreds = providerHasCredentials(utilityProvider, p.env);
  const utilityLlm: FeatureHealth = utilityHasCreds
    ? { status: 'ok', reason: `Utility AI calls served by ${utilityProvider}`, provider: utilityProvider }
    : {
        status: 'off',
        reason: `utility AI off (no credentials for ${utilityProvider}) — background AI features are not running`,
        provider: utilityProvider,
      };

  const features = { embeddings, atom_extraction: atomExtraction, pack_rag: packRag, utility_llm: utilityLlm };
  const overall = (Object.values(features) as FeatureHealth[]).reduce<FeatureStatus>(
    (worst, f) => (STATUS_RANK[f.status] > STATUS_RANK[worst] ? f.status : worst),
    'ok'
  );

  return {
    generated_at: new Date().toISOString(),
    overall,
    features,
  };
}
