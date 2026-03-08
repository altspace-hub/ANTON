import { Router } from 'express';
import type Database from 'better-sqlite3';
import { createProjectWorkspace, deleteProjectWorkspace } from '../services/workspace.js';

export function createProjectRoutes(db: Database.Database) {
  const router = Router();
  const IS_TEAM_MODE = process.env.DEPLOYMENT_MODE === 'team';

  function getUserId(req: unknown): string {
    return (req as { user?: { id?: string; role?: string } }).user?.id ?? 'solo';
  }

  function getUserRole(req: unknown): string {
    return (req as { user?: { role?: string } }).user?.role ?? 'admin';
  }

  // GET /api/projects
  router.get('/projects', (req, res) => {
    try {
      const userId = getUserId(req);
      const userRole = getUserRole(req);

      let projects;
      if (IS_TEAM_MODE && userRole !== 'admin') {
        // In team mode, non-admins only see projects they're a member of
        projects = db.prepare(
          `SELECT p.*, COUNT(s.id) as session_count
           FROM projects p
           LEFT JOIN sessions s ON s.project_id = p.id
           INNER JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
           WHERE p.status != 'deleted'
           GROUP BY p.id
           ORDER BY p.updated_at DESC`
        ).all(userId);
      } else {
        projects = db.prepare(
          `SELECT p.*, COUNT(s.id) as session_count
           FROM projects p
           LEFT JOIN sessions s ON s.project_id = p.id
           WHERE p.status != 'deleted'
           GROUP BY p.id
           ORDER BY p.updated_at DESC`
        ).all();
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
      console.log('[projects] Creating project:', req.body);
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

      // Insert into database with workspace_path
      db.prepare(
        'INSERT INTO projects (id, name, description, template_id, workspace_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(id, name.trim(), description || null, template_id || null, workspace.root, now, now);

      // Auto-add creator as project owner
      const creatorId = getUserId(req);
      try {
        db.prepare(
          'INSERT INTO project_members (id, project_id, user_id, role, added_by) VALUES (?, ?, ?, ?, ?)'
        ).run(crypto.randomUUID(), id, creatorId, 'owner', creatorId);
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
  router.get('/projects/:id', (req, res) => {
    try {
      const userId = getUserId(req);
      const userRole = getUserRole(req);
      // In team mode, non-admins can only fetch projects they are a member of
      const project = (IS_TEAM_MODE && userRole !== 'admin')
        ? db.prepare('SELECT p.* FROM projects p INNER JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ? WHERE p.id = ?').get(userId, req.params.id)
        : db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
      if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
      // D3: Return sessions from ALL areas (no area filter), include module_id as areaId
      const sessions = db.prepare(
        'SELECT id, module_id, title, summary, config, created_at, updated_at, project_id FROM sessions WHERE project_id = ? ORDER BY updated_at DESC'
      ).all(req.params.id);
      res.json({ ...project as object, sessions });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  });

  // GET /api/projects/:id/stats
  router.get('/projects/:id/stats', (req, res) => {
    const { id } = req.params;
    const userId = getUserId(req);
    const userRole = getUserRole(req);
    // Verify project access
    const hasAccess = (IS_TEAM_MODE && userRole !== 'admin')
      ? db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(id, userId)
      : db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id);
    if (!hasAccess) { res.status(404).json({ error: 'Project not found' }); return; }
    try {
      const totals = db.prepare(`
        SELECT
          COUNT(DISTINCT s.id) as session_count,
          COALESCE(SUM(a.input_token_count),0) as total_input_tokens,
          COALESCE(SUM(a.output_token_count),0) as total_output_tokens,
          COALESCE(SUM(a.estimated_cost_usd),0) as total_cost,
          COALESCE(AVG(qs.score_overall),0) as avg_quality
        FROM sessions s
        LEFT JOIN audit_log a ON a.session_id = s.id
        LEFT JOIN quality_scores qs ON qs.session_id = s.id
        WHERE s.project_id = ?
      `).get(id) as {
        session_count: number;
        total_input_tokens: number;
        total_output_tokens: number;
        total_cost: number;
        avg_quality: number;
      };

      const byModule = db.prepare(`
        SELECT module_id, COUNT(*) as count
        FROM sessions WHERE project_id = ?
        GROUP BY module_id ORDER BY count DESC LIMIT 8
      `).all(id) as Array<{ module_id: string; count: number }>;

      const recentActivity = db.prepare(`
        SELECT a.created_at, a.module_id, a.model, a.estimated_cost_usd
        FROM audit_log a JOIN sessions s ON s.id = a.session_id
        WHERE s.project_id = ? ORDER BY a.created_at DESC LIMIT 10
      `).all(id) as Array<{ created_at: string; module_id: string; model: string; estimated_cost_usd: number }>;

      res.json({ totals, byModule, recentActivity });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ error: msg });
    }
  });

  // PATCH /api/projects/:id
  router.patch('/projects/:id', (req, res) => {
    try {
      const { name, description, status } = req.body as { name?: string; description?: string; status?: string };
      const now = new Date().toISOString();
      if (name !== undefined) {
        db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?').run(name.trim(), now, req.params.id);
      }
      if (description !== undefined) {
        db.prepare('UPDATE projects SET description = ?, updated_at = ? WHERE id = ?').run(description, now, req.params.id);
      }
      if (status !== undefined) {
        db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run(status, now, req.params.id);
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  // DELETE /api/projects/:id
  router.delete('/projects/:id', async (req, res) => {
    try {
      console.log('[projects] Deleting project:', req.params.id);

      // Delete workspace folder
      await deleteProjectWorkspace(req.params.id);

      // Unlink sessions before deleting
      db.prepare('UPDATE sessions SET project_id = NULL WHERE project_id = ?').run(req.params.id);
      db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);

      console.log('[projects] ✅ Project deleted successfully:', req.params.id);
      res.json({ ok: true });
    } catch (error) {
      console.error('[projects] ❌ Project deletion failed:', error);
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  // PATCH /api/sessions/:id/project — assign session to project
  router.patch('/sessions/:id/project', (req, res) => {
    try {
      const { projectId } = req.body as { projectId: string | null };
      db.prepare('UPDATE sessions SET project_id = ?, updated_at = ? WHERE id = ?')
        .run(projectId || null, new Date().toISOString(), req.params.id);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to assign project' });
    }
  });

  return router;
}
