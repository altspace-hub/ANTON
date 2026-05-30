// ═══════════════════════════════════════════════════════════
// /api/settings/model-endpoints — CRUD for OpenAI-compatible
// custom endpoints (DeepSeek, OpenRouter, Together, Groq,
// Fireworks, vLLM, LM Studio, etc.).
//
// API keys are AES-256-GCM encrypted at rest via credential-vault.
// Health check + remote model-list discovery via GET /models.
// ═══════════════════════════════════════════════════════════

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { encrypt, decrypt } from '../services/credential-vault.js';
import {
  checkOpenAICompatibleHealth,
  listOpenAICompatibleModels,
} from '../services/adapters/openaiCompatibleAdapter.js';
import { safeError } from '../lib/error-response.js';

interface EndpointRow {
  id: number;
  slug: string;
  display_name: string;
  base_url: string;
  api_key_encrypted: string | null;
  default_model: string | null;
  available_models: string[];
  context_window: number | null;
  extra_headers: Record<string, string>;
  enabled: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafeEndpoint {
  id: number;
  slug: string;
  displayName: string;
  baseUrl: string;
  hasApiKey: boolean;
  defaultModel: string | null;
  availableModels: string[];
  contextWindow: number | null;
  extraHeaders: Record<string, string>;
  enabled: boolean;
  notes: string | null;
  updatedAt: string;
}

function toSafe(row: EndpointRow): SafeEndpoint {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    baseUrl: row.base_url,
    hasApiKey: !!row.api_key_encrypted,
    defaultModel: row.default_model,
    availableModels: row.available_models ?? [],
    contextWindow: row.context_window,
    extraHeaders: row.extra_headers ?? {},
    enabled: row.enabled,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,40}$/;

export function createCustomModelEndpointsRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  // ── List ───────────────────────────────────────────────────
  router.get('/settings/model-endpoints', async (_req, res) => {
    try {
      const rows = (await db.all(
        'SELECT * FROM custom_model_endpoints ORDER BY display_name ASC',
      )) as EndpointRow[];
      res.json({ endpoints: rows.map(toSafe) });
    } catch (err) {
      const e = safeError(err);
      res.status(500).json({ error: e });
    }
  });

  // ── Create ─────────────────────────────────────────────────
  router.post('/settings/model-endpoints', async (req, res) => {
    const body = req.body as {
      slug?: string;
      displayName?: string;
      baseUrl?: string;
      apiKey?: string;
      defaultModel?: string;
      contextWindow?: number;
      extraHeaders?: Record<string, string>;
      notes?: string;
    };

    if (!body.slug || !SLUG_REGEX.test(body.slug)) {
      return res.status(400).json({
        error: 'slug must be lowercase a-z, 0-9 and dashes (1-41 chars)',
      });
    }
    if (!body.displayName?.trim()) {
      return res.status(400).json({ error: 'displayName is required' });
    }
    if (!body.baseUrl?.trim() || !/^https?:\/\//i.test(body.baseUrl)) {
      return res.status(400).json({ error: 'baseUrl must be a valid http(s) URL' });
    }

    try {
      const existing = await db.get(
        'SELECT id FROM custom_model_endpoints WHERE slug = ?',
        body.slug,
      );
      if (existing) {
        return res.status(409).json({ error: `Endpoint with slug "${body.slug}" already exists` });
      }

      const encrypted = body.apiKey?.trim() ? encrypt(body.apiKey.trim()) : null;

      await db.run(
        `INSERT INTO custom_model_endpoints
           (slug, display_name, base_url, api_key_encrypted,
            default_model, context_window, extra_headers, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?)`,
        body.slug,
        body.displayName.trim(),
        body.baseUrl.trim(),
        encrypted,
        body.defaultModel?.trim() || null,
        body.contextWindow ?? null,
        JSON.stringify(body.extraHeaders ?? {}),
        body.notes?.trim() || null,
      );

      const row = (await db.get(
        'SELECT * FROM custom_model_endpoints WHERE slug = ?',
        body.slug,
      )) as EndpointRow;

      invalidateCustomEndpointCache();
      res.json({ endpoint: toSafe(row) });
    } catch (err) {
      const e = safeError(err);
      res.status(500).json({ error: e });
    }
  });

  // ── Update ─────────────────────────────────────────────────
  router.patch('/settings/model-endpoints/:slug', async (req, res) => {
    const { slug } = req.params;
    const body = req.body as {
      displayName?: string;
      baseUrl?: string;
      apiKey?: string;        // empty string clears; undefined leaves unchanged
      defaultModel?: string;
      contextWindow?: number;
      extraHeaders?: Record<string, string>;
      enabled?: boolean;
      notes?: string;
    };

    try {
      const existing = (await db.get(
        'SELECT * FROM custom_model_endpoints WHERE slug = ?',
        slug,
      )) as EndpointRow | undefined;
      if (!existing) return res.status(404).json({ error: 'Endpoint not found' });

      const next = {
        displayName: body.displayName?.trim() ?? existing.display_name,
        baseUrl: body.baseUrl?.trim() ?? existing.base_url,
        defaultModel:
          body.defaultModel !== undefined
            ? (body.defaultModel.trim() || null)
            : existing.default_model,
        contextWindow:
          body.contextWindow !== undefined ? body.contextWindow : existing.context_window,
        extraHeaders: body.extraHeaders ?? existing.extra_headers ?? {},
        enabled: body.enabled !== undefined ? body.enabled : existing.enabled,
        notes:
          body.notes !== undefined ? (body.notes.trim() || null) : existing.notes,
      };

      let apiKeyEncrypted = existing.api_key_encrypted;
      if (body.apiKey !== undefined) {
        apiKeyEncrypted = body.apiKey.trim() ? encrypt(body.apiKey.trim()) : null;
      }

      await db.run(
        `UPDATE custom_model_endpoints
            SET display_name = ?, base_url = ?, api_key_encrypted = ?,
                default_model = ?, context_window = ?, extra_headers = ?::jsonb,
                enabled = ?, notes = ?, updated_at = NOW()
          WHERE slug = ?`,
        next.displayName,
        next.baseUrl,
        apiKeyEncrypted,
        next.defaultModel,
        next.contextWindow,
        JSON.stringify(next.extraHeaders),
        next.enabled,
        next.notes,
        slug,
      );

      const row = (await db.get(
        'SELECT * FROM custom_model_endpoints WHERE slug = ?',
        slug,
      )) as EndpointRow;
      invalidateCustomEndpointCache();
      res.json({ endpoint: toSafe(row) });
    } catch (err) {
      const e = safeError(err);
      res.status(500).json({ error: e });
    }
  });

  // ── Delete ─────────────────────────────────────────────────
  router.delete('/settings/model-endpoints/:slug', async (req, res) => {
    try {
      const result = await db.run(
        'DELETE FROM custom_model_endpoints WHERE slug = ?',
        req.params.slug,
      );
      invalidateCustomEndpointCache();
      res.json({ ok: true, deleted: (result as { changes?: number })?.changes ?? 0 });
    } catch (err) {
      const e = safeError(err);
      res.status(500).json({ error: e });
    }
  });

  // ── Health check + remote model list refresh ───────────────
  router.post('/settings/model-endpoints/:slug/health', async (req, res) => {
    try {
      const row = (await db.get(
        'SELECT * FROM custom_model_endpoints WHERE slug = ?',
        req.params.slug,
      )) as EndpointRow | undefined;
      if (!row) return res.status(404).json({ error: 'Endpoint not found' });

      const apiKey = row.api_key_encrypted ? decrypt(row.api_key_encrypted) : undefined;
      const health = await checkOpenAICompatibleHealth(
        row.base_url,
        apiKey,
        row.extra_headers ?? {},
      );

      if (health.available) {
        const models = await listOpenAICompatibleModels(
          row.base_url,
          apiKey,
          row.extra_headers ?? {},
        );
        await db.run(
          'UPDATE custom_model_endpoints SET available_models = ?::jsonb, updated_at = NOW() WHERE slug = ?',
          JSON.stringify(models),
          req.params.slug,
        );
        res.json({ ...health, models });
      } else {
        res.json(health);
      }
    } catch (err) {
      const e = safeError(err);
      res.status(500).json({ available: false, error: e });
    }
  });

  return router;
}

// ─────────────────────────────────────────────────────────────
// Server-side lookup helpers (used by the provider router).
// Cached in-process for the lifetime of the process; cleared on
// any write through the route layer above.
// ─────────────────────────────────────────────────────────────

interface ResolvedEndpoint {
  slug: string;
  baseUrl: string;
  apiKey?: string;
  defaultModel: string | null;
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
