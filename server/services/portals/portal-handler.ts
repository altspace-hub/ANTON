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

import { randomBytes, randomUUID } from 'crypto';

import type { DatabaseAdapter } from '../../db/database.js';
import { childLogger } from '../../lib/logger.js';
import { assertSafeLanEgressUrl } from '../../lib/ssrf-guard.js';
import { validateAgainstSchema } from '../capability-descriptor/validator.js';
import { createSellerQuoter, type SellerQuoter } from './seller-quoter.js';
import { makeQuoterDbDeps } from './auto-quote-config-service.js';
import { createCallChatQuoteLLM } from './seller-quoter-llm.js';
import { createCallChatQuoteReviewer } from './seller-quoter-review.js';
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

export interface InvocationStatusRequest {
  portalAddress: string;
  responseId: string;
}

/** Visitor-facing status of a previously accepted invocation. The
 *  responseId acts as the capability token — it's random (verb-prefixed,
 *  ~52 bits of entropy for new ids), scoped to the portal address, and
 *  the public route is rate-limited per IP. Only lifecycle fields plus
 *  the owner's response output ever leave; never the visitor's input or
 *  contact hash. */
export type InvocationStatusResponse =
  | {
      kind: 'invocation_status';
      responseId: string;
      status: 'pending' | 'acknowledged' | 'responded' | 'rejected';
      receivedAt: string;
      respondedAt: string | null;
      /** Owner-authored response payload — only present once responded. */
      output: Record<string, unknown> | null;
      /** Owner-supplied reason — only present when rejected. */
      rejectionReason: string | null;
    }
  | { kind: 'not_found'; reason: string }
  | { kind: 'portal_offline'; reason: string };

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

/**
 * Returns the origin_endpoint for a remote LAN portal, or null if the portal
 * is local (or unknown). Used by every handler to short-circuit to the
 * proxy path when this portal lives on a peer ANTON.
 */
async function lookupRemoteOrigin(db: DatabaseAdapter, portalAddress: string): Promise<string | null> {
  const row = await db.get<{ origin_endpoint: string | null }>(
    `SELECT origin_endpoint FROM portal_descriptor_cache WHERE portal_address = ?`,
    portalAddress,
  );
  const origin = row?.origin_endpoint ?? null;
  if (!origin) return null;
  // SSRF guard: never proxy to a loopback/link-local/cloud-metadata target. LAN
  // peers (private 192.168/10/172.16) ARE allowed — that's the point of LAN portals.
  try {
    await assertSafeLanEgressUrl(origin);
  } catch {
    childLogger('portals').warn({ portalAddress }, 'refusing to proxy: origin_endpoint blocked by SSRF guard');
    return null;
  }
  return origin;
}

const PROXY_TIMEOUT_MS = 10_000;

async function proxyFetch(originEndpoint: string, req: PortalFetchRequest): Promise<PortalFetchResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS);
  try {
    const isAsset = isAssetPath(req.path);
    const url = isAsset
      ? `${originEndpoint}/api/portals/visit/${encodeURIComponent(req.portalAddress)}/asset/${req.path.replace(/^\/+/, '')}`
      : `${originEndpoint}/api/portals/visit/${encodeURIComponent(req.portalAddress)}/page?path=${encodeURIComponent(req.path)}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (isAsset) {
      if (!res.ok) {
        if (res.status === 404) return { kind: 'not_found', reason: 'Remote asset not found' };
        if (res.status === 503) return { kind: 'portal_offline', reason: 'Remote portal offline' };
        return { kind: 'not_found', reason: `Remote asset error ${res.status}` };
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        kind: 'asset',
        bytes: buf,
        mimeType: res.headers.get('content-type') ?? 'application/octet-stream',
        contentHash: res.headers.get('etag') ?? '',
      };
    }
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (json && typeof json === 'object' && 'kind' in json) {
      return json as unknown as PortalFetchResponse;
    }
    return { kind: 'not_found', reason: 'Remote returned malformed response' };
  } catch (err) {
    log.warn({ originEndpoint, address: req.portalAddress, err: String(err) }, 'proxy_fetch_failed');
    return { kind: 'portal_offline', reason: 'Remote portal unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

async function proxyInquire(originEndpoint: string, req: CapabilityInquireRequest): Promise<CapabilityInquireResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS);
  try {
    const url = `${originEndpoint}/api/portals/visit/${encodeURIComponent(req.portalAddress)}/capabilities/${encodeURIComponent(req.capabilityId)}/inquire`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorContactHash: req.visitorContactHash }),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (json && typeof json === 'object' && 'kind' in json) {
      return json as unknown as CapabilityInquireResponse;
    }
    return { kind: 'portal_offline', reason: 'Remote returned malformed response' };
  } catch (err) {
    log.warn({ originEndpoint, address: req.portalAddress, err: String(err) }, 'proxy_inquire_failed');
    return { kind: 'portal_offline', reason: 'Remote portal unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

async function proxyInvoke(originEndpoint: string, req: CapabilityInvokeRequest): Promise<CapabilityInvokeResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS);
  try {
    const url = `${originEndpoint}/api/portals/visit/${encodeURIComponent(req.portalAddress)}/capabilities/${encodeURIComponent(req.capabilityId)}/invoke`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: req.input, visitorContactHash: req.visitorContactHash }),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (json && typeof json === 'object' && 'kind' in json) {
      return json as unknown as CapabilityInvokeResponse;
    }
    return { kind: 'portal_offline', reason: 'Remote returned malformed response' };
  } catch (err) {
    log.warn({ originEndpoint, address: req.portalAddress, err: String(err) }, 'proxy_invoke_failed');
    return { kind: 'portal_offline', reason: 'Remote portal unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

async function proxyInvocationStatus(originEndpoint: string, req: InvocationStatusRequest): Promise<InvocationStatusResponse> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS);
  try {
    const url = `${originEndpoint}/api/portals/visit/${encodeURIComponent(req.portalAddress)}/invocations/${encodeURIComponent(req.responseId)}`;
    const res = await fetch(url, { signal: ctrl.signal });
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (json && typeof json === 'object' && 'kind' in json) {
      return json as unknown as InvocationStatusResponse;
    }
    return { kind: 'portal_offline', reason: 'Remote returned malformed response' };
  } catch (err) {
    log.warn({ originEndpoint, address: req.portalAddress, err: String(err) }, 'proxy_invocation_status_failed');
    return { kind: 'portal_offline', reason: 'Remote portal unreachable' };
  } finally {
    clearTimeout(timer);
  }
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
 *
 * Deliberately NO fabricated SLA fields (e.g. expectedResponseTimeHours):
 * we have no basis for promising a response window — the honest contract
 * is "the owner will respond and the visitor can poll the invocation
 * status endpoint" (GET /portals/visit/:address/invocations/:responseId).
 */
function buildVerbOutput(verb: string, responseId: string, _input: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  switch (verb) {
    case 'contact':
      return { messageId: responseId, acceptedAt: now };
    case 'inquire':
      return { inquiryId: responseId, confidence: 'requires_human' };
    case 'request':
      return { requestId: responseId, status: 'received' };
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
  // Also doubles as the bearer token for the public invocation-status
  // endpoint, so the random suffix is 10 base-32 chars (~50 bits) from
  // crypto-strength randomness — wide enough that enumeration is
  // infeasible under the per-IP rate limit on that route.
  const prefix = verb.toUpperCase().slice(0, 3);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  // Crockford-ish base32 (no I/L/O/U) — unambiguous when read aloud.
  const charset = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = randomBytes(10);
  let rand = '';
  for (let i = 0; i < 10; i++) rand += charset[bytes[i]! % charset.length];
  return `${prefix}-${date}-${rand}`;
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface PortalHandler {
  handleFetch(req: PortalFetchRequest): Promise<PortalFetchResponse>;
  handleInquire(req: CapabilityInquireRequest): Promise<CapabilityInquireResponse>;
  handleInvoke(req: CapabilityInvokeRequest): Promise<CapabilityInvokeResponse>;
  handleInvocationStatus(req: InvocationStatusRequest): Promise<InvocationStatusResponse>;
}

export function createPortalHandler(
  db: DatabaseAdapter,
  opts?: { quoter?: SellerQuoter },
): PortalHandler {
  const dbSvc: PortalDatabaseService = createPortalDatabaseService(db);
  const renderer: PortalRenderer = createPortalRenderer(db);
  // The seller auto-quote responder (commerce-loop P3). Opt-in per capability —
  // with no config it returns {ok:false} and the human-inbox path is unchanged.
  // Injectable so the handler integration test stubs it (no LLM/network).
  // OPTIONAL four-eyes review: when ANTON_AUTOQUOTE_REVIEW_MODEL is set, a SECOND,
  // independent model scrutinises every auto-quote (and the untrusted inquiry) for
  // no-go zones / manipulation / anomalies and routes flagged quotes to a human.
  // Off by default. Use a model from a DIFFERENT provider than ANTON_AUTOQUOTE_MODEL.
  const reviewModel = (process.env.ANTON_AUTOQUOTE_REVIEW_MODEL || '').trim();
  const reviewPolicy = (process.env.ANTON_AUTOQUOTE_REVIEW_POLICY || '').trim();
  const reviewer = reviewModel
    ? createCallChatQuoteReviewer(db, reviewModel, reviewPolicy || undefined)
    : undefined;
  const quoter: SellerQuoter = opts?.quoter
    ?? createSellerQuoter({
      ...makeQuoterDbDeps(db),
      llm: createCallChatQuoteLLM(db),
      ...(reviewer ? { reviewer } : {}),
    });

  return {
    async handleFetch(req) {
      // LAN proxy short-circuit: when the descriptor cache has an
      // origin_endpoint, this portal lives on a peer ANTON. Forward instead
      // of looking in our local tables (which would say not_found).
      const remote = await lookupRemoteOrigin(db, req.portalAddress);
      if (remote) return proxyFetch(remote, req);
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
      const remote = await lookupRemoteOrigin(db, req.portalAddress);
      if (remote) return proxyInquire(remote, req);
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
      const remote = await lookupRemoteOrigin(db, req.portalAddress);
      if (remote) return proxyInvoke(remote, req);
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

      // Generate response_id, then either AUTO-QUOTE (the seller-quoter answers
      // a real priced quote synchronously) or fall back to today's human-inbox
      // placeholder. The auto-quoter is opt-in per capability + fails closed:
      // any disabled config / tripped guard returns {ok:false} and the unchanged
      // 'pending' human path is taken. The quote is NON-BINDING (status:'quoted').
      const verb = cap.verb as string;
      const responseId = generateResponseId(verb);
      let output: Record<string, unknown>;
      let status: 'pending' | 'responded' = 'pending';
      let respondedAt: Date | null = null;
      let aq: Awaited<ReturnType<SellerQuoter['tryAutoQuote']>>;
      try {
        aq = await quoter.tryAutoQuote({
          portalId: ctx.portalId,
          capabilityId: req.capabilityId,
          cap: cap as Record<string, unknown>,
          verb,
          responseId,
          input: req.input,
          ...(req.visitorContactHash !== undefined ? { visitorContactHash: req.visitorContactHash } : {}),
        });
      } catch (err) {
        // Auto-quote is STRICTLY ADDITIVE: any failure (e.g. migration 243 not
        // run, an LLM/DB error) degrades to today's human-inbox path. It must
        // never break a portal invoke.
        log.warn({ portalId: ctx.portalId, capabilityId: req.capabilityId, err: err instanceof Error ? err.message : String(err) },
          'auto-quote failed; falling back to human inbox');
        aq = { ok: false, reason: 'quoter_error' };
      }
      if (aq.ok) {
        output = aq.output as unknown as Record<string, unknown>;
        status = 'responded';   // fulfilled synchronously, no human leg
        respondedAt = new Date();
      } else {
        output = buildVerbOutput(verb, responseId, req.input);
      }

      const inserted = await db.get<{ id: string }>(
        `INSERT INTO portal_capability_invocations
           (portal_id, capability_id, capability_verb, aap_endpoint,
            visitor_contact_hash, input, output, response_id, status,
            responded_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
        ctx.portalId,
        req.capabilityId,
        verb,
        cap.aapEndpoint as string,
        req.visitorContactHash ?? null,
        JSON.stringify(req.input),
        JSON.stringify(output),
        responseId,
        status,
        respondedAt,
        JSON.stringify({ autoQuote: aq.ok, autoQuoteReason: aq.reason, ...(aq.review ? { fourEyes: aq.review } : {}) }),
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

    // Closes the invoke loop (plan 2.11): the visitor who received an
    // invoke_accepted receipt polls this with their responseId until the
    // owner responds (or rejects). Mirrors the other handlers' LAN proxy
    // short-circuit so visiting a peer's portal through this instance
    // also polls the peer.
    async handleInvocationStatus(req) {
      const remote = await lookupRemoteOrigin(db, req.portalAddress);
      if (remote) return proxyInvocationStatus(remote, req);
      const ctx = await loadPortalContext(db, req.portalAddress);
      if (!ctx) return { kind: 'not_found', reason: `No portal at ${req.portalAddress}` };
      if (ctx.portalRow.status !== 'active') {
        return { kind: 'portal_offline', reason: `Portal status is ${ctx.portalRow.status}` };
      }

      const row = await db.get<{
        status: 'pending' | 'acknowledged' | 'responded' | 'rejected';
        received_at: string;
        responded_at: string | null;
        output: Record<string, unknown> | string | null;
        rejection_reason: string | null;
      }>(
        `SELECT status, received_at, responded_at, output, rejection_reason
         FROM portal_capability_invocations
         WHERE portal_id = ? AND response_id = ?`,
        ctx.portalId,
        req.responseId,
      );
      if (!row) return { kind: 'not_found', reason: 'No invocation with that response id' };

      // Only the owner's response payload leaves — the auto-generated
      // acceptance receipt (the pre-respond `output` value) was already
      // returned to the visitor at invoke time, and the input/visitor
      // hash are never exposed on this public route.
      const ownerOutput = row.status === 'responded'
        ? (typeof row.output === 'string' ? safeParse(row.output) : row.output)
        : null;

      return {
        kind: 'invocation_status',
        responseId: req.responseId,
        status: row.status,
        receivedAt: new Date(row.received_at).toISOString(),
        respondedAt: row.responded_at ? new Date(row.responded_at).toISOString() : null,
        output: ownerOutput,
        rejectionReason: row.status === 'rejected' ? row.rejection_reason : null,
      };
    },
  };
}

function safeParse(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
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
