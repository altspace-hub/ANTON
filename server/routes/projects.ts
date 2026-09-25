import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import type { DatabaseAdapter } from '../db/database.js';

import { createProjectWorkspace, deleteProjectWorkspace } from '../services/workspace.js';
import { safeError } from '../lib/error-response.js';
import { resolveProjectAccess } from '../services/project-context.js';
import { scopesToOwner, assertOwned } from '../middleware/ownership.js';

export async function createProjectRoutes(db: DatabaseAdapter) {
  const router = Router();
  const IS_TEAM_MODE = process.env.DEPLOYMENT_MODE === 'team';

  function getUserId(req: unknown): string {
    return (req as { user?: { id?: string; role?: string } }).user?.id ?? 'solo';
  }

  function getUserRole(req: unknown): string {
    return (req as { user?: { role?: string } }).user?.role ?? 'admin';
  }

  /** The caller's role in the project ('owner' | 'admin' | 'member' | 'viewer'), or null. */
  async function projectRoleOf(projectId: string, userId: string): Promise<string | null> {
    const row = await db.get<{ role: string }>(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', projectId, userId,
    );
    return row?.role ?? null;
  }

  // ── Team-mode membership gate ──────────────────────────────────────────────
  // H7 (team-server readiness, 2026-09-23): PATCH and DELETE /projects/:id acted
  // on any project id for any caller — a rename, a soft delete through `status`,
  // or the project removed together with its folder on disk. Every /projects/:id
  // route now needs membership first, as project-files.ts does. A project the
  // caller is not in answers 404, exactly like one that does not exist: a 403
  // would confirm the id (see ownership.ts). Solo mode and admins pass.
  // (The session route below names its parameter :sessionId so this gate never
  // mistakes a session id for a project id.)
  router.param('id', async (req: Request, res: Response, next: NextFunction, id: string) => {
    try {
      if (!scopesToOwner(req)) return next();
      if (!(await projectRoleOf(String(id), getUserId(req)))) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  // GET /api/projects
  router.get('/projects', async (req, res) => {
    try {
      const userId = getUserId(req);
      const userRole = getUserRole(req);

      let projects;
      if (IS_TEAM_MODE && userRole !== 'admin') {
        // In team mode, non-admins only see projects they're a member of
        projects = await db.all(
          `SELECT p.*, COUNT(s.id) as session_count,
                  EXISTS (SELECT 1 FROM coding_projects cp WHERE cp.project_id = p.id) AS is_coding
           FROM projects p
           LEFT JOIN sessions s ON s.project_id = p.id
           INNER JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
           WHERE p.status != 'deleted'
           GROUP BY p.id
           ORDER BY p.updated_at DESC`
        , userId);
      } else {
        projects = await db.all(
          `SELECT p.*, COUNT(s.id) as session_count,
                  EXISTS (SELECT 1 FROM coding_projects cp WHERE cp.project_id = p.id) AS is_coding
           FROM projects p
           LEFT JOIN sessions s ON s.project_id = p.id
           WHERE p.status != 'deleted'
           GROUP BY p.id
           ORDER BY p.updated_at DESC`
        );
      }
      res.json(projects);
    } catch (error) {
      console.error('[projects] Failed to fetch projects:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  // POST /api/projects
  router.post('/projects', async (req, res) => {
    try {
      // No request body in the log: a project name or description is client data,
      // and on a shared server the log is read by people who are not in the project.
      console.log('[projects] Creating project');
      const { name, description, template_id } = req.body as { name: string; description?: string; template_id?: string };

      if (!name?.trim()) {
        console.log('[projects] Validation failed: name is required');
        res.status(400).json({ error: 'name is required' });
        return;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      // Create workspace folders
      console.log('[projects] Creating workspace for project:', id);
      const workspace = await createProjectWorkspace(id);

      // Insert into database with workspace_path. user_id records the creator —
      // it was left at the column default 'default', although resolveProjectAccess
      // and the coding routes read projects.user_id as the owner.
      const creatorId = getUserId(req);
      await db.run(
        'INSERT INTO projects (id, name, description, template_id, workspace_path, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      , id, name.trim(), description || null, template_id || null, workspace.root, creatorId, now, now);

      // Auto-add creator as project owner
      try {
        await db.run(
          'INSERT INTO project_members (id, project_id, user_id, role, added_by) VALUES (?, ?, ?, ?, ?)'
        , crypto.randomUUID(), id, creatorId, 'owner', creatorId);
      } catch {
        // Ignore if user table FK fails in solo mode
      }

      console.log('[projects] ✅ Project created successfully:', id);
      res.json({
        id,
        name: name.trim(),
        description: description || null,
        status: 'active',
        session_count: 0,
        workspace_path: workspace.root,
        created_at: now,
        updated_at: now
      });
    } catch (error) {
      console.error('[projects] ❌ Project creation failed:', error);
      res.status(500).json({ error: 'Failed to create project' });
    }
  });

  // GET /api/projects/:id
  router.get('/projects/:id', async (req, res) => {
    try {
      const userId = getUserId(req);
      const userRole = getUserRole(req);
      // In team mode, non-admins can only fetch projects they are a member of
      const project = (IS_TEAM_MODE && userRole !== 'admin')
        ? await db.get('SELECT p.* FROM projects p INNER JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ? WHERE p.id = ?', userId, req.params.id)
        : await db.get('SELECT * FROM projects WHERE id = ?', req.params.id);
      if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
      // D3: Return sessions from ALL areas (no area filter), include module_id as areaId
      const sessions = await db.all(
        'SELECT id, module_id, title, summary, config, created_at, updated_at, project_id FROM sessions WHERE project_id = ? ORDER BY updated_at DESC'
      , req.params.id);
      res.json({ ...project as object, sessions });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  });

  // GET /api/projects/:id/stats
  router.get('/projects/:id/stats', async (req, res) => {
    const { id } = req.params;
    const userId = getUserId(req);
    const userRole = getUserRole(req);
    // Verify project access
    const hasAccess = (IS_TEAM_MODE && userRole !== 'admin')
      ? await db.get('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?', id, userId)
      : await db.get('SELECT 1 FROM projects WHERE id = ?', id);
    if (!hasAccess) { res.status(404).json({ error: 'Project not found' }); return; }
    try {
      const totals = await db.get(`
        SELECT
          COUNT(DISTINCT s.id) as session_count,
          COALESCE(SUM(a.input_token_count),0) as total_input_tokens,
          COALESCE(SUM(a.output_token_count),0) as total_output_tokens,
          COALESCE(SUM(a.estimated_cost_usd),0) as total_cost,
          COALESCE(AVG(qs.score_overall),0) as avg_quality
        FROM sessions s
        LEFT JOIN audit_log a ON a.session_id = s.id
        LEFT JOIN quality_scores qs ON qs.session_id = s.id AND qs.origin = 'run'
        WHERE s.project_id = ?
      `, id) as {
        session_count: number;
        total_input_tokens: number;
        total_output_tokens: number;
        total_cost: number;
        avg_quality: number;
      };

      const byModule = await db.all(`
        SELECT s.module_id, COUNT(*) as count
        FROM sessions s WHERE s.project_id = ? GROUP BY s.module_id ORDER BY count DESC
      `, id) as Array<{ module_id: string; count: number }>;

      const recentActivity = await db.all(`
        SELECT a.created_at, a.module_id, a.model, a.estimated_cost_usd
        FROM audit_log a JOIN sessions s ON s.id = a.session_id
        WHERE s.project_id = ? ORDER BY a.created_at DESC LIMIT 10
      `, id) as Array<{ created_at: string; module_id: string; model: string; estimated_cost_usd: number }>;

      res.json({ totals, byModule, recentActivity });
    } catch (error) {
      const msg = safeError(error);
      res.status(500).json({ error: msg });
    }
  });

  // PATCH /api/projects/:id — membership is already checked by the gate above.
  router.patch('/projects/:id', async (req, res) => {
    try {
      const body = req.body as { name?: unknown; description?: string; status?: string };
      const { description, status } = body;
      // A non-string name used to reach name.trim() and 500.
      if (body.name !== undefined && typeof body.name !== 'string') {
        res.status(400).json({ error: 'name must be a string' });
        return;
      }
      const name = body.name as string | undefined;
      if (scopesToOwner(req)) {
        const role = await projectRoleOf(String(req.params.id), getUserId(req));
        // A viewer reads the project; a rename changes it for every member.
        if (role === 'viewer') {
          res.status(403).json({ error: 'Viewers cannot edit this project' });
          return;
        }
        // `status` is how a project is archived or soft-deleted ('deleted' drops it
        // from every member's list), so it is the owner's decision, like DELETE.
        if (status !== undefined && role !== 'owner') {
          res.status(403).json({ error: 'Only the project owner can change its status' });
          return;
        }
      }
      const now = new Date().toISOString();
      if (name !== undefined) {
        await db.run('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?', name.trim(), now, req.params.id);
      }
      if (description !== undefined) {
        await db.run('UPDATE projects SET description = ?, updated_at = ? WHERE id = ?', description, now, req.params.id);
      }
      if (status !== undefined) {
        await db.run('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?', status, now, req.params.id);
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  // DELETE /api/projects/:id — the owner's call; membership is checked by the gate above.
  router.delete('/projects/:id', async (req, res) => {
    try {
      const projectId = String(req.params.id);
      // Read the row first, in every mode. The id becomes a directory name below and
      // Express decodes the path segment, so DELETE /projects/%2E%2E handed '..' to
      // deleteProjectWorkspace — which removes <workspaces>/.. recursively. Only the
      // id of a real project (always server-generated) reaches the disk now.
      const project = await db.get<{ id: string }>('SELECT id FROM projects WHERE id = ?', projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (scopesToOwner(req) && (await projectRoleOf(projectId, getUserId(req))) !== 'owner') {
        res.status(403).json({ error: 'Only the project owner can delete this project' });
        return;
      }

      console.log('[projects] Deleting project:', projectId);

      // Delete workspace folder — belt and braces: never for an id that is not a
      // plain directory name, even though every insert path generates the id.
      if (projectId === path.basename(projectId) && projectId !== '.' && projectId !== '..') {
        await deleteProjectWorkspace(projectId);
      }

      // Unlink sessions before deleting
      await db.run('UPDATE sessions SET project_id = NULL WHERE project_id = ?', projectId);
      await db.run('DELETE FROM projects WHERE id = ?', projectId);

      console.log('[projects] ✅ Project deleted successfully:', projectId);
      res.json({ ok: true });
    } catch (error) {
      console.error('[projects] ❌ Project deletion failed:', error);
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  // PATCH /api/sessions/:id/project — assign session to project.
  // Wave 4 (2026-09-17): the same gate as session creation. This route
  // accepted any project id for any session — no existence check, no
  // membership check, no session ownership — so a team-mode caller could
  // pull a stranger's session into a project they were not part of.
  // :sessionId, not :id — the router.param('id') gate above is for project ids.
  router.patch('/sessions/:sessionId/project', async (req, res) => {
    try {
      const raw = (req.body as { projectId?: unknown }).projectId;
      if (raw !== null && raw !== undefined && typeof raw !== 'string') {
        return res.status(400).json({ error: 'projectId must be a string or null' });
      }
      const projectId = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
      const userId = getUserId(req);
      const userRole = getUserRole(req);
      const sessionId = String(req.params.sessionId);
      // Ownership in SQL, 404 for "not yours" exactly as for "missing" — the 403s
      // here confirmed that a session or project id existed. An unowned (legacy,
      // user_id NULL) session is admin-only in team mode, as ownership.ts says;
      // any member could claim one into their project before.
      if (!(await assertOwned(db, req, res, { table: 'sessions', ownerColumn: 'user_id', id: sessionId, notFoundMessage: 'Session not found' }))) return;
      if (projectId) {
        const access = await resolveProjectAccess(db, { projectId, userId, userRole, teamMode: IS_TEAM_MODE });
        if (access !== 'ok') return res.status(404).json({ error: 'Project not found' });
      }
      await db.run('UPDATE sessions SET project_id = ?, updated_at = ? WHERE id = ?', projectId, new Date().toISOString(), sessionId);
      res.json({ ok: true, projectId });
    } catch (error) {
      res.status(500).json({ error: safeError(error) });
    }
  });

  return router;
}
