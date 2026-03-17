import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { computeDiff, computeStats, buildSemanticSummary } from '../services/version-diff.js';

export async function createVersionsRoutes(db: DatabaseAdapter) {
  const router = Router();

  // GET /api/versions/:entityType/:entityId — list versions (newest first, max 20)
  router.get('/:entityType/:entityId', async (req, res) => {
    try {
      const versions = await db.all(
        'SELECT id, version_number, label, created_at, length(content) as content_length FROM versions WHERE entity_type = ? AND entity_id = ? ORDER BY version_number DESC LIMIT 20'
      , req.params.entityType, req.params.entityId);
      res.json(versions);
    } catch {
      res.status(500).json({ error: 'Failed to fetch versions' });
    }
  });

  // GET /api/versions/:entityType/:entityId/:versionNumber — get specific version content
  router.get('/:entityType/:entityId/:versionNumber', async (req, res) => {
    try {
      const version = await db.get(
        'SELECT * FROM versions WHERE entity_type = ? AND entity_id = ? AND version_number = ?'
      , req.params.entityType, req.params.entityId, parseInt(req.params.versionNumber, 10));
      if (!version) {
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
      const { content, label } = req.body as { content: string; label?: string };
      if (!content) {
        res.status(400).json({ error: 'content required' });
        return;
      }

      const last = await db.get(
        'SELECT MAX(version_number) as max_v FROM versions WHERE entity_type = ? AND entity_id = ?'
      , req.params.entityType, req.params.entityId) as { max_v: number | null } | undefined;

      const nextVersion = (last?.max_v ?? 0) + 1;
      await db.run(
        'INSERT INTO versions (entity_type, entity_id, version_number, label, content) VALUES (?, ?, ?, ?, ?)'
      ,
        req.params.entityType,
        req.params.entityId,
        nextVersion,
        label ?? null,
        content
      );

      res.json({ version_number: nextVersion });
    } catch {
      res.status(500).json({ error: 'Failed to save version' });
    }
  });

  // DELETE /api/versions/:id — delete a specific version record
  router.delete('/:id', async (req, res) => {
    try {
      await db.run('DELETE FROM versions WHERE id = ?', req.params.id);
      res.json({ ok: true });
    } catch {
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

      const oldVer = await db.get('SELECT * FROM versions WHERE id = ?', oldId) as {
        id: number;
        entity_type: string;
        entity_id: string;
        version_number: number;
        label: string | null;
        content: string;
        created_at: string;
      } | undefined;

      const newVer = await db.get('SELECT * FROM versions WHERE id = ?', newId) as {
        id: number;
        entity_type: string;
        entity_id: string;
        version_number: number;
        label: string | null;
        content: string;
        created_at: string;
      } | undefined;

      if (!oldVer || !newVer) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }

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
    } catch {
      res.status(500).json({ error: 'Failed to compute diff' });
    }
  });

  return router;
}
