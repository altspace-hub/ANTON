/**
 * portal-handler.ts — visitor-facing handlers invoked by the Companion App
 * Gateway when another ANTON connects to fetch this portal or invoke a
 * declared capability.
 *
 * Per Spec v0.2 §C.4 (transport reframed onto the Gateway) + Capability
 * Schema §3.3 message types: this handler dispatches three Gateway message
 * types:
 *
 *   portal_fetch       — return a page (HTML) or asset (binary)
 *   capability_inquire — return descriptor metadata + availability + SLA
 *                        without writing to the inbox (read-only probe)
 *   capability_invoke  — validate input against capability inputSchema,
 *                        write to portal_capability_invocations inbox,
 *                        return a structured response with response_id
 *
 * The Gateway routing wiring (mapping inbound messages → these handlers)
 * lives in app-gateway.ts; this file is pure logic + DB I/O so it can be
 * unit-tested without standing up a Gateway.
 */

import { randomUUID } from 'crypto';

import type { DatabaseAdapter } from '../../db/database.js';
import { childLogger } from '../../lib/logger.js';
import { validateAgainstSchema } from '../capability-descriptor/validator.js';
import { createAppCheckpointService } from '../app-checkpoint-service.js';
import { createPortalDatabaseService, type PortalDatabaseService } from './portal-database-service.js';
import { createPortalRenderer, type PortalRenderer } from './portal-renderer.js';

const log = childLogger('portal-handler');

// ── Request / response shapes ──────────────────────────────────────────────

export interface PortalFetchRequest {
  portalAddress: string; // "<name>.<namespace>.portal"
  path: string; // "/" or "/about" for pages; "logo.png" for assets
  visitorContactHash?: string; // optional — anonymous browsing allowed
}

export type PortalFetchResponse =
  | { kind: 'page'; html: string; title: string | null; mimeType: 'text/html' }
  | { kind: 'asset'; bytes: Buffer; mimeType: string; contentHash: string }
  | { kind: 'not_found'; reason: string }
  | { kind: 'portal_offline'; reason: string };

export interface CapabilityInquireRequest {
  portalAddress: string;
  capabilityId: string;
  visitorContactHash?: string;
}

export type CapabilityInquireResponse =
  | {
      kind: 'inquire_response';
      capability: {
        id: string;
        verb: string;
        title: string;
        description: string;
        slaHints?: Record<string, unknown>;
        availability?: Record<string, unknown>;
        paymentCoupling?: Record<string, unknown>;
        trustRequirements?: Record<string, unknown>;
      };
      portal: {
        displayTitle: string;
        category: string;
        timezone?: string;
      };
    }
  | { kind: 'capability_not_found'; reason: string }
  | { kind: 'portal_offline'; reason: string };

export interface CapabilityInvokeRequest {
  portalAddress: string;
  capabilityId: string;
  input: Record<string, unknown>;
  visitorContactHash?: string;
}

export type CapabilityInvokeResponse =
  | {
      kind: 'invoke_accepted';
      responseId: string;
      invocationId: string;
      verb: string;
      output: Record<string, unknown>;
    }
  | { kind: 'invoke_validation_failed'; errors: Array<{ path: string; message: string }> }
  | { kind: 'capability_not_found'; reason: string }
  | { kind: 'portal_offline'; reason: string }
  | { kind: 'trust_required'; reason: string };

// ── Internals ──────────────────────────────────────────────────────────────

interface CachedPortalContext {
  portalId: string;
  portalRow: PortalRow;
  descriptor: Record<string, unknown> | null;
}

interface PortalRow {
  id: string;
  name: string;
  namespace: string;
  category: string;
  display_title: string | null;
  status: string;
}

async function loadPortalContext(
  db: DatabaseAdapter,
  portalAddress: string,
): Promise<CachedPortalContext | null> {
  // portalAddress is "<name>.<namespace>.portal".
  const m = portalAddress.match(/^([^.]+(?:\.[^.]+)*)\.([^.]+)\.portal$/);
  if (!m) return null;
  const name = m[1];
  const namespace = m[2];

  const portal = await db.get<PortalRow>(
    `SELECT id, name, namespace, category, display_title, status
     FROM portals WHERE namespace = ? AND name = ?`,
    namespace,
    name,
  );
  if (!portal) return null;

  // Pull cached descriptor (the one we serve at /capabilities Gateway endpoint).
  const descRow = await db.get<{ descriptor: Record<string, unknown> }>(
    `SELECT descriptor FROM portal_descriptor_cache WHERE portal_address = ? AND valid_until > NOW()`,
    portalAddress,
  );

  return {
    portalId: portal.id,
    portalRow: portal,
    descriptor: descRow?.descriptor ?? null,
  };
}

function findCapability(
  descriptor: Record<string, unknown> | null,
  capabilityId: string,
): Record<string, unknown> | null {
  if (!descriptor) return null;
  const caps = (descriptor.capabilities as Array<Record<string, unknown>>) ?? [];
  return caps.find((c) => c.id === capabilityId) ?? null;
}

function isAssetPath(path: string): boolean {
  // Heuristic: asset paths contain a non-leading file extension.
  // Page paths look like '/', '/about', '/products/cake-1' (no extension).
  // We treat anything with a dot in a non-leading position as an asset.
  return /\.[a-z0-9]{1,8}$/.test(path);
}

/**
 * Build a per-verb structured response on a successful invoke. Mirrors the
 * baseline outputSchemas in capability-descriptor/verbs/*.ts.
 */
function buildVerbOutput(verb: string, responseId: string, _input: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  switch (verb) {
    case 'contact':
      return { messageId: responseId, acceptedAt: now, expectedResponseTimeHours: 24 };
    case 'inquire':
      return { inquiryId: responseId, confidence: 'requires_human' };
    case 'request':
      return { requestId: responseId, status: 'received', expectedResponseTimeHours: 24 };
    case 'order':
      return { orderId: responseId, status: 'quoted', currency: 'EUR' };
    case 'pay':
      return { paymentId: responseId, status: 'pending' };
    case 'book':
      return { bookingId: responseId, status: 'pending' };
    case 'subscribe':
      return { subscriptionId: responseId, unsubscribeToken: randomUUID().replace(/-/g, '').slice(0, 16) };
    case 'join':
      return { applicationId: responseId, status: 'pending', nextStep: 'Owner will review and reply.' };
    case 'query':
      return { queryType: 'unknown', results: [], asOf: now };
    case 'publish':
      return { feed: 'default', items: [], hasMore: false };
    case 'delegate':
      return { delegationId: responseId, accepted: false };
    case 'authenticate':
      return { verified: false, confidence: 'low' };
    default:
      return { responseId, status: 'received' };
  }
}

function generateResponseId(verb: string): string {
  // Verb-prefixed human-readable id. Useful for visitors to quote later.
  const prefix = verb.toUpperCase().slice(0, 3);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${date}-${rand}`;
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface PortalHandler {
  handleFetch(req: PortalFetchRequest): Promise<PortalFetchResponse>;
  handleInquire(req: CapabilityInquireRequest): Promise<CapabilityInquireResponse>;
  handleInvoke(req: CapabilityInvokeRequest): Promise<CapabilityInvokeResponse>;
}

export function createPortalHandler(db: DatabaseAdapter): PortalHandler {
  const dbSvc: PortalDatabaseService = createPortalDatabaseService(db);
  const renderer: PortalRenderer = createPortalRenderer(db);

  return {
    async handleFetch(req) {
      const ctx = await loadPortalContext(db, req.portalAddress);
      if (!ctx) return { kind: 'not_found', reason: `No portal at ${req.portalAddress}` };
      if (ctx.portalRow.status !== 'active') {
        return { kind: 'portal_offline', reason: `Portal status is ${ctx.portalRow.status}` };
      }

      // Route to assets vs pages based on path shape.
      if (isAssetPath(req.path)) {
        const asset = await dbSvc.getAsset(ctx.portalId, req.path);
        if (!asset || !asset.content) {
          return { kind: 'not_found', reason: `Asset not found: ${req.path}` };
        }
        return {
          kind: 'asset',
          bytes: asset.content,
          mimeType: asset.mimeType,
          contentHash: asset.contentHash,
        };
      }

      const page = await dbSvc.getPage(ctx.portalId, req.path);
      if (!page || !page.visible) {
        return { kind: 'not_found', reason: `Page not found: ${req.path}` };
      }

      // Run the minimal-interpolation renderer so {{title}} / {{portal.*}} /
      // {{data.*}} / {{#each kind}} / {{asset:path}} are expanded before
      // serving. Page.html stays the source of truth in the DB.
      const html = await renderer.renderPage({
        page,
        portal: {
          address: req.portalAddress,
          name: ctx.portalRow.name,
          namespace: ctx.portalRow.namespace,
          displayTitle: ctx.portalRow.display_title,
          category: ctx.portalRow.category,
        },
      });

      return { kind: 'page', html, title: page.title, mimeType: 'text/html' };
    },

    async handleInquire(req) {
      const ctx = await loadPortalContext(db, req.portalAddress);
      if (!ctx) return { kind: 'portal_offline', reason: `No portal at ${req.portalAddress}` };
      if (ctx.portalRow.status !== 'active') {
        return { kind: 'portal_offline', reason: `Portal status is ${ctx.portalRow.status}` };
      }
      if (!ctx.descriptor) {
        return { kind: 'portal_offline', reason: 'No capability descriptor cached for this portal' };
      }

      const cap = findCapability(ctx.descriptor, req.capabilityId);
      if (!cap) return { kind: 'capability_not_found', reason: `Capability ${req.capabilityId} not declared` };

      const availability =
        (cap.availability as Record<string, unknown> | undefined) ??
        (ctx.descriptor.availability as Record<string, unknown> | undefined);

      const portalSection = (ctx.descriptor.portal as { displayTitle?: string; category?: string }) ?? {};

      return {
        kind: 'inquire_response',
        capability: {
          id: cap.id as string,
          verb: cap.verb as string,
          title: cap.title as string,
          description: cap.description as string,
          slaHints: cap.slaHints as Record<string, unknown> | undefined,
          availability,
          paymentCoupling: cap.paymentCoupling as Record<string, unknown> | undefined,
          trustRequirements: cap.trustRequirements as Record<string, unknown> | undefined,
        },
        portal: {
          displayTitle: portalSection.displayTitle ?? ctx.portalRow.display_title ?? ctx.portalRow.name,
          category: portalSection.category ?? ctx.portalRow.category,
          timezone: (availability as { timezone?: string } | undefined)?.timezone,
        },
      };
    },

    async handleInvoke(req) {
      const ctx = await loadPortalContext(db, req.portalAddress);
      if (!ctx) return { kind: 'portal_offline', reason: `No portal at ${req.portalAddress}` };
      if (ctx.portalRow.status !== 'active') {
        return { kind: 'portal_offline', reason: `Portal status is ${ctx.portalRow.status}` };
      }
      if (!ctx.descriptor) {
        return { kind: 'portal_offline', reason: 'No capability descriptor cached for this portal' };
      }

      const cap = findCapability(ctx.descriptor, req.capabilityId);
      if (!cap) return { kind: 'capability_not_found', reason: `Capability ${req.capabilityId} not declared` };

      // Trust requirement: if visitorIdentityRequired, reject anonymous calls.
      const trustReq = cap.trustRequirements as { visitorIdentityRequired?: boolean } | undefined;
      if (trustReq?.visitorIdentityRequired && !req.visitorContactHash) {
        return { kind: 'trust_required', reason: 'visitorIdentityRequired: provide a visitor contact hash' };
      }

      // Validate input against capability inputSchema (ajv).
      const inputSchema = cap.inputSchema as Record<string, unknown> | undefined;
      if (inputSchema) {
        const r = validateAgainstSchema(inputSchema, req.input);
        if (!r.valid) {
          return { kind: 'invoke_validation_failed', errors: r.errors };
        }
      }

      // Generate response_id + structured output, then insert into inbox.
      const verb = cap.verb as string;
      const responseId = generateResponseId(verb);
      const output = buildVerbOutput(verb, responseId, req.input);

      const inserted = await db.get<{ id: string }>(
        `INSERT INTO portal_capability_invocations
           (portal_id, capability_id, capability_verb, aap_endpoint,
            visitor_contact_hash, input, output, response_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
         RETURNING id`,
        ctx.portalId,
        req.capabilityId,
        verb,
        cap.aapEndpoint as string,
        req.visitorContactHash ?? null,
        JSON.stringify(req.input),
        JSON.stringify(output),
        responseId,
      );

      log.info({
        portalId: ctx.portalId, portalAddress: req.portalAddress,
        capabilityId: req.capabilityId, verb, responseId,
        visitor: req.visitorContactHash ?? null,
      }, 'capability invoked');

      // Best-effort push notification to the owner's paired phone (if any).
      // Non-blocking — visitor response shape is unaffected by push delivery.
      void notifyOwnerOfInvocation(db, {
        portalId: ctx.portalId,
        portalAddress: req.portalAddress,
        portalTitle: ctx.portalRow.display_title ?? ctx.portalRow.name,
        capabilityId: req.capabilityId,
        verb,
        responseId,
        invocationId: inserted!.id,
      });

      return {
        kind: 'invoke_accepted',
        responseId,
        invocationId: inserted!.id,
        verb,
        output,
      };
    },
  };
}

// ── Owner notification (best-effort push via Companion App checkpoint) ──────

interface InvocationNotice {
  portalId: string;
  portalAddress: string;
  portalTitle: string;
  capabilityId: string;
  verb: string;
  responseId: string;
  invocationId: string;
}

async function notifyOwnerOfInvocation(db: DatabaseAdapter, n: InvocationNotice): Promise<void> {
  try {
    const portal = await db.get<{ metadata: { ownerId?: string } | null }>(
      `SELECT metadata FROM portals WHERE id = ?`, n.portalId,
    );
    const ownerId = portal?.metadata?.ownerId;
    if (!ownerId) {
      log.debug({ portalId: n.portalId }, 'no ownerId on portal — skipping push');
      return;
    }
    // Find a connected_user row for this owner across any org. We pick the
    // first (most-recent) — production would let the user designate which
    // device receives notifications.
    const connected = await db.get<{ id: string; org_id: string }>(
      `SELECT cu.id, cu.org_id FROM connected_users cu
       JOIN app_devices ad ON ad.connected_user_id = cu.id AND ad.revoked_at IS NULL
       WHERE cu.user_id = ? OR cu.display_name = ?
       ORDER BY cu.created_at DESC LIMIT 1`,
      ownerId, ownerId,
    );
    if (!connected) {
      log.debug({ ownerId }, 'no paired phone for owner — skipping push');
      return;
    }
    const checkpoints = createAppCheckpointService(db);
    await checkpoints.create({
      org_id: connected.org_id,
      connected_user_id: connected.id,
      title: `New ${n.verb} on ${n.portalTitle}`,
      summary: `Capability "${n.capabilityId}" invoked. Response id: ${n.responseId}`,
      severity: 'normal',
      payload: {
        kind: 'portal-capability-invocation',
        portalAddress: n.portalAddress,
        invocationId: n.invocationId,
        verb: n.verb,
      },
      source_kind: 'portal-invocation',
      source_id: n.invocationId,
      deep_link: `/portals/${n.portalId}/manage`,
    });
    log.info({ portalId: n.portalId, ownerId, connectedUserId: connected.id }, 'owner push fired');
  } catch (err) {
    // Push failure must not affect the visitor's response.
    log.warn({ err, portalId: n.portalId }, 'owner notification failed');
  }
}
