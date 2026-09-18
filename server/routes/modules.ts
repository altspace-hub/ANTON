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
import { listServerPersonaIds, resolvePersonaInstruction } from '../services/prompt-builder.js';
import { EXPERT_ROLES } from '../../src/lib/expert-roles.js';
import { getAllSkills } from '../services/skills-manager.js';

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

/**
 * Personas. Until Wave 8 these two endpoints were served by personas-manager.ts,
 * a registry the prompt composer did not read — so the list a caller got here and
 * the text a run actually injected were two different things. They now answer from
 * the same source the composer resolves, which is the only way the endpoint can be
 * trusted to describe what a run will do.
 */
const personaMeta = new Map(EXPERT_ROLES.map((r) => [r.id, r]));

function personaSummary(id: string): { id: string; label: string; description: string; category?: string } {
  const meta = personaMeta.get(id);
  return {
    id,
    label: meta?.label ?? id,
    description: meta?.description ?? '',
    ...(meta?.category ? { category: meta.category } : {}),
  };
}

router.get('/personas', (_req, res) => {
  try {
    const ids = [...new Set([...listServerPersonaIds(), ...personaMeta.keys()])].sort();
    res.json(ids.map(personaSummary));
  } catch {
    res.status(500).json({ error: 'Failed to load personas' });
  }
});

router.get('/personas/:id', (req, res) => {
  try {
    const prompt = resolvePersonaInstruction(req.params.id);
    if (!prompt) {
      res.status(404).json({ error: 'Persona not found' });
      return;
    }
    res.json({ ...personaSummary(req.params.id), prompt });
  } catch {
    res.status(500).json({ error: 'Failed to load persona' });
  }
});

// ── All skills (built-in + disk) ──────────────────────────────
// Same list and shape as GET /api/skills (routes/skills.ts): the disk packs are
// preloaded at boot into the synchronous index, so no async load here.

router.get('/skills/all', async (_req, res) => {
  try {
    const safe = getAllSkills().map(({ prompt: _p, ...rest }) => rest);
    res.json(safe);
  } catch {
    res.status(500).json({ error: 'Failed to load skills' });
  }
});

export default router;
