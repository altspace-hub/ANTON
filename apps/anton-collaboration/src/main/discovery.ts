/**
 * discovery.ts — DISCOVER + IDENTIFY: find a seller's agent via the ANTON
 * Portals relay registry, with no prior connection.
 *
 * This is the buyer side of the commerce loop's first leg. The relay
 * (relay.futurechain.eu) is a deployed, KYC'd, signature-verified searchable
 * index of signed `.anton` capability descriptors. Two calls:
 *
 *   - searchPortals()  GET /v1/portals/search — find businesses by free text +
 *                      capability verb + category (e.g. "sport store" + `order`).
 *   - resolvePortal()  GET /v1/portals/resolve/:address — the canonical signed
 *                      descriptor for an exact `name.namespace` address: the
 *                      seller's commerce verbs, payment rail, and originEndpoint
 *                      (the publisher's own ANTON, where TALK/INQUIRE/INVOKE go).
 *
 * The relay does DISCOVERY ONLY (DSA safe-harbour). Capability invocation goes
 * directly to the descriptor's `originEndpoint`, not the relay.
 *
 * TRUST (v1): the relay verifies each descriptor's Ed25519 signature at submit
 * time and stores the signing pubkey; resolve returns it. Independent client-
 * side signature verification against the publisher's signed envelope is a
 * hardening follow-on (the relay's resolve returns the descriptor + pubkey, not
 * the detached signature). Ported from the device-verified Comm client
 * (src/comm/services/portals.ts), Node-adapted (fetch-injectable, no Vite env).
 */

/** Override the relay base URL + fetch impl (tests inject a stub). */
export interface DiscoveryConfig {
  /** Relay HTTPS origin, no trailing slash. Defaults to env or the public relay. */
  base?: string;
  /** fetch implementation — defaults to the global. */
  fetch?: typeof fetch;
}

const DEFAULT_RELAY_BASE =
  (typeof process !== 'undefined' && process.env?.ANTON_COLLAB_RELAY_BASE) || 'https://relay.futurechain.eu';

function resolveBase(cfg?: DiscoveryConfig): string {
  return (cfg?.base ?? DEFAULT_RELAY_BASE).replace(/\/+$/, '');
}

function resolveFetch(cfg?: DiscoveryConfig): typeof fetch {
  const f = cfg?.fetch ?? (globalThis.fetch as typeof fetch | undefined);
  if (!f) throw new Error('discovery: no fetch implementation available (pass DiscoveryConfig.fetch)');
  return f;
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
  tier?: string;
  approvedAt?: string;
  relevanceScore?: number | null;
}

export interface PortalSearchResponse {
  results: PortalSearchResult[];
  total: number;
}

export interface PortalSearchOpts {
  /** Free-text query, e.g. "sport store". */
  text?: string;
  /** Capability verbs to require, e.g. ['order', 'inquire']. */
  verbs?: string[];
  categories?: string[];
  limit?: number;
  offset?: number;
}

/** Search the registry for businesses. Throws on a non-OK relay response. */
export async function searchPortals(
  opts: PortalSearchOpts = {}, cfg?: DiscoveryConfig,
): Promise<PortalSearchResponse> {
  const params = new URLSearchParams();
  if (opts.text) params.set('text', opts.text);
  if (opts.verbs?.length) params.set('verbs', opts.verbs.join(','));
  if (opts.categories?.length) params.set('categories', opts.categories.join(','));
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.offset) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const res = await resolveFetch(cfg)(`${resolveBase(cfg)}/v1/portals/search${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`discovery: search failed (${res.status})`);
  const body = (await res.json()) as Partial<PortalSearchResponse>;
  return { results: Array.isArray(body.results) ? body.results : [], total: Number(body.total ?? 0) };
}

// ── Resolve ──────────────────────────────────────────────────────────────

export interface CapabilitySpec {
  id: string;
  verb: string;
  title: string;
  description?: string;
  /** Authoring slug for the publisher's own routing — NOT a URL. Visitors
   *  invoke via the address+capId pattern against originEndpoint. */
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
    /** Publisher's publicly-reachable HTTPS origin (no trailing slash) — where
     *  TALK / INQUIRE / INVOKE go (the seller's own ANTON). */
    originEndpoint?: string;
  };
  capabilities?: CapabilitySpec[];
  payment?: Record<string, unknown>;
}

export interface ResolvedPortal {
  portalAddress: string;
  contactHash?: string;
  /** The Ed25519 pubkey the relay verified the descriptor signature against. */
  signingPubkeyHex?: string;
  descriptor: PortalDescriptor;
  tier?: string;
  approvedAt?: string;
}

interface ResolveBody {
  found: boolean;
  portalAddress?: string;
  contactHash?: string;
  signingPubkeyHex?: string;
  descriptor?: PortalDescriptor;
  tier?: string;
  approvedAt?: string;
}

/** Resolve an exact `name.namespace` address → its signed descriptor + the
 *  signing pubkey + originEndpoint. Returns null when the portal doesn't exist
 *  / was revoked (relay 404). Throws on other failures. */
export async function resolvePortal(
  address: string, cfg?: DiscoveryConfig,
): Promise<ResolvedPortal | null> {
  const res = await resolveFetch(cfg)(`${resolveBase(cfg)}/v1/portals/resolve/${encodeURIComponent(address)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`discovery: resolve failed (${res.status})`);
  const body = (await res.json()) as ResolveBody;
  if (!body.found || !body.descriptor) return null;
  return {
    portalAddress: body.portalAddress ?? address,
    ...(body.contactHash !== undefined ? { contactHash: body.contactHash } : {}),
    ...(body.signingPubkeyHex !== undefined ? { signingPubkeyHex: body.signingPubkeyHex } : {}),
    descriptor: body.descriptor,
    ...(body.tier !== undefined ? { tier: body.tier } : {}),
    ...(body.approvedAt !== undefined ? { approvedAt: body.approvedAt } : {}),
  };
}

/** Convenience: the commerce verbs a resolved seller exposes (for an agent to
 *  decide whether it can inquire/order/pay here). */
export function portalVerbs(p: ResolvedPortal): string[] {
  return (p.descriptor.capabilities ?? []).map((c) => c.verb).filter((v): v is string => !!v);
}

/** Find a capability by verb (e.g. the 'inquire' or 'order' endpoint to TALK to). */
export function capabilityByVerb(p: ResolvedPortal, verb: string): CapabilitySpec | null {
  return (p.descriptor.capabilities ?? []).find((c) => c.verb === verb) ?? null;
}
