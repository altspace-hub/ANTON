/**
 * ownership.ts — per-user row scoping for a shared ANTON instance.
 *
 * A 2026-07-27 survey found six route groups that fetch, mutate or delete rows by id
 * alone, with no check that the caller owns them. On a single-user laptop that is
 * harmless. On a `DEPLOYMENT_MODE=team` install it means any authenticated user can
 * read another user's sessions and delete their messages, read and destroy uploaded
 * documents, enumerate other tenants' discovery findings, delete another user's brand
 * template, or — worst — read every pupil's AI assessment summaries and teacher notes.
 *
 * Generalised from `ensureAtlasAccess` in routes/atlas.ts, which already did this
 * correctly for one table. Same three properties:
 *
 *   1. **404, never 403, on a miss.** A 403 confirms the row exists and belongs to
 *      someone else, which is itself a disclosure — it turns an id into an oracle for
 *      enumerating other tenants' data.
 *   2. **Admins are not scoped**, so support and audit paths keep working.
 *   3. Ownership is checked in SQL, not after fetching, so a row the caller may not
 *      see is never loaded into memory or logged.
 *
 * ── Why solo mode is deliberately not scoped ────────────────────────────────
 *
 * In solo there is exactly one human, and rows exist that were written before
 * ownership was enforced — `coding-scripts.ts` still creates sessions with no
 * `user_id` at all. Filtering strictly there would make a user's own history vanish
 * from their own machine: a worse bug than the one being fixed, and one that reads as
 * data loss rather than a permissions change. Solo therefore short-circuits, exactly
 * as `requireAdminOrSolo` does.
 *
 * In TEAM mode the same unattributed rows are invisible to non-admins. That is the
 * deliberate fail-closed choice: on a shared instance an unowned row is ambiguous, and
 * showing it to everyone is the outcome we are removing. Admins can still see them,
 * and the real fix is to attribute rows on write.
 */
import type { Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { isTeamMode } from './role-guards.js';

export interface OwnedRequest {
  user?: { id: string; role: string };
}

/**
 * Whether this request must be scoped to its own rows at all.
 * False for solo mode and for admins — both see everything by design.
 */
export function scopesToOwner(req: OwnedRequest): boolean {
  if (!isTeamMode()) return false;
  return req.user?.role !== 'admin';
}

/**
 * A SQL fragment + params to append to a WHERE clause for LIST endpoints.
 *
 * Returns empty strings when scoping does not apply, so call sites can interpolate
 * unconditionally:
 *
 *   const scope = ownerFilter(req, 'user_id');
 *   db.all(`SELECT * FROM sessions WHERE deleted_at IS NULL ${scope.sql}`, ...scope.params)
 *
 * The fragment always begins with ` AND `, so the caller's WHERE must already have at
 * least one condition — use `WHERE 1=1` if there is none. That is deliberate: an
 * `ownerFilter` that sometimes emits `WHERE` and sometimes `AND` is the kind of thing
 * that silently produces an unscoped query when a condition is later removed.
 */
export function ownerFilter(req: OwnedRequest, column: string): { sql: string; params: string[] } {
  if (!scopesToOwner(req)) return { sql: '', params: [] };
  const userId = req.user?.id;
  if (!userId) return { sql: ' AND 1=0', params: [] };  // no identity ⇒ no rows
  return { sql: ` AND ${column} = ?`, params: [userId] };
}

export interface AssertOwnedOptions {
  /** Table holding the row. Must be a literal in the caller — never interpolated input. */
  table: string;
  /** Column naming the owner, e.g. 'user_id', 'uploaded_by', 'student_user_id'. */
  ownerColumn: string;
  /** The row's primary key value from the request. */
  id: string;
  /** Primary key column. Defaults to 'id'. */
  idColumn?: string;
  /** Overrides the 404 body. Keep it identical for "missing" and "not yours". */
  notFoundMessage?: string;
}

/**
 * Verify the caller may act on one row, and respond if not.
 *
 * Returns true to continue; on false it has ALREADY sent 401 or 404 and the caller
 * must return immediately:
 *
 *   if (!(await assertOwned(db, req, res, { table: 'sessions', ownerColumn: 'user_id', id }))) return;
 *
 * `table`, `ownerColumn` and `idColumn` are interpolated into SQL and must therefore
 * be literals at the call site. They are never derived from request input — the guard
 * would otherwise be an injection vector, which is a poor trade for a security helper.
 */
export async function assertOwned(
  db: DatabaseAdapter,
  req: OwnedRequest,
  res: Response,
  opts: AssertOwnedOptions,
): Promise<boolean> {
  const { table, ownerColumn, id, idColumn = 'id' } = opts;
  const notFound = opts.notFoundMessage ?? 'Not found';

  if (!req.user?.id) {
    res.status(401).json({ error: 'Authentication required' });
    return false;
  }

  if (!scopesToOwner(req)) {
    // Solo or admin: still confirm the row exists, so a bad id 404s consistently
    // rather than failing later with a confusing error from the real handler.
    const row = await db.get(`SELECT 1 AS ok FROM ${table} WHERE ${idColumn} = ?`, id);
    if (!row) { res.status(404).json({ error: notFound }); return false; }
    return true;
  }

  const row = await db.get(
    `SELECT 1 AS ok FROM ${table} WHERE ${idColumn} = ? AND ${ownerColumn} = ?`,
    id, req.user.id,
  );
  if (!row) {
    // Same 404 as a genuinely missing row — see the header note on not leaking existence.
    res.status(404).json({ error: notFound });
    return false;
  }
  return true;
}
