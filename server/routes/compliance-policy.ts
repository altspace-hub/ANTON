/**
 * compliance-policy.ts
 * MGOV-01/02: Admin routes for compliance policy and model allowlist management.
 * Allows admins to:
 *   - Set per-module model/thinking/creativity enforcement rules
 *   - Manage per-user model allowlists
 *   - Read active policy (used by client to enforce thinking/creativity)
 */

import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

import { requireAdminOrSolo } from '../middleware/auth.js';
import { validate } from '../lib/validate.js';
import { z } from 'zod';

const PolicyUpsertSchema = z.object({
  enforce_model:      z.string().max(100).nullable().optional(),
  enforce_thinking:   z.enum(['quick', 'think', 'think_hard', 'investigate', 'plan_first']).nullable().optional(),
  enforce_creativity: z.enum(['strict', 'balanced', 'creative']).nullable().optional(),
  note:               z.string().max(500).optional(),
});

const AllowlistAddSchema = z.object({
  userId:  z.string().max(100).nullable().optional(), // null = global
  modelId: z.string().min(1).max(100),
});

export async function createCompliancePolicyRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  // GET /api/compliance-policy — list all module policies (admin)
  router.get('/compliance-policy', requireAdminOrSolo, async (_req, res) => {
    try {
      const rows = await db.all('SELECT * FROM compliance_policy ORDER BY module_id');
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch compliance policies' });
    }
  });

  // GET /api/compliance-policy/:moduleId — get active policy for a module (any user — used by client)
  router.get('/compliance-policy/:moduleId', async (req, res) => {
    try {
      const row = await db.get('SELECT * FROM compliance_policy WHERE module_id = ?', req.params.moduleId);
      res.json(row || null);
    } catch {
      res.json(null);
    }
  });

  // PUT /api/compliance-policy/:moduleId — upsert policy (admin only)
  router.put('/compliance-policy/:moduleId', requireAdminOrSolo, validate(PolicyUpsertSchema), async (req, res) => {
    const { moduleId } = req.params;
    const { enforce_model, enforce_thinking, enforce_creativity, note } = req.body as z.infer<typeof PolicyUpsertSchema>;
    const createdBy = (req as any).user?.id || 'admin'; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      await db.run(`
        INSERT INTO compliance_policy (module_id, enforce_model, enforce_thinking, enforce_creativity, note, created_by, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(module_id) DO UPDATE SET
          enforce_model      = excluded.enforce_model,
          enforce_thinking   = excluded.enforce_thinking,
          enforce_creativity = excluded.enforce_creativity,
          note               = excluded.note,
          updated_at         = datetime('now')
      `, moduleId,
        enforce_model ?? null,
        enforce_thinking ?? null,
        enforce_creativity ?? null,
        note ?? null,
        createdBy,);
      const row = await db.get('SELECT * FROM compliance_policy WHERE module_id = ?', moduleId);
      res.json(row);
    } catch (e) {
      res.status(500).json({ error: 'Failed to save compliance policy' });
    }
  });

  // DELETE /api/compliance-policy/:moduleId — remove policy (admin only)
  router.delete('/compliance-policy/:moduleId', requireAdminOrSolo, async (req, res) => {
    try {
      await db.run('DELETE FROM compliance_policy WHERE module_id = ?', req.params.moduleId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete compliance policy' });
    }
  });

  // GET /api/compliance-policy/allowlist/all — list all model allowlist entries (admin)
  router.get('/compliance-policy/allowlist/all', requireAdminOrSolo, async (_req, res) => {
    try {
      const rows = await db.get('SELECT * FROM model_allowed ORDER BY user_id, model_id');
      res.json(rows);
    } catch {
      res.status(500).json({ error: 'Failed to fetch allowlist' });
    }
  });

  // POST /api/compliance-policy/allowlist — add entry (admin only)
  router.post('/compliance-policy/allowlist', requireAdminOrSolo, validate(AllowlistAddSchema), async (req, res) => {
    const { userId, modelId } = req.body as z.infer<typeof AllowlistAddSchema>;
    const createdBy = (req as any).user?.id || 'admin'; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      await db.run('INSERT OR IGNORE INTO model_allowed (user_id, model_id, created_by) VALUES (?, ?, ?)'
      , userId ?? null, modelId, createdBy);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to add allowlist entry' });
    }
  });

  // DELETE /api/compliance-policy/allowlist/:id — remove entry (admin only)
  router.delete('/compliance-policy/allowlist/:id', requireAdminOrSolo, async (req, res) => {
    try {
      await db.run('DELETE FROM model_allowed WHERE id = ?', req.params.id);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Failed to delete allowlist entry' });
    }
  });

  return router;
}
