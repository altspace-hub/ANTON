/**
 * module-access.ts — per-role module access rules (Wave 6 track F, 2026-09-17).
 *
 *   GET    /module-access/rules          admin or solo   every rule
 *   POST   /module-access/rules          admin or solo   { role, moduleId?, areaId?, effect, note?, wildcard? }
 *   DELETE /module-access/rules/:id      admin or solo
 *   GET    /module-access/check          any user        ?moduleId=&areaId= → the caller's own verdict
 *   GET    /module-access/preview        admin or solo   how many modules analyst / viewer may run
 *
 * The verdict itself lives in services/module-access.ts; the chat route calls
 * `isModuleAllowed` directly. This router only adds validation, the guards,
 * and the catalogue lookups the page needs (an area for a module id the page
 * did not send; the module count for the preview).
 *
 * Logging: rule id and action only — never the note (it is free text).
 */

import { Router, type Request, type Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import { isTeamMode, requireAdminOrSolo, requireAuth } from '../middleware/role-guards.js';
import { getAllModules, getModule } from '../services/module-loader.js';
import {
  MODULE_ACCESS_RULE_ROLES,
  addModuleAccessRule,
  effectiveAccessForRole,
  isAccessEffect,
  isModuleAccessRuleRole,
  isModuleAllowed,
  listModuleAccessRules,
  removeModuleAccessRule,
} from '../services/module-access.js';

/** Optional string field: absent / null / blank → null; anything else must be a string. */
function optionalId(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > 200) throw new Error(`${field} is too long`);
  return trimmed;
}

/**
 * The area a module belongs to: the disk catalogue first, then custom_modules.
 * Exported for the chat route, which needs it so area-scoped rules can match.
 */
export async function resolveModuleAreaId(db: DatabaseAdapter, moduleId: string): Promise<string | null> {
  const builtIn = await getModule(moduleId);
  if (builtIn?.areaId) return builtIn.areaId;
  const custom = await db.get<{ area: string | null }>('SELECT area FROM custom_modules WHERE id = ?', moduleId);
  return custom?.area ?? null;
}

/** Built-in plus custom modules, the shape the preview evaluates. */
async function moduleCatalogue(db: DatabaseAdapter): Promise<Array<{ id: string; areaId: string | null }>> {
  const builtIn = (await getAllModules()).map((m) => ({ id: m.id, areaId: m.areaId ?? null }));
  const custom = await db.all<{ id: string; area: string | null }>('SELECT id, area FROM custom_modules');
  const seen = new Set(builtIn.map((m) => m.id));
  for (const row of custom) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    builtIn.push({ id: row.id, areaId: row.area ?? null });
  }
  return builtIn;
}

export function createModuleAccessRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  router.get('/module-access/rules', requireAdminOrSolo, async (_req: Request, res: Response) => {
    try {
      res.json({ rules: await listModuleAccessRules(db) });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/module-access/rules', requireAdminOrSolo, async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (body.role === 'admin') {
      res.status(400).json({ error: 'role: an admin is never restricted, so a rule for admin does nothing' });
      return;
    }
    if (!isModuleAccessRuleRole(body.role)) {
      res.status(400).json({ error: `role must be one of ${MODULE_ACCESS_RULE_ROLES.join(', ')}` });
      return;
    }
    if (!isAccessEffect(body.effect)) {
      res.status(400).json({ error: 'effect must be allow or deny' });
      return;
    }
    let moduleId: string | null;
    let areaId: string | null;
    try {
      moduleId = optionalId(body.moduleId, 'moduleId');
      areaId = optionalId(body.areaId, 'areaId');
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
      return;
    }
    if (moduleId === null && areaId === null && body.wildcard !== true) {
      res.status(400).json({ error: 'scope: give a moduleId or an areaId, or set wildcard: true for a rule that covers every module' });
      return;
    }
    if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') {
      res.status(400).json({ error: 'note must be a string' });
      return;
    }
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null;

    try {
      const rule = await addModuleAccessRule(db, {
        role: body.role, moduleId, areaId, effect: body.effect, note, createdBy: req.user?.id ?? null,
      });
      console.log(`[module-access] rule ${rule.id} added (${rule.role}, ${rule.effect}, ${moduleId ? 'module' : areaId ? 'area' : 'all'})`);
      res.status(201).json({ rule });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/module-access/rules/:id', requireAdminOrSolo, async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '').trim();
    if (id === '' || id.length > 100) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    try {
      const removed = await removeModuleAccessRule(db, id);
      if (!removed) {
        res.status(404).json({ error: 'No such rule' });
        return;
      }
      console.log(`[module-access] rule ${id} removed`);
      res.json({ ok: true, id });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  /** The caller's own verdict — the page greys out a module it cannot run. */
  router.get('/module-access/check', requireAuth, async (req: Request, res: Response) => {
    const rawModule = typeof req.query.moduleId === 'string' ? req.query.moduleId.trim() : '';
    const rawArea = typeof req.query.areaId === 'string' ? req.query.areaId.trim() : '';
    const moduleId = rawModule === '' ? null : rawModule.slice(0, 200);
    try {
      const areaId = rawArea !== '' ? rawArea.slice(0, 200) : moduleId ? await resolveModuleAreaId(db, moduleId) : null;
      const teamMode = isTeamMode();
      const verdict = await isModuleAllowed(db, { role: req.user?.role, moduleId, areaId, teamMode });
      res.json({ ...verdict, moduleId, areaId, role: req.user?.role ?? null, teamMode });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  /** "analyst can run N of M modules; viewer N of M" for the Settings card. */
  router.get('/module-access/preview', requireAdminOrSolo, async (_req: Request, res: Response) => {
    try {
      const modules = await moduleCatalogue(db);
      const roles: Record<string, { allowed: number; total: number }> = {};
      for (const role of MODULE_ACCESS_RULE_ROLES) {
        const access = await effectiveAccessForRole(db, role, modules);
        let allowed = 0;
        for (const ok of access.values()) if (ok) allowed += 1;
        roles[role] = { allowed, total: modules.length };
      }
      res.json({ total: modules.length, roles });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
