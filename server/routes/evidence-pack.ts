/**
 * evidence-pack.ts — REST API for the Evidence Pack module (Phase 1).
 *
 * Two audiences:
 *   1. Internal users building + viewing packs (most endpoints)
 *   2. Phase 2: external regulators via /api/shared-pack/* (not yet — placeholder)
 *
 * Auth model:
 *   - All /api/evidence-pack/* require authentication.
 *   - finalise / share require an elevated role (default: admin or analyst per
 *     spec §14 proposal). Other actions are open to any authenticated user
 *     who created or owns the pack — Phase 1 scopes ownership to created_by.
 *
 * Phase 1 supports session + project scopes only. Phase 2 adds workflow_run +
 * mission + canvas + date_range. Phase 3 adds the compliance-mapper preview.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';

import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { childLogger } from '../lib/logger.js';

import { collectForScope, type ScopeDefinition } from '../services/evidence-pack/collector.js';
import { assemblePack, finalisePack, readPackRow, type AssembledPack } from '../services/evidence-pack/assembler.js';
import { bundleEvidencePackToAnton } from '../services/evidence-pack/bundler.js';
import { generateEvidencePackPdf } from '../services/evidence-pack/pdf-layout.js';

const log = childLogger('evidence-pack-route');

// ── Validation ─────────────────────────────────────────────────────────────

const sessionScopeSchema = z.object({ type: z.literal('session'), sessionId: z.string().min(1) });
const projectScopeSchema = z.object({ type: z.literal('project'), projectId: z.string().min(1) });
const scopeSchema = z.discriminatedUnion('type', [sessionScopeSchema, projectScopeSchema]);

const createPackSchema = z.object({
  title: z.string().min(1).max(300),
  purpose: z.string().max(2000).optional(),
  scope: scopeSchema,
  complianceFrameworks: z.array(z.string()).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  notes: z.string().max(5000).optional(),
});

const exportFormatSchema = z.enum(['anton', 'pdf']);

// ── Factory ────────────────────────────────────────────────────────────────

export function createEvidencePackRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  /**
   * Owner check: Phase 1 ties ownership to created_by. Phase 2 will broaden
   * via the new evidence_pack.view_others permission.
   */
  async function assertOwnerOrAdmin(req: Request, res: Response, packId: string): Promise<boolean> {
    const row = await db.get<{ created_by: string }>(
      `SELECT created_by FROM evidence_packs WHERE id = ?`, packId,
    );
    if (!row) { res.status(404).json({ error: 'Pack not found' }); return false; }
    if (row.created_by !== req.user!.id && req.user!.role !== 'admin') {
      res.status(403).json({ error: 'Not the pack owner' }); return false;
    }
    return true;
  }

  // ── Create draft ────────────────────────────────────────────────────────
  router.post('/evidence-pack', requireAuth, async (req, res) => {
    try {
      const parsed = createPackSchema.parse(req.body);
      const id = generatePackId();
      await db.run(
        `INSERT INTO evidence_packs
           (id, title, purpose, scope_type, scope_ref, created_by,
            compliance_frameworks, notes)
         VALUES (?, ?, ?, ?, ?::jsonb, ?, ?::jsonb, ?)`,
        id, parsed.title, parsed.purpose ?? null,
        parsed.scope.type, JSON.stringify(parsed.scope),
        req.user!.id,
        JSON.stringify(parsed.complianceFrameworks ?? ['eu_ai_act', 'amlr']),
        parsed.notes ?? null,
      );
      const pack = await readPackRow(db, id);
      log.info({ packId: id, scopeType: parsed.scope.type, createdBy: req.user!.id }, 'pack_created');
      res.status(201).json({ pack });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── List ────────────────────────────────────────────────────────────────
  router.get('/evidence-pack', requireAuth, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const where = ['(created_by = ? OR ? = \'admin\')'];
      const params: unknown[] = [req.user!.id, req.user!.role];
      if (status) {
        where.push('status = ?');
        params.push(status);
      }
      const rows = await db.all(
        `SELECT id, title, purpose, scope_type, scope_label, status,
                hash_manifest, item_count, created_by, created_at, finalised_at,
                retention_until, legal_hold, compliance_frameworks
         FROM evidence_packs
         WHERE ${where.join(' AND ')}
         ORDER BY created_at DESC LIMIT 200`,
        ...params,
      );
      res.json({ packs: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Get one ─────────────────────────────────────────────────────────────
  router.get('/evidence-pack/:id', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, req.params.id)) return;
      const pack = await readPackRow(db, req.params.id);
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      const items = await db.all(
        `SELECT item_type, item_id, item_hash, item_summary, item_order,
                regulatory_relevance
         FROM evidence_pack_items
         WHERE pack_id = ?
         ORDER BY item_order ASC`,
        req.params.id,
      );
      res.json({ pack, items });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Run / re-run the collector ──────────────────────────────────────────
  router.post('/evidence-pack/:id/collect', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, req.params.id)) return;
      const pack = await readPackRow(db, req.params.id);
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      if (pack.status !== 'draft') {
        return res.status(409).json({ error: `Pack is ${pack.status}; cannot re-collect` });
      }
      const scope = pack.scope_ref as unknown as ScopeDefinition;
      const collected = await collectForScope(db, scope);
      const assembled = await assemblePack(db, {
        packId: pack.id,
        title: pack.title,
        purpose: pack.purpose ?? undefined,
        scope,
        scopeLabel: collected.scopeLabel,
        collected,
        createdBy: pack.created_by,
        complianceFrameworks: pack.compliance_frameworks,
      });
      // Persist scope_label so the list view doesn't have to recompute it.
      await db.run(`UPDATE evidence_packs SET scope_label = ? WHERE id = ?`,
        collected.scopeLabel, pack.id);
      res.json({
        pack: assembled.pack,
        manifestHash: assembled.manifest.manifestHash,
        itemCount: assembled.collectedItems.length,
        itemsByType: assembled.manifest.itemsByType,
      });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Finalise (lock contents) ────────────────────────────────────────────
  // Phase 1: signing not yet implemented (Phase 2 will sign here too).
  router.post('/evidence-pack/:id/finalise', requireAuth, requireRole('analyst'), async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, req.params.id)) return;
      await finalisePack(db, req.params.id);
      const pack = await readPackRow(db, req.params.id);
      res.json({ pack });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Export ──────────────────────────────────────────────────────────────
  router.post('/evidence-pack/:id/export', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, req.params.id)) return;
      const format = exportFormatSchema.parse(req.body?.format ?? 'anton');
      const assembled = await rebuildAssembledPack(db, req.params.id);
      if (!assembled) return res.status(404).json({ error: 'Pack not found' });

      if (format === 'anton') {
        const buf = await bundleEvidencePackToAnton(db, assembled);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${assembled.pack.id}.anton"`);
        return res.send(buf);
      }
      // PDF
      const pdfBuf = await generateEvidencePackPdf(assembled);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${assembled.pack.id}.pdf"`);
      return res.send(pdfBuf);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Soft delete (respects legal hold + retention) ──────────────────────
  router.delete('/evidence-pack/:id', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, req.params.id)) return;
      const row = await db.get<{ legal_hold: boolean; retention_until: string | null; status: string }>(
        `SELECT legal_hold, retention_until, status FROM evidence_packs WHERE id = ?`,
        req.params.id,
      );
      if (!row) return res.status(404).json({ error: 'Pack not found' });
      if (row.legal_hold) {
        return res.status(409).json({ error: 'Pack is under legal hold and cannot be deleted' });
      }
      if (row.retention_until && row.status === 'finalised' && new Date(row.retention_until) > new Date()) {
        return res.status(409).json({
          error: `Retention runs until ${row.retention_until}; deletion blocked`,
        });
      }
      await db.run(`DELETE FROM evidence_packs WHERE id = ?`, req.params.id);
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function generatePackId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = randomBytes(3).toString('hex').toUpperCase();
  return `EP-${date}-${rand}`;
}

/**
 * Reconstitute an AssembledPack from persisted rows. The assembler's hash is
 * deterministic given the same source data, so re-collecting then re-
 * assembling for export is safe (and intentional per spec §13.4: same scope
 * → same hash if no underlying data changed).
 */
async function rebuildAssembledPack(db: DatabaseAdapter, packId: string): Promise<AssembledPack | null> {
  const pack = await readPackRow(db, packId);
  if (!pack) return null;
  const scope = pack.scope_ref as unknown as ScopeDefinition;
  const collected = await collectForScope(db, scope);
  return assemblePack(db, {
    packId: pack.id,
    title: pack.title,
    purpose: pack.purpose ?? undefined,
    scope,
    scopeLabel: pack.scope_label ?? collected.scopeLabel,
    collected,
    createdBy: pack.created_by,
    complianceFrameworks: pack.compliance_frameworks,
  });
}
