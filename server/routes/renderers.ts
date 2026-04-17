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

import { Router } from 'express';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import type { DatabaseAdapter } from '../db/database.js';
import { createRendererRegistry, ARTIFACTS_SUBDIR, OUTPUT_ROOT } from '../services/renderer-registry.js';
import { safeError } from '../lib/error-response.js';

interface AuthedRequest {
  user?: { id: string; role?: string };
}

/**
 * Verifies the caller owns (or admins) the given session. Returns `true`
 * if access is allowed; writes a 404 and returns `false` otherwise.
 */
async function ensureSessionAccess(
  db: DatabaseAdapter,
  req: AuthedRequest,
  sessionId: string,
  res: import('express').Response,
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

export function createRendererRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const registry = createRendererRegistry(db);

  // ── Listing ────────────────────────────────────────────────────────

  router.get('/renderers', async (_req, res) => {
    try {
      const renderers = await registry.listRenderers();
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
      const applicable = await registry.getApplicableRenderers(parsed.data.session_id);
      const grouped: Record<string, typeof applicable> = {};
      for (const r of applicable) {
        (grouped[r.category] ??= []).push(r);
      }
      res.json({ success: true, renderers: applicable, grouped });
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
    try {
      const schema = z.object({
        session_id: z.string().min(1),
        renderer_id: z.string().min(1),
        options: z.record(z.string(), z.unknown()).optional(),
      }).strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }); return; }
      if (!(await ensureSessionAccess(db, req as AuthedRequest, parsed.data.session_id, res))) return;
      const userId = (req as AuthedRequest).user?.id ?? null;
      const result = await registry.runRenderer(
        parsed.data.session_id,
        parsed.data.renderer_id,
        parsed.data.options ?? {},
        userId,
      );
      res.status(201).json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
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
