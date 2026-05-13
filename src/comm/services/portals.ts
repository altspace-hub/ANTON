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
  const res = await fetch(url(`/v1/portals/resolve/${encodeURIComponent(address)}`));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Descriptor fetch failed (${res.status})`);
  const body = (await res.json()) as ResolveResponseBody;
  if (!body.found || !body.descriptor) return null;
  return body.descriptor;
}

// ── Invoke ───────────────────────────────────────────────────────────────

export interface InvokeResponse {
  kind: 'invoke_response' | 'capability_not_found' | 'portal_offline' | 'invalid_input' | 'rate_limited' | 'not_supported';
  inboxId?: string;
  output?: Record<string, unknown>;
  message?: string;
}

/**
 * Invoke a capability on the portal owner's ANTON. The relay only does
 * discovery — this call goes directly to the descriptor's `aapEndpoint`
 * for the chosen capability. Caller passes the full PortalDescriptor
 * (from fetchPortalDescriptor) and the capability id.
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
  if (!cap.aapEndpoint) {
    return {
      kind: 'not_supported',
      message: 'This capability has no aapEndpoint declared — direct invocation is not available yet.',
    };
  }

  const me = getIdentity();
  const body = {
    input,
    visitorContactHash: me?.contactHash,
    capabilityId,
  };

  try {
    const res = await fetch(cap.aapEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok && res.status < 500) {
      return (await res.json()) as InvokeResponse;
    }
    if (!res.ok) {
      return { kind: 'portal_offline', message: `Portal returned ${res.status}.` };
    }
    return (await res.json()) as InvokeResponse;
  } catch (err) {
    return { kind: 'portal_offline', message: (err as Error).message };
  }
}
