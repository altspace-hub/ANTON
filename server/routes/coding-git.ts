// ── ANTON Studio — REAL GIT routes (Studio P6) ─────────────────────────────
//
//   GET  /api/coding/projects/:id/git/status    branch + dirty count + recent commits
//   GET  /api/coding/projects/:id/git/commits    the last N commits (?limit=)
//   POST /api/coding/projects/:id/git/init       initialize the repo (idempotent)
//
// Ownership mirrors coding-studio.ts EXACTLY: a coding_project belongs to a
// `projects` row; admins see everything, everyone else only their own. The git
// service is INJECTABLE so tests run with no real git/exec/FS. safeError() on
// every catch (no stack traces / paths leaked to the client).

import { Router } from 'express';
import { z } from 'zod';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import {
  ensureRepo,
  gitStatus,
  listCommits,
  type EnsureRepoResult,
  type GitStatusSummary,
  type GitCommitSummary,
} from '../services/coding-git.js';
import { validateWorkspacePath } from '../services/coding-workspace.js';

interface AuthedRequest {
  user?: { id: string; role?: string };
}

interface ProjectAccessRow {
  id: string;
  name: string | null;
  owner_user_id: string | null;
  directory_path: string | null;
}

/**
 * The injectable git service surface (default = coding-git.ts). Each takes the
 * already-resolved workspace dir + db + project id. Tests stub these.
 */
export interface CodingGitService {
  ensureRepo: (workspaceAbs: string, db: DatabaseAdapter, codingProjectId: string) => Promise<EnsureRepoResult>;
  gitStatus: (workspaceAbs: string) => Promise<GitStatusSummary>;
  listCommits: (workspaceAbs: string, limit: number) => Promise<GitCommitSummary[]>;
}

export interface CodingGitRouteDeps {
  service?: CodingGitService;
}

const defaultService: CodingGitService = {
  ensureRepo: (ws, db, pid) => ensureRepo(ws, undefined, db, pid),
  gitStatus: (ws) => gitStatus(ws),
  listCommits: (ws, limit) => listCommits(ws, limit),
};

/**
 * Load the owned coding project AND resolve its bound workspace dir. Replies
 * with the correct error and returns null when access is denied / no workspace.
 * 404 (not 403) on a foreign project — same as coding-studio.ts (no leak that
 * the id exists).
 */
async function loadOwnedProjectWorkspace(
  db: DatabaseAdapter,
  req: AuthedRequest,
  projectId: string,
  res: import('express').Response,
): Promise<{ project: ProjectAccessRow; workspaceAbs: string } | null> {
  const userId = req.user?.id;
  const userRole = req.user?.role;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return null; }
  const row = await db.get<ProjectAccessRow>(
    `SELECT cp.id AS id, cp.name AS name, p.user_id AS owner_user_id, cp.directory_path AS directory_path
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
  const v = await validateWorkspacePath(row.directory_path);
  if (!v.ok || !v.resolved) {
    res.status(400).json({ error: v.error ?? 'No workspace bound to this project — provision/bind one first.' });
    return null;
  }
  return { project: row, workspaceAbs: v.resolved };
}

export function createCodingGitRoutes(db: DatabaseAdapter, deps: CodingGitRouteDeps = {}): Router {
  const router = Router();
  const service = deps.service ?? defaultService;

  // ── GET /coding/projects/:id/git/status ───────────────────────────────────
  router.get('/coding/projects/:id/git/status', async (req, res) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: 'project id is required' }); return; }
    try {
      const ctx = await loadOwnedProjectWorkspace(db, req as AuthedRequest, params.data.id, res);
      if (!ctx) return;
      const status = await service.gitStatus(ctx.workspaceAbs);
      res.json({ success: true, status });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /coding/projects/:id/git/commits ──────────────────────────────────
  router.get('/coding/projects/:id/git/commits', async (req, res) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: 'project id is required' }); return; }
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).optional() }).safeParse(req.query);
    const limit = query.success && query.data.limit ? query.data.limit : 20;
    try {
      const ctx = await loadOwnedProjectWorkspace(db, req as AuthedRequest, params.data.id, res);
      if (!ctx) return;
      const commits = await service.listCommits(ctx.workspaceAbs, limit);
      res.json({ success: true, commits });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /coding/projects/:id/git/init ────────────────────────────────────
  router.post('/coding/projects/:id/git/init', async (req, res) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: 'project id is required' }); return; }
    try {
      const ctx = await loadOwnedProjectWorkspace(db, req as AuthedRequest, params.data.id, res);
      if (!ctx) return;
      const result = await service.ensureRepo(ctx.workspaceAbs, db, params.data.id);
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
