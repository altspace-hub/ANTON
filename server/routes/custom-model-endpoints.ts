// ═══════════════════════════════════════════════════════════
// /api/settings/model-endpoints — CRUD for OpenAI-compatible
// custom endpoints (DeepSeek, OpenRouter, Together, Groq,
// Fireworks, vLLM, LM Studio, etc.).
//
// API keys are AES-256-GCM encrypted at rest via credential-vault.
// Health check + remote model-list discovery via GET /models.
//
// Migration 288 (public showcase): an endpoint also carries an
// extra body merged into every request (OpenRouter provider
// routing), an allowed-models list enforced on every path by
// services/compat-endpoint.ts, a max_tokens ceiling, optional
// prices, and — read-only, written by the health check — what
// GET /models said about each model (modelMeta).
// ═══════════════════════════════════════════════════════════

import { Router } from 'express';
import { requireAdminOrSolo, isTeamMode } from '../middleware/role-guards.js';
import type { DatabaseAdapter } from '../db/database.js';
import { encrypt, decrypt } from '../services/credential-vault.js';
import { invalidateCustomEndpointCache } from '../services/custom-endpoint-resolver.js';
import { listOpenAICompatibleModelsDetailed, COMPAT_EXTRA_BODY_RESERVED_KEYS } from '../services/adapters/openaiCompatibleAdapter.js';
import type { CompatModelMeta } from '../services/compat-endpoint.js';
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
  extra_body: Record<string, unknown> | null;
  allowed_models: string[] | null;
  max_output_tokens: number | null;
  model_meta: Record<string, CompatModelMeta> | null;
  input_price_per_million: number | null;
  output_price_per_million: number | null;
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
  /** Merged into every request body (e.g. OpenRouter `provider`, `plugins`). */
  extraBody: Record<string, unknown>;
  /** When non-empty, the only bare model ids that may run on this endpoint. */
  allowedModels: string[];
  /** Ceiling for max_tokens on this endpoint; null = none. */
  maxOutputTokens: number | null;
  /** Read-only: per bare model id, what the endpoint's /models reported. */
  modelMeta: Record<string, CompatModelMeta>;
  /** Optional prices (USD per million tokens) for endpoints that report no cost. */
  inputPricePerMillion: number | null;
  outputPricePerMillion: number | null;
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
    extraBody: row.extra_body ?? {},
    allowedModels: Array.isArray(row.allowed_models) ? row.allowed_models : [],
    maxOutputTokens: row.max_output_tokens ?? null,
    modelMeta: row.model_meta ?? {},
    inputPricePerMillion: row.input_price_per_million ?? null,
    outputPricePerMillion: row.output_price_per_million ?? null,
  };
}

/**
 * What a non-admin on a team server sees of an endpoint: what the model picker
 * needs, nothing of how it is reached (base URL, headers, extra body — which
 * can carry account-specific routing — prices or notes). Every signed-in user
 * can list endpoints, because the picker reads them; on a public demo that is
 * every visitor.
 */
type PickerEndpoint = Pick<SafeEndpoint, 'id' | 'slug' | 'displayName' | 'defaultModel' | 'availableModels' | 'allowedModels' | 'enabled'>;

function toPicker(row: EndpointRow): PickerEndpoint {
  const safe = toSafe(row);
  return {
    id: safe.id,
    slug: safe.slug,
    displayName: safe.displayName,
    defaultModel: safe.defaultModel,
    availableModels: safe.allowedModels.length > 0 ? safe.allowedModels : safe.availableModels,
    allowedModels: safe.allowedModels,
    enabled: safe.enabled,
  };
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,40}$/;

/** Largest extra body accepted, serialized. It rides on every request. */
const MAX_EXTRA_BODY_BYTES = 16_384;
const MAX_ALLOWED_MODELS = 200;

/** Body fields this route validates for the migration 288 columns. */
interface ControlsInput {
  extraBody?: unknown;
  allowedModels?: unknown;
  maxOutputTokens?: unknown;
  inputPricePerMillion?: unknown;
  outputPricePerMillion?: unknown;
}

interface ControlsParsed {
  extraBody?: Record<string, unknown>;
  allowedModels?: string[];
  maxOutputTokens?: number | null;
  inputPricePerMillion?: number | null;
  outputPricePerMillion?: number | null;
}

function priceOrNull(v: unknown, field: string): number | null {
  if (v === null || v === '') return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error(`${field} must be a non-negative number (USD per million tokens) or null`);
  }
  return v;
}

/**
 * Validate the controls an admin may set. Only the fields present are
 * returned, so a PATCH leaves the others as they are. modelMeta is never
 * accepted: it is what the endpoint said, written by the health check.
 */
export function parseEndpointControls(body: ControlsInput): ControlsParsed {
  const out: ControlsParsed = {};
  if (body.extraBody !== undefined) {
    const eb = body.extraBody === null ? {} : body.extraBody;
    if (typeof eb !== 'object' || Array.isArray(eb)) throw new Error('extraBody must be a JSON object');
    if (JSON.stringify(eb).length > MAX_EXTRA_BODY_BYTES) throw new Error(`extraBody must be under ${MAX_EXTRA_BODY_BYTES} bytes`);
    const reserved = COMPAT_EXTRA_BODY_RESERVED_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(eb, k));
    if (reserved.length > 0) {
      throw new Error(`extraBody may not set ${reserved.join(', ')}: those choose the model or what it is sent (use allowedModels)`);
    }
    out.extraBody = eb as Record<string, unknown>;
  }
  if (body.allowedModels !== undefined) {
    const list = body.allowedModels === null ? [] : body.allowedModels;
    if (!Array.isArray(list) || list.some((m) => typeof m !== 'string')) {
      throw new Error('allowedModels must be an array of model ids');
    }
    const cleaned = [...new Set((list as string[]).map((m) => m.trim()).filter((m) => m.length > 0))];
    if (cleaned.length > MAX_ALLOWED_MODELS) throw new Error(`allowedModels may name at most ${MAX_ALLOWED_MODELS} models`);
    out.allowedModels = cleaned;
  }
  if (body.maxOutputTokens !== undefined) {
    const v = body.maxOutputTokens;
    if (v === null || v === '') out.maxOutputTokens = null;
    else if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 1_000_000) out.maxOutputTokens = v;
    else throw new Error('maxOutputTokens must be a whole number between 1 and 1000000, or null');
  }
  if (body.inputPricePerMillion !== undefined) out.inputPricePerMillion = priceOrNull(body.inputPricePerMillion, 'inputPricePerMillion');
  if (body.outputPricePerMillion !== undefined) out.outputPricePerMillion = priceOrNull(body.outputPricePerMillion, 'outputPricePerMillion');
  return out;
}

export function createCustomModelEndpointsRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  // ── List ───────────────────────────────────────────────────
  router.get('/settings/model-endpoints', async (req, res) => {
    try {
      const rows = (await db.all(
        'SELECT * FROM custom_model_endpoints ORDER BY display_name ASC',
      )) as EndpointRow[];
      const full = !isTeamMode() || req.user?.role === 'admin';
      res.json({ endpoints: full ? rows.map(toSafe) : rows.filter((r) => r.enabled).map(toPicker) });
    } catch (err) {
      const e = safeError(err);
      res.status(500).json({ error: e });
    }
  });

  // ── Create ─────────────────────────────────────────────────
  // SECURITY (2026-07-27 survey): creating or repointing a compat endpoint is the
  // other half of the settings exfiltration path — the base URL is validated only as
  // /^https?:\/\//i, so an ungated POST here lets any team-mode user stand up an
  // attacker-controlled model backend. Admin-only in team mode; no-op in solo.
  router.post('/settings/model-endpoints', requireAdminOrSolo, async (req, res) => {
    const body = req.body as {
      slug?: string;
      displayName?: string;
      baseUrl?: string;
      apiKey?: string;
      defaultModel?: string;
      contextWindow?: number;
      extraHeaders?: Record<string, string>;
      notes?: string;
    } & ControlsInput;

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
    let controls: ControlsParsed;
    try {
      controls = parseEndpointControls(body);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid endpoint controls' });
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
            default_model, context_window, extra_headers, notes,
            extra_body, allowed_models, max_output_tokens,
            input_price_per_million, output_price_per_million)
         VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?::jsonb, ?::jsonb, ?, ?, ?)`,
        body.slug,
        body.displayName.trim(),
        body.baseUrl.trim(),
        encrypted,
        body.defaultModel?.trim() || null,
        body.contextWindow ?? null,
        JSON.stringify(body.extraHeaders ?? {}),
        body.notes?.trim() || null,
        JSON.stringify(controls.extraBody ?? {}),
        JSON.stringify(controls.allowedModels ?? []),
        controls.maxOutputTokens ?? null,
        controls.inputPricePerMillion ?? null,
        controls.outputPricePerMillion ?? null,
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
  router.patch('/settings/model-endpoints/:slug', requireAdminOrSolo, async (req, res) => {
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
    } & ControlsInput;
    let controls: ControlsParsed;
    try {
      controls = parseEndpointControls(body);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid endpoint controls' });
    }

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
        extraBody: controls.extraBody ?? existing.extra_body ?? {},
        allowedModels: controls.allowedModels ?? existing.allowed_models ?? [],
        maxOutputTokens: controls.maxOutputTokens !== undefined ? controls.maxOutputTokens : existing.max_output_tokens,
        inputPricePerMillion: controls.inputPricePerMillion !== undefined ? controls.inputPricePerMillion : existing.input_price_per_million,
        outputPricePerMillion: controls.outputPricePerMillion !== undefined ? controls.outputPricePerMillion : existing.output_price_per_million,
      };

      let apiKeyEncrypted = existing.api_key_encrypted;
      if (body.apiKey !== undefined) {
        apiKeyEncrypted = body.apiKey.trim() ? encrypt(body.apiKey.trim()) : null;
      }

      await db.run(
        `UPDATE custom_model_endpoints
            SET display_name = ?, base_url = ?, api_key_encrypted = ?,
                default_model = ?, context_window = ?, extra_headers = ?::jsonb,
                enabled = ?, notes = ?,
                extra_body = ?::jsonb, allowed_models = ?::jsonb, max_output_tokens = ?,
                input_price_per_million = ?, output_price_per_million = ?,
                updated_at = NOW()
          WHERE slug = ?`,
        next.displayName,
        next.baseUrl,
        apiKeyEncrypted,
        next.defaultModel,
        next.contextWindow,
        JSON.stringify(next.extraHeaders),
        next.enabled,
        next.notes,
        JSON.stringify(next.extraBody),
        JSON.stringify(next.allowedModels),
        next.maxOutputTokens,
        next.inputPricePerMillion,
        next.outputPricePerMillion,
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
  router.delete('/settings/model-endpoints/:slug', requireAdminOrSolo, async (req, res) => {
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
  router.post('/settings/model-endpoints/:slug/health', requireAdminOrSolo, async (req, res) => {
    try {
      const row = (await db.get(
        'SELECT * FROM custom_model_endpoints WHERE slug = ?',
        req.params.slug,
      )) as EndpointRow | undefined;
      if (!row) return res.status(404).json({ error: 'Endpoint not found' });

      const apiKey = row.api_key_encrypted ? decrypt(row.api_key_encrypted) : undefined;
      const listing = await listOpenAICompatibleModelsDetailed(
        row.base_url,
        apiKey,
        row.extra_headers ?? {},
      );

      if (listing.ok) {
        // The discovered list and each model's metadata are refreshed; the
        // admin's allowed_models list is never touched here.
        await db.run(
          `UPDATE custom_model_endpoints
              SET available_models = ?::jsonb, model_meta = ?::jsonb, updated_at = NOW()
            WHERE slug = ?`,
          JSON.stringify(listing.ids),
          JSON.stringify(listing.meta),
          req.params.slug,
        );
        invalidateCustomEndpointCache();
        res.json({ available: true, modelCount: listing.ids.length, models: listing.ids });
      } else {
        res.json({ available: false, error: listing.error });
      }
    } catch (err) {
      const e = safeError(err);
      res.status(500).json({ available: false, error: e });
    }
  });

  return router;
}

// ─────────────────────────────────────────────────────────────
// Server-side lookup helpers moved to
// services/custom-endpoint-resolver.ts (2026-07-29) so the LLM
// core no longer imports a route module (Express + role-guards).
// This route layer invalidates the resolver cache on every write.
// ─────────────────────────────────────────────────────────────
