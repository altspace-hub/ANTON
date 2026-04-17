// ── Renderer Registry — core service ─────────────────────────────────────
//
// The Renderer Registry is the single source of truth for what output
// transforms exist on this ANTON instance. Renderers are declared as
// RendererDefinition code (BUILTIN_RENDERERS in renderer-registry.builtin.ts)
// and synced into the `renderers` DB table on startup so admins can
// override status (stable/beta/experimental/disabled) without a deploy.
//
// Runtime use:
//   • getApplicableRenderers(sessionId) — filtered list for a given output
//   • runRenderer(sessionId, rendererId, options) — executes a renderer and
//     persists the artifact + audit log + (optional) output_version link
//
// Renderer implementation modules are dynamically imported on first use.

import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import {
  type RendererDefinition,
  type RegistryEntry,
  type RenderContext,
  type RenderResult,
  type RenderFn,
  evaluateRequiresField,
} from './renderer-registry.types.js';
import { BUILTIN_RENDERERS } from './renderer-registry.builtin.js';
import {
  type ContentType,
  type StructuredOutput,
  isContentType,
} from '../schemas/content-types/index.js';

const OUTPUT_ROOT = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'outputs');
const ARTIFACTS_SUBDIR = 'renderer-artifacts';

interface SessionRow {
  id: string;
  module_id: string;
  title: string;
  user_id: string | null;
  content_type: string | null;
  sector: string | null;
  output_structured: unknown;
  structured_status: string | null;
}

interface MessageRow {
  content: string;
}

export function createRendererRegistry(db: DatabaseAdapter) {
  // In-memory cache of resolved render functions (by renderer_module path)
  const renderFnCache = new Map<string, RenderFn>();

  // ── Registry seeding (startup) ─────────────────────────────────────────

  async function seedRegistry(): Promise<{ inserted: number; updated: number }> {
    // Single INSERT ... ON CONFLICT DO UPDATE — atomic. Avoids the boot race
    // when two servers start simultaneously and both see "no row" then both
    // INSERT (primary-key violation on one). `status` is deliberately NOT in
    // the UPDATE set so admin overrides (disable a buggy beta renderer via
    // direct SQL) survive restarts.
    let inserted = 0; let updated = 0;
    for (const def of BUILTIN_RENDERERS) {
      const row = await db.get<{ was_insert: boolean }>(
        `INSERT INTO renderers
          (id, label, description, category, trigger, applies_when, output,
           renderer_module, preview_module, phase, status, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           label = EXCLUDED.label,
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           trigger = EXCLUDED.trigger,
           applies_when = EXCLUDED.applies_when,
           output = EXCLUDED.output,
           renderer_module = EXCLUDED.renderer_module,
           preview_module = EXCLUDED.preview_module,
           phase = EXCLUDED.phase,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()
         RETURNING (xmax = 0) AS was_insert`,
        def.id, def.label, def.description, def.category, def.trigger,
        JSON.stringify(def.applies_when), JSON.stringify(def.output),
        def.renderer_module, def.preview_module ?? null,
        def.phase, def.status, def.sort_order ?? 100,
      );
      if (row?.was_insert) inserted++; else updated++;
    }
    return { inserted, updated };
  }

  // ── Querying ──────────────────────────────────────────────────────────

  async function listRenderers(opts?: { includeDisabled?: boolean }): Promise<RendererDefinition[]> {
    const rows = await db.all<{
      id: string; label: string; description: string | null; category: string;
      trigger: string; applies_when: unknown; output: unknown;
      renderer_module: string; preview_module: string | null;
      phase: number; status: string; sort_order: number;
    }>(
      opts?.includeDisabled
        ? `SELECT * FROM renderers ORDER BY category, sort_order, label`
        : `SELECT * FROM renderers WHERE status != 'disabled' ORDER BY category, sort_order, label`,
    );
    return rows.map(rowToDefinition);
  }

  async function getRenderer(id: string): Promise<RendererDefinition | null> {
    const row = await db.get<{
      id: string; label: string; description: string | null; category: string;
      trigger: string; applies_when: unknown; output: unknown;
      renderer_module: string; preview_module: string | null;
      phase: number; status: string; sort_order: number;
    }>(`SELECT * FROM renderers WHERE id = ?`, id);
    return row ? rowToDefinition(row) : null;
  }

  async function getApplicableRenderers(sessionId: string): Promise<RendererDefinition[]> {
    const session = await loadSession(sessionId);
    if (!session) return [];
    const all = await listRenderers();
    const contentType = session.content_type;
    const sector = session.sector;
    const payload = coerceStructured(session);
    return all.filter(def => {
      if (def.trigger === 'upfront') return false;
      const aw = def.applies_when;
      // Content type filter
      if (aw.content_types && aw.content_types.length > 0) {
        if (!contentType || !aw.content_types.includes(contentType as ContentType)) return false;
      }
      // Sector filter (Phase 2+; Phase 1 renderers don't specify)
      if (aw.sectors && aw.sectors.length > 0) {
        if (!sector || !aw.sectors.includes(sector)) return false;
      }
      // Required-fields filter — needs a payload; if extraction missing, hide
      // any renderer that depends on specific fields.
      if (aw.requires_fields && aw.requires_fields.length > 0) {
        if (!payload) return false;
        for (const expr of aw.requires_fields) {
          if (!evaluateRequiresField(payload.body, expr)) return false;
        }
      }
      return true;
    });
  }

  // ── Execution ─────────────────────────────────────────────────────────

  async function runRenderer(
    sessionId: string,
    rendererId: string,
    options: Record<string, unknown> = {},
    userId?: string | null,
  ): Promise<{ artifact_id: number; file_path: string; preview_path?: string; validation?: unknown; metadata: Record<string, unknown>; duration_ms: number; tokens_consumed?: number }> {
    const started = Date.now();
    const session = await loadSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    const def = await getRenderer(rendererId);
    if (!def) throw new Error(`Renderer not found: ${rendererId}`);
    if (def.status === 'disabled') throw new Error(`Renderer ${rendererId} is disabled`);

    await logAudit({ sessionId, rendererId, userId, event: 'invoked', details: { options } });

    // Build the RenderContext
    const payload = coerceStructured(session);
    if (!payload) {
      // Some renderers are fine without structured (e.g. plain-language, pdf of any session).
      // But renderers that specified content_types or requires_fields must not run without it.
      const aw = def.applies_when;
      const needsStructured = (aw.content_types && aw.content_types.length > 0)
        || (aw.requires_fields && aw.requires_fields.length > 0);
      if (needsStructured) {
        await logAudit({ sessionId, rendererId, userId, event: 'extraction_missing', details: {} });
        throw new Error(`Renderer ${rendererId} requires a structured payload, but extraction has not completed for this session.`);
      }
    }

    const markdown = await loadLatestMarkdown(sessionId);
    const brandTemplate = await loadBrandTemplate(session.user_id);
    const ctx: RenderContext = {
      session: {
        id: session.id,
        module_id: session.module_id,
        title: session.title,
        area_id: (payload?.area_id as string | null) ?? null,
        content_type: isContentType(session.content_type) ? session.content_type : null,
        sector: session.sector,
        user_id: session.user_id,
      },
      options,
      brand_template: brandTemplate ?? undefined,
      markdown: markdown ?? undefined,
    };

    // Resolve + execute the render function
    const renderFn = await resolveRenderFn(def);
    const result = await renderFn(
      payload ?? buildFallbackPayload(session, markdown ?? ''),
      ctx,
    );

    const durationMs = Date.now() - started;

    // Persist artifact + output_versions link in a single transaction so the
    // artifact can never exist without its version row, and concurrent
    // runRenderer calls serialise on the version_number (session_id, ver)
    // UNIQUE constraint.
    const fileSize = result.file_size_bytes
      ?? (await tryStatSize(resolveArtifactAbsPath(result.file_path)));
    const { artifactId } = await db.transaction(async (tx) => {
      const artifactRow = await tx.get<{ id: number }>(
        `INSERT INTO rendered_artifacts
          (session_id, renderer_id, output_version_id, file_path, preview_path,
           file_type, mime_type, file_size_bytes, validation, metadata, options,
           duration_ms, tokens_consumed, created_by)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        sessionId, rendererId,
        result.file_path, result.preview_path ?? null,
        result.file_type, result.mime_type, fileSize ?? null,
        result.validation ? JSON.stringify(result.validation) : null,
        JSON.stringify(result.metadata ?? {}),
        JSON.stringify(options),
        durationMs, result.tokens_consumed ?? null,
        userId ?? null,
      );
      if (!artifactRow) throw new Error('Failed to insert rendered_artifacts row');

      // Lock current max version for this session to avoid version-number
      // collisions under concurrent runRenderer calls.
      const maxRow = await tx.get<{ maxv: number | string | null }>(
        `SELECT COALESCE(MAX(version_number), 0) AS maxv
         FROM output_versions WHERE session_id = ? FOR UPDATE`,
        sessionId,
      );
      const nextVersion = Number(maxRow?.maxv ?? 0) + 1;
      const ovId = `ov_${randomUUID()}`;
      await tx.run(
        `INSERT INTO output_versions (id, session_id, version_number, content, metadata, is_current, user_id)
         VALUES (?, ?, ?, ?, ?, FALSE, ?)`,
        ovId, sessionId, nextVersion,
        `[renderer:${rendererId}] → ${result.file_path}`,
        JSON.stringify({ renderer_id: rendererId, artifact_id: artifactRow.id, file_type: result.file_type }),
        userId ?? null,
      );
      await tx.run(
        `UPDATE rendered_artifacts SET output_version_id = ? WHERE id = ?`,
        ovId, artifactRow.id,
      );
      return { artifactId: artifactRow.id };
    });

    await logAudit({
      sessionId, rendererId, userId, event: 'succeeded',
      artifactId,
      details: { duration_ms: durationMs, file_type: result.file_type },
    });

    return {
      artifact_id: artifactId,
      file_path: result.file_path,
      preview_path: result.preview_path,
      validation: result.validation,
      metadata: result.metadata,
      duration_ms: durationMs,
      tokens_consumed: result.tokens_consumed,
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────

  async function resolveRenderFn(def: RendererDefinition): Promise<RenderFn> {
    const cached = renderFnCache.get(def.renderer_module);
    if (cached) return cached;
    const mod = await import(def.renderer_module);
    const fn: unknown = mod.render ?? mod.default;
    if (typeof fn !== 'function') {
      throw new Error(`Renderer module ${def.renderer_module} does not export a \`render\` function`);
    }
    const rf = fn as RenderFn;
    renderFnCache.set(def.renderer_module, rf);
    return rf;
  }

  async function loadSession(sessionId: string): Promise<SessionRow | null> {
    return (await db.get<SessionRow>(
      `SELECT id, module_id, title, user_id, content_type, sector, output_structured, structured_status
       FROM sessions WHERE id = ?`,
      sessionId,
    )) ?? null;
  }

  async function loadLatestMarkdown(sessionId: string): Promise<string | null> {
    const row = await db.get<MessageRow>(
      `SELECT content FROM messages WHERE session_id = ? AND role = 'assistant'
       ORDER BY created_at DESC LIMIT 1`,
      sessionId,
    );
    return row?.content ?? null;
  }

  async function loadBrandTemplate(userId: string | null): Promise<import('./renderer-registry.types.js').BrandTemplate | null> {
    if (!userId) return null;
    try {
      const row = await db.get<{ brand_config: unknown }>(
        `SELECT brand_config FROM user_profiles WHERE user_id = ? LIMIT 1`,
        userId,
      );
      if (!row?.brand_config) return null;
      const cfg = typeof row.brand_config === 'string' ? JSON.parse(row.brand_config) : row.brand_config;
      return cfg as import('./renderer-registry.types.js').BrandTemplate;
    } catch {
      return null;
    }
  }

  async function logAudit(params: {
    sessionId: string;
    rendererId: string;
    userId?: string | null;
    event: 'invoked' | 'succeeded' | 'failed' | 'validation_failed' | 'extraction_missing';
    artifactId?: number;
    details?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await db.run(
        `INSERT INTO renderer_audit_log (session_id, renderer_id, artifact_id, user_id, event, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        params.sessionId, params.rendererId, params.artifactId ?? null,
        params.userId ?? null, params.event, JSON.stringify(params.details ?? {}),
      );
    } catch (err) {
      console.warn('[renderer-registry] audit log write failed:', err instanceof Error ? err.message : err);
    }
  }

  return {
    seedRegistry,
    listRenderers,
    getRenderer,
    getApplicableRenderers,
    runRenderer,
    // exported for testing
    _evaluateRequiresField: evaluateRequiresField,
  };
}

export type RendererRegistry = ReturnType<typeof createRendererRegistry>;

// ── Local helpers ──────────────────────────────────────────────────────

function rowToDefinition(row: {
  id: string; label: string; description: string | null; category: string;
  trigger: string; applies_when: unknown; output: unknown;
  renderer_module: string; preview_module: string | null;
  phase: number; status: string; sort_order: number;
}): RendererDefinition {
  return {
    id: row.id,
    label: row.label,
    description: row.description ?? '',
    category: row.category as RendererDefinition['category'],
    trigger: row.trigger as RendererDefinition['trigger'],
    applies_when: parseJson(row.applies_when, {}) as RendererDefinition['applies_when'],
    output: parseJson(row.output, {}) as RendererDefinition['output'],
    renderer_module: row.renderer_module,
    preview_module: row.preview_module ?? undefined,
    phase: row.phase as 1 | 2 | 3,
    status: row.status as RendererDefinition['status'],
    sort_order: row.sort_order,
  };
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
  return v as T;
}

function coerceStructured(session: SessionRow): StructuredOutput | null {
  if (!session.output_structured) return null;
  if (typeof session.output_structured === 'string') {
    try { return JSON.parse(session.output_structured) as StructuredOutput; }
    catch { return null; }
  }
  return session.output_structured as StructuredOutput;
}

/**
 * For renderers that can run without a structured payload (e.g. plain
 * language, exec one-pager), manufacture a minimal envelope so the
 * RenderFn contract is still uniform.
 */
function buildFallbackPayload(session: SessionRow, markdown: string): StructuredOutput<{ markdown: string }> {
  return {
    schema_version: '1.0',
    module_id: session.module_id,
    area_id: '',
    content_type: (isContentType(session.content_type) ? session.content_type : 'analytic_report'),
    sector: session.sector ?? null,
    generated_at: new Date().toISOString(),
    model: 'unknown',
    body: { markdown },
  };
}

export function resolveArtifactAbsPath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  return path.join(OUTPUT_ROOT, ARTIFACTS_SUBDIR, filePath);
}

async function tryStatSize(absPath: string): Promise<number | null> {
  try { const s = await fs.stat(absPath); return s.size; } catch { return null; }
}

export { OUTPUT_ROOT, ARTIFACTS_SUBDIR };
