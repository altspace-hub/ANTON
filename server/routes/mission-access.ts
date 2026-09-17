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
import { loadOwnedRow, respondToRowAccessError, RowAccessError } from '../lib/owned-row.js';
import { assertSqlIdentifier, assertSqlTableName } from '../lib/sql-identifier.js';
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

/**
 * ── Guards for routes addressed by something OTHER than a mission id ─────────
 *
 * The four mission sub-routers (payments, delivery, grow, delegation) are separate
 * Routers mounted in index.ts BEFORE missions.ts, so the `router.use('/missions/:id')`
 * guard above never runs for them — a matching router terminates the chain. They also
 * cannot simply adopt it: they interleave `/missions/:id/…` with collection paths like
 * `/missions/payments/run-pending` and `/missions/delegations/inbound`, which
 * `'/missions/:id'` would capture with id='payments' and 404. Hence per-route guards,
 * and hence these two, for routes whose parameter is a payment or a delegation rather
 * than a mission.
 */

export interface MissionResolverSpec {
  /** Table holding the row. A literal at the call site — never request input. */
  table: string;
  /** The route parameter holding that row's id, e.g. 'paymentId', 'dId'. */
  idParam: string;
  /** Primary key column. Defaults to 'id'. */
  idColumn?: string;
  /** Column naming the mission. Defaults to 'mission_id'. */
  missionColumn?: string;
  /**
   * Consulted when `missionColumn` is NULL — mission_delegations splits a delegation
   * across mission_id (the delegating side) and sub_mission_id (the receiving side).
   */
  fallbackMissionColumn?: string;
  /** One message for BOTH "no such row" and "not yours". Differing bodies re-open the oracle. */
  notFoundMessage?: string;
  /**
   * What to do when the row exists but names no mission at all — an inbound delegation
   * before it is accepted has mission_id AND sub_mission_id NULL, so there is no owner
   * to compare against and 404 would break the inbox. MUST answer or call next()
   * itself: a handler that does neither hangs the request. Omit to 404.
   */
  onUnattributed?: RequestHandler;
}

/**
 * Owner guard for a route keyed on a row that BELONGS to a mission.
 *
 * Resolves row → mission id → `loadOwnedRow`, so solo pass-through, admin-unscoped and
 * 404-not-403 keep their single definition rather than being restated per table. The
 * lookup in step one is deliberately unscoped: it only reads the mission id, and the
 * ownership decision is still made by loadOwnedRow against missions.missions.
 *
 * A missing row and a row on someone else's mission produce the SAME 404 body, so an id
 * cannot be used to confirm another tenant's payment or delegation exists.
 *
 * NOTE FOR CALLERS: routes that previously answered 400 for an unknown id now answer
 * 404 — including in solo mode, because the existence lookup runs there too. That is
 * mission-payments.ts's approve and cancel, whose service layer threw a plain Error the
 * handler mapped to 400.
 */
export function createMissionOwnerGuardVia(db: DatabaseAdapter, spec: MissionResolverSpec): RequestHandler {
  // Validated even though every call site passes a literal: the day one does not, this
  // should fail loudly rather than turn the guard into the injection vector.
  const table = assertSqlTableName(spec.table);
  const idColumn = assertSqlIdentifier(spec.idColumn ?? 'id', 'id column');
  const missionColumn = assertSqlIdentifier(spec.missionColumn ?? 'mission_id', 'mission column');
  const fallbackColumn = spec.fallbackMissionColumn
    ? assertSqlIdentifier(spec.fallbackMissionColumn, 'fallback mission column')
    : null;
  const notFound = spec.notFoundMessage ?? 'Not found';
  const projection = fallbackColumn ? `${missionColumn}, ${fallbackColumn}` : missionColumn;

  return async function requireMissionOwnerVia(req: Request, res: Response, next: NextFunction) {
    try {
      const row = await db.get<Record<string, string | null>>(
        `SELECT ${projection} FROM ${table} WHERE ${idColumn} = ?`,
        String(req.params[spec.idParam] ?? ''),
      );
      if (!row) throw new RowAccessError(404, notFound);

      const missionId = row[missionColumn] ?? (fallbackColumn ? row[fallbackColumn] : null);
      if (!missionId) {
        if (spec.onUnattributed) return spec.onUnattributed(req, res, next);
        throw new RowAccessError(404, notFound);
      }

      await loadOwnedRow(db, req, {
        table: 'missions.missions',
        ownerColumn: 'created_by',
        id: missionId,
        columns: ['id'],
        notFoundMessage: notFound,
      });
      next();
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;
      res.status(500).json({ error: safeError(err) });
    }
  };
}

/**
 * Assert that `:taskId` really belongs to the `:id` in the same path.
 *
 * Ownership is the other guard's job; this one closes a different hole. A handler that
 * looks a task up by taskId alone will happily act on a task from a DIFFERENT mission
 * that the caller does happen to own — the mission id in the URL becomes decoration.
 * Compose them: `router.post(path, missionOwner, taskInMission, handler)`.
 *
 * Both parameter names are arguments. Hardcoding the mission one as 'id' would work at
 * every call site today and quietly break at the first route that spells it differently
 * — which is exactly the class of latent coupling this file exists to remove.
 */
export function createMissionTaskGuard(
  db: DatabaseAdapter,
  taskParam = 'taskId',
  missionParam = 'id',
): RequestHandler {
  return async function requireTaskInMission(req: Request, res: Response, next: NextFunction) {
    try {
      const row = await db.get<{ mission_id: string }>(
        'SELECT mission_id FROM missions.mission_tasks WHERE id = ?',
        String(req.params[taskParam] ?? ''),
      );
      // Same answer for "no such task" and "task belongs to another mission", for the
      // same reason loadOwnedRow answers 404 rather than 403.
      if (!row || row.mission_id !== String(req.params[missionParam] ?? '')) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      next();
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  };
}
