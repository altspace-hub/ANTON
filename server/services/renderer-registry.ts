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
//
// Wave 3 (2026-09-16):
//   • Experimental renderers stay registered but are hidden from listings
//     unless asked for (`includeExperimental`) — the route grants that to
//     admins only.
//   • A content-aware renderer (content_types / requires_fields) is offered
//     BEFORE any payload exists, flagged `needs_extraction`, with the
//     content type resolved from the module — extraction now runs on
//     demand, so hiding these until a payload turned up would have hidden
//     them for good.
//   • runRenderer fails loudly: every failure lands in renderer_audit_log as
//     a `failed` event with its message, and surfaces as a RendererRunError
//     that names the stage. renderer_audit_log had two rows on the dev
//     database, both 'invoked', with nothing to say why nothing followed.

import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import {
  type RendererDefinition,
  type RenderContext,
  type RenderFn,
  type RenderResult,
  evaluateRequiresField,
} from './renderer-registry.types.js';
import { BUILTIN_RENDERERS } from './renderer-registry.builtin.js';
import { loadLatexBrandAssets } from './brand-latex-assets.js';
import {
  type ContentType,
  type StructuredOutput,
  isContentType,
} from '../schemas/content-types/index.js';

const OUTPUT_ROOT = process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'outputs');
const ARTIFACTS_SUBDIR = 'renderer-artifacts';
/** renderer_audit_log.details is JSONB; keep one failure readable in a list. */
const MAX_AUDIT_MESSAGE_LEN = 1_000;

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

export type RendererRunStage = 'lookup' | 'precondition' | 'render' | 'persist';

/**
 * A renderer run that did not produce an artifact. `stage` says where it
 * stopped, so the route can pick a status and the panel can say whether the
 * renderer, its input, or the instance is at fault.
 */
export class RendererRunError extends Error {
  readonly stage: RendererRunStage;
  readonly rendererId: string;
  readonly sessionId: string;
  constructor(stage: RendererRunStage, rendererId: string, sessionId: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RendererRunError';
    this.stage = stage;
    this.rendererId = rendererId;
    this.sessionId = sessionId;
  }
}

export type RendererAuditEvent = 'invoked' | 'succeeded' | 'failed' | 'validation_failed' | 'extraction_missing';

/** A definition as offered for one session — `needs_extraction` means the
 *  session has no structured payload yet and pressing it extracts first. */
export type ApplicableRenderer = RendererDefinition & { needs_extraction: boolean };

/** A renderer that cannot run on the Markdown alone. */
export function rendererNeedsStructured(def: Pick<RendererDefinition, 'applies_when'>): boolean {
  const aw = def.applies_when ?? {};
  return (Array.isArray(aw.content_types) && aw.content_types.length > 0)
    || (Array.isArray(aw.requires_fields) && aw.requires_fields.length > 0);
}

export interface RendererRegistryDeps {
  /** Content type for a session whose extraction has not run yet — the
   *  module's declared contentType. Default: module-loader via the
   *  extraction queue's resolver. Injected by tests. */
  resolveContentType?: (moduleId: string | null) => Promise<ContentType>;
  /** Test seam: resolve a render function without importing a module. */
  resolveRenderFn?: (def: RendererDefinition) => Promise<RenderFn>;
}

export function createRendererRegistry(db: DatabaseAdapter, deps: RendererRegistryDeps = {}) {
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

  /**
   * Enabled renderers. Experimental ones are registered and runnable by id
   * but hidden from listings unless `includeExperimental` — seven of the
   * seventeen built-ins are experimental, and a panel that shows them to
   * every user shows unfinished work as product.
   */
  async function listRenderers(opts?: { includeDisabled?: boolean; includeExperimental?: boolean }): Promise<RendererDefinition[]> {
    const hidden: string[] = [];
    if (!opts?.includeDisabled) hidden.push('disabled');
    if (!opts?.includeExperimental) hidden.push('experimental');
    const where = hidden.length === 0
      ? ''
      : `WHERE status NOT IN (${hidden.map(() => '?').join(', ')}) `;
    const rows = await db.all<{
      id: string; label: string; description: string | null; category: string;
      trigger: string; applies_when: unknown; output: unknown;
      renderer_module: string; preview_module: string | null;
      phase: number; status: string; sort_order: number;
    }>(
      `SELECT * FROM renderers ${where}ORDER BY category, sort_order, label`,
      ...hidden,
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

  async function resolveContentType(moduleId: string | null): Promise<ContentType> {
    if (deps.resolveContentType) return deps.resolveContentType(moduleId);
    const { resolveModuleContentType } = await import('./structured-extraction-queue.js');
    return resolveModuleContentType(moduleId);
  }

  /**
   * The renderers this session can use. With a payload, the filters are
   * exact (content type + required fields). Without one, the content type
   * comes from the module and content-aware renderers are offered flagged
   * `needs_extraction` — the run route extracts first, then re-checks the
   * required fields against what came back.
   */
  async function getApplicableRenderers(sessionId: string, opts?: { includeExperimental?: boolean }): Promise<ApplicableRenderer[]> {
    const session = await loadSession(sessionId);
    if (!session) return [];
    const all = await listRenderers({ includeExperimental: opts?.includeExperimental });
    const payload = coerceStructured(session);
    const contentType = session.content_type ?? (await resolveContentType(session.module_id ?? null));
    const sector = session.sector;
    const out: ApplicableRenderer[] = [];
    for (const def of all) {
      if (def.trigger === 'upfront') continue;
      const aw = def.applies_when;
      // Content type filter
      if (aw.content_types && aw.content_types.length > 0) {
        if (!contentType || !aw.content_types.includes(contentType as ContentType)) continue;
      }
      // Sector filter (Phase 2+; Phase 1 renderers don't specify)
      if (aw.sectors && aw.sectors.length > 0) {
        if (!sector || !aw.sectors.includes(sector)) continue;
      }
      // Required-fields filter — exact once a payload exists. Before that the
      // renderer is offered as needing extraction; the fields are checked
      // again after the on-demand extraction, against real data.
      const needsStructured = rendererNeedsStructured(def);
      if (aw.requires_fields && aw.requires_fields.length > 0 && payload) {
        let ok = true;
        for (const expr of aw.requires_fields) {
          if (!evaluateRequiresField(payload.body, expr)) { ok = false; break; }
        }
        if (!ok) continue;
      }
      out.push({ ...def, needs_extraction: needsStructured && !payload });
    }
    return out;
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
    if (!session) throw new RendererRunError('lookup', rendererId, sessionId, `Session not found: ${sessionId}`);
    const def = await getRenderer(rendererId);
    if (!def) throw new RendererRunError('lookup', rendererId, sessionId, `Renderer not found: ${rendererId}`);
    if (def.status === 'disabled') throw new RendererRunError('lookup', rendererId, sessionId, `Renderer ${rendererId} is disabled`);

    await logAudit({ sessionId, rendererId, userId, event: 'invoked', details: { options } });

    try {
      // Build the RenderContext
      const payload = coerceStructured(session);
      if (!payload && rendererNeedsStructured(def)) {
        // Some renderers are fine without structured (e.g. plain-language, pdf of any session).
        // But renderers that specified content_types or requires_fields must not run without it.
        await logAudit({ sessionId, rendererId, userId, event: 'extraction_missing', details: {} });
        throw new RendererRunError('precondition', rendererId, sessionId,
          `Renderer ${rendererId} requires a structured payload, but extraction has not completed for this session.`);
      }

      const markdown = await loadLatestMarkdown(sessionId);
      const brandTemplate = await loadBrandTemplate(session.user_id);
      // Company-uploaded LaTeX class/style files. Scoped to the SESSION's owner —
      // see loadLatexBrandAssets for why that, and not the caller, is the right
      // subject. Empty on every instance that has never uploaded one, which is
      // what keeps the .tex export unchanged for everybody else.
      const latexAssets = await loadLatexBrandAssets(db, session.user_id);
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
        latex_assets: latexAssets.length > 0 ? latexAssets : undefined,
      };

      // Resolve + execute the render function
      let result: RenderResult;
      try {
        const renderFn = await resolveRenderFn(def);
        result = await renderFn(
          payload ?? buildFallbackPayload(session, markdown ?? ''),
          ctx,
        );
      } catch (err) {
        throw new RendererRunError('render', rendererId, sessionId,
          `${def.label} failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
      }

      const durationMs = Date.now() - started;

      // Persist artifact + output_versions link in a single transaction so the
      // artifact can never exist without its version row, and concurrent
      // runRenderer calls serialise on the version_number (session_id, ver)
      // UNIQUE constraint.
      let artifactId: number;
      try {
        const fileSize = result.file_size_bytes
          ?? (await tryStatSize(resolveArtifactAbsPath(result.file_path)));
        ({ artifactId } = await db.transaction(async (tx) => {
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
        }));
      } catch (err) {
        throw new RendererRunError('persist', rendererId, sessionId,
          `${def.label} produced its file but the artifact could not be recorded: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
      }

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
    } catch (err) {
      const runError = err instanceof RendererRunError
        ? err
        : new RendererRunError('render', rendererId, sessionId, err instanceof Error ? err.message : String(err), { cause: err });
      // The precondition branch has already written its own event.
      if (runError.stage !== 'precondition') {
        await logAudit({
          sessionId, rendererId, userId, event: 'failed',
          details: {
            stage: runError.stage,
            message: runError.message.slice(0, MAX_AUDIT_MESSAGE_LEN),
            duration_ms: Date.now() - started,
          },
        });
      }
      console.warn(`[renderer-registry] ${rendererId} failed at ${runError.stage} for session ${sessionId}: ${runError.message}`);
      throw runError;
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────

  async function resolveRenderFn(def: RendererDefinition): Promise<RenderFn> {
    if (deps.resolveRenderFn) return deps.resolveRenderFn(def);
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

  /**
   * Load the instance brand config and adapt it to the renderer contract.
   *
   * Two bugs sat here, and each one alone was enough to make branding a no-op.
   *
   * 1. The query read `WHERE user_id = ?`. `user_profiles` has no such column — it is a
   *    singleton keyed `id TEXT PRIMARY KEY DEFAULT 'default'`. Postgres threw, the bare
   *    catch returned null, and no renderer ever saw a brand.
   *
   * 2. The row was cast straight to BrandTemplate. What is STORED is Settings' shape —
   *    `{ fonts: { body, h1… }, palette: string[] }` — while renderers read
   *    `primary_color` / `accent_color` / `font_family`. A cast does not convert, so even
   *    with the query fixed every field would have been undefined and every renderer
   *    would have fallen through to its defaults. The two are mapped explicitly below.
   *
   * It is instance-wide by design: user_profiles holds one row, so `userId` selects
   * nothing. The parameter is kept because the signature is part of the render context,
   * and a per-user brand would reinstate it.
   */
  async function loadBrandTemplate(_userId: string | null): Promise<import('./renderer-registry.types.js').BrandTemplate | null> {
    try {
      const row = await db.get<{ brand_config: unknown }>(
        `SELECT brand_config FROM user_profiles WHERE id = ? LIMIT 1`,
        'default',
      );
      if (!row?.brand_config) return null;
      const cfg = (typeof row.brand_config === 'string' ? JSON.parse(row.brand_config) : row.brand_config) as {
        fonts?: Record<string, { family?: string; color?: string }>;
        palette?: string[];
        [k: string]: unknown;
      };

      const withHash = (c?: string) => (c && !c.startsWith('#') ? `#${c}` : c);
      return {
        primary_color: withHash(cfg.palette?.[0] ?? cfg.fonts?.h1?.color),
        accent_color:  withHash(cfg.palette?.[1] ?? cfg.palette?.[0]),
        font_family:   cfg.fonts?.body?.family,
        // Anything Settings stores that has no first-class field — including a company
        // LaTeX preamble — reaches renderers through here rather than being dropped.
        extra: cfg,
      };
    } catch (err) {
      console.warn('[renderer-registry] brand config unavailable, using defaults:', (err as Error).message);
      return null;
    }
  }

  async function logAudit(params: {
    sessionId: string;
    rendererId: string;
    userId?: string | null;
    event: RendererAuditEvent;
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
    /** The route records what happened around a run (on-demand extraction
     *  that failed, required fields missing after it) in the same log. */
    audit: logAudit,
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
