/**
 * user-module-defaults.ts — per-user, per-module defaults (Wave 6 track H).
 *
 *   GET  /user-module-defaults/:moduleId        → { defaults, prefill, jurisdictionSkill }
 *   POST /user-module-defaults/:moduleId/used   ← { outputFormats, thinking, creativity, guidedInputs }
 *
 * `defaults` is what the caller ran this module with last time (null before
 * the first run); `prefill` is what the profile / org context already answer
 * for the module's guided fields, keyed by field id; `jurisdictionSkill` is
 * the jurisdiction pack the profile's jurisdiction maps to, or null.
 *
 * user_profiles and org_context are single-row tables (id = 'default'); the
 * defaults row is keyed by the authenticated user, so team-mode users each
 * keep their own.
 */
import { Router, type Request, type Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { requireAuth } from '../middleware/role-guards.js';
import { safeError } from '../lib/error-response.js';
import { getModule } from '../services/module-loader.js';
import { findJurisdictionSkill, isDiskSkillsPreloaded, preloadDiskSkills } from '../services/skills-manager.js';
import {
  getModuleDefaults,
  recordModuleUse,
  suggestGuidedPrefill,
  type PrefillProfile,
  type PrefillOrgContext,
} from '../services/user-module-defaults.js';

const MODULE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,120}$/i;

function moduleIdOf(req: Request): string | null {
  const raw = req.params.moduleId;
  return typeof raw === 'string' && MODULE_ID_RE.test(raw) ? raw : null;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const t = (v ?? '').trim();
    if (t) return t;
  }
  return '';
}

export function createUserModuleDefaultsRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  router.get('/user-module-defaults/:moduleId', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }
      const moduleId = moduleIdOf(req);
      if (!moduleId) { res.status(400).json({ error: 'Invalid module id' }); return; }

      const [defaults, profile, orgContext, mod] = await Promise.all([
        getModuleDefaults(db, userId, moduleId),
        db.get<PrefillProfile>('SELECT jurisdiction, output_language, organisation, company FROM user_profiles WHERE id = ?', 'default'),
        db.get<PrefillOrgContext>('SELECT jurisdiction, org_name, preferred_language FROM org_context WHERE id = ?', 'default'),
        getModule(moduleId),
      ]);

      const prefill = suggestGuidedPrefill(profile, orgContext, mod?.guidedInputs ?? []);

      const jurisdiction = firstNonEmpty(profile?.jurisdiction, orgContext?.jurisdiction);
      if (jurisdiction && !isDiskSkillsPreloaded()) await preloadDiskSkills();
      const jurisdictionSkill = jurisdiction ? findJurisdictionSkill(jurisdiction) : null;

      res.json({ defaults, prefill, jurisdictionSkill });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/user-module-defaults/:moduleId/used', requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }
      const moduleId = moduleIdOf(req);
      if (!moduleId) { res.status(400).json({ error: 'Invalid module id' }); return; }

      const body = (req.body ?? {}) as Record<string, unknown>;
      if (typeof body !== 'object' || Array.isArray(body)) { res.status(400).json({ error: 'Invalid body' }); return; }

      const mod = await getModule(moduleId);
      await recordModuleUse(db, {
        userId,
        moduleId,
        outputFormats: body.outputFormats,
        thinking: body.thinking,
        creativity: body.creativity,
        guidedInputs: body.guidedInputs,
        guidedFields: mod?.guidedInputs,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
