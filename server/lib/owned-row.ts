/**
 * owned-row.ts — load a user-owned row THROUGH the ownership check.
 *
 * ── Why this exists when middleware/ownership.ts already does ────────────────
 *
 * The 2026-09 team-mode audit counted 107 of ~170 route files with no ownership
 * signal at all, and 534 `WHERE id = ?` lookups in server/routes/*.ts that mention
 * neither user_id nor an owner column. Isolation here is per-file diligence, not
 * architecture, and per-file diligence is exactly what a 170-file surface loses.
 *
 * `assertOwned` (middleware/ownership.ts) is correct and stays. Its SHAPE is the
 * problem: it returns a boolean and then the handler goes and fetches the row itself.
 * That leaves two ways to ship a hole and both look fine in review —
 *
 *   1. forget the call entirely (`const row = await db.get('… WHERE id = ?', id)`
 *      reads like every other line in the file), or
 *   2. call it, then fetch unscoped anyway, so the check and the read can drift
 *      apart the next time somebody edits the query.
 *
 * `loadOwnedRow` closes both: it IS the fetch. There is no unguarded read left to
 * write, and a handler that skipped the guard has no row to work with. A reviewer
 * looking for "does this route check ownership?" only has to ask "where did this row
 * come from?".
 *
 * ── The three properties, inherited not re-invented ──────────────────────────
 *
 * `scopesToOwner` from middleware/ownership.ts is imported rather than reimplemented,
 * so there is ONE definition of who gets scoped. Anyone changing that rule must not
 * have to find a second copy:
 *
 *   1. **Solo mode is a pass-through.** DEPLOYMENT_MODE defaults to solo — one human,
 *      loopback bind — and rows exist that predate ownership (coding-scripts.ts still
 *      writes sessions with a NULL user_id). Filtering there would make the operator's
 *      own history vanish from their own machine: data-loss-shaped, and worse than the
 *      bug being fixed. The row is still looked up, so a bad id 404s the same in both
 *      modes and a route cannot behave differently depending on deployment.
 *   2. **Admins are not scoped**, so support and audit paths keep working.
 *   3. **404, never 403.** A 403 confirms the row exists and belongs to someone else,
 *      turning an id into an existence oracle for enumerating other tenants.
 *
 * ── Using it ─────────────────────────────────────────────────────────────────
 *
 *   import { loadOwnedRow, respondToRowAccessError } from '../lib/owned-row.js';
 *
 *   router.get('/agents/:id', async (req, res) => {
 *     try {
 *       const agent = await loadOwnedRow<AgentRow>(db, req, {
 *         table: 'agent_profiles', ownerColumn: 'created_by', id: req.params.id,
 *       });
 *       res.json(agent);
 *     } catch (err) {
 *       if (respondToRowAccessError(err, res)) return;   // 401/404 already sent
 *       res.status(500).json({ error: safeError(err) });
 *     }
 *   });
 *
 * It throws rather than writing to `res` itself because Express 4 does not catch
 * rejected promises: a helper that only wrote the response would leave the handler
 * running on to `res.json(undefined)`. Throwing stops the handler dead, and
 * `respondToRowAccessError` turns the throw back into the right status inside the
 * catch block these handlers already have. Put it FIRST in the catch — otherwise the
 * generic `safeError` arm answers 500 with "Not found" and the 404 contract is lost.
 *
 * For LIST endpoints use `ownerFilter(req, 'user_id')` from middleware/ownership.ts;
 * this file deliberately does not duplicate it.
 */
import type { Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';
import { assertSqlIdentifier, assertSqlTableName } from './sql-identifier.js';

/** Thrown by loadOwnedRow. Carries the status the route must answer with. */
export class RowAccessError extends Error {
  readonly status: 401 | 404;

  constructor(status: 401 | 404, message: string) {
    super(message);
    this.name = 'RowAccessError';
    this.status = status;
  }
}

export function isRowAccessError(err: unknown): err is RowAccessError {
  return err instanceof RowAccessError;
}

/**
 * Send the 401/404 a RowAccessError carries. Returns true when it handled `err`, so a
 * handler's existing catch stays one line:
 *
 *   catch (err) { if (respondToRowAccessError(err, res)) return; … }
 *
 * Anything else is left for the caller — a database fault must not be reported as
 * "not found".
 */
export function respondToRowAccessError(err: unknown, res: Response): boolean {
  if (!isRowAccessError(err)) return false;
  res.status(err.status).json({ error: err.message });
  return true;
}

export interface OwnedRowSpec {
  /**
   * Table holding the row. A literal at the call site — never request input.
   * May be schema-qualified (`missions.missions`); each part is validated separately.
   */
  table: string;
  /** Column naming the owner, e.g. 'user_id', 'created_by', 'owner_user_id'. */
  ownerColumn: string;
  /** The row's primary key value, typically req.params.id. */
  id: string;
  /** Primary key column. Defaults to 'id'. */
  idColumn?: string;
  /** Columns to return. Defaults to every column. Literals, like `table`. */
  columns?: readonly string[];
  /**
   * Overrides the 404 body. Keep it identical for "missing" and "not yours" — a
   * distinct message re-opens the existence oracle that answering 404 closes.
   */
  notFoundMessage?: string;
}

/**
 * Fetch one row, or throw RowAccessError(401 | 404) if the caller may not have it.
 *
 * `table`, `ownerColumn`, `idColumn` and `columns` are concatenated into SQL — they
 * cannot be bound as parameters — so each is pushed through assertSqlIdentifier first.
 * They are meant to be literals at the call site; the validation is there so that a
 * future call site passing something request-derived fails loudly instead of turning
 * the security helper into the injection vector. `id` is always bound.
 */
export async function loadOwnedRow<T = Record<string, unknown>>(
  db: DatabaseAdapter,
  req: OwnedRequest,
  spec: OwnedRowSpec,
): Promise<T> {
  const table = assertSqlTableName(spec.table);
  const ownerColumn = assertSqlIdentifier(spec.ownerColumn, 'owner column');
  const idColumn = assertSqlIdentifier(spec.idColumn ?? 'id', 'id column');
  const projection = spec.columns?.length
    ? spec.columns.map((c) => assertSqlIdentifier(c, 'column')).join(', ')
    : '*';
  const notFound = spec.notFoundMessage ?? 'Not found';

  const userId = req.user?.id;
  if (!userId) {
    // Team mode with no authenticated identity. Never fall through to an unscoped
    // read: an anonymous caller getting "the row" is the bug this file exists for.
    throw new RowAccessError(401, 'Authentication required');
  }

  const row = scopesToOwner(req)
    ? await db.get<T>(
        `SELECT ${projection} FROM ${table} WHERE ${idColumn} = ? AND ${ownerColumn} = ?`,
        spec.id, userId,
      )
    // Solo or admin: unscoped, but still a lookup — see property 1 in the header.
    : await db.get<T>(
        `SELECT ${projection} FROM ${table} WHERE ${idColumn} = ?`,
        spec.id,
      );

  if (!row) throw new RowAccessError(404, notFound);
  return row;
}
