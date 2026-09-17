// ── Renderer Registry REST API ──────────────────────────────────────────
//
// GET  /api/renderers                          — list all enabled renderers
// GET  /api/renderers/applicable?session_id=X  — filtered list for one session
// GET  /api/renderers/:id                      — single renderer definition
// POST /api/renderers/run                      — execute a renderer, persist artifact
// GET  /api/renderers/artifacts/:artifactId    — download / stream an artifact
// GET  /api/sessions/:id/artifacts             — list rendered artifacts for a session
//
// Session-bound endpoints enforce caller ownership (same pattern as
// routes/sessions.ts): admins see everything; everyone else sees only their
// own sessions. A rendered_artifacts row is owned by the session it belongs
// to — ownership is resolved via the linked sessions.user_id.
//
// Wave 3 (2026-09-16):
//   • Listings hide experimental renderers unless `?includeExperimental=1`
//     from an admin (or the solo operator).
//   • POST /renderers/run extracts ON DEMAND: a content-aware renderer
//     requested for a session with no structured payload runs the
//     extraction first and waits for it. A failure comes back as 422 with
//     the metered error (also persisted on the session), never as a silent
//     "renderer requires a structured payload".
//   • Renderer failures are logged (ids + stage) and returned as
//     { error, stage, renderer_id } with a status that says whose fault it is.

import { Router, type Response } from 'express';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import type { DatabaseAdapter } from '../db/database.js';
import {
  createRendererRegistry,
  rendererNeedsStructured,
  RendererRunError,
  ARTIFACTS_SUBDIR,
  OUTPUT_ROOT,
  type RendererRegistry,
} from '../services/renderer-registry.js';
import {
  createExtractionQueue,
  getAutoExtractionSetting,
  resolveModuleContentType,
  type ExtractionQueue,
} from '../services/structured-extraction-queue.js';
import { isTeamMode } from '../middleware/role-guards.js';
import { safeError } from '../lib/error-response.js';

interface AuthedRequest {
  user?: { id: string; role?: string };
}

/** Experimental renderers are listed only for an admin (or the solo
 *  operator) who asks with `?includeExperimental=1`. Everyone else gets
 *  stable + beta, silently. */
function experimentalAllowed(req: AuthedRequest, query: Record<string, unknown>): boolean {
  const asked = String(query.includeExperimental ?? query.include_experimental ?? '');
  if (asked !== '1' && asked !== 'true') return false;
  return req.user?.role === 'admin' || !isTeamMode();
}

/**
 * Verifies the caller owns (or admins) the given session. Returns `true`
 * if access is allowed; writes a 404 and returns `false` otherwise.
 */
async function ensureSessionAccess(
  db: DatabaseAdapter,
  req: AuthedRequest,
  sessionId: string,
  res: Response,
): Promise<boolean> {
  const userId = req.user?.id;
  const userRole = req.user?.role;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return false; }
  const row = await db.get<{ id: string }>(
    userRole === 'admin'
      ? `SELECT id FROM sessions WHERE id = ?`
      : `SELECT id FROM sessions WHERE id = ? AND user_id = ?`,
    ...(userRole === 'admin' ? [sessionId] : [sessionId, userId]),
  );
  if (!row) { res.status(404).json({ error: 'Session not found or access denied' }); return false; }
  return true;
}

export interface RendererRouteDeps {
  registry?: RendererRegistry;
  extractionQueue?: ExtractionQueue;
}

export function createRendererRoutes(db: DatabaseAdapter, deps: RendererRouteDeps = {}): Router {
  const router = Router();
  const registry = deps.registry ?? createRendererRegistry(db, { resolveContentType: resolveModuleContentType });
  const extractionQueue = deps.extractionQueue ?? createExtractionQueue(db, resolveModuleContentType);

  /**
   * Extraction on demand. Resolves true when the session has a structured
   * payload the renderer can use. Otherwise the response has been written
   * (422 with the metered error) and the caller must return.
   */
  async function ensureStructuredPayload(
    sessionId: string,
    rendererId: string,
    userId: string | null,
    res: Response,
  ): Promise<boolean> {
    const sess = await db.get<{ module_id: string | null; user_id: string | null; output_structured: unknown }>(
      'SELECT module_id, user_id, output_structured FROM sessions WHERE id = ?',
      sessionId,
    );
    if (sess?.output_structured) return true;

    const latest = await db.get<{ content: string; model_id: string | null }>(
      `SELECT content, model_id FROM messages WHERE session_id = ? AND role = 'assistant'
       ORDER BY created_at DESC LIMIT 1`,
      sessionId,
    );
    const result = await extractionQueue.extractNow({
      sessionId,
      markdown: latest?.content ?? '',
      moduleId: sess?.module_id ?? null,
      // The extraction cache is scoped to the session's owner, not the caller
      // (an admin running someone else's session must not seed their own cache).
      userId: sess?.user_id ?? userId,
      generationModel: latest?.model_id ?? null,
    });
    if (result.status !== 'extracted') {
      const error = result.error ?? 'extraction failed';
      await registry.audit({
        sessionId, rendererId, userId, event: 'extraction_missing',
        details: { on_demand: true, error: error.slice(0, 1000), method: result.method ?? null, model: result.model ?? null },
      });
      res.status(422).json({
        error: `Structured extraction failed: ${error}`,
        stage: 'extraction',
        renderer_id: rendererId,
        structured_status: 'failed',
        structured_error: error,
      });
      return false;
    }

    // The fields the renderer needs are checked against real data now.
    const applicable = await registry.getApplicableRenderers(sessionId, { includeExperimental: true });
    if (!applicable.some((r) => r.id === rendererId)) {
      const def = await registry.getRenderer(rendererId);
      const requires = def?.applies_when.requires_fields ?? [];
      const message = `The structured analysis of this output does not carry what this transform needs${requires.length ? ` (${requires.join(', ')})` : ''}.`;
      await registry.audit({
        sessionId, rendererId, userId, event: 'validation_failed',
        details: { on_demand: true, requires_fields: requires },
      });
      res.status(422).json({ error: message, stage: 'precondition', renderer_id: rendererId, structured_status: 'extracted' });
      return false;
    }
    return true;
  }

  // ── Listing ────────────────────────────────────────────────────────

  router.get('/renderers', async (req, res) => {
    try {
      const renderers = await registry.listRenderers({
        includeExperimental: experimentalAllowed(req as AuthedRequest, req.query as Record<string, unknown>),
      });
      res.json({ success: true, renderers });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/renderers/applicable', async (req, res) => {
    try {
      const schema = z.object({ session_id: z.string().min(1) });
      const parsed = schema.safeParse(req.query);
      if (!parsed.success) { res.status(400).json({ error: 'session_id is required' }); return; }
      if (!(await ensureSessionAccess(db, req as AuthedRequest, parsed.data.session_id, res))) return;
      const applicable = await registry.getApplicableRenderers(parsed.data.session_id, {
        includeExperimental: experimentalAllowed(req as AuthedRequest, req.query as Record<string, unknown>),
      });
      const grouped: Record<string, typeof applicable> = {};
      for (const r of applicable) {
        (grouped[r.category] ??= []).push(r);
      }
      // Also report the structured-extraction state — status, the last
      // error and the attempt count — so the Transform panel can say what
      // happened rather than that something did.
      const sess = await db.get<{
        content_type: string | null; structured_status: string | null;
        structured_error: string | null; structured_attempts: number | string | null;
      }>(
        'SELECT content_type, structured_status, structured_error, structured_attempts FROM sessions WHERE id = ?',
        parsed.data.session_id,
      );
      const auto = await getAutoExtractionSetting(db);
      res.json({
        success: true,
        renderers: applicable,
        grouped,
        content_type: sess?.content_type ?? null,
        structured_status: sess?.structured_status ?? null,
        structured_error: sess?.structured_error ?? null,
        structured_attempts: Number(sess?.structured_attempts ?? 0),
        auto_extraction: auto.enabled,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/renderers/:id', async (req, res) => {
    try {
      const def = await registry.getRenderer(String(req.params.id));
      if (!def) { res.status(404).json({ error: 'Renderer not found' }); return; }
      res.json({ success: true, renderer: def });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Execution ──────────────────────────────────────────────────────

  router.post('/renderers/run', async (req, res) => {
    const schema = z.object({
      session_id: z.string().min(1),
      renderer_id: z.string().min(1),
      options: z.record(z.string(), z.unknown()).optional(),
    }).strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
    const { session_id: sessionId, renderer_id: rendererId } = parsed.data;
    try {
      if (!(await ensureSessionAccess(db, req as AuthedRequest, sessionId, res))) return;
      const userId = (req as AuthedRequest).user?.id ?? null;
      const def = await registry.getRenderer(rendererId);
      if (!def) { res.status(404).json({ error: 'Renderer not found', renderer_id: rendererId }); return; }

      // Extraction on demand: a content-aware renderer on a session with no
      // payload extracts first (and waits), instead of failing on the
      // precondition that the old auto-extraction was supposed to have met.
      if (rendererNeedsStructured(def)) {
        if (!(await ensureStructuredPayload(sessionId, rendererId, userId, res))) return;
      }

      const result = await registry.runRenderer(sessionId, rendererId, parsed.data.options ?? {}, userId);
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      if (err instanceof RendererRunError) {
        // ids + stage only; the message is the renderer's own and goes to the caller.
        console.warn(`[renderers] run failed stage=${err.stage} renderer=${err.rendererId} session=${err.sessionId}`);
        const status = err.stage === 'lookup' ? 404 : err.stage === 'persist' ? 500 : 422;
        res.status(status).json({ error: safeError(err), stage: err.stage, renderer_id: err.rendererId });
        return;
      }
      console.warn(`[renderers] run failed renderer=${rendererId} session=${sessionId}: ${err instanceof Error ? err.message : 'error'}`);
      res.status(500).json({ error: safeError(err), stage: 'render', renderer_id: rendererId });
    }
  });

  // ── Artifact download ──────────────────────────────────────────────

  router.get('/sessions/:id/artifacts', async (req, res) => {
    try {
      const sessionId = String(req.params.id);
      if (!(await ensureSessionAccess(db, req as AuthedRequest, sessionId, res))) return;
      const rows = await db.all<{
        id: number; renderer_id: string; file_path: string; file_type: string;
        mime_type: string; file_size_bytes: number | null; metadata: unknown;
        created_at: string; created_by: string | null;
      }>(
        `SELECT id, renderer_id, file_path, file_type, mime_type, file_size_bytes, metadata, created_at, created_by
         FROM rendered_artifacts WHERE session_id = ? ORDER BY created_at DESC`,
        sessionId,
      );
      res.json({ success: true, artifacts: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/renderers/artifacts/:artifactId', async (req, res) => {
    try {
      // Owner check via join: the caller must own the session the artifact belongs to.
      const userId = (req as AuthedRequest).user?.id;
      const userRole = (req as AuthedRequest).user?.role;
      if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }
      const ownershipQuery = userRole === 'admin'
        ? `SELECT a.file_path, a.mime_type, a.file_type FROM rendered_artifacts a WHERE a.id = ?`
        : `SELECT a.file_path, a.mime_type, a.file_type
           FROM rendered_artifacts a JOIN sessions s ON s.id = a.session_id
           WHERE a.id = ? AND s.user_id = ?`;
      const row = await db.get<{ file_path: string; mime_type: string; file_type: string }>(
        ownershipQuery,
        ...(userRole === 'admin' ? [Number(req.params.artifactId)] : [Number(req.params.artifactId), userId]),
      );
      if (!row) { res.status(404).json({ error: 'Artifact not found' }); return; }
      const absPath = path.isAbsolute(row.file_path)
        ? row.file_path
        : path.join(OUTPUT_ROOT, ARTIFACTS_SUBDIR, row.file_path);
      const root = path.resolve(OUTPUT_ROOT, ARTIFACTS_SUBDIR);
      const resolved = path.resolve(absPath);
      const rootWithSep = root + path.sep;
      if (resolved !== root && !resolved.startsWith(rootWithSep)) {
        res.status(400).json({ error: 'Artifact path escapes the artifacts root' }); return;
      }
      const buf = await fs.readFile(resolved);
      res.setHeader('Content-Type', row.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(resolved)}"`);
      // X-Content-Type-Options defeats MIME-sniff-to-HTML on .svg served to <img>/<iframe>
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
