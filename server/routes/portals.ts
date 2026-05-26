/**
 * portals.ts — REST API for Portals.
 *
 * Three audiences:
 *   1. The local owner managing their own portals (CRUD + inbox)
 *   2. The walkthrough UI driving the 8-phase builder
 *   3. The visitor UI rendering another portal's content & invoking caps
 *
 * Auth model:
 *   - Owner endpoints (CRUD, pages, inbox-respond, bundle export, walkthroughs):
 *     require an authenticated user (requireAuth). For :id-scoped endpoints
 *     we additionally check that the caller owns the portal via the
 *     `ownerId` stored in `portals.metadata`. The walkthrough's POST creates
 *     a session bound to req.user.id; finalize stamps the portal row's
 *     metadata.ownerId. Pre-auth portals (rare, only relevant for solo-mode
 *     historical state) are owned by the first authenticated caller per
 *     pragmatic legacy compat.
 *   - Visitor endpoints (.../visit/...) and search/templates are public —
 *     anyone can fetch a portal page or invoke a declared capability.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import { requireAuth } from '../middleware/auth.js';

import { createPortalDatabaseService } from '../services/portals/portal-database-service.js';
import { createPortalHandler } from '../services/portals/portal-handler.js';
import { createPortalSearchEngine } from '../services/portals/portal-search-engine.js';
import { createWalkthroughEngine } from '../services/portals/portal-walkthrough-engine.js';
import { listTemplates } from '../services/portals/portal-walkthrough-templates.js';
import { bundlePortal, importPortal } from '../services/portals/portal-bundler.js';
import { suggestPhase, suggestPhaseStream, suggestCapabilitySchema, getSessionCostCents } from '../services/portals/portal-llm-suggest.js';
import { scanLan, listKnownNeighbors } from '../services/portals/portal-lan-discovery.js';
import { rebuildPortalDescriptor, readCurrentCapabilities } from '../services/portals/portal-capabilities-editor.js';
import { verifyAndPersist } from '../services/portals/external-url-verifier.js';
import { getTrustStore } from '../services/registry-client/trust-store.js';
import { fetchSubmissionStatus, RelaySubmitError } from '../services/registry-client/relay-submit.js';
import { CAPABILITY_VERBS } from '../services/capability-descriptor/schema.js';

// ── Owner-check middleware ──────────────────────────────────────────────────
// Used on /portals/:id/* mutations after requireAuth. Verifies that the
// authenticated user (req.user.id) owns the portal at :id (matching the
// metadata.ownerId field). Falls through to the next handler on success;
// 403s on mismatch, 404s if the portal doesn't exist.

function makeRequirePortalOwner(db: DatabaseAdapter) {
  return async function requirePortalOwner(req: Request, res: Response, next: NextFunction) {
    try {
      const portalId = req.params.id;
      if (!portalId) return res.status(400).json({ error: 'Portal id required' });
      if (!req.user?.id) return res.status(401).json({ error: 'Authentication required' });
      const row = await db.get<{ metadata: { ownerId?: string } | null }>(
        `SELECT metadata FROM portals WHERE id = ?`, portalId,
      );
      if (!row) return res.status(404).json({ error: 'Portal not found' });
      const ownerId = row.metadata?.ownerId;
      // Solo-mode legacy compat: portals created before owner stamping have
      // no ownerId; the first authenticated caller in solo mode is allowed
      // through (gates immediately tighten once owner is stamped on next
      // mutation via finalizeSession or POST /portals).
      if (ownerId && ownerId !== req.user.id) {
        return res.status(403).json({ error: 'Not the portal owner' });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  };
}

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

const capabilityEditSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i, 'lowercase slug'),
  verb: z.enum(CAPABILITY_VERBS),
  customVerbName: z.string().optional(),
  title: z.string().min(1).max(120),
  description: z.string().max(2000),
  aapEndpoint: z.string().min(1),
  paymentCoupling: z.record(z.string(), z.unknown()).optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

const capabilitiesUpdateSchema = z.object({
  capabilities: z.array(capabilityEditSchema).min(1).max(20),
});

const portalPatchSchema = z.object({
  display_title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  public_index: z.boolean().optional(),
  // Bring-your-own-site mode. Switching to 'external' requires an
  // external_primary_url; the DB check constraint enforces it too.
  surface_mode: z.enum(['managed', 'external']).optional(),
  external_primary_url: z.string().url().max(2000).nullable().optional(),
});

const invokeSchema = z.object({
  input: z.record(z.string(), z.unknown()),
  visitorContactHash: z.string().optional(),
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Rate-limit visitor capability invokes per IP. The owner's inbox would
// otherwise be a DoS target — anyone could spam it.
const visitorInvokeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30, // 30 invokes per minute per IP — generous for legit visitors
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many capability invocations from this IP. Slow down.' },
});

// ── Factory ────────────────────────────────────────────────────────────────

export function createPortalsRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const portalDb = createPortalDatabaseService(db);
  const handler = createPortalHandler(db);
  const search = createPortalSearchEngine(db);
  const walkthroughs = createWalkthroughEngine(db);
  const requirePortalOwner = makeRequirePortalOwner(db);

  // Helper: assert that the authenticated caller owns the walkthrough session.
  async function assertSessionOwner(req: Request, res: Response): Promise<boolean> {
    const sid = req.params.id;
    const row = await db.get<{ owner_id: string }>(
      `SELECT owner_id FROM portal_walkthrough_sessions WHERE id = ?`, sid,
    );
    if (!row) { res.status(404).json({ error: 'Session not found' }); return false; }
    if (row.owner_id !== req.user!.id) { res.status(403).json({ error: 'Not the session owner' }); return false; }
    return true;
  }

  // ── Templates + walkthroughs ──────────────────────────────────────────────

  // Public: anyone can list templates.
  router.get('/portals/templates', (_req, res) => {
    res.json({ templates: listTemplates() });
  });

  // Public: this instance's public portal directory. Consumed by peer ANTONs
  // doing LAN discovery — they fetch this after mDNS-finding us, then ingest
  // each entry into their portal_descriptor_cache with origin_endpoint set
  // to our http://host:port. Returns only active + public_index portals.
  // Intentionally unauthenticated: the descriptor envelope is signed with
  // the portal's Ed25519 key, so peers can verify integrity without trusting
  // us. Sensitive material (private_key_pem, owner metadata) never appears.
  router.get('/portals/public-directory', async (_req, res) => {
    try {
      const rows = await db.all<{
        portal_address: string; descriptor_hash: string;
        descriptor: Record<string, unknown> | string;
        signature: string; signing_key_fingerprint: string;
        valid_from: string; valid_until: string;
      }>(
        `SELECT c.portal_address, c.descriptor_hash, c.descriptor,
                c.signature, c.signing_key_fingerprint,
                c.valid_from, c.valid_until
         FROM portal_descriptor_cache c
         JOIN portals p ON p.name || '.' || p.namespace || '.portal' = c.portal_address
         WHERE p.status = 'active' AND p.public_index = TRUE
           AND c.origin_endpoint IS NULL
         ORDER BY p.created_at DESC
         LIMIT 500`,
      );
      const portals = rows.map((r) => ({
        portalAddress: r.portal_address,
        descriptorHash: r.descriptor_hash,
        descriptor: typeof r.descriptor === 'string' ? JSON.parse(r.descriptor) : r.descriptor,
        signature: r.signature,
        signingKeyFingerprint: r.signing_key_fingerprint,
        validFrom: r.valid_from,
        validUntil: r.valid_until,
      }));
      res.json({
        instance: {
          name: process.env.APP_GATEWAY_INSTANCE_NAME || process.env.APP_GATEWAY_MDNS_NAME || 'ANTON',
        },
        portals,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Owner: trigger an mDNS scan of the LAN, fetch each peer's public
  // directory, ingest into the descriptor cache as remote-origin entries.
  // Owner-only because scanning is mildly costly (mDNS + N HTTP fetches)
  // and surfaces external state into the user's discovery UI.
  router.post('/portals/lan/scan', requireAuth, async (_req, res) => {
    try {
      const port = Number(process.env.PORT) || 3001;
      const result = await scanLan(db, port);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Owner: list LAN neighbors we've discovered + their last-scan health.
  // Powers the "On your LAN" section of /portals/discovery.
  router.get('/portals/lan/neighbors', requireAuth, async (_req, res) => {
    try {
      const neighbors = await listKnownNeighbors(db);
      res.json({ neighbors });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Owner: install / replace the trust bundle. Trust bundles ship the
  // registry operator's Ed25519 public key — without one, STH proofs from
  // the registry can't be verified and we can only do best-effort lookups.
  // Body is JSON matching the TrustBundle shape; we validate before swapping
  // the in-process singleton.
  const trustedOperatorSchema = z.object({
    operatorId: z.string().min(1),
    namespaces: z.array(z.string().min(1)).min(1),
    publicKeyHex: z.string().regex(/^[0-9a-fA-F]+$/, 'publicKeyHex must be hex'),
    publicKeyFingerprint: z.string().min(1),
    bundleDate: z.string().min(1),
    expiresAt: z.string().min(1),
    rotatedToOperatorId: z.string().optional(),
  });
  const trustBundleSchema = z.object({
    trustStoreVersion: z.number().int().positive(),
    registryOperators: z.array(trustedOperatorSchema).min(1),
  });
  router.post('/portals/trust-bundle', requireAuth, async (req, res) => {
    try {
      const parsed = trustBundleSchema.parse(req.body);
      // Reject placeholder keys to stop accidental no-op uploads.
      const placeholders = parsed.registryOperators.filter((op) => op.publicKeyHex.startsWith('__PENDING_'));
      if (placeholders.length > 0) {
        return res.status(400).json({
          error: 'Bundle still contains placeholder operator keys: '
            + placeholders.map((p) => p.operatorId).join(', '),
        });
      }
      getTrustStore().replace(parsed);
      const snap = getTrustStore().snapshot();
      res.json({
        installed: true,
        trustStoreVersion: snap.trustStoreVersion,
        operators: snap.registryOperators.map((op) => ({
          operatorId: op.operatorId,
          namespaces: op.namespaces,
          publicKeyFingerprint: op.publicKeyFingerprint,
          bundleDate: op.bundleDate,
          expiresAt: op.expiresAt,
        })),
      });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // Public: trust-bundle status for the UI banner. Tells the client whether
  // the registry operator's public key is the bundled placeholder (in which
  // case STH verification can't succeed and registry submissions are best-
  // effort only) or a real key from a trust-bundle update.
  router.get('/portals/trust-bundle/status', (_req, res) => {
    const store = getTrustStore();
    const futurechain = store.forNamespace('futurechain');
    res.json({
      registryUrl: process.env.PORTAL_REGISTRY_URL ?? null,
      operators: store.snapshot().registryOperators.map((op) => ({
        operatorId: op.operatorId,
        namespaces: op.namespaces,
        isPlaceholder: store.isPlaceholder(op.operatorId),
        bundleDate: op.bundleDate,
        expiresAt: op.expiresAt,
      })),
      futurechainPlaceholder: futurechain ? store.isPlaceholder(futurechain.operatorId) : true,
    });
  });

  // Public: combined registry-readiness check. Aggregates trust-bundle status
  // with a live reachability probe to PORTAL_REGISTRY_URL so the UI can show
  // one decisive state (configured / unreachable / placeholder / ready).
  router.get('/portals/registry-status', async (_req, res) => {
    const store = getTrustStore();
    const futurechain = store.forNamespace('futurechain');
    const registryUrl = process.env.PORTAL_REGISTRY_URL ?? null;
    const futurechainPlaceholder = futurechain ? store.isPlaceholder(futurechain.operatorId) : true;

    let reachable: boolean | null = null;
    let reachabilityError: string | null = null;

    if (registryUrl) {
      try {
        const probeUrl = `${registryUrl.replace(/\/$/, '')}/health`;
        const probe = await fetch(probeUrl, { signal: AbortSignal.timeout(3000) });
        reachable = probe.ok;
        if (!probe.ok) reachabilityError = `HTTP ${probe.status}`;
      } catch (err) {
        reachable = false;
        reachabilityError = err instanceof Error ? err.message : String(err);
      }
    }

    // Decisive state for the UI:
    //   ready          — registry URL set + reachable + non-placeholder operator key
    //   placeholder    — registry URL set + reachable + operator key is the bundled placeholder
    //   unreachable    — registry URL set but server didn't respond
    //   local_only     — no registry URL configured; portals live on this machine + LAN only
    let state: 'ready' | 'placeholder' | 'unreachable' | 'local_only';
    if (!registryUrl) state = 'local_only';
    else if (reachable === false) state = 'unreachable';
    else if (futurechainPlaceholder) state = 'placeholder';
    else state = 'ready';

    res.json({
      state,
      registryUrl,
      reachable,
      reachabilityError,
      futurechainPlaceholder,
      hint: {
        ready: 'Portals you publish will register with the federated registry.',
        placeholder: 'Registry is reachable but using the bundled placeholder operator key. STH verification can\'t succeed yet.',
        unreachable: 'Registry URL is configured but the server isn\'t responding. Portals will be published locally and submission will retry in the background.',
        local_only: 'No registry configured. Portals will be visible on this machine and the local network only. Set PORTAL_REGISTRY_URL in .env to publish to the federated registry.',
      }[state],
    });
  });

  router.post('/portals/walkthroughs', requireAuth, async (req, res) => {
    try {
      // Always stamp ownerId from the authenticated user — never trust the body.
      const parsed = createWalkthroughSchema.parse({ ...req.body, ownerId: req.user!.id });
      const session = await walkthroughs.createSession(parsed);
      res.status(201).json({ session });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.get('/portals/walkthroughs/:id', requireAuth, async (req, res) => {
    try {
      if (!await assertSessionOwner(req, res)) return;
      const session = await walkthroughs.getSession(String(req.params.id));
      if (!session) return res.status(404).json({ error: 'Session not found' });
      res.json({ session });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/portals/walkthroughs/:id/prompt', requireAuth, async (req, res) => {
    try {
      if (!await assertSessionOwner(req, res)) return;
      const prompt = await walkthroughs.generatePhasePrompt(String(req.params.id));
      res.json({ prompt });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/portals/walkthroughs/:id/advance', requireAuth, async (req, res) => {
    try {
      if (!await assertSessionOwner(req, res)) return;
      const result = await walkthroughs.advanceSession(String(req.params.id), req.body);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/portals/walkthroughs/:id/finalize', requireAuth, async (req, res) => {
    try {
      if (!await assertSessionOwner(req, res)) return;
      // Step 11: caller may pass kyc fields in the body to trigger
      // relay submission. The walkthrough engine validates the shape
      // by passing it through to submitToRelay; we don't double-validate
      // here so the relay's error codes propagate verbatim.
      const kyc = (req.body && typeof req.body === 'object' && 'kyc' in req.body)
        ? (req.body as { kyc?: unknown }).kyc as never
        : undefined;
      const result = await walkthroughs.finalizeSession(String(req.params.id), { kyc });
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // Auto-save the in-flight phase draft. Lightweight: does NOT advance the
  // phase or validate against the phase schema — just stores the partial
  // input so the user doesn't lose work if they navigate away mid-phase.
  // Stored under accumulated_state.__drafts.<phaseId> so it doesn't collide
  // with the validated outputs the engine writes on advance.
  router.put('/portals/walkthroughs/:id/draft', requireAuth, async (req, res) => {
    try {
      if (!await assertSessionOwner(req, res)) return;
      const sessionRow = await db.get<{ accumulated_state: Record<string, unknown> | string; current_phase: string }>(
        `SELECT accumulated_state, current_phase FROM portal_walkthrough_sessions WHERE id = ?`,
        req.params.id,
      );
      if (!sessionRow) return res.status(404).json({ error: 'Session not found' });
      const acc = typeof sessionRow.accumulated_state === 'string'
        ? JSON.parse(sessionRow.accumulated_state) : sessionRow.accumulated_state;
      const drafts = (acc.__drafts as Record<string, unknown> | undefined) ?? {};
      drafts[sessionRow.current_phase] = req.body;
      acc.__drafts = drafts;
      await db.run(
        `UPDATE portal_walkthrough_sessions SET accumulated_state = ? WHERE id = ?`,
        JSON.stringify(acc), req.params.id,
      );
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.post('/portals/walkthroughs/:id/abandon', requireAuth, async (req, res) => {
    try {
      if (!await assertSessionOwner(req, res)) return;
      await walkthroughs.abandonSession(String(req.params.id));
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // LLM-driven phase suggestion. Calls the configured provider (Anthropic /
  // OpenAI / etc.), validates against PHASE_SCHEMAS[phase], persists as a
  // draft under accumulated_state.__drafts.<phase>, and records a cost row.
  // The UI reads the suggestion to populate the form; the user still
  // confirms via the existing /advance endpoint.
  router.post('/portals/walkthroughs/:id/llm-suggest', requireAuth, async (req, res) => {
    try {
      if (!await assertSessionOwner(req, res)) return;
      const r = await suggestPhase(db, String(req.params.id));
      switch (r.kind) {
        case 'ok':
          return res.status(200).json({
            phase: r.phase,
            suggestion: r.suggestion,
            usage: r.usage,
          });
        case 'parse_error':
          return res.status(422).json({
            error: { kind: r.kind, phase: r.phase, reason: r.reason, retryable: r.retryable },
          });
        case 'shape_error':
          return res.status(422).json({
            error: { kind: r.kind, phase: r.phase, zodErrors: r.zodErrors, retryable: r.retryable },
          });
        case 'cap_exceeded':
          return res.status(429).json({
            error: { kind: r.kind, phase: r.phase, limit: r.limit },
          });
        case 'no_provider':
          return res.status(503).json({
            error: { kind: r.kind, reason: r.reason },
          });
        case 'session_inactive':
          // not_found vs already-finalized
          return res.status(r.status === 'not_found' ? 404 : 409).json({
            error: { kind: r.kind, status: r.status },
          });
        case 'provider_error':
          return res.status(502).json({
            error: { kind: r.kind, phase: r.phase, message: r.message },
          });
      }
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Per-capability schema suggestion. Phase-5's lowest-friction unlock: the user
  // names a capability + verb, then describes in natural language what they
  // collect. LLM returns inputSchema + outputSchema for that single capability.
  // Costs one walkthrough cap slot.
  router.post('/portals/walkthroughs/:id/capability-schema', requireAuth, async (req, res) => {
    try {
      if (!await assertSessionOwner(req, res)) return;
      const body = req.body as {
        verb?: string;
        capabilityTitle?: string;
        capabilityDescription?: string;
        collectionDescription?: string;
      };
      if (!body.verb || typeof body.verb !== 'string') {
        return res.status(400).json({ error: 'verb is required' });
      }
      if (!body.capabilityTitle || typeof body.capabilityTitle !== 'string') {
        return res.status(400).json({ error: 'capabilityTitle is required' });
      }
      if (!body.collectionDescription || typeof body.collectionDescription !== 'string' || body.collectionDescription.trim().length < 5) {
        return res.status(400).json({ error: 'collectionDescription must be at least 5 characters describing what visitors send' });
      }

      const r = await suggestCapabilitySchema(db, String(req.params.id), {
        verb: body.verb,
        capabilityTitle: body.capabilityTitle,
        capabilityDescription: body.capabilityDescription,
        collectionDescription: body.collectionDescription,
      });
      switch (r.kind) {
        case 'ok':
          return res.status(200).json({
            inputSchema: r.inputSchema,
            outputSchema: r.outputSchema,
            notes: r.notes,
            usage: r.usage,
          });
        case 'parse_error':
          return res.status(422).json({ error: { kind: r.kind, reason: r.reason } });
        case 'shape_error':
          return res.status(422).json({ error: { kind: r.kind, zodErrors: r.zodErrors } });
        case 'cap_exceeded':
          return res.status(429).json({ error: { kind: r.kind, limit: r.limit } });
        case 'no_provider':
          return res.status(503).json({ error: { kind: r.kind, reason: r.reason } });
        case 'session_inactive':
          return res.status(r.status === 'not_found' ? 404 : 409).json({ error: { kind: r.kind, status: r.status } });
        case 'provider_error':
          return res.status(502).json({ error: { kind: r.kind, message: r.message } });
      }
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Streaming variant of /llm-suggest. SSE — emits text_delta/thinking_delta
  // tokens as the LLM generates them, then a final `event: complete` with
  // {phase, suggestion, usage} or `event: error` with the failure shape.
  // Used by the builder for content_generation (long output) so the user
  // sees progress instead of a 30-second blank loader. Other phases keep
  // using the synchronous endpoint above — short output, no UX gain.
  router.post('/portals/walkthroughs/:id/llm-suggest/stream', requireAuth, async (req, res) => {
    try {
      if (!await assertSessionOwner(req, res)) return;
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      await suggestPhaseStream(db, String(req.params.id), res);
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err) {
      // If we never got past the headers, fall back to a JSON 500. After
      // streaming begins, just emit an SSE error event and end the stream.
      if (!res.headersSent) {
        res.status(500).json({ error: safeError(err) });
        return;
      }
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ kind: 'internal_error', message: String(err) })}\n\n`);
        res.write('data: [DONE]\n\n');
      } finally {
        res.end();
      }
    }
  });

  // Render an in-flight walkthrough page as HTML, for the review-phase
  // preview iframe. Reads pages from accumulated_state.content_generation
  // rather than the portals table (which doesn't exist yet pre-finalize).
  // Only does simple {{title}} / {{portal.*}} / {{data.*}} substitution —
  // {{#each}} blocks and asset lookups are skipped since neither the
  // structured_data nor portal_assets rows exist yet.
  router.get('/portals/walkthroughs/:id/preview', requireAuth, async (req, res) => {
    try {
      if (!await assertSessionOwner(req, res)) return;
      const requestedPath = (req.query.path as string | undefined) ?? '/';
      const session = await db.get<{ accumulated_state: Record<string, unknown> | string }>(
        `SELECT accumulated_state FROM portal_walkthrough_sessions WHERE id = ?`,
        req.params.id,
      );
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const acc = typeof session.accumulated_state === 'string'
        ? JSON.parse(session.accumulated_state) : session.accumulated_state;
      const identity = (acc.identity ?? {}) as { name?: string; namespace?: string; display_title?: string; category?: string };
      const generation = (acc.content_generation ?? {}) as { pages?: Array<{ path: string; html: string; structured_data?: Record<string, unknown> }> };
      const page = (generation.pages ?? []).find((p) => p.path === requestedPath)
        ?? (generation.pages ?? [])[0];
      if (!page) return res.status(404).json({ error: 'No page in draft' });

      const { renderSimpleSubstitutionsOnly } = await import('../services/portals/portal-renderer.js');
      const html = renderSimpleSubstitutionsOnly({
        page: {
          path: page.path, title: identity.display_title ?? null,
          html: page.html, sortOrder: 0, updatedAt: new Date().toISOString(),
          structuredData: page.structured_data ?? null,
        },
        portal: {
          address: `${identity.name ?? 'preview'}.${identity.namespace ?? 'preview'}.portal`,
          name: identity.name ?? 'preview',
          namespace: identity.namespace ?? 'preview',
          displayTitle: identity.display_title ?? null,
          category: identity.category ?? 'personal',
        },
      });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(html);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Cumulative session cost (USD cents) — feeds the cost chip in the
  // walkthrough header so the user can see what they've spent.
  router.get('/portals/walkthroughs/:id/cost', requireAuth, async (req, res) => {
    try {
      if (!await assertSessionOwner(req, res)) return;
      const costUsdCents = await getSessionCostCents(db, String(req.params.id));
      const callRow = await db.get<{ llm_calls_used: number }>(
        `SELECT llm_calls_used FROM portal_walkthrough_sessions WHERE id = ?`, req.params.id,
      );
      res.json({
        costUsdCents,
        callsUsed: callRow?.llm_calls_used ?? 0,
        callLimit: 16,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Cross-portal inbox: aggregates invocations across owner's portals ────
  // MUST be declared before /portals/:id (Express ordering — "inbox" would
  // otherwise be matched as the UUID :id param).

  router.get('/portals/inbox', requireAuth, async (req, res) => {
    try {
      const status = (req.query.status as string | undefined) ?? null;
      const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
      const ownerId = req.user!.id;
      const where = [`p.metadata->>'ownerId' = ?`];
      const params: unknown[] = [ownerId];
      if (status) {
        where.push('inv.status = ?');
        params.push(status);
      }
      const queryParams = [...params, limit];
      const rows = await db.all(
        `SELECT inv.id, inv.portal_id, p.name AS portal_name, p.namespace AS portal_namespace,
                p.display_title AS portal_title,
                inv.capability_id, inv.capability_verb, inv.aap_endpoint,
                inv.visitor_contact_hash, inv.input, inv.output, inv.response_id,
                inv.status, inv.received_at, inv.acknowledged_at, inv.responded_at,
                inv.rejection_reason
         FROM portal_capability_invocations inv
         JOIN portals p ON p.id = inv.portal_id
         WHERE ${where.join(' AND ')}
         ORDER BY inv.received_at DESC LIMIT ?`,
        ...queryParams,
      );
      const totalRow = await db.get<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM portal_capability_invocations inv
         JOIN portals p ON p.id = inv.portal_id
         WHERE ${where.join(' AND ')}`,
        ...params,
      );
      res.json({ invocations: rows, total: totalRow?.n ?? 0 });
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

  // Owner-portal list handler. Shared by GET /portals and GET /portals/mine
  // so both URLs return the same payload. The /mine alias pins the historical
  // regression (audit-notes §6 D7) where calling /api/portals/mine matched
  // /portals/:id with id='mine' and PostgreSQL rejected "mine" as a UUID.
  // See tests/routes/portals-mine.test.ts.
  const listOwnedPortals: import('express').RequestHandler = async (req, res) => {
    try {
      const ownerId = req.user!.id;
      const rows = await db.all(
        `SELECT id, name, namespace, category, display_title, description, status,
                public_index, descriptor_hash, registered_at, last_synced_at,
                created_at, updated_at
         FROM portals WHERE metadata->>'ownerId' = ?
         ORDER BY created_at DESC`,
        ownerId,
      );
      res.json({ portals: rows });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[portals] GET /api/portals failed:', msg, err);
      res.status(500).json({ error: safeError(err) });
    }
  };

  router.get('/portals', requireAuth, listOwnedPortals);
  // /portals/mine alias — must be registered BEFORE /portals/:id so Express
  // matches it first.
  router.get('/portals/mine', requireAuth, listOwnedPortals);

  router.get('/portals/:id', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const portal = await db.get(
        `SELECT id, name, namespace, category, display_title, description, status,
                public_index, descriptor_hash, capability_summary,
                surface_mode, external_primary_url, external_url_verified_at,
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

  // Step 11: poll the relay for the current submission status of this
  // portal. The portal row's metadata.relayStatus is whatever was last
  // observed; this endpoint refreshes it by hitting the relay's
  // /v1/portals/submissions/:id/status, then persists the result so
  // subsequent reads don't need a round-trip.
  //
  // Returns 200 with the current status even if the relay can't be
  // reached — the caller gets stale-but-known state plus a 'syncOk'
  // field so the UI can show "last refreshed at" honestly.
  router.get('/portals/:id/relay-status', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const row = await db.get<{ metadata: Record<string, unknown> | string | null }>(
        `SELECT metadata FROM portals WHERE id = ?`,
        req.params.id,
      );
      if (!row) return res.status(404).json({ error: 'Portal not found' });
      const meta = typeof row.metadata === 'string'
        ? (JSON.parse(row.metadata) as Record<string, unknown>)
        : (row.metadata ?? {});
      const submissionId = meta.relaySubmissionId as string | undefined;
      const baseUrl = meta.relayBaseUrl as string | undefined;
      if (!submissionId || !baseUrl) {
        return res.json({
          syncOk: true,
          submitted: false,
          message: 'Portal has not been submitted to the relay.',
        });
      }
      try {
        const status = await fetchSubmissionStatus(baseUrl, submissionId);
        // Patch metadata if anything changed.
        const patch: Record<string, unknown> = {
          relayStatus: status.status,
          relayReviewedAt: status.reviewedAt,
          relayRejectionReason: status.rejectionReason,
          relayLastSyncedAt: new Date().toISOString(),
        };
        await db.run(
          `UPDATE portals SET metadata = metadata || ?::jsonb WHERE id = ?`,
          JSON.stringify(patch),
          req.params.id,
        );
        res.json({ syncOk: true, submitted: true, ...status });
      } catch (err) {
        // Network / 5xx — return stale state from metadata with a
        // signal that the sync failed.
        const errorCode = err instanceof RelaySubmitError ? err.code : 'sync_failed';
        res.json({
          syncOk: false,
          submitted: true,
          submissionId,
          stale: true,
          stickyStatus: meta.relayStatus ?? null,
          stickyReviewedAt: meta.relayReviewedAt ?? null,
          stickyRejectionReason: meta.relayRejectionReason ?? null,
          syncError: errorCode,
        });
      }
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Patch portal-level fields. When public_index changes, the descriptor
  // must be re-signed because discoveryMetadata depends on it; we route
  // through rebuildPortalDescriptor in that case to keep cache + portal row
  // + capability_summary atomic.
  router.patch('/portals/:id', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const parsed = portalPatchSchema.parse(req.body);

      // Integrity check before hitting the DB: switching to external
      // requires a URL; managed may clear the URL.
      if (parsed.surface_mode === 'external' && !parsed.external_primary_url) {
        const current = await db.get<{ external_primary_url: string | null }>(
          `SELECT external_primary_url FROM portals WHERE id = ?`, req.params.id,
        );
        if (!current?.external_primary_url) {
          return res.status(400).json({ error: 'external_primary_url is required when switching to external mode' });
        }
      }

      const surfaceChanged =
        parsed.surface_mode !== undefined || parsed.external_primary_url !== undefined;

      // Identity + surface changes that DON'T flip public_index: update the
      // row in place, then rebuild the descriptor if surface changed so the
      // signed envelope reflects the new surface block.
      if (parsed.public_index === undefined && !surfaceChanged) {
        const sets: string[] = ['updated_at = NOW()'];
        const params: unknown[] = [];
        if (parsed.display_title !== undefined) { sets.push('display_title = ?'); params.push(parsed.display_title); }
        if (parsed.description !== undefined) { sets.push('description = ?'); params.push(parsed.description); }
        if (params.length === 0) return res.status(400).json({ error: 'No updatable fields supplied' });
        params.push(req.params.id);
        await db.run(`UPDATE portals SET ${sets.join(', ')} WHERE id = ?`, ...params);
      } else {
        if (surfaceChanged) {
          const sets: string[] = ['updated_at = NOW()'];
          const params: unknown[] = [];
          if (parsed.surface_mode !== undefined) {
            sets.push('surface_mode = ?'); params.push(parsed.surface_mode);
          }
          if (parsed.external_primary_url !== undefined) {
            sets.push('external_primary_url = ?'); params.push(parsed.external_primary_url);
            sets.push('external_url_verified_at = NULL');
          }
          params.push(req.params.id);
          await db.run(`UPDATE portals SET ${sets.join(', ')} WHERE id = ?`, ...params);
        }
        const caps = await readCurrentCapabilities(db, String(req.params.id));
        await rebuildPortalDescriptor(db, String(req.params.id), caps, {
          displayTitle: parsed.display_title,
          description: parsed.description,
          publicIndex: parsed.public_index,
        });
      }
      // Kick off a reachability check in the background so a slow
      // external host can't stall the PATCH response. The timestamp
      // will appear on the next GET.
      if (parsed.external_primary_url || parsed.surface_mode === 'external') {
        const portalId = String(req.params.id);
        void verifyAndPersist(db, portalId).catch(() => undefined);
      }
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // Manual re-check of the external surface URL. Returns the verify
  // result + the new external_url_verified_at so the UI can update
  // without a second GET.
  router.post('/portals/:id/verify-external-url', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const portalId = String(req.params.id);
      const result = await verifyAndPersist(db, portalId);
      if (!result) {
        return res.status(400).json({ error: 'Portal is not in external surface mode' });
      }
      res.json({
        ok: result.ok,
        status: result.status,
        reason: result.reason,
        verifiedAt: result.ok ? result.checkedAt : null,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Read current capabilities (extracted from cached descriptor) — used by
  // the edit UI to seed its form.
  router.get('/portals/:id/capabilities', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const capabilities = await readCurrentCapabilities(db, String(req.params.id));
      res.json({ capabilities });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Replace the portal's capabilities. Triggers a full descriptor rebuild +
  // re-sign + cache update inside one transaction. Visitors fetching
  // /capabilities get the new descriptor on their next request — there's no
  // explicit cache invalidation step.
  router.put('/portals/:id/capabilities', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const parsed = capabilitiesUpdateSchema.parse(req.body);
      const result = await rebuildPortalDescriptor(db, String(req.params.id), parsed.capabilities);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.delete('/portals/:id', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const r = await db.run(`DELETE FROM portals WHERE id = ?`, req.params.id);
      if (r.changes === 0) return res.status(404).json({ error: 'Portal not found' });
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Owner: pages CRUD ─────────────────────────────────────────────────────

  router.get('/portals/:id/pages', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const pages = await portalDb.listPages(String(req.params.id));
      res.json({ pages });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.put('/portals/:id/pages', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const parsed = upsertPageSchema.parse(req.body);
      const page = await portalDb.upsertPage(String(req.params.id), parsed);
      res.json({ page });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.delete('/portals/:id/pages', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const path = req.query.path as string | undefined;
      if (!path) return res.status(400).json({ error: 'path query parameter required' });
      const ok = await portalDb.deletePage(String(req.params.id), path);
      if (!ok) return res.status(404).json({ error: 'Page not found' });
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Owner: assets (logos, images, files referenced via {{asset:path}}) ────

  router.get('/portals/:id/assets', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const assets = await portalDb.listAssets(String(req.params.id));
      res.json({ assets });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Multipart upload — `file` is the binary body, `path` is the asset path
  // (form field). Reuses the same multer instance as portal bundle imports.
  router.post('/portals/:id/assets', requireAuth, requirePortalOwner, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file required' });
      const path = (req.body?.path as string | undefined)?.trim();
      if (!path) return res.status(400).json({ error: 'path field required' });
      const asset = await portalDb.upsertAsset(String(req.params.id), {
        path,
        mimeType: req.file.mimetype || 'application/octet-stream',
        content: req.file.buffer,
      });
      // Strip the bytes from the response — the client already has them.
      res.status(201).json({ asset: { ...asset, content: undefined } });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.delete('/portals/:id/assets', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const path = req.query.path as string | undefined;
      if (!path) return res.status(400).json({ error: 'path query parameter required' });
      const ok = await portalDb.deleteAsset(String(req.params.id), path);
      if (!ok) return res.status(404).json({ error: 'Asset not found' });
      res.status(204).end();
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Owner: inbox ──────────────────────────────────────────────────────────

  router.get('/portals/:id/inbox', requireAuth, requirePortalOwner, async (req, res) => {
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

  router.post('/portals/:id/inbox/:invId/respond', requireAuth, requirePortalOwner, async (req, res) => {
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

  // ── Owner: stats — aggregated invocation counts per capability ────────────
  // One row per declared capability with totals per status. Driven entirely
  // from portal_capability_invocations so deleted capabilities still show up
  // (helpful during audits — "this used to be a thing, here's what happened").
  router.get('/portals/:id/stats', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const rows = await db.all<{
        capability_id: string; capability_verb: string;
        total: number; pending: number; acknowledged: number;
        responded: number; rejected: number;
        last_received_at: string | null;
      }>(
        `SELECT capability_id, capability_verb,
                COUNT(*)::int AS total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)::int AS pending,
                SUM(CASE WHEN status = 'acknowledged' THEN 1 ELSE 0 END)::int AS acknowledged,
                SUM(CASE WHEN status = 'responded' THEN 1 ELSE 0 END)::int AS responded,
                SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END)::int AS rejected,
                MAX(received_at) AS last_received_at
         FROM portal_capability_invocations
         WHERE portal_id = ?
         GROUP BY capability_id, capability_verb
         ORDER BY total DESC, capability_id ASC`,
        req.params.id,
      );
      res.json({ stats: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Owner: bundle export / import ─────────────────────────────────────────

  router.get('/portals/:id/bundle', requireAuth, requirePortalOwner, async (req, res) => {
    try {
      const redactToTemplate = req.query.template === '1';
      const buf = await bundlePortal(db, String(req.params.id), { redactToTemplate });
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

  router.post('/portals/import', requireAuth, upload.single('bundle'), async (req, res) => {
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

  // Public: list visible pages for a portal address. Used by the visitor
  // page's nav rail. For local portals we read straight from portal_pages;
  // for LAN-discovered remotes we proxy the same endpoint on the origin.
  router.get('/portals/visit/:address/pages', async (req, res) => {
    try {
      const portalAddress = decodeURIComponent(req.params.address);
      const remote = await db.get<{ origin_endpoint: string | null }>(
        `SELECT origin_endpoint FROM portal_descriptor_cache WHERE portal_address = ?`,
        portalAddress,
      );
      if (remote?.origin_endpoint) {
        try {
          const r = await fetch(`${remote.origin_endpoint}/api/portals/visit/${encodeURIComponent(portalAddress)}/pages`);
          if (!r.ok) return res.status(r.status).json({ error: 'Remote returned non-OK' });
          return res.json(await r.json());
        } catch {
          return res.status(503).json({ error: 'Remote portal unreachable' });
        }
      }
      const m = portalAddress.match(/^([^.]+(?:\.[^.]+)*)\.([^.]+)\.portal$/);
      if (!m) return res.status(400).json({ error: 'Invalid portal address' });
      const rows = await db.all<{ path: string; title: string | null; sort_order: number }>(
        `SELECT pp.path, pp.title, pp.sort_order
         FROM portal_pages pp
         JOIN portals p ON p.id = pp.portal_id
         WHERE p.name = ? AND p.namespace = ? AND p.status = 'active' AND pp.visible = TRUE
         ORDER BY pp.sort_order ASC, pp.path ASC`,
        m[1], m[2],
      );
      res.json({ pages: rows.map((r) => ({ path: r.path, title: r.title, sortOrder: r.sort_order })) });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

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
      const assetPath = String((req.params as Record<string, unknown>)['0'] ?? '');
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

  router.post('/portals/visit/:address/capabilities/:capId/invoke', visitorInvokeLimiter, async (req, res) => {
    try {
      const parsed = invokeSchema.parse(req.body);
      const r = await handler.handleInvoke({
        portalAddress: decodeURIComponent(String(req.params.address)),
        capabilityId: String(req.params.capId),
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
