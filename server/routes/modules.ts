/**
 * modules.ts (routes)
 * Serves area and module configs loaded from disk by module-loader.
 *
 * GET /api/areas                        — list all areas with their modules
 * GET /api/areas/:areaId                — single area with full module list
 * GET /api/areas/:areaId/modules/:id    — single module config (includes systemPrompt)
 * GET /api/modules                      — flat list of all modules (legacy + sidebar)
 * GET /api/modules/:id                  — single module config
 * GET /api/modules/:id/prompt           — system prompt for a module (legacy)
 */

import { Router } from 'express';
import { getAreas, getArea, getModule, getAllModules, getModuleSystemPrompt } from '../services/module-loader.js';
import { getPersonas, getPersona } from '../services/personas-manager.js';
import { getAllSkillsAsync } from '../services/skills-manager.js';

const router = Router();

// ── Areas ────────────────────────────────────────────────────

router.get('/areas', async (_req, res) => {
  try {
    const areas = await getAreas();
    // Strip systemPrompt from the response (large field, not needed in listing)
    const safe = areas.map((area) => ({
      ...area,
      modules: area.modules.map(({ systemPrompt: _sp, ...m }) => m),
    }));
    res.json(safe);
  } catch {
    res.status(500).json({ error: 'Failed to load areas' });
  }
});

router.get('/areas/:areaId', async (req, res) => {
  try {
    const area = await getArea(req.params.areaId);
    if (!area) {
      res.status(404).json({ error: 'Area not found' });
      return;
    }
    const safe = {
      ...area,
      modules: area.modules.map(({ systemPrompt: _sp, ...m }) => m),
    };
    res.json(safe);
  } catch {
    res.status(500).json({ error: 'Failed to load area' });
  }
});

router.get('/areas/:areaId/modules/:moduleId', async (req, res) => {
  try {
    const mod = await getModule(req.params.moduleId);
    if (!mod || mod.areaId !== req.params.areaId) {
      res.status(404).json({ error: 'Module not found' });
      return;
    }
    res.json(mod);
  } catch {
    res.status(500).json({ error: 'Failed to load module' });
  }
});

// ── Flat module endpoints (used by existing frontend code) ───

router.get('/modules', async (_req, res) => {
  try {
    const modules = await getAllModules();
    const safe = modules.map(({ systemPrompt: _sp, ...m }) => m);
    res.json(safe);
  } catch {
    res.status(500).json({ error: 'Failed to load modules' });
  }
});

router.get('/modules/:id', async (req, res) => {
  try {
    const mod = await getModule(req.params.id);
    if (!mod) {
      res.status(404).json({ error: 'Module not found' });
      return;
    }
    res.json(mod);
  } catch {
    res.status(500).json({ error: 'Failed to load module' });
  }
});

// Legacy prompt endpoint — used by ModulePage.tsx
router.get('/modules/:id/prompt', async (req, res) => {
  try {
    const prompt = await getModuleSystemPrompt(req.params.id);
    if (!prompt) {
      res.status(404).json({ error: 'Prompt not found' });
      return;
    }
    res.json({ moduleId: req.params.id, prompt });
  } catch {
    res.status(500).json({ error: 'Failed to load prompt' });
  }
});

// ── Personas ──────────────────────────────────────────────────

router.get('/personas', async (_req, res) => {
  try {
    const personas = await getPersonas();
    // Strip prompt from listing response (large field, returned on single-fetch only)
    const safe = personas.map(({ prompt: _p, ...rest }) => rest);
    res.json(safe);
  } catch {
    res.status(500).json({ error: 'Failed to load personas' });
  }
});

router.get('/personas/:id', async (req, res) => {
  try {
    const persona = await getPersona(req.params.id);
    if (!persona) {
      res.status(404).json({ error: 'Persona not found' });
      return;
    }
    res.json(persona);
  } catch {
    res.status(500).json({ error: 'Failed to load persona' });
  }
});

// ── All skills (built-in + disk) ──────────────────────────────

router.get('/skills/all', async (_req, res) => {
  try {
    const skills = await getAllSkillsAsync();
    const safe = skills.map(({ prompt: _p, ...rest }) => rest);
    res.json(safe);
  } catch {
    res.status(500).json({ error: 'Failed to load skills' });
  }
});

export default router;
