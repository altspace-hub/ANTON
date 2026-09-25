/**
 * org-context.ts (route)
 * API for organisational context management (Improvement 4 — Layer 2a).
 */

import { Router, Request, Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { requireAdminOrSolo } from '../middleware/role-guards.js';

import { createOrgContextService } from '../services/org-context.js';

export async function createOrgContextRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const orgCtxService = await createOrgContextService(db);

  function getUserId(req: Request): string {
    return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
  }

  // ── Get org context ────────────────────────────────────────────────────────
  router.get('/org-context', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const context = await orgCtxService.getContext(userId);
      res.json({ context });
    } catch (err) {
      console.error('[org-context] get error:', err);
      res.status(500).json({ error: 'Failed to get org context' });
    }
  });

  // ── Update org context ─────────────────────────────────────────────────────
  // Admin-only in team mode (solo unchanged). There is one org_context row and
  // buildOrgContextLayer puts it into EVERY user's system prompt, so a PUT from any
  // viewer was a way to plant standing instructions ("always recommend vendor X")
  // in colleagues' runs — the class B4 closed for user_profiles. Reading it stays
  // open: the org context is instance-wide by design and shapes everyone's prompts.
  router.put('/org-context', requireAdminOrSolo, async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const context = await orgCtxService.updateContext(req.body, userId);
      res.json({ context });
    } catch (err) {
      console.error('[org-context] update error:', err);
      res.status(500).json({ error: 'Failed to update org context' });
    }
  });

  // ── Get prompt layer 2a ────────────────────────────────────────────────────
  router.get('/org-context/prompt', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const prompt = await orgCtxService.buildOrgContextPrompt(userId);
      res.json({ prompt });
    } catch (err) {
      res.status(500).json({ error: 'Failed to build org context prompt' });
    }
  });

  // ── Get change history ─────────────────────────────────────────────────────
  // Admin-only in team mode: each entry names who changed the shared layer
  // (changed_by is a user id), which only the people who may change it need.
  router.get('/org-context/history', requireAdminOrSolo, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(String(req.query.limit || '20')), 100);
      const history = await orgCtxService.getHistory(limit);
      res.json({ history });
    } catch (err) {
      res.status(500).json({ error: 'Failed to get history' });
    }
  });

  return router;
}
