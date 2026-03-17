import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth.js';

interface SkillPackRow {
  id: string;
  name: string;
  description: string | null;
  target_role: string | null;
  target_industry: string | null;
  modules: string;
  workflow_template: string | null;
  persona_configs: string | null;
  skills_attached: string | null;
  quality_baselines: string | null;
  getting_started: string | null;
  is_default: number;
  created_by: string;
  created_at: string;
}

function parsePackRow(row: SkillPackRow) {
  return {
    ...row,
    modules: typeof row.modules === 'string' ? JSON.parse(row.modules) : row.modules,
    workflow_template: row.workflow_template ? (() => { try { return JSON.parse(row.workflow_template!); } catch { return row.workflow_template; } })() : null,
    persona_configs: row.persona_configs ? (() => { try { return JSON.parse(row.persona_configs!); } catch { return row.persona_configs; } })() : null,
    skills_attached: row.skills_attached ? (() => { try { return JSON.parse(row.skills_attached!); } catch { return row.skills_attached; } })() : null,
    quality_baselines: row.quality_baselines ? (() => { try { return JSON.parse(row.quality_baselines!); } catch { return row.quality_baselines; } })() : null,
    is_default: row.is_default === 1,
  };
}

export async function createSkillPacksRoutes(db: DatabaseAdapter) {
  const router = Router();

  // GET /api/skill-packs — list all packs (default packs first, then custom)
  router.get('/skill-packs', requireAuth, async (_req, res) => {
    try {
      const rows = await db.all(
        'SELECT * FROM skill_packs ORDER BY is_default DESC, created_at ASC'
      ) as SkillPackRow[];
      res.json(rows.map(parsePackRow));
    } catch (error) {
      console.error('[skill-packs] GET /skill-packs error:', error);
      res.status(500).json({ error: 'Failed to fetch skill packs' });
    }
  });

  // GET /api/skill-packs/:id — get single pack
  router.get('/skill-packs/:id', requireAuth, async (req, res) => {
    try {
      const row = await db.get('SELECT * FROM skill_packs WHERE id = ?', req.params.id) as SkillPackRow | undefined;
      if (!row) {
        res.status(404).json({ error: 'Skill pack not found' });
        return;
      }
      res.json(parsePackRow(row));
    } catch (error) {
      console.error('[skill-packs] GET /skill-packs/:id error:', error);
      res.status(500).json({ error: 'Failed to fetch skill pack' });
    }
  });

  // POST /api/skill-packs — create a custom (non-default) pack
  router.post('/skill-packs', requireAuth, async (req, res) => {
    try {
      const {
        name,
        description,
        target_role,
        target_industry,
        modules,
        workflow_template,
        persona_configs,
        skills_attached,
        quality_baselines,
        getting_started,
      } = req.body as Partial<{
        name: string;
        description: string;
        target_role: string;
        target_industry: string;
        modules: string[] | string;
        workflow_template: unknown;
        persona_configs: unknown;
        skills_attached: unknown;
        quality_baselines: unknown;
        getting_started: string;
      }>;

      if (!name?.trim()) {
        res.status(400).json({ error: 'name is required' });
        return;
      }

      const id = `pack-custom-${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      const createdBy = (req as { user?: { username?: string } }).user?.username || 'user';

      const modulesJson = Array.isArray(modules)
        ? JSON.stringify(modules)
        : typeof modules === 'string'
          ? modules
          : '[]';

      await db.run(`
        INSERT INTO skill_packs (
          id, name, description, target_role, target_industry,
          modules, workflow_template, persona_configs, skills_attached,
          quality_baselines, getting_started, is_default, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `, 
        id,
        name.trim(),
        description?.trim() || null,
        target_role?.trim() || null,
        target_industry?.trim() || null,
        modulesJson,
        workflow_template ? JSON.stringify(workflow_template) : null,
        persona_configs ? JSON.stringify(persona_configs) : null,
        skills_attached ? JSON.stringify(skills_attached) : null,
        quality_baselines ? JSON.stringify(quality_baselines) : null,
        getting_started?.trim() || null,
        createdBy,
        now,
      );


      res.status(201).json(parsePackRow(created));
    } catch (error) {
      console.error('[skill-packs] POST /skill-packs error:', error);
      res.status(500).json({ error: 'Failed to create skill pack' });
    }
  });

  return router;
}
