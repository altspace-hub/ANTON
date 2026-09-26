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
 * Scopes: session, project, mission, gap_assessment, engagement, task, and
 * custom (a list of source rows — what POST /:id/scope/add builds when a
 * user adds a session or assessment to an existing draft pack). Phase 3
 * adds the compliance-mapper preview.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';

import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assertOwned, scopesToOwner } from '../middleware/ownership.js';
import { isTeamMode } from '../middleware/role-guards.js';
import { resolveProjectAccess } from '../services/project-context.js';
import { childLogger } from '../lib/logger.js';

import {
  collectForScope, scopeToCustomItem, CUSTOM_SCOPE_TABLES,
  type ScopeDefinition, type CustomScope,
} from '../services/evidence-pack/collector.js';
import { assemblePack, finalisePack, readPackRow, type AssembledPack } from '../services/evidence-pack/assembler.js';
import { bundleEvidencePackToAnton } from '../services/evidence-pack/bundler.js';
import { generateEvidencePackPdf } from '../services/evidence-pack/pdf-layout.js';
import { generateEvidencePackHtml } from '../services/evidence-pack/html-exporter.js';
import { mapCompliance } from '../services/evidence-pack/compliance-mapper.js';

const log = childLogger('evidence-pack-route');

// ── Validation ─────────────────────────────────────────────────────────────

// includePrompts: composed prompts + evidence document texts travel verbatim
// only when the pack was created with it (default false — they can carry
// client documents; hashes travel regardless).
const includePrompts = z.boolean().optional();
const sessionScopeSchema = z.object({ type: z.literal('session'), sessionId: z.string().min(1), includePrompts });
const projectScopeSchema = z.object({ type: z.literal('project'), projectId: z.string().min(1), includePrompts });
const missionScopeSchema = z.object({ type: z.literal('mission'), missionId: z.string().min(1) });
const gapAssessmentScopeSchema = z.object({ type: z.literal('gap_assessment'), assessmentId: z.string().min(1), includePrompts });
const engagementScopeSchema = z.object({ type: z.literal('engagement'), engagementId: z.string().min(1), includePrompts });
const taskScopeSchema = z.object({ type: z.literal('task'), taskId: z.string().min(1) });
const customScopeSchema = z.object({
  type: z.literal('custom'),
  items: z.array(z.object({
    table: z.string().refine((t) => t in CUSTOM_SCOPE_TABLES, { message: 'Unknown custom scope table' }),
    id: z.string().min(1),
  })).min(1).max(200),
  includePrompts,
});
/** A scope with one root row — what a pack is created with and what scope/add appends. */
const singleScopeSchema = z.discriminatedUnion('type', [
  sessionScopeSchema, projectScopeSchema, missionScopeSchema,
  gapAssessmentScopeSchema, engagementScopeSchema, taskScopeSchema,
]);
const scopeSchema = z.discriminatedUnion('type', [
  sessionScopeSchema, projectScopeSchema, missionScopeSchema,
  gapAssessmentScopeSchema, engagementScopeSchema, taskScopeSchema, customScopeSchema,
]);

const createPackSchema = z.object({
  title: z.string().min(1).max(300),
  purpose: z.string().max(2000).optional(),
  scope: scopeSchema,
  complianceFrameworks: z.array(z.string()).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  notes: z.string().max(5000).optional(),
});

const exportFormatSchema = z.enum(['anton', 'pdf', 'jsonl', 'html']);

const gapAcceptanceSchema = z.object({
  pointId: z.string().min(1).max(200),
  rationale: z.string().min(1).max(2000),
});

const createShareSchema = z.object({
  recipientName: z.string().min(1).max(200),
  recipientOrganisation: z.string().min(1).max(200),
  recipientContact: z.string().email().optional().or(z.literal('')),
  purpose: z.string().min(1).max(500),
  expiresInDays: z.number().int().min(1).max(365).default(30),
  password: z.string().min(8).max(200).optional(),
  allowDownload: z.boolean().default(true),
  watermarkText: z.string().max(200).optional(),
});

// ── Factory ────────────────────────────────────────────────────────────────

export function createEvidencePackRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  /**
   * Owner check: Phase 1 ties ownership to created_by. Phase 2 will broaden
   * via the new evidence_pack.view_others permission.
   *
   * The owner condition is in the SQL, and someone else's pack answers the
   * same 404 as a missing one (ownership.ts). It answered 403 'Not the pack
   * owner', which let a non-admin test whether a pack id existed — and the ids
   * carry only 24 random bits per day. Solo and admins are not scoped, as before.
   */
  async function assertOwnerOrAdmin(req: Request, res: Response, packId: string): Promise<boolean> {
    return assertOwned(db, req, res, {
      table: 'evidence_packs', ownerColumn: 'created_by', id: packId, notFoundMessage: 'Pack not found',
    });
  }

  /**
   * Every root a scope names must be readable by the caller (team-mode
   * non-admins; solo and admins are not scoped). A pack's scope was only
   * validated for shape, and the collector reads by id alone — so any user
   * could name a colleague's session, project, assessment, engagement, mission
   * or task and export its messages, thinking and composed prompts (round-1
   * verifier gap, 2026-09-23). Checked where a scope is accepted (create,
   * scope/add) and again wherever a stored scope is read (view, collect,
   * preview, export, share), because scope_ref outlives the access that let it
   * in — and packs created before this check exist. A root the caller may not
   * read answers the same 404 as one that does not exist.
   */
  async function assertScopeReadable(req: Request, res: Response, scope: ScopeDefinition | null): Promise<boolean> {
    if (!scopesToOwner(req)) return true;
    if (!(await scopeReadableBy(db, { id: req.user!.id, role: req.user!.role }, scope))) {
      res.status(404).json({ error: 'Scope not found' });
      return false;
    }
    return true;
  }

  /** The stored scope of a pack the caller owns (checked by assertOwnerOrAdmin first). */
  async function assertStoredScopeReadable(req: Request, res: Response, packId: string): Promise<boolean> {
    if (!scopesToOwner(req)) return true;
    const pack = await readPackRow(db, packId);
    if (!pack) { res.status(404).json({ error: 'Pack not found' }); return false; }
    return assertScopeReadable(req, res, pack.scope_ref as unknown as ScopeDefinition | null);
  }

  // ── Create draft ────────────────────────────────────────────────────────
  router.post('/evidence-pack', requireAuth, async (req, res) => {
    try {
      const parsed = createPackSchema.parse(req.body);
      if (!(await assertScopeReadable(req, res, parsed.scope))) return;
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
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      // The stored item summaries quote their sources (a decision's text, a
      // mission activity), so a pack whose scope names a root its creator can no
      // longer read — one created before scope roots were checked — is not shown.
      if (!(await assertStoredScopeReadable(req, res, String(req.params.id)))) return;
      const pack = await readPackRow(db, String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      const items = await db.all(
        `SELECT item_type, item_id, item_hash, item_summary, item_order,
                regulatory_relevance, redaction_status, redaction_reason
         FROM evidence_pack_items
         WHERE pack_id = ?
         ORDER BY item_order ASC LIMIT 1000`,
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
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      const pack = await readPackRow(db, String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      if (pack.status !== 'draft') {
        return res.status(409).json({ error: `Pack is ${pack.status}; cannot re-collect` });
      }
      const scope = pack.scope_ref as unknown as ScopeDefinition;
      if (!(await assertScopeReadable(req, res, scope))) return;
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

  // ── Add a source row to a draft pack's scope ───────────────────────────
  // "Add this session / assessment to an evidence pack" from the output page
  // or the gap wizard. A single-target scope becomes a custom list holding
  // the old root plus the new one; a custom scope grows by one entry. The
  // caller runs /collect afterwards. Draft packs only — a finalised pack's
  // contents are signed.
  router.post('/evidence-pack/:id/scope/add', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      const added = singleScopeSchema.parse(req.body?.scope);
      if (!(await assertScopeReadable(req, res, added))) return;
      const pack = await readPackRow(db, String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      if (pack.status !== 'draft') {
        return res.status(409).json({ error: `Pack is ${pack.status}; its scope is locked` });
      }
      const current = pack.scope_ref as unknown as ScopeDefinition;
      const entries: CustomScope['items'] = current.type === 'custom'
        ? [...current.items]
        : (() => { const root = scopeToCustomItem(current); return root ? [root] : []; })();
      const newEntry = scopeToCustomItem(added);
      if (!newEntry) return res.status(400).json({ error: 'Scope cannot be added' });
      const already = entries.some((e) => e.table === newEntry.table && e.id === newEntry.id);
      if (!already) entries.push(newEntry);
      const wantsPrompts = ('includePrompts' in current && current.includePrompts === true)
        || ('includePrompts' in added && added.includePrompts === true);
      const scope: CustomScope = { type: 'custom', items: entries, ...(wantsPrompts ? { includePrompts: true } : {}) };
      await db.run(
        `UPDATE evidence_packs SET scope_type = 'custom', scope_ref = ?::jsonb WHERE id = ?`,
        JSON.stringify(scope), pack.id,
      );
      log.info({ packId: pack.id, table: newEntry.table, added: !already, entryCount: entries.length }, 'pack_scope_extended');
      res.json({ pack: await readPackRow(db, pack.id), added: !already });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Preview (Phase 3): run the compliance mapper, return the mapping
  // and the gap list so the builder can show "fix / justify / accept" UI
  // before the user clicks finalise.
  router.post('/evidence-pack/:id/preview', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      if (!(await assertStoredScopeReadable(req, res, String(req.params.id)))) return;
      const assembled = await rebuildAssembledPack(db, String(req.params.id));
      if (!assembled) return res.status(404).json({ error: 'Pack not found' });
      const mapping = mapCompliance(
        assembled,
        assembled.pack.compliance_frameworks,
        assembled.pack.compliance_gaps,
      );
      res.json({ mapping });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Gap acceptance: owner explicitly accepts a documented gap, with
  // rationale that ends up on the pack cover page (per spec §5.6).
  // Reversible until finalise.
  router.put('/evidence-pack/:id/gap-acceptance', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      const parsed = gapAcceptanceSchema.parse(req.body);
      const pack = await readPackRow(db, String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      if (pack.status !== 'draft') {
        return res.status(409).json({ error: 'Pack is finalised; cannot edit gap acceptances' });
      }
      const gaps = { ...pack.compliance_gaps };
      gaps[parsed.pointId] = {
        rationale: parsed.rationale,
        acceptedAt: new Date().toISOString(),
        acceptedBy: req.user!.id,
      };
      await db.run(
        `UPDATE evidence_packs SET compliance_gaps = ?::jsonb WHERE id = ?`,
        JSON.stringify(gaps), req.params.id,
      );
      log.info({ packId: req.params.id, pointId: parsed.pointId }, 'gap_accepted');
      res.json({ gaps });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.delete('/evidence-pack/:id/gap-acceptance/:pointId', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      const pack = await readPackRow(db, String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      if (pack.status !== 'draft') {
        return res.status(409).json({ error: 'Pack is finalised; cannot edit gap acceptances' });
      }
      const gaps = { ...pack.compliance_gaps };
      delete gaps[String(req.params.pointId)];
      await db.run(
        `UPDATE evidence_packs SET compliance_gaps = ?::jsonb WHERE id = ?`,
        JSON.stringify(gaps), req.params.id,
      );
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Finalise (lock contents) ────────────────────────────────────────────
  // Phase 2 signs here. Phase 3 doesn't change the gate — open gaps are
  // allowed but flagged on the cover.
  router.post('/evidence-pack/:id/finalise', requireAuth, requireRole('analyst'), async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      await finalisePack(db, String(req.params.id));
      const pack = await readPackRow(db, String(req.params.id));
      res.json({ pack });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Export ──────────────────────────────────────────────────────────────
  router.post('/evidence-pack/:id/export', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      const format = exportFormatSchema.parse(req.body?.format ?? 'anton');
      if (!(await assertStoredScopeReadable(req, res, String(req.params.id)))) return;
      const assembled = await rebuildAssembledPack(db, String(req.params.id));
      if (!assembled) return res.status(404).json({ error: 'Pack not found' });

      if (format === 'anton') {
        const buf = await bundleEvidencePackToAnton(db, assembled);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${assembled.pack.id}.anton"`);
        return res.send(buf);
      }
      if (format === 'pdf') {
        const pdfBuf = await generateEvidencePackPdf(assembled);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${assembled.pack.id}.pdf"`);
        return res.send(pdfBuf);
      }
      if (format === 'jsonl') {
        // One JSON object per line — manifest first, then each item.
        // Streaming-friendly for ingestion pipelines per spec §5.4.
        const lines = [JSON.stringify({ kind: 'manifest', ...assembled.manifest })];
        for (const item of assembled.collectedItems) {
          const redaction = assembled.redactions[`${item.itemType}:${item.itemId}`];
          lines.push(JSON.stringify({
            kind: 'item',
            type: item.itemType, id: item.itemId, hash: item.itemHash,
            summary: item.itemSummary, regulatory_relevance: item.regulatoryRelevance,
            body: redaction && redaction.status !== 'none'
              ? { _redacted: true, status: redaction.status, reason: redaction.reason }
              : JSON.parse(item.canonicalJson),
          }));
        }
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Content-Disposition', `attachment; filename="${assembled.pack.id}.jsonl"`);
        return res.send(lines.join('\n') + '\n');
      }
      // HTML
      const html = generateEvidencePackHtml(assembled);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${assembled.pack.id}.html"`);
      return res.send(html);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Owner: share management ─────────────────────────────────────────────
  // Spec §6: only finalised packs can be shared. Each share gets a random
  // URL-safe access token; password is bcrypt-hashed.
  router.post('/evidence-pack/:id/shares', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      const parsed = createShareSchema.parse(req.body);
      const pack = await readPackRow(db, String(req.params.id));
      if (!pack) return res.status(404).json({ error: 'Pack not found' });
      // A share's download re-collects the scope for someone outside the instance.
      if (!(await assertScopeReadable(req, res, pack.scope_ref as unknown as ScopeDefinition | null))) return;
      if (pack.status !== 'finalised') {
        return res.status(409).json({ error: 'Pack must be finalised before sharing' });
      }
      const token = randomBytes(32).toString('base64url');
      const passwordHash = parsed.password ? await bcrypt.hash(parsed.password, 10) : null;
      const expiresAt = new Date(Date.now() + parsed.expiresInDays * 86400000).toISOString();
      const row = await db.get<{ id: string }>(
        `INSERT INTO evidence_pack_shares
           (pack_id, access_token, password_hash, recipient_name, recipient_organisation,
            recipient_contact, purpose, created_by, expires_at,
            allow_download, watermark_text)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::timestamptz, ?, ?)
         RETURNING id`,
        req.params.id, token, passwordHash,
        parsed.recipientName, parsed.recipientOrganisation,
        parsed.recipientContact || null,
        parsed.purpose, req.user!.id, expiresAt,
        parsed.allowDownload, parsed.watermarkText ?? null,
      );
      // Mark the pack as shared if it wasn't already.
      await db.run(`UPDATE evidence_packs SET status = 'shared' WHERE id = ? AND status = 'finalised'`, req.params.id);
      log.info({ packId: req.params.id, shareId: row?.id, expiresAt }, 'share_created');
      res.status(201).json({
        id: row?.id, accessToken: token, expiresAt,
        passwordRequired: !!passwordHash,
      });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.get('/evidence-pack/:id/shares', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      const rows = await db.all(
        `SELECT id, access_token, recipient_name, recipient_organisation,
                recipient_contact, purpose, created_at, expires_at,
                revoked_at, revoked_reason, allow_download, watermark_text,
                (password_hash IS NOT NULL) AS password_required
         FROM evidence_pack_shares WHERE pack_id = ?
         ORDER BY created_at DESC LIMIT 200`,
        req.params.id,
      );
      res.json({ shares: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/evidence-pack/:id/shares/:shareId', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      const reason = (req.body?.reason as string | undefined) ?? 'revoked by owner';
      const r = await db.run(
        `UPDATE evidence_pack_shares
            SET revoked_at = NOW(), revoked_reason = ?
          WHERE id = ? AND pack_id = ? AND revoked_at IS NULL`,
        reason, req.params.shareId, req.params.id,
      );
      if (r.changes === 0) return res.status(404).json({ error: 'Share not found or already revoked' });
      log.info({ packId: req.params.id, shareId: req.params.shareId, reason }, 'share_revoked');
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Owner: chain-of-custody ─────────────────────────────────────────────
  router.get('/evidence-pack/:id/access-log', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      const limit = Math.min(Number(req.query.limit ?? 200) || 200, 1000);
      const rows = await db.all(
        `SELECT al.id, al.share_id, al.accessed_at, al.accessor_type,
                al.accessor_id, al.action, al.item_accessed, al.success,
                al.error_reason, al.ip_address_hash,
                s.recipient_name, s.recipient_organisation
         FROM evidence_pack_access_log al
         LEFT JOIN evidence_pack_shares s ON s.id = al.share_id
         WHERE al.pack_id = ?
         ORDER BY al.accessed_at DESC LIMIT ?`,
        req.params.id, limit,
      );
      res.json({ accesses: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Phase 4: legal hold toggle ──────────────────────────────────────────
  // When set, the pack cannot be deleted by anyone, regardless of retention.
  // Cleared with a reason that lands in the access log (Phase 4 audit).
  router.put('/evidence-pack/:id/legal-hold', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      const enable = req.body?.enable === true;
      const reason = (req.body?.reason as string | undefined)?.trim() || (enable ? 'enabled' : 'cleared');
      await db.run(
        `UPDATE evidence_packs SET legal_hold = ? WHERE id = ?`,
        enable, req.params.id,
      );
      // Use the access log to record the toggle so it shows up in chain-of-custody.
      await db.run(
        `INSERT INTO evidence_pack_access_log
           (pack_id, accessor_type, accessor_id, action, success, error_reason)
         VALUES (?, 'internal_user', ?, ?, TRUE, ?)`,
        req.params.id, req.user!.id,
        enable ? 'legal_hold_set' : 'legal_hold_cleared',
        reason,
      );
      log.info({ packId: req.params.id, enable, reason, userId: req.user!.id }, 'legal_hold_toggled');
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Phase 4: redaction workflow ─────────────────────────────────────────
  // Mark an item as redacted (legal privilege, GDPR personal data, etc.).
  // The bundle + PDF will hide the canonical body for redacted items but
  // keep the manifest reference + hash so verifiers know the item existed
  // and can audit the redaction.
  router.put('/evidence-pack/:id/items/:itemKey/redact', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
      const status = req.body?.status === 'full' ? 'full' : req.body?.status === 'partial' ? 'partial' : 'none';
      const reason = (req.body?.reason as string | undefined)?.trim() || null;
      if (status !== 'none' && !reason) {
        return res.status(400).json({ error: 'Reason required when redacting' });
      }
      // itemKey is "<type>:<id>" so we can target one polymorphic row.
      const [itemType, itemId] = String(req.params.itemKey).split(':', 2);
      if (!itemType || !itemId) return res.status(400).json({ error: 'itemKey must be "type:id"' });
      const r = await db.run(
        `UPDATE evidence_pack_items
           SET redaction_status = ?, redaction_reason = ?
         WHERE pack_id = ? AND item_type = ? AND item_id = ?`,
        status, reason, req.params.id, itemType, itemId,
      );
      if (r.changes === 0) return res.status(404).json({ error: 'Item not found in pack' });
      await db.run(
        `INSERT INTO evidence_pack_access_log
           (pack_id, accessor_type, accessor_id, action, item_accessed, success)
         VALUES (?, 'internal_user', ?, 'redact', ?, TRUE)`,
        req.params.id, req.user!.id, `${itemType}:${itemId}:${status}`,
      );
      log.info({ packId: req.params.id, itemType, itemId, status, userId: req.user!.id }, 'item_redacted');
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Soft delete (respects legal hold + retention) ──────────────────────
  router.delete('/evidence-pack/:id', requireAuth, async (req, res) => {
    try {
      if (!await assertOwnerOrAdmin(req, res, String(req.params.id))) return;
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

/** Whose reading rights a scope is checked against: the caller, or a pack's creator. */
interface ScopeReader { id: string; role: string }

/** evidence_packs.scope_ref as read raw (jsonb, or text on an adapter that returns it so). */
function parseStoredScope(raw: unknown): ScopeDefinition | null {
  try {
    const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return value && typeof value === 'object' ? (value as ScopeDefinition) : null;
  } catch {
    return null;
  }
}

/**
 * Whether a team-mode non-admin may read one scope root — the same rule the
 * root's own routes apply. Owner columns: sessions.user_id, missions.created_by,
 * gap_assessments.user_id, anton_tasks.user_id. Checked in SQL, so a foreign
 * row is never loaded. Anything else — including a table name that only passed
 * the schema's `in` check, such as 'toString' — is refused.
 *
 * Project and engagement roots need more than being able to see the project.
 * Packing one walks EVERY session filed in it: colleagues' transcripts,
 * thinking and audit rows, and with includePrompts their composed prompts —
 * which carry each author's own atoms, profile layer and uploaded documents,
 * none of which a colleague may otherwise read (GET /sessions/:id is
 * owner-only; members see only the project layer). So a project root needs an
 * editing role in it (owner, admin or member — not 'viewer'), or to be the
 * recorded owner of a project with no member list; an engagement root needs its
 * owner or an editing member of its project (engagements.ts canEdit). A viewer
 * packs their own sessions instead (round-2 gap "verify2:projects-2").
 */
async function mayReadScopeRoot(db: DatabaseAdapter, reader: ScopeReader, root: { table: string; id: string }): Promise<boolean> {
  const userId = reader.id;
  const walker = Object.prototype.hasOwnProperty.call(CUSTOM_SCOPE_TABLES, root.table)
    ? CUSTOM_SCOPE_TABLES[root.table] : undefined;
  switch (walker) {
    case 'session':
      return !!(await db.get('SELECT 1 AS ok FROM sessions WHERE id = ? AND user_id = ?', root.id, userId));
    case 'project': {
      const access = await resolveProjectAccess(db, {
        projectId: root.id, userId, userRole: reader.role, teamMode: true,
      });
      if (access !== 'ok') return false;
      // 'ok' with no membership row is the recorded owner of a memberless project.
      const member = await db.get<{ role: string }>(
        'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', root.id, userId,
      );
      return !member || member.role !== 'viewer';
    }
    case 'mission':
      return !!(await db.get('SELECT 1 AS ok FROM missions.missions WHERE id = ? AND created_by = ?', root.id, userId));
    case 'gap_assessment':
      return !!(await db.get('SELECT 1 AS ok FROM gap_assessments WHERE id = ? AND user_id = ?', root.id, userId));
    case 'engagement':
      return !!(await db.get(
        `SELECT 1 AS ok FROM engagements e
         WHERE e.id = ? AND (e.user_id = ? OR EXISTS (
           SELECT 1 FROM project_members pm
            WHERE pm.project_id = e.project_id AND pm.user_id = ? AND pm.role <> 'viewer'))`,
        root.id, userId, userId,
      ));
    case 'task':
      return !!(await db.get('SELECT 1 AS ok FROM anton_tasks WHERE id = ? AND user_id = ?', root.id, userId));
    default:
      return false;
  }
}

/**
 * Whether `reader` may read every root the scope names. Solo mode and an admin
 * reader are not scoped; an empty or malformed scope is not readable.
 */
async function scopeReadableBy(db: DatabaseAdapter, reader: ScopeReader, scope: ScopeDefinition | null): Promise<boolean> {
  if (!isTeamMode() || reader.role === 'admin') return true;
  const roots = !scope || typeof scope !== 'object' ? []
    : scope.type === 'custom' ? (Array.isArray(scope.items) ? scope.items : [])
    : [scopeToCustomItem(scope)].filter((r): r is { table: string; id: string } => r !== null);
  if (roots.length === 0) return false;
  for (const root of roots) {
    if (!(await mayReadScopeRoot(db, reader, root))) return false;
  }
  return true;
}

// ── Public regulator factory (no auth, mounted before authMiddleware) ─────

/**
 * Routes for external auditors hitting `/api/shared-pack/:token`. NO auth
 * middleware — the token IS the authentication. Every request appends a row
 * to `evidence_pack_access_log` BEFORE rendering, per spec §6.
 *
 * Auth model for password-protected shares: client POSTs password to /auth,
 * server returns a short-lived HMAC of (token + password_hash + secret) that
 * the client echoes as the `X-Pack-Session` header on subsequent calls. No
 * server-side session storage — the HMAC re-validates on each request.
 */
export function createSharedPackRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const SECRET = process.env.JWT_SECRET || 'evidence-pack-shared-fallback-secret-change-me';

  function ipHash(req: Request): string {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
    return createHash('sha256').update(ip + SECRET.slice(0, 16)).digest('hex').slice(0, 32);
  }
  function uaHash(req: Request): string {
    return createHash('sha256').update((req.headers['user-agent'] ?? '') + SECRET.slice(0, 16)).digest('hex').slice(0, 32);
  }
  function sessionHmac(token: string, passwordHash: string): string {
    return createHmac('sha256', SECRET).update(token + ':' + passwordHash).digest('hex');
  }

  /**
   * Resolve a share token. Returns the share + pack rows on success, or
   * sends an error response and returns null. ALWAYS logs the attempt
   * before continuing — even invalid tokens get a log row so the owner can
   * spot probing.
   */
  async function resolveShare(req: Request, res: Response, action: string, requirePassword: boolean): Promise<{ share: ShareRow; pack: PackRowMin } | null> {
    const token = String(req.params.token);
    const share = await db.get<ShareRow>(
      `SELECT id, pack_id, password_hash, recipient_name, recipient_organisation,
              created_at, expires_at, revoked_at, allow_download, watermark_text
       FROM evidence_pack_shares WHERE access_token = ?`, token,
    );
    if (!share) {
      // Don't write to access_log without a valid pack_id — just 404.
      res.status(404).json({ error: 'Share not found' });
      return null;
    }
    const pack = await db.get<PackRowMin>(
      `SELECT id, title, status, created_by, scope_ref FROM evidence_packs WHERE id = ?`, share.pack_id,
    );
    if (!pack) { res.status(404).json({ error: 'Pack not found' }); return null; }

    // Always log the attempt, regardless of outcome.
    const baseLog = {
      shareId: share.id, packId: pack.id, action,
      ipAddressHash: ipHash(req), userAgentHash: uaHash(req),
    };

    if (share.revoked_at) {
      await logAccess(db, baseLog, false, 'share_revoked');
      res.status(410).json({ error: 'Share revoked' }); return null;
    }
    if (new Date(share.expires_at) < new Date()) {
      await logAccess(db, baseLog, false, 'share_expired');
      res.status(410).json({ error: 'Share expired' }); return null;
    }

    if (requirePassword && share.password_hash) {
      const sessionHeader = req.headers['x-pack-session'] as string | undefined;
      const expected = sessionHmac(token, share.password_hash);
      if (!sessionHeader || sessionHeader !== expected) {
        await logAccess(db, baseLog, false, 'password_required');
        res.status(401).json({ error: 'Password required', kind: 'password_required' });
        return null;
      }
    }

    // Team mode: the share is only as good as its creator's access. A pack
    // shared before scope roots were checked can name rows its creator never
    // could read, and the download re-collects them for someone outside the
    // instance; the index and item routes return the stored summaries, which
    // quote their sources. So every stored root is re-checked against the
    // creator (users.role read now, so a creator no longer admin is checked like
    // anyone else) and a pack that fails answers like a missing one — after the
    // password check, so an unauthenticated caller learns nothing new.
    // Solo mode and an admin creator are not scoped.
    if (isTeamMode()) {
      const creator = await db.get<{ role: string | null }>('SELECT role FROM users WHERE id = ?', pack.created_by);
      const reader: ScopeReader = { id: pack.created_by, role: creator?.role ?? '' };
      if (!(await scopeReadableBy(db, reader, parseStoredScope(pack.scope_ref)))) {
        await logAccess(db, baseLog, false, 'scope_not_readable_by_creator');
        res.status(404).json({ error: 'Pack not found' });
        return null;
      }
    }

    await logAccess(db, baseLog, true, null);
    return { share, pack };
  }

  // ── Manifest + index ────────────────────────────────────────────────────
  router.get('/shared-pack/:token', async (req, res) => {
    const r = await resolveShare(req, res, 'view_index', true);
    if (!r) return;
    const items = await db.all(
      `SELECT item_type, item_id, item_hash, item_summary, item_order,
              regulatory_relevance
       FROM evidence_pack_items WHERE pack_id = ?
       ORDER BY item_order ASC LIMIT 1000`, r.pack.id,
    );
    const pack = await db.get(
      `SELECT id, title, purpose, scope_type, scope_label, status,
              hash_manifest, signature, signer_public_key,
              finalised_at, compliance_frameworks
       FROM evidence_packs WHERE id = ?`, r.pack.id,
    );
    res.json({
      pack, items,
      share: {
        recipientName: r.share.recipient_name,
        recipientOrganisation: r.share.recipient_organisation,
        expiresAt: r.share.expires_at,
        allowDownload: r.share.allow_download,
        watermarkText: r.share.watermark_text,
      },
    });
  });

  // ── Password challenge ──────────────────────────────────────────────────
  router.post('/shared-pack/:token/auth', async (req, res) => {
    try {
      const password = (req.body?.password as string | undefined) ?? '';
      const share = await db.get<ShareRow>(
        `SELECT id, pack_id, password_hash, expires_at, revoked_at
         FROM evidence_pack_shares WHERE access_token = ?`, req.params.token,
      );
      if (!share) return res.status(404).json({ error: 'Share not found' });
      if (!share.password_hash) {
        // No password configured — return a session token that always validates.
        return res.json({ sessionToken: sessionHmac(req.params.token, '') });
      }
      const ok = await bcrypt.compare(password, share.password_hash);
      const baseLog = {
        shareId: share.id, packId: share.pack_id, action: 'auth_attempt',
        ipAddressHash: ipHash(req), userAgentHash: uaHash(req),
      };
      await logAccess(db, baseLog, ok, ok ? null : 'wrong_password');
      if (!ok) return res.status(401).json({ error: 'Wrong password' });
      res.json({ sessionToken: sessionHmac(req.params.token, share.password_hash) });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Single item content ─────────────────────────────────────────────────
  router.get('/shared-pack/:token/item/:itemId', async (req, res) => {
    const r = await resolveShare(req, res, 'view_item', true);
    if (!r) return;
    const item = await db.get<{ item_summary: string; item_hash: string; item_type: string; regulatory_relevance: unknown }>(
      `SELECT item_summary, item_hash, item_type, regulatory_relevance
       FROM evidence_pack_items WHERE pack_id = ? AND item_id = ?`,
      r.pack.id, req.params.itemId,
    );
    if (!item) return res.status(404).json({ error: 'Item not in pack' });
    // We deliberately do NOT serve the canonical body itself here — the
    // bundle download is the canonical export. The item endpoint shows
    // metadata only so regulators can navigate without pulling MB of JSON.
    res.json({ item });
  });

  // ── Bundle download (if allow_download) ────────────────────────────────
  router.get('/shared-pack/:token/download', async (req, res) => {
    const r = await resolveShare(req, res, 'download', true);
    if (!r) return;
    if (!r.share.allow_download) return res.status(403).json({ error: 'Download not permitted by this share' });
    try {
      const assembled = await rebuildAssembledPack(db, r.pack.id);
      if (!assembled) return res.status(404).json({ error: 'Pack not found' });
      const buf = await bundleEvidencePackToAnton(db, assembled);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${r.pack.id}.anton"`);
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}

interface ShareRow {
  id: string; pack_id: string; password_hash: string | null;
  recipient_name: string; recipient_organisation: string;
  created_at: string; expires_at: string;
  revoked_at: string | null; allow_download: boolean;
  watermark_text: string | null;
}
interface PackRowMin { id: string; title: string; status: string; created_by: string; scope_ref: unknown }

async function logAccess(
  db: DatabaseAdapter,
  base: { shareId: string; packId: string; action: string; ipAddressHash: string; userAgentHash: string; itemAccessed?: string | null },
  success: boolean, errorReason: string | null,
): Promise<void> {
  try {
    await db.run(
      `INSERT INTO evidence_pack_access_log
         (share_id, pack_id, accessor_type, accessor_id, ip_address_hash,
          user_agent_hash, action, item_accessed, success, error_reason)
       VALUES (?, ?, 'external_auditor', ?, ?, ?, ?, ?, ?, ?)`,
      base.shareId, base.packId, base.shareId,
      base.ipAddressHash, base.userAgentHash,
      base.action, base.itemAccessed ?? null, success, errorReason,
    );
  } catch { /* never fail the request because logging failed */ }
}

/**
 * Reconstitute an AssembledPack from persisted rows. The assembler's hash is
 * deterministic given the same source data, so re-collecting then re-
 * assembling for export is safe (and intentional per spec §13.4: same scope
 * → same hash if no underlying data changed).
 *
 * A finalised pack is pinned to the item set that was signed: rows the
 * collector has since learned to walk (run records, quality scores, reviews,
 * exports) are dropped for packs finalised before they were collected, so
 * such a pack exports with the manifest it was signed with. A source row
 * that changed or vanished after signing still surfaces as a hash mismatch.
 */
async function rebuildAssembledPack(db: DatabaseAdapter, packId: string): Promise<AssembledPack | null> {
  const pack = await readPackRow(db, packId);
  if (!pack) return null;
  const scope = pack.scope_ref as unknown as ScopeDefinition;
  const collected = await collectForScope(db, scope);
  if (pack.status !== 'draft') {
    const signedRows = await db.all<{ item_type: string; item_id: string }>(
      `SELECT item_type, item_id FROM evidence_pack_items WHERE pack_id = ?`, packId,
    );
    const signed = new Set(signedRows.map((r) => `${r.item_type}:${r.item_id}`));
    collected.items = collected.items.filter((i) => signed.has(`${i.itemType}:${i.itemId}`));
  }
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
