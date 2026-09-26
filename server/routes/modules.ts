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
 *
 * In demo mode a visitor (a non-admin) does not see the modules kept off the
 * demo (DEMO_HIDDEN_AREAS / DEMO_HIDDEN_MODULES): the listings leave them out
 * and each single read answers 404, as for a module that does not exist.
 */

import { Router, type Request } from 'express';
import { getAreas, getArea, getModule, getAllModules, getModuleSystemPrompt } from '../services/module-loader.js';
import { isDemoMode, demoModuleHidden } from '../middleware/demo-mode.js';
import { listServerPersonaIds, resolvePersonaInstruction } from '../services/prompt-builder.js';
import { EXPERT_ROLES } from '../../src/lib/expert-roles.js';
import { getAllSkills } from '../services/skills-manager.js';

const router = Router();

/**
 * Demo mode: whether this caller is kept from the hidden modules. They invite
 * health, employment, credit or criminal-offence data, which the demo must not
 * receive (privacy review H3); the run route refuses them too (claude.ts).
 * Admins, and every caller outside demo mode, see all of them.
 */
function hidesDemoModules(req: Request): boolean {
  return isDemoMode() && req.user?.role !== 'admin';
}

/** Whether the caller must not see this module, or this area (moduleId ''). */
function hiddenFor(req: Request, moduleId: string, areaId: string | null | undefined): boolean {
  return hidesDemoModules(req) && demoModuleHidden(moduleId, areaId);
}

// ── Areas ────────────────────────────────────────────────────

router.get('/areas', async (req, res) => {
  try {
    const areas = await getAreas();
    // Strip systemPrompt from the response (large field, not needed in listing)
    const safe = areas
      .filter((area) => !hiddenFor(req, '', area.id))
      .map((area) => ({
        ...area,
        modules: area.modules
          .filter((m) => !hiddenFor(req, m.id, m.areaId ?? area.id))
          .map(({ systemPrompt: _sp, ...m }) => m),
      }));
    res.json(safe);
  } catch {
    res.status(500).json({ error: 'Failed to load areas' });
  }
});

router.get('/areas/:areaId', async (req, res) => {
  try {
    const area = await getArea(req.params.areaId);
    if (!area || hiddenFor(req, '', area.id)) {
      res.status(404).json({ error: 'Area not found' });
      return;
    }
    const safe = {
      ...area,
      modules: area.modules
        .filter((m) => !hiddenFor(req, m.id, m.areaId ?? area.id))
        .map(({ systemPrompt: _sp, ...m }) => m),
    };
    res.json(safe);
  } catch {
    res.status(500).json({ error: 'Failed to load area' });
  }
});

router.get('/areas/:areaId/modules/:moduleId', async (req, res) => {
  try {
    const mod = await getModule(req.params.moduleId);
    if (!mod || mod.areaId !== req.params.areaId || hiddenFor(req, mod.id, mod.areaId)) {
      res.status(404).json({ error: 'Module not found' });
      return;
    }
    res.json(mod);
  } catch {
    res.status(500).json({ error: 'Failed to load module' });
  }
});

// ── Flat module endpoints (used by existing frontend code) ───

router.get('/modules', async (req, res) => {
  try {
    const modules = await getAllModules();
    const safe = modules
      .filter((m) => !hiddenFor(req, m.id, m.areaId))
      .map(({ systemPrompt: _sp, ...m }) => m);
    res.json(safe);
  } catch {
    res.status(500).json({ error: 'Failed to load modules' });
  }
});

router.get('/modules/:id', async (req, res) => {
  try {
    const mod = await getModule(req.params.id);
    if (!mod || hiddenFor(req, mod.id, mod.areaId)) {
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
    // A legacy prompt (server/prompts/<id>.md) has no area; its id still counts.
    const hidden = hidesDemoModules(req)
      && demoModuleHidden(req.params.id, (await getModule(req.params.id))?.areaId);
    const prompt = hidden ? null : await getModuleSystemPrompt(req.params.id);
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
