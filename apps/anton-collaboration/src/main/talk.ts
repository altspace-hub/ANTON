/**
 * talk.ts — TALK: the buyer invokes a seller's capability on the seller's OWN
 * ANTON (not the relay). This is "ask the sport store about Jordans size 43".
 *
 * The relay does discovery only; capability invocation goes DIRECTLY to the
 * descriptor's `originEndpoint` (the seller's hosted ANTON). The descriptor's
 * Ed25519 signature is the trust root. Ported from the device-verified Comm
 * client (src/comm/services/portals.ts `invokeCapability`), Node-adapted
 * (fetch-injectable, the buyer's contactHash passed in rather than read from a
 * global identity store).
 *
 * Wire (matches server/routes/portals.ts):
 *   POST {originEndpoint}/api/portals/visit/{address}/capabilities/{capId}/invoke
 *   body: { input, visitorContactHash? }
 *
 * The seller answers either synchronously (an auto-quoter — phase P3) or by
 * queuing into a human inbox and returning a pending placeholder. Either way
 * this returns the seller's structured response for the buyer's negotiation
 * brain to read.
 */
import type { ResolvedPortal, CapabilitySpec } from './discovery.js';

export type InvokeOutcome =
  | 'response'            // the seller answered (sync output, or a queued ack)
  | 'capability_not_found'
  | 'seller_offline'
  | 'invalid_input'
  | 'rate_limited'
  | 'not_supported'      // seller has no originEndpoint declared
  | 'trust_required';

export interface InvokeResult {
  kind: InvokeOutcome;
  /** Server-issued id to poll/correlate the seller's (possibly async) answer. */
  responseId?: string;
  /** The seller's structured output (e.g. a quote: price, availability). */
  output?: Record<string, unknown>;
  message?: string;
}

export interface InvokeOpts {
  fetch?: typeof fetch;
  /** The buyer's contact hash, attributed in the seller's inbox. */
  visitorContactHash?: string;
  /** Allow a non-https seller origin (local/dev sellers). Defaults to the
   *  ANTON_COLLAB_ALLOW_INSECURE_ORIGIN env flag. */
  allowInsecureOrigin?: boolean;
}

/**
 * SSRF guard. The seller's `originEndpoint` comes from a relay-resolved
 * descriptor — untrusted input that we then POST to. A malicious descriptor
 * could point it at a cloud metadata service (http://169.254.169.254/…) or an
 * internal http://127.0.0.1 service. The cheap, strong default is https-only:
 * every real cloud metadata IMDS endpoint is http, so requiring TLS removes the
 * whole class. Local/dev sellers (http loopback) opt in explicitly via
 * ANTON_COLLAB_ALLOW_INSECURE_ORIGIN. (A LAN-aware allowlist is a P8 follow-on,
 * mirroring the main server's assertSafeLanEgressUrl.)
 */
function originIsAllowed(origin: string, allowInsecure: boolean): boolean {
  let scheme: string;
  try {
    scheme = new URL(origin).protocol;
  } catch {
    return false;
  }
  if (scheme === 'https:') return true;
  return allowInsecure && scheme === 'http:';
}

/** Server-side 200 shape from portal-handler (kind: 'invoke_accepted'). */
interface ServerAccepted {
  kind: 'invoke_accepted';
  responseId: string;
  invocationId: string;
  verb: string;
  output: Record<string, unknown>;
}

/** The canonical "name.namespace.portal" address the seller's invoke route
 *  requires. The Comm client passes only `portal.name`, which the server's
 *  handleInvoke regex (`^(...)\.(...)\.portal$`) rejects across instances — it
 *  only works on the local-first path. We build the full form: prefer name +
 *  namespace; fall back to the resolved portalAddress, normalised to carry the
 *  `.portal` suffix the regex demands. */
function fullPortalAddress(p: ResolvedPortal): string | null {
  const name = p.descriptor.portal.name?.trim();
  const ns = p.descriptor.portal.namespace?.trim();
  if (name && ns) return `${name}.${ns}.portal`;
  const addr = p.portalAddress?.trim();
  if (!addr) return null;
  return /\.portal$/.test(addr) ? addr : `${addr}.portal`;
}

function originAddress(p: ResolvedPortal): { origin: string; address: string } | null {
  const origin = p.descriptor.portal.originEndpoint?.trim().replace(/\/+$/, '');
  if (!origin) return null;
  const address = fullPortalAddress(p);
  if (!address) return null;
  return { origin, address };
}

/** Invoke a capability (by id) on a resolved seller. */
export async function invokeCapability(
  resolved: ResolvedPortal, capabilityId: string, input: Record<string, unknown>, opts: InvokeOpts = {},
): Promise<InvokeResult> {
  const cap = (resolved.descriptor.capabilities ?? []).find((c) => c.id === capabilityId);
  if (!cap) return { kind: 'capability_not_found', message: `No capability with id "${capabilityId}".` };

  const oa = originAddress(resolved);
  if (!oa) return { kind: 'not_supported', message: 'Seller has no originEndpoint — direct invocation unavailable.' };

  const allowInsecure = opts.allowInsecureOrigin
    ?? (typeof process !== 'undefined' && !!process.env?.ANTON_COLLAB_ALLOW_INSECURE_ORIGIN);
  if (!originIsAllowed(oa.origin, allowInsecure)) {
    return {
      kind: 'not_supported',
      message: `Seller origin "${oa.origin}" is not https — refusing to invoke (set ANTON_COLLAB_ALLOW_INSECURE_ORIGIN for local sellers).`,
    };
  }

  const f = opts.fetch ?? (globalThis.fetch as typeof fetch | undefined);
  if (!f) throw new Error('talk: no fetch implementation available');

  const invokeUrl =
    `${oa.origin}/api/portals/visit/${encodeURIComponent(oa.address)}` +
    `/capabilities/${encodeURIComponent(capabilityId)}/invoke`;
  const body = { input, ...(opts.visitorContactHash ? { visitorContactHash: opts.visitorContactHash } : {}) };

  try {
    const res = await f(invokeUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (res.status === 429) return { kind: 'rate_limited', message: 'Too many requests; try again later.' };
    if (!res.ok && res.status < 500) {
      const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (parsed && typeof parsed.kind === 'string') return parsed as unknown as InvokeResult;
      return { kind: 'invalid_input', message: `Seller returned ${res.status}.` };
    }
    if (!res.ok) return { kind: 'seller_offline', message: `Seller returned ${res.status}.` };
    const parsed = (await res.json()) as ServerAccepted | InvokeResult;
    if (parsed.kind === 'invoke_accepted') {
      return { kind: 'response', responseId: parsed.responseId ?? parsed.invocationId, output: parsed.output };
    }
    return parsed as InvokeResult;
  } catch (err) {
    return { kind: 'seller_offline', message: (err as Error).message };
  }
}

/** Find the capability a verb maps to (e.g. 'inquire' → the inquire cap). */
export function capabilityForVerb(resolved: ResolvedPortal, verb: string): CapabilitySpec | null {
  return (resolved.descriptor.capabilities ?? []).find((c) => c.verb === verb) ?? null;
}
