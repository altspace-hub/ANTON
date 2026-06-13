// ── ANTON Studio — Live Local Preview Server routes (Studio P6) ─────────────
//
//   POST /api/coding/projects/:id/preview/start   spawn the per-project dev
//        server. body: { argv: string[] } OR { language: 'typescript'|'node'|
//        'python'|'rust' } (a preset → argv), optional { port }.
//        412 when CODING_STUDIO_PREVIEW is unset/false (spawns NOTHING).
//
//   POST /api/coding/projects/:id/preview/stop    SIGTERM the tracked handle
//        ONLY; if no handle (server restarted), just marks the DB row stopped.
//        NEVER taskkill / kill-by-pid / kill-by-port.
//
//   GET  /api/coding/projects/:id/preview/status  reconciled status (DB row +
//        whether a live handle exists → 'unknown' when running-but-no-handle).
//
//   GET  /api/coding/projects/:id/preview/logs    the in-memory ring buffer.
//
// Ownership is gated EXACTLY like coding-studio.ts: a coding_project belongs to
// a `projects` row; admins see everything, everyone else only their own. The
// preview service is INJECTABLE so route tests run with a fake (no real spawn).

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import {
  startPreview as realStart,
  stopPreview as realStop,
  getPreviewStatus as realStatus,
  getPreviewLogs as realLogs,
  type StartResult,
  type StopResult,
  type PreviewView,
} from '../services/coding-preview-service.js';

interface AuthedRequest {
  user?: { id: string; role?: string };
}

/** The service surface the routes depend on — injectable for tests. */
export interface PreviewService {
  startPreview(db: DatabaseAdapter, projectId: string, opts: { argv: string[]; port?: number }): Promise<StartResult>;
  stopPreview(db: DatabaseAdapter, projectId: string): Promise<StopResult>;
  getPreviewStatus(db: DatabaseAdapter, projectId: string): Promise<PreviewView>;
  getPreviewLogs(db: DatabaseAdapter, projectId: string): Promise<{ status: string; has_live_handle: boolean; logs: string }>;
}

export interface CodingPreviewRouteDeps {
  service?: PreviewService;
}

const DEFAULT_SERVICE: PreviewService = {
  startPreview: realStart,
  stopPreview: realStop,
  getPreviewStatus: realStatus,
  getPreviewLogs: realLogs,
};

/**
 * Built-in language → dev-server argv presets. These deliberately invoke the
 * dev-server BINARY via node (never an npm/.cmd shim — see the service's
 * Windows guard). The `<port>` placeholder is replaced with the chosen port at
 * start time; callers may always pass an explicit `argv` instead.
 */
const PREVIEW_PRESETS: Record<string, (port: number) => string[]> = {
  typescript: (port) => ['node', 'node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'],
  node: (port) => ['node', 'node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'],
  python: (port) => ['.venv/bin/python', '-m', 'http.server', String(port)],
  rust: (port) => ['cargo', 'run', '--', '--port', String(port)],
};

interface ProjectAccessRow {
  id: string;
  owner_user_id: string | null;
}

async function loadOwnedCodingProject(
  db: DatabaseAdapter,
  req: AuthedRequest,
  projectId: string,
  res: import('express').Response,
): Promise<ProjectAccessRow | null> {
  const userId = req.user?.id;
  const userRole = req.user?.role;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return null; }
  const row = await db.get<ProjectAccessRow>(
    `SELECT cp.id AS id, p.user_id AS owner_user_id
       FROM coding_projects cp
       JOIN projects p ON p.id = cp.project_id
      WHERE cp.id = ?`,
    projectId,
  );
  if (!row) { res.status(404).json({ error: 'Coding project not found' }); return null; }
  if (userRole !== 'admin' && row.owner_user_id && row.owner_user_id !== userId) {
    res.status(404).json({ error: 'Coding project not found' });
    return null;
  }
  return row;
}

export function createCodingPreviewRoutes(db: DatabaseAdapter, deps: CodingPreviewRouteDeps = {}): Router {
  const router = Router();
  const service = deps.service ?? DEFAULT_SERVICE;

  // ── POST /coding/projects/:id/preview/start ───────────────────────────────
  router.post('/coding/projects/:id/preview/start', async (req, res) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: 'project id is required' }); return; }
    const body = z.object({
      argv: z.array(z.string().min(1)).min(1).max(32).optional(),
      language: z.enum(['typescript', 'node', 'python', 'rust']).optional(),
      port: z.number().int().min(1).max(65535).optional(),
    }).safeParse(req.body ?? {});
    if (!body.success) { res.status(400).json({ error: 'invalid body' }); return; }

    try {
      const project = await loadOwnedCodingProject(db, req as AuthedRequest, params.data.id, res);
      if (!project) return;

      // Resolve argv: explicit argv wins; otherwise a language preset.
      let argv = body.data.argv;
      if (!argv) {
        if (!body.data.language) {
          res.status(400).json({ error: 'Provide an explicit "argv" array or a "language" preset.' });
          return;
        }
        // The preset's <port> is filled from the chosen port; if no explicit
        // port, the service picks one and the preset must accept it — so we let
        // the service pick the port and feed it back via the preset here only
        // when an explicit port is given. Otherwise pick a port deterministically
        // up-front so the preset and the bound port agree.
        const presetPort = body.data.port;
        const fn = PREVIEW_PRESETS[body.data.language];
        if (presetPort === undefined) {
          // The preset needs a concrete port to bind --port; require an explicit
          // port for presets so the bound port and the URL never disagree.
          res.status(400).json({
            error: 'Language presets need an explicit "port" so the dev server binds the URL it is given. Pass { language, port } or a full { argv }.',
          });
          return;
        }
        argv = fn(presetPort);
      }

      const result = await service.startPreview(db, params.data.id, { argv, port: body.data.port });
      if (!result.ok) {
        res.status(result.code ?? 500).json({ error: result.error ?? 'failed to start preview' });
        return;
      }
      res.json({ success: true, preview: result.view });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /coding/projects/:id/preview/stop ────────────────────────────────
  router.post('/coding/projects/:id/preview/stop', async (req, res) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: 'project id is required' }); return; }
    try {
      const project = await loadOwnedCodingProject(db, req as AuthedRequest, params.data.id, res);
      if (!project) return;
      const result = await service.stopPreview(db, params.data.id);
      res.json({ success: result.ok, note: result.note, message: result.error, preview: result.view });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /coding/projects/:id/preview/status ───────────────────────────────
  router.get('/coding/projects/:id/preview/status', async (req, res) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: 'project id is required' }); return; }
    try {
      const project = await loadOwnedCodingProject(db, req as AuthedRequest, params.data.id, res);
      if (!project) return;
      const view = await service.getPreviewStatus(db, params.data.id);
      res.json({ success: true, preview: view });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /coding/projects/:id/preview/logs ─────────────────────────────────
  router.get('/coding/projects/:id/preview/logs', async (req, res) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: 'project id is required' }); return; }
    try {
      const project = await loadOwnedCodingProject(db, req as AuthedRequest, params.data.id, res);
      if (!project) return;
      const result = await service.getPreviewLogs(db, params.data.id);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
