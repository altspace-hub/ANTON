/**
 * portals.ts — client for the ANTON Portals visitor surface.
 *
 * All endpoints here are public (no auth) on any ANTON instance running
 * Visitor Layer v0.8+. The Comm App points at whatever hosted ANTON
 * exposes the public portal surface (via VITE_COMM_PORTALS_BASE), or
 * proxies through Vite to a local heavy ANTON in dev.
 *
 * Endpoints used:
 *   GET  /api/portals/search?text=&verbs=&categories=
 *   GET  /api/portals/visit/{address}/capabilities
 *   POST /api/portals/visit/{address}/capabilities/{capId}/inquire
 *   POST /api/portals/visit/{address}/capabilities/{capId}/invoke
 *
 * Server reference: server/routes/portals.ts §605, §1080-1140.
 */

import { getIdentity } from './identity';

const PORTALS_BASE = (import.meta.env.VITE_COMM_PORTALS_BASE as string | undefined) ?? '';

function url(path: string): string {
  return `${PORTALS_BASE}${path}`;
}

// ── Search ───────────────────────────────────────────────────────────────

export interface PortalSearchResult {
  portalAddress: string;
  displayTitle: string;
  description?: string;
  category?: string;
  capabilityVerbs?: string[];
  tags?: string[];
  serviceAreas?: string[];
  languages?: string[];
  lastSeenAt?: string;
}

export interface PortalSearchResponse {
  results: PortalSearchResult[];
  total?: number;
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
  const res = await fetch(url(`/api/portals/search${qs ? '?' + qs : ''}`));
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
  schemaVersion: string;
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

export async function fetchPortalDescriptor(address: string): Promise<PortalDescriptor | null> {
  const res = await fetch(url(`/api/portals/visit/${encodeURIComponent(address)}/capabilities`));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Descriptor fetch failed (${res.status})`);
  const body = await res.json() as { descriptor: PortalDescriptor };
  return body.descriptor;
}

// ── Invoke ───────────────────────────────────────────────────────────────

export interface InvokeResponse {
  kind: 'invoke_response' | 'capability_not_found' | 'portal_offline' | 'invalid_input' | 'rate_limited';
  inboxId?: string;
  output?: Record<string, unknown>;
  message?: string;
}

export async function invokeCapability(
  portalAddress: string,
  capabilityId: string,
  input: Record<string, unknown>,
): Promise<InvokeResponse> {
  const me = getIdentity();
  const body = {
    input,
    visitorContactHash: me?.contactHash,
  };
  const res = await fetch(
    url(`/api/portals/visit/${encodeURIComponent(portalAddress)}/capabilities/${encodeURIComponent(capabilityId)}/invoke`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok && res.status < 500) {
    // 400/404/429/503 return structured kind in the body
    return res.json() as Promise<InvokeResponse>;
  }
  if (!res.ok) throw new Error(`Invoke failed (${res.status})`);
  return res.json() as Promise<InvokeResponse>;
}
