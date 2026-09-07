/**
 * mission-access.ts — the owner guard for every route addressed by a mission id.
 *
 * ── The hole this closes ─────────────────────────────────────────────────────
 *
 * The Missions routers LOOK identity-bound: nearly every mutation calls
 * `resolveCallerIdentity(db, undefined)` first. It isn't. That function reads
 * `community_identity WHERE user_id = 'default'` — ONE row for the whole instance — and
 * with no `claimed` hash to compare it degrades to "is community activated?". It returns
 * the same identity to a viewer, an analyst and the owner alike. So on a
 * DEPLOYMENT_MODE=team install every authenticated user could drive, pause, abort or
 * re-plan any other user's mission, and read its full task graph, budget and activity —
 * `missions.missions.created_by` existed the whole time and was simply never in a WHERE.
 *
 * ── Why middleware, not a call in each handler ───────────────────────────────
 *
 * `missions.ts` alone has seventeen `/missions/:id…` routes. A helper each handler must
 * remember to call is the per-file diligence that let this open in the first place, and
 * a route added next year would default to unguarded. Mounted as
 * `router.use('/missions/:id', guard)` the default flips: a new `/missions/:id/whatever`
 * is covered on the day it is written.
 *
 *   ⚠ ORDERING, and the one way to break this: `router.use('/missions/:id')` matches
 *   ANY second path segment, so a COLLECTION route like `/missions/delegations/inbound`
 *   or `/missions/identity` binds id='delegations' and 404s. Register those BEFORE the
 *   guard (missions.ts does, and index.ts:656 already warns about the same shadowing
 *   between routers). In the sub-routers, which interleave collection paths with
 *   `/missions/:id/…` paths, attach the guard per route instead — see mission-payments.ts.
 *
 * ── Behaviour ────────────────────────────────────────────────────────────────
 *
 * Delegates to loadOwnedRow, so the three properties come from one place: solo mode is a
 * pass-through (a single operator, plus rows stamped with whichever sentinel
 * resolveUserId picked, must never vanish from their own machine), admins are unscoped,
 * and a miss is 404 rather than 403 so a mission id cannot confirm another tenant's
 * mission exists. The row is still looked up in the unscoped branch, so a bad id 404s
 * identically in both deployment modes.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { loadOwnedRow, respondToRowAccessError } from '../lib/owned-row.js';
import { safeError } from '../lib/error-response.js';

/**
 * @param paramName the route parameter holding the mission id. Defaults to 'id'.
 */
export function createMissionOwnerGuard(db: DatabaseAdapter, paramName = 'id'): RequestHandler {
  return async function requireMissionOwner(req: Request, res: Response, next: NextFunction) {
    try {
      await loadOwnedRow(db, req, {
        table: 'missions.missions',
        ownerColumn: 'created_by',
        id: String(req.params[paramName] ?? ''),
        columns: ['id'],
        notFoundMessage: 'Mission not found',
      });
      next();
    } catch (err) {
      // FIRST — before the generic arm, or a 404 is reported as a 500 and the
      // "same answer for missing and not-yours" contract is lost.
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  };
}
