/**
 * portals.ts — client for the ANTON Portals relay registry.
 *
 * Step 12 wired the Comm App against relay.futurechain.eu's /v1/*
 * endpoints (the Step 8 + 9 work). Two responsibilities the relay
 * owns:
 *
 *   - Search (`searchPortals`) — calls GET /v1/portals/search. Returns
 *     approved, public-indexed portals.
 *   - Resolve (`fetchPortalDescriptor`) — calls GET
 *     /v1/portals/resolve/:address. Returns the canonical descriptor +
 *     capability summary in a single round-trip; no separate
 *     descriptor fetch.
 *
 * Capability invocation is NOT routed through the relay — the relay
 * does discovery only. `invokeCapability` reads the per-capability
 * `aapEndpoint` from the descriptor and POSTs directly to it. That
 * endpoint is the portal owner's hosted ANTON; the descriptor's
 * Ed25519 signature is the trust root.
 *
 * Base URL is taken from VITE_COMM_PORTALS_BASE at build time. For a
 * production Comm App APK, this is the relay's HTTPS origin (e.g.
 * `https://relay.futurechain.eu`). For local dev, point it at
 * `http://10.0.2.2:8443` for an Android emulator hitting the
 * developer's localhost relay.
 */

import { getIdentity } from './identity';
import {
  readDescriptor as cacheReadDescriptor,
  writeDescriptor as cacheWriteDescriptor,
  readPage as cacheReadPage,
  writePage as cacheWritePage,
  readPages as cacheReadPages,
  writePages as cacheWritePages,
} from './portal-cache';

const PORTALS_BASE = (import.meta.env.VITE_COMM_PORTALS_BASE as string | undefined) ?? 'https://relay.futurechain.eu';

function url(path: string): string {
  return `${PORTALS_BASE.replace(/\/+$/, '')}${path}`;
}

// ── Search ───────────────────────────────────────────────────────────────

export interface PortalSearchResult {
  portalAddress: string;
  displayTitle: string;
  description?: string;
  category?: string;
  contactHash?: string;
  signingPubkeyHex?: string;
  capabilityVerbs?: string[];
  tags?: string[];
  serviceAreas?: string[];
  languages?: string[];
  tier?: 'tier2_claimed' | 'tier3_selfservice';
  approvedAt?: string;
  relevanceScore?: number | null;
}

export interface PortalSearchResponse {
  results: PortalSearchResult[];
  total: number;
}

export interface PortalSearchOpts {
  text?: string;
  verbs?: string[];
  categories?: string[];
  limit?: number;
  offset?: number;
}

export async function searchPortals(opts: PortalSearchOpts = {}): Promise<PortalSearchResponse> {
  const params = new URLSearchParams();
  if (opts.text) params.set('text', opts.text);
  if (opts.verbs?.length) params.set('verbs', opts.verbs.join(','));
  if (opts.categories?.length) params.set('categories', opts.categories.join(','));
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const res = await fetch(url(`/v1/portals/search${qs ? '?' + qs : ''}`));
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return res.json() as Promise<PortalSearchResponse>;
}

// ── Capability descriptor ────────────────────────────────────────────────

export interface CapabilitySpec {
  id: string;
  verb: string;
  title: string;
  description?: string;
  aapEndpoint?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  paymentCoupling?: Record<string, unknown>;
  tags?: string[];
}

export interface PortalDescriptor {
  schemaVersion?: string;
  descriptorId?: string;
  issuedAt?: string;
  portal: {
    name: string;
    namespace?: string;
    displayTitle: string;
    description?: string;
    category?: string;
    contactHash?: string;
    publicKey?: string;
    /** Publisher's publicly-reachable HTTPS origin (no trailing slash).
     *  Required for the Comm App to fetch pages + invoke capabilities. */
    originEndpoint?: string;
    surface?: {
      mode: 'managed' | 'external';
      url?: string;
      verifiedAt?: string;
    };
  };
  capabilities?: CapabilitySpec[];
  payment?: Record<string, unknown>;
}

interface ResolveResponseBody {
  found: boolean;
  portalAddress?: string;
  contactHash?: string;
  signingPubkeyHex?: string;
  descriptor?: PortalDescriptor;
  capabilitySummary?: Record<string, unknown>;
  tier?: string;
  approvedAt?: string;
}

export async function fetchPortalDescriptor(address: string): Promise<PortalDescriptor | null> {
  // Network-first. A 404 from the relay means the portal really doesn't
  // exist (or was unpublished) — we treat that as authoritative and
  // don't fall back to a stale cached descriptor. Anything else (fetch
  // throw, 5xx) is "publisher reachable but registry flaky" → cache.
  try {
    const res = await fetch(url(`/v1/portals/resolve/${encodeURIComponent(address)}`));
    if (res.status === 404) return null;
    if (res.status >= 500) {
      const cached = await cacheReadDescriptor<PortalDescriptor>(address);
      if (cached) return cached;
      throw new Error(`Descriptor fetch failed (${res.status})`);
    }
    if (!res.ok) throw new Error(`Descriptor fetch failed (${res.status})`);
    const body = (await res.json()) as ResolveResponseBody;
    if (!body.found || !body.descriptor) return null;
    await cacheWriteDescriptor(address, body.descriptor);
    return body.descriptor;
  } catch (err) {
    // fetch() throws on network failure (no DNS, no route, TLS error).
    const cached = await cacheReadDescriptor<PortalDescriptor>(address);
    if (cached) return cached;
    throw err;
  }
}

// ── Page fetch ───────────────────────────────────────────────────────────
//
// Pages live on the publisher's ANTON, NOT the relay (relay does discovery
// only — preserves DSA Art. 4-5 safe harbor). The descriptor declares
// `portal.originEndpoint` which is the publisher's publicly-reachable
// HTTPS base URL. We join with /api/portals/visit/<address>/page(s).
//
// Failures are split:
//   - `null` from fetchPortalPage:    no originEndpoint declared, or 404
//   - throw from fetchPortalPage:     network error or 5xx
// The Comm App's PortalPageScreen surfaces these as either "Capabilities
// only" (no surface declared) or "Publisher offline" (origin unreachable).

export interface PortalPage {
  html: string;
  title: string | null;
}

export interface PortalPageMeta {
  path: string;
  title: string | null;
  sortOrder: number;
}

function originAddress(descriptor: PortalDescriptor): { origin: string; address: string } | null {
  const origin = descriptor.portal.originEndpoint?.trim().replace(/\/+$/, '');
  if (!origin) return null;
  const address = descriptor.portal.name;
  if (!address) return null;
  return { origin, address };
}

/** Fetch a single page from the publisher's ANTON. Returns null if
 *  the descriptor has no originEndpoint or the page is not found.
 *
 *  Same network-first / stale-on-failure rule as fetchPortalDescriptor:
 *  a real 404 is authoritative (page was removed), but any network
 *  failure or 5xx falls back to the last cached copy if one exists.
 *
 *  `onCacheHit` is an optional side-channel for the UI to learn that
 *  this call was served from cache (i.e. publisher was unreachable).
 *  Kept as a callback rather than baked into the return type so existing
 *  callers and tests don't need to be re-typed. */
export async function fetchPortalPage(
  descriptor: PortalDescriptor,
  path: string,
  onCacheHit?: () => void,
): Promise<PortalPage | null> {
  const oa = originAddress(descriptor);
  if (!oa) return null;
  const pageUrl =
    `${oa.origin}/api/portals/visit/${encodeURIComponent(oa.address)}/page` +
    `?path=${encodeURIComponent(path || '/')}`;
  try {
    const res = await fetch(pageUrl);
    if (res.status === 404) return null;
    if (res.status >= 500) {
      const cached = await cacheReadPage<PortalPage>(oa.address, path || '/');
      if (cached) { onCacheHit?.(); return cached; }
      throw new Error(`Page fetch failed (${res.status})`);
    }
    if (!res.ok) throw new Error(`Page fetch failed (${res.status})`);
    const body = (await res.json()) as { kind?: string; html?: string; title?: string | null };
    if (body.kind !== 'page' || typeof body.html !== 'string') return null;
    const page: PortalPage = { html: body.html, title: body.title ?? null };
    await cacheWritePage(oa.address, path || '/', page);
    return page;
  } catch (err) {
    const cached = await cacheReadPage<PortalPage>(oa.address, path || '/');
    if (cached) { onCacheHit?.(); return cached; }
    throw err;
  }
}

/** List visible pages for a portal. Returns null when origin isn't set;
 *  empty array when origin is set but the portal exposes no pages.
 *  `onCacheHit` mirrors fetchPortalPage — fires when the network call
 *  fails and a cached page list is returned instead. */
export async function fetchPortalPages(
  descriptor: PortalDescriptor,
  onCacheHit?: () => void,
): Promise<PortalPageMeta[] | null> {
  const oa = originAddress(descriptor);
  if (!oa) return null;
  const listUrl = `${oa.origin}/api/portals/visit/${encodeURIComponent(oa.address)}/pages`;
  try {
    const res = await fetch(listUrl);
    if (res.status === 404) return [];
    if (res.status >= 500) {
      const cached = await cacheReadPages<PortalPageMeta[]>(oa.address);
      if (cached) { onCacheHit?.(); return cached; }
      throw new Error(`Pages list failed (${res.status})`);
    }
    if (!res.ok) throw new Error(`Pages list failed (${res.status})`);
    const body = (await res.json()) as { pages?: PortalPageMeta[] };
    const pages = Array.isArray(body.pages) ? body.pages : [];
    await cacheWritePages(oa.address, pages);
    return pages;
  } catch (err) {
    const cached = await cacheReadPages<PortalPageMeta[]>(oa.address);
    if (cached) { onCacheHit?.(); return cached; }
    throw err;
  }
}

// ── Invoke ───────────────────────────────────────────────────────────────

export interface InvokeResponse {
  kind:
    | 'invoke_response'
    | 'capability_not_found'
    | 'portal_offline'
    | 'invalid_input'
    | 'rate_limited'
    | 'not_supported'
    | 'trust_required';
  inboxId?: string;
  output?: Record<string, unknown>;
  message?: string;
}

/** Server-side wire shape for the 200 path (matches portal-handler.ts
 *  `CapabilityInvokeResponse` of kind `invoke_accepted`). The Comm App
 *  translates it into `invoke_response` so the UI doesn't need to know
 *  about the two naming conventions. */
interface ServerInvokeAccepted {
  kind: 'invoke_accepted';
  responseId: string;
  invocationId: string;
  verb: string;
  output: Record<string, unknown>;
}

/**
 * Invoke a capability on the portal owner's ANTON. The relay only does
 * discovery — this call goes directly to the publisher's ANTON via the
 * descriptor's `portal.originEndpoint`. URL pattern matches the existing
 * server route (server/routes/portals.ts line 1183):
 *
 *   POST {originEndpoint}/api/portals/visit/{address}/capabilities/{capId}/invoke
 *
 * Note that `cap.aapEndpoint` is a SLUG (e.g. "messages"), not a full URL —
 * we never fetch against it directly. It's an authoring hint for the
 * publisher's own routing; visitors always use the address+capId pattern.
 *
 * The visitor's contact hash is added to the body so the portal owner's
 * inbox can attribute the invocation; no authentication is otherwise
 * required at v0.1.
 */
export async function invokeCapability(
  descriptor: PortalDescriptor,
  capabilityId: string,
  input: Record<string, unknown>,
): Promise<InvokeResponse> {
  const cap = descriptor.capabilities?.find((c) => c.id === capabilityId);
  if (!cap) {
    return { kind: 'capability_not_found', message: `No capability with id "${capabilityId}".` };
  }
  const oa = originAddress(descriptor);
  if (!oa) {
    return {
      kind: 'not_supported',
      message: 'This portal has no originEndpoint declared — direct invocation is not available yet.',
    };
  }

  const me = getIdentity();
  const body = {
    input,
    visitorContactHash: me?.contactHash,
  };

  const invokeUrl =
    `${oa.origin}/api/portals/visit/${encodeURIComponent(oa.address)}` +
    `/capabilities/${encodeURIComponent(capabilityId)}/invoke`;

  try {
    const res = await fetch(invokeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    // 429 → server's express-rate-limit middleware. No JSON body guaranteed.
    if (res.status === 429) {
      return { kind: 'rate_limited', message: 'Too many requests. Try again later.' };
    }
    // 4xx — server returns a structured response; pass through.
    if (!res.ok && res.status < 500) {
      const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (parsed && typeof parsed.kind === 'string') {
        return parsed as unknown as InvokeResponse;
      }
      return { kind: 'invalid_input', message: `Portal returned ${res.status}.` };
    }
    // 5xx / unreachable.
    if (!res.ok) {
      return { kind: 'portal_offline', message: `Portal returned ${res.status}.` };
    }
    // 200 — translate the server's invoke_accepted into the Comm App's
    // invoke_response shape so the existing CapabilityForm rendering works.
    const parsed = (await res.json()) as ServerInvokeAccepted | InvokeResponse;
    if (parsed.kind === 'invoke_accepted') {
      return {
        kind: 'invoke_response',
        inboxId: parsed.invocationId,
        output: parsed.output,
      };
    }
    return parsed as InvokeResponse;
  } catch (err) {
    return { kind: 'portal_offline', message: (err as Error).message };
  }
}
