/**
 * portals.ts — REST API for Portals (Phase B / Step 12-14, 16).
 *
 * Three audiences:
 *   1. The local owner managing their own portals (CRUD + inbox)
 *   2. The walkthrough UI driving the 8-phase builder
 *   3. The visitor UI rendering another portal's content & invoking caps
 *
 * Owner-side endpoints assume the caller IS the local ANTON owner — auth
 * integration with the broader app is a separate concern (v0.7.x scope).
 */

import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';

import { createPortalDatabaseService } from '../services/portals/portal-database-service.js';
import { createPortalHandler } from '../services/portals/portal-handler.js';
import { createPortalSearchEngine } from '../services/portals/portal-search-engine.js';
import { createWalkthroughEngine } from '../services/portals/portal-walkthrough-engine.js';
import { listTemplates } from '../services/portals/portal-walkthrough-templates.js';
import { bundlePortal, importPortal } from '../services/portals/portal-bundler.js';

// ── Validation schemas ─────────────────────────────────────────────────────

const createWalkthroughSchema = z.object({
  ownerId: z.string().min(1),
  templateId: z.string().min(1),
  modelId: z.string().optional(),
  thinkingLevel: z.enum(['quick', 'think', 'think_hard', 'investigate', 'plan_first', 'deep_investigate']).optional(),
});

const upsertPageSchema = z.object({
  path: z.string().min(1),
  title: z.string().optional(),
  html: z.string().min(1),
  template: z.string().optional(),
  structuredData: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number().int().min(0).optional(),
  visible: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const inboxRespondSchema = z.object({
  status: z.enum(['acknowledged', 'responded', 'rejected']),
  output: z.record(z.string(), z.unknown()).optional(),
  rejection_reason: z.string().optional(),
});

const searchQuerySchema = z.object({
  text: z.string().optional(),
  verbs: z.string().optional(), // CSV
  categories: z.string().optional(), // CSV
  tags: z.string().optional(), // CSV
  serviceAreas: z.string().optional(), // CSV
  languages: z.string().optional(), // CSV
  namespace: z.string().optional(),
  sortBy: z.enum(['relevance', 'recently_active', 'recently_registered']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const inquireSchema = z.object({
  visitorContactHash: z.string().optional(),
});

const invokeSchema = z.object({
  input: z.record(z.string(), z.unknown()),
  visitorContactHash: z.string().optional(),
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// ── Factory ────────────────────────────────────────────────────────────────

export function createPortalsRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const portalDb = createPortalDatabaseService(db);
  const handler = createPortalHandler(db);
  const search = createPortalSearchEngine(db);
  const walkthroughs = createWalkthroughEngine(db);

  // ── Templates + walkthroughs ──────────────────────────────────────────────

  router.get('/portals/templates', (_req, res) => {
    res.json({ templates: listTemplates() });
  });

  router.post('/portals/walkthroughs', async (req, res) => {
    try {
      const parsed = createWalkthroughSchema.parse(req.body);
      const session = await walkthroughs.createSession(parsed);
      res.status(201).json({ session });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.get('/portals/walkthroughs/:id', async (req, res) => {
    try {
      const session = await walkthroughs.getSession(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json({ session });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/portals/walkthroughs/:id/prompt', async (req, res) => {
    try {
      const prompt = await walkthroughs.generatePhasePrompt(req.params.id);
      res.json({ prompt });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/portals/walkthroughs/:id/advance', async (req, res) => {
    try {
      const result = await walkthroughs.advanceSession(req.params.id, req.body);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/portals/walkthroughs/:id/finalize', async (req, res) => {
    try {
      const result = await walkthroughs.finalizeSession(req.params.id);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/portals/walkthroughs/:id/abandon', async (req, res) => {
    try {
      await walkthroughs.abandonSession(req.params.id);
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Discovery: search ─────────────────────────────────────────────────────
  // MUST be declared before /portals/:id, otherwise Express matches "search"
  // as the :id param (which then fails uuid coercion).

  router.get('/portals/search', async (req, res) => {
    try {
      const parsed = searchQuerySchema.parse(req.query);
      const csvToArr = (s: string | undefined) => s ? s.split(',').map(x => x.trim()).filter(Boolean) : undefined;
      const result = await search.search({
        text: parsed.text,
        verbs: csvToArr(parsed.verbs) as never,
        categories: csvToArr(parsed.categories) as never,
        tags: csvToArr(parsed.tags),
        serviceAreas: csvToArr(parsed.serviceAreas),
        languages: csvToArr(parsed.languages),
        namespace: parsed.namespace,
        sortBy: parsed.sortBy,
        limit: parsed.limit,
        offset: parsed.offset,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Owner: portal CRUD ────────────────────────────────────────────────────

  router.get('/portals', async (req, res) => {
    try {
      const ownerId = (req.query.ownerId as string | undefined) ?? null;
      const where = ownerId ? `WHERE metadata->>'ownerId' = ?` : '';
      const params = ownerId ? [ownerId] : [];
      const rows = await db.all(
        `SELECT id, name, namespace, category, display_title, description, status,
                public_index, descriptor_hash, registered_at, last_synced_at,
                created_at, updated_at
         FROM portals ${where}
         ORDER BY created_at DESC`,
        ...params,
      );
      res.json({ portals: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/portals/:id', async (req, res) => {
    try {
      const portal = await db.get(
        `SELECT id, name, namespace, category, display_title, description, status,
                public_index, descriptor_hash, capability_summary,
                registered_at, last_synced_at, created_at, updated_at, metadata
         FROM portals WHERE id = ?`,
        req.params.id,
      );
      if (!portal) return res.status(404).json({ error: 'Portal not found' });

      // Pages count + inbox count for the dashboard.
      const [pageCount, inboxPending] = await Promise.all([
        db.get<{ n: number }>(`SELECT COUNT(*)::int AS n FROM portal_pages WHERE portal_id = ?`, req.params.id),
        db.get<{ n: number }>(`SELECT COUNT(*)::int AS n FROM portal_capability_invocations WHERE portal_id = ? AND status = 'pending'`, req.params.id),
      ]);
      res.json({ portal, pageCount: pageCount?.n ?? 0, inboxPending: inboxPending?.n ?? 0 });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/portals/:id', async (req, res) => {
    try {
      const r = await db.run(`DELETE FROM portals WHERE id = ?`, req.params.id);
      if (r.changes === 0) return res.status(404).json({ error: 'Portal not found' });
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Owner: pages CRUD ─────────────────────────────────────────────────────

  router.get('/portals/:id/pages', async (req, res) => {
    try {
      const pages = await portalDb.listPages(req.params.id);
      res.json({ pages });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/portals/:id/pages', async (req, res) => {
    try {
      const parsed = upsertPageSchema.parse(req.body);
      const page = await portalDb.upsertPage(req.params.id, parsed);
      res.json({ page });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.delete('/portals/:id/pages', async (req, res) => {
    try {
      const path = req.query.path as string | undefined;
      if (!path) return res.status(400).json({ error: 'path query parameter required' });
      const ok = await portalDb.deletePage(req.params.id, path);
      if (!ok) return res.status(404).json({ error: 'Page not found' });
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Owner: inbox ──────────────────────────────────────────────────────────

  router.get('/portals/:id/inbox', async (req, res) => {
    try {
      const status = (req.query.status as string | undefined) ?? null;
      const where = status ? 'AND status = ?' : '';
      const params: unknown[] = [req.params.id];
      if (status) params.push(status);
      const rows = await db.all(
        `SELECT id, capability_id, capability_verb, aap_endpoint,
                visitor_contact_hash, input, output, response_id, status,
                received_at, acknowledged_at, responded_at,
                rejection_reason
         FROM portal_capability_invocations
         WHERE portal_id = ? ${where}
         ORDER BY received_at DESC LIMIT 200`,
        ...params,
      );
      res.json({ invocations: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/portals/:id/inbox/:invId/respond', async (req, res) => {
    try {
      const parsed = inboxRespondSchema.parse(req.body);
      const now = new Date().toISOString();
      const sets: string[] = ['status = ?'];
      const params: unknown[] = [parsed.status];
      if (parsed.status === 'acknowledged') {
        sets.push('acknowledged_at = ?');
        params.push(now);
      } else if (parsed.status === 'responded') {
        sets.push('acknowledged_at = COALESCE(acknowledged_at, ?)', 'responded_at = ?');
        params.push(now, now);
        if (parsed.output !== undefined) {
          sets.push('output = ?');
          params.push(JSON.stringify(parsed.output));
        }
      } else if (parsed.status === 'rejected') {
        sets.push('responded_at = ?');
        params.push(now);
        if (parsed.rejection_reason) {
          sets.push('rejection_reason = ?');
          params.push(parsed.rejection_reason);
        }
      }
      params.push(req.params.invId, req.params.id);
      const r = await db.run(
        `UPDATE portal_capability_invocations SET ${sets.join(', ')}
         WHERE id = ? AND portal_id = ?`,
        ...params,
      );
      if (r.changes === 0) return res.status(404).json({ error: 'Invocation not found' });
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Owner: bundle export / import ─────────────────────────────────────────

  router.get('/portals/:id/bundle', async (req, res) => {
    try {
      const redactToTemplate = req.query.template === '1';
      const buf = await bundlePortal(db, req.params.id, { redactToTemplate });
      const portal = await db.get<{ name: string; namespace: string }>(
        `SELECT name, namespace FROM portals WHERE id = ?`, req.params.id,
      );
      const filename = portal ? `portal-${portal.name}.${portal.namespace}.anton` : 'portal.anton';
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buf);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/portals/import', upload.single('bundle'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'bundle file required' });
      const newName = (req.body?.newName as string | undefined);
      const newNamespace = (req.body?.newNamespace as string | undefined);
      const verifyDescriptorSignature = req.body?.verifyDescriptorSignature !== 'false';
      const result = await importPortal(db, req.file.buffer, { newName, newNamespace, verifyDescriptorSignature });
      const status = result.success ? 201 : 400;
      res.status(status).json(result);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Visitor: fetch + invoke ───────────────────────────────────────────────

  router.get('/portals/visit/:address/page', async (req, res) => {
    try {
      const path = (req.query.path as string | undefined) ?? '/';
      const visitorContactHash = req.query.visitor as string | undefined;
      const r = await handler.handleFetch({
        portalAddress: decodeURIComponent(req.params.address),
        path,
        visitorContactHash,
      });
      if (r.kind === 'page') return res.json({ kind: 'page', html: r.html, title: r.title });
      if (r.kind === 'not_found') return res.status(404).json(r);
      if (r.kind === 'portal_offline') return res.status(503).json(r);
      // 'asset' shouldn't surface via /page; tell the caller to use /asset.
      return res.status(400).json({ kind: 'wrong_route', reason: 'use /asset for asset paths' });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/portals/visit/:address/asset/*', async (req, res) => {
    try {
      const assetPath = (req.params as Record<string, string>)['0'] ?? '';
      const r = await handler.handleFetch({
        portalAddress: decodeURIComponent(req.params.address),
        path: assetPath,
      });
      if (r.kind === 'asset') {
        res.setHeader('Content-Type', r.mimeType);
        res.setHeader('ETag', r.contentHash);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(r.bytes);
      }
      if (r.kind === 'not_found') return res.status(404).json(r);
      if (r.kind === 'portal_offline') return res.status(503).json(r);
      res.status(400).json({ kind: 'wrong_route' });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/portals/visit/:address/capabilities', async (req, res) => {
    try {
      const portalAddress = decodeURIComponent(req.params.address);
      const row = await db.get<{ descriptor: Record<string, unknown> }>(
        `SELECT descriptor FROM portal_descriptor_cache WHERE portal_address = ? AND valid_until > NOW()`,
        portalAddress,
      );
      if (!row) return res.status(404).json({ kind: 'no_descriptor' });
      res.json({ descriptor: row.descriptor });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/portals/visit/:address/capabilities/:capId/inquire', async (req, res) => {
    try {
      const parsed = inquireSchema.parse(req.body);
      const r = await handler.handleInquire({
        portalAddress: decodeURIComponent(req.params.address),
        capabilityId: req.params.capId,
        visitorContactHash: parsed.visitorContactHash,
      });
      const status = r.kind === 'inquire_response' ? 200
        : r.kind === 'capability_not_found' ? 404
          : r.kind === 'portal_offline' ? 503
            : 400;
      res.status(status).json(r);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/portals/visit/:address/capabilities/:capId/invoke', async (req, res) => {
    try {
      const parsed = invokeSchema.parse(req.body);
      const r = await handler.handleInvoke({
        portalAddress: decodeURIComponent(req.params.address),
        capabilityId: req.params.capId,
        input: parsed.input,
        visitorContactHash: parsed.visitorContactHash,
      });
      const status = r.kind === 'invoke_accepted' ? 200
        : r.kind === 'capability_not_found' ? 404
          : r.kind === 'portal_offline' ? 503
            : r.kind === 'trust_required' ? 401
              : 400;
      res.status(status).json(r);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  return router;
}
