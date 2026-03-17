import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import { getBuiltInSkills } from '../services/skills-manager.js';

export async function createSkillsRoutes(db: DatabaseAdapter) {
  const router = Router();

  // GET /api/skills — list all skills (built-in + custom from DB)
  router.get('/skills', async (_req, res) => {
    try {
      const builtIn = getBuiltInSkills();
      res.json(builtIn);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch skills' });
    }
  });

  // POST /api/skills/community — submit a community skill
  router.post('/skills/community', async (req, res) => {
    try {
      const { name, description, category, promptInstruction, tags } = req.body as {
        name: string;
        description: string;
        category: string;
        promptInstruction: string;
        tags?: string;
      };
      if (!name?.trim() || !description?.trim() || !category?.trim() || !promptInstruction?.trim()) {
        res.status(400).json({ error: 'name, description, category, and promptInstruction are required' });
        return;
      }
      const id = `community-${randomUUID().slice(0, 8)}`;
      const tagsArray = tags ? JSON.stringify(tags.split(',').map((t: string) => t.trim()).filter(Boolean)) : '[]';
      const now = new Date().toISOString();
      await db.run(
        `INSERT INTO community_skills (id, name, description, category, prompt_instruction, tags, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      , id, name.trim(), description.trim(), category.trim(), promptInstruction.trim(), tagsArray, now);
      const created = await db.get('SELECT * FROM community_skills WHERE id = ?', id) as Record<string, unknown>;
      res.status(201).json({
        ...created,
        tags: typeof created.tags === 'string' ? JSON.parse(created.tags as string) : created.tags,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to submit community skill' });
    }
  });

  // GET /api/skills/community — list all community skills
  // NOTE: Must be registered before /skills/:id to avoid "community" being matched as :id
  router.get('/skills/community', async (_req, res) => {
    try {

      res.json(skills.map((s) => ({
        ...s,
        tags: typeof s.tags === 'string' ? JSON.parse(s.tags as string) : s.tags,
      })));
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch community skills' });
    }
  });

  // GET /api/skills/:id — get skill with full prompt
  router.get('/skills/:id', async (req, res) => {
    try {
      const skills = getBuiltInSkills();
      const skill = skills.find((s) => s.id === req.params.id);
      if (!skill) { res.status(404).json({ error: 'Skill not found' }); return; }
      res.json(skill);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch skill' });
    }
  });

  return router;
}
