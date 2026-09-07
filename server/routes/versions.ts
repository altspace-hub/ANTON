/**
 * versions.ts — the generic saved-version store (module outputs, edited prompts).
 *
 * ── Why every query below carries an owner predicate ─────────────────────────
 *
 * This router used to key purely on the caller-supplied entity_type/entity_id
 * pair, or on the SERIAL primary key. On a DEPLOYMENT_MODE=team instance that
 * made it the side door around the ownership guard on sessions.ts:164-175: the
 * version row holds the same assistant output as the session it came from, but
 * it was never joined back to sessions.user_id, so `GET /api/versions/output/
 * <another user's session id>` returned it anyway. DELETE was worse — it took
 * the integer primary key, so walking 1..n destroyed every tenant's history
 * without guessing a single secret id.
 *
 * The owner cannot be resolved from entity_id at read time: it is a session id
 * for `output` versions but a module id for `module` versions, and
 * custom_modules has no owner column. So versions.user_id (migration 265) is
 * stamped on write and every read/delete filters on it. If you remove one of
 * these predicates the route silently serves other tenants again — nothing here
 * fails loudly.
 *
 * Solo mode is unaffected throughout: ownerFilter/loadOwnedRow short-circuit for
 * a non-team deployment, so the single operator still sees rows written before
 * migration 265 attributed anything.
 */
import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { computeDiff, computeStats, buildSemanticSummary } from '../services/version-diff.js';
import { ownerFilter, type OwnedRequest } from '../middleware/ownership.js';
import { loadOwnedRow, respondToRowAccessError } from '../lib/owned-row.js';

interface VersionRow {
  id: number;
  entity_type: string;
  entity_id: string;
  version_number: number;
  label: string | null;
  content: string;
  created_at: string;
}

export async function createVersionsRoutes(db: DatabaseAdapter) {
  const router = Router();

  // GET /api/versions/:entityType/:entityId — list versions (newest first, max 20)
  router.get('/:entityType/:entityId', async (req, res) => {
    try {
      const scope = ownerFilter(req as OwnedRequest, 'user_id');
      const versions = await db.all(
        `SELECT id, version_number, label, created_at, length(content) as content_length
           FROM versions
          WHERE entity_type = ? AND entity_id = ?${scope.sql}
          ORDER BY version_number DESC LIMIT 20`
      , req.params.entityType, req.params.entityId, ...scope.params);
      res.json(versions);
    } catch {
      res.status(500).json({ error: 'Failed to fetch versions' });
    }
  });

  // GET /api/versions/:entityType/:entityId/:versionNumber — get specific version content
  router.get('/:entityType/:entityId/:versionNumber', async (req, res) => {
    try {
      const scope = ownerFilter(req as OwnedRequest, 'user_id');
      const version = await db.get(
        `SELECT * FROM versions
          WHERE entity_type = ? AND entity_id = ? AND version_number = ?${scope.sql}`
      , req.params.entityType, req.params.entityId, parseInt(req.params.versionNumber, 10), ...scope.params);
      if (!version) {
        // Same 404 whether the version is missing or belongs to another user —
        // a distinct status would turn the id into an existence oracle.
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      res.json(version);
    } catch {
      res.status(500).json({ error: 'Failed to fetch version' });
    }
  });

  // POST /api/versions/:entityType/:entityId — save a new version
  router.post('/:entityType/:entityId', async (req, res) => {
    try {
      const userId = (req as OwnedRequest).user?.id;
      if (!userId) {
        // Team mode with no identity. Writing an unattributed row here would
        // recreate exactly the un-ownable history migration 265 had to backfill.
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { content, label } = req.body as { content: string; label?: string };
      if (!content) {
        res.status(400).json({ error: 'content required' });
        return;
      }

      // MAX is deliberately NOT scoped to the caller: version_number stays unique
      // per entity, so an admin reading /:entityType/:entityId/:versionNumber
      // unscoped still gets exactly one row. Scoping it would let two users each
      // hold a "version 3" of the same entity and make that read ambiguous.
      const last = await db.get(
        'SELECT MAX(version_number) as max_v FROM versions WHERE entity_type = ? AND entity_id = ?'
      , req.params.entityType, req.params.entityId) as { max_v: number | null } | undefined;

      const nextVersion = (last?.max_v ?? 0) + 1;
      await db.run(
        'INSERT INTO versions (entity_type, entity_id, version_number, label, content, user_id) VALUES (?, ?, ?, ?, ?, ?)'
      ,
        req.params.entityType,
        req.params.entityId,
        nextVersion,
        label ?? null,
        content,
        userId
      );

      res.json({ version_number: nextVersion });
    } catch {
      res.status(500).json({ error: 'Failed to save version' });
    }
  });

  // DELETE /api/versions/:id — delete a specific version record
  router.delete('/:id', async (req, res) => {
    try {
      // versions.id is SERIAL. Reject a non-integer here rather than letting
      // PostgreSQL raise "invalid input syntax for type integer" from inside the
      // ownership check, which would surface as a 500 and read as a server fault.
      if (!/^\d+$/.test(req.params.id)) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }
      // Loading THROUGH the guard rather than deleting by id: the previous
      // `DELETE FROM versions WHERE id = ?` let any authenticated user walk the
      // primary key and destroy every tenant's history.
      const row = await loadOwnedRow<{ id: number }>(db, req as OwnedRequest, {
        table: 'versions', ownerColumn: 'user_id', id: req.params.id,
        columns: ['id'], notFoundMessage: 'Version not found',
      });
      await db.run('DELETE FROM versions WHERE id = ?', row.id);
      res.json({ ok: true });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;   // 401/404 already sent
      res.status(500).json({ error: 'Failed to delete version' });
    }
  });

  // GET /api/versions/diff?oldId=xxx&newId=xxx — semantic diff between two versions
  router.get('/diff', async (req, res) => {
    try {
      const { oldId, newId } = req.query as { oldId: string; newId: string };
      if (!oldId || !newId) {
        res.status(400).json({ error: 'oldId and newId required' });
        return;
      }
      if (!/^\d+$/.test(String(oldId)) || !/^\d+$/.test(String(newId))) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }

      // Both sides go through the ownership check: the diff body echoes each
      // version's label and created_at, and the chunks are built from its full
      // content, so an unscoped fetch here leaks the same text the list route
      // refuses.
      const oldVer = await loadOwnedRow<VersionRow>(db, req as OwnedRequest, {
        table: 'versions', ownerColumn: 'user_id', id: String(oldId),
        notFoundMessage: 'Version not found',
      });
      const newVer = await loadOwnedRow<VersionRow>(db, req as OwnedRequest, {
        table: 'versions', ownerColumn: 'user_id', id: String(newId),
        notFoundMessage: 'Version not found',
      });

      const oldContent = oldVer.content ?? '';
      const newContent = newVer.content ?? '';

      const chunks = computeDiff(oldContent, newContent);
      const stats = computeStats(chunks, oldContent, newContent);

      res.json({
        oldVersionId: String(oldId),
        newVersionId: String(newId),
        oldLabel: oldVer.label ?? `v${oldVer.version_number}`,
        newLabel: newVer.label ?? `v${newVer.version_number}`,
        oldCreatedAt: oldVer.created_at,
        newCreatedAt: newVer.created_at,
        chunks,
        stats,
        semanticSummary: buildSemanticSummary(stats),
      });
    } catch (err) {
      if (respondToRowAccessError(err, res)) return;   // 401/404 already sent
      res.status(500).json({ error: 'Failed to compute diff' });
    }
  });

  return router;
}
