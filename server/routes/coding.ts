import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { createCodingIntegration } from '../services/coding-integration.js';
import {
  bundleCodingReviewProfile,
  bundleScriptLiteTemplate,
  bundleScriptMediumTemplate,
  bundleCodingLargeBlueprint,
} from '../services/anton-bundler.js';

export async function createCodingRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();

  // GET /api/coding/overview — Dashboard stats for Coding area
  router.get('/coding/overview', async (req, res) => {
    try {
      const projects = await db.get(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN status NOT IN ('completed','archived','paused') THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM coding_projects
      `) as { total: number; active: number; completed: number } | undefined;

      const reviews = await db.get(`
        SELECT COUNT(*) as total FROM code_review_sessions
      `) as { total: number } | undefined;

      const recentProjects = await db.all(`
        SELECT cp.*, p.name as parent_project_name
        FROM coding_projects cp
        LEFT JOIN projects p ON cp.project_id = p.id
        ORDER BY cp.updated_at DESC
        LIMIT 5
      `);

      const recentReviews = await db.all(`
        SELECT * FROM code_review_sessions
        ORDER BY created_at DESC
        LIMIT 5
      `);

      res.json({
        stats: {
          projects: projects || { total: 0, active: 0, completed: 0 },
          reviews: reviews?.total || 0,
        },
        recentProjects,
        recentReviews,
      });
    } catch (error) {
      console.error('[coding] Overview error:', error);
      res.status(500).json({ error: 'Failed to load coding overview' });
    }
  });

  // GET /api/coding/activity — Recent activity across all coding features
  router.get('/coding/activity', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;

      const activity = await db.all(`
        SELECT 'project' as type, id, name as title, status, updated_at as timestamp
        FROM coding_projects
        UNION ALL
        SELECT 'review' as type, id, source_path as title, 'completed' as status, created_at as timestamp
        FROM code_review_sessions
        UNION ALL
        SELECT 'task' as type, id, title, status, updated_at as timestamp
        FROM coding_tasks
        ORDER BY timestamp DESC
        LIMIT ?
      `, limit);

      res.json(activity);
    } catch (error) {
      console.error('[coding] Activity error:', error);
      res.status(500).json({ error: 'Failed to load activity' });
    }
  });

  // ── Integration Endpoints ────────────────────────────────────────────────

  // POST /api/coding/export/:type/:id — Export as .anton bundle
  router.post('/coding/export/:type/:id', async (req, res) => {
    try {
      const { type, id } = req.params;
      let buffer: Buffer;
      let filename: string;

      switch (type) {
        case 'review-profile':
          buffer = await bundleCodingReviewProfile(db, id);
          filename = `review-profile-${id.slice(0, 8)}.anton`;
          break;
        case 'script-lite':
          buffer = await bundleScriptLiteTemplate(db, id);
          filename = `script-lite-${id.slice(0, 8)}.anton`;
          break;
        case 'script-medium':
          buffer = await bundleScriptMediumTemplate(db, id);
          filename = `script-medium-${id.slice(0, 8)}.anton`;
          break;
        case 'blueprint':
          buffer = await bundleCodingLargeBlueprint(db, id);
          filename = `blueprint-${id.slice(0, 8)}.anton`;
          break;
        default:
          return res.status(400).json({ error: `Unknown export type: ${type}. Valid types: review-profile, script-lite, script-medium, blueprint` });
      }

      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      });
      res.send(buffer);
    } catch (error: any) {
      console.error('[coding] Export error:', error);
      res.status(500).json({ error: error.message || 'Failed to export bundle' });
    }
  });

  // POST /api/coding/score — Score an output
  router.post('/coding/score', async (req, res) => {
    try {
      const { content, moduleId, areaId, sessionId } = req.body;

      if (!content || !moduleId) {
        return res.status(400).json({ error: 'content and moduleId are required' });
      }

      const integration = await createCodingIntegration(db);
      const result = await integration.scoreOutput(content, moduleId, areaId || 'coding', sessionId);

      if (!result) {
        return res.status(500).json({ error: 'Scoring failed' });
      }

      res.json({ score: result.score, id: result.id, regressionWarning: result.regressionWarning });
    } catch (error) {
      console.error('[coding] Score error:', error);
      res.status(500).json({ error: 'Failed to score output' });
    }
  });

  // GET /api/coding/versions/:entityType/:entityId — Get version history
  router.get('/coding/versions/:entityType/:entityId', async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;

      // Validate entity type
      const allowedTypes = [
        'code-review', 'coding-discovery', 'coding-architecture',
        'coding-task', 'script-lite', 'script-medium', 'coding-baseline',
      ];
      if (!allowedTypes.includes(entityType)) {
        return res.status(400).json({
          error: `Invalid entity type: ${entityType}. Allowed: ${allowedTypes.join(', ')}`,
        });
      }

      const integration = await createCodingIntegration(db);
      const versions = integration.getVersionHistory(entityType, entityId, limit);

      res.json(versions);
    } catch (error) {
      console.error('[coding] Version history error:', error);
      res.status(500).json({ error: 'Failed to get version history' });
    }
  });

  // POST /api/coding/versions/:entityType/:entityId/diff — Compare versions
  router.post('/coding/versions/:entityType/:entityId/diff', async (req, res) => {
    try {
      const { entityType, entityId } = req.params;
      const { v1, v2 } = req.body;

      if (v1 === undefined || v2 === undefined) {
        return res.status(400).json({ error: 'v1 and v2 version numbers are required' });
      }

      const integration = await createCodingIntegration(db);
      const result = integration.diffVersions(entityType, entityId, Number(v1), Number(v2));

      if (!result) {
        return res.status(404).json({ error: 'One or both versions not found' });
      }

      res.json(result);
    } catch (error) {
      console.error('[coding] Version diff error:', error);
      res.status(500).json({ error: 'Failed to diff versions' });
    }
  });

  return router;
}
