/**
 * org-context.ts (route)
 * API for organisational context management (Improvement 4 — Layer 2a).
 */

import { Router, Request, Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { requireAdminOrSolo } from '../middleware/role-guards.js';
import { scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';

import { createOrgContextService } from '../services/org-context.js';

export async function createOrgContextRoutes(db: DatabaseAdapter): Promise<Router> {
  const router = Router();
  const orgCtxService = await createOrgContextService(db);

  function getUserId(req: Request): string {
    return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
  }

  /**
   * Who a read may name as the creator of the one org_context row, which a
   * read inserts (empty) when there is none. Only someone who may change it
   * (solo, an admin); for anyone else the column default. A team user's id
   * there made the instance-wide row theirs: demo retention deletes every row
   * whose user_id is an expired visitor's, and the admin's later edits (which
   * keep user_id) with it.
   */
  function readerId(req: Request): string {
    return scopesToOwner(req as unknown as OwnedRequest) ? 'default' : getUserId(req);
  }

  // ── Get org context ────────────────────────────────────────────────────────
  // Instance-wide by design (it shapes everyone's prompts). A team user who
  // may not change it gets it without user_id, the id of whoever created it.
  router.get('/org-context', async (req: Request, res: Response) => {
    try {
      const full = await orgCtxService.getContext(readerId(req));
      if (scopesToOwner(req as unknown as OwnedRequest)) {
        const { user_id: _creator, ...context } = full;
        res.json({ context });
        return;
      }
      res.json({ context: full });
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
      const prompt = await orgCtxService.buildOrgContextPrompt(readerId(req));
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
