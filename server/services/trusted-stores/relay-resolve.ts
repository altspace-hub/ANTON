/**
 * relay-resolve.ts — fetch a seller's INDEPENDENT signing key from the ANTON
 * relay registry, to anchor a Trusted-Stores pin against something other than the
 * descriptor's own embedded key.
 *
 * Why this exists: a descriptor is self-signed — verifying it against the key it
 * itself carries proves only internal consistency, not authenticity (a forger
 * self-signs their own descriptor). The relay, by contrast, verified the
 * descriptor's Ed25519 signature at KYC'd SUBMIT time and stores the signing
 * pubkey it accepted. Resolving by address returns THAT pubkey — an independent
 * record. Anchoring the pin to the relay's key (and cross-checking the embedded
 * key against it) closes the circularity. The relay is the trust root here; a
 * future hardening verifies the descriptor's transparency-log inclusion proof so
 * the relay itself can't equivocate.
 *
 * Best-effort + read-only: when the relay is unreachable / not configured / the
 * seller isn't registered, this returns null and the caller falls back to
 * trust-on-first-use on the cached descriptor (clearly labelled as such).
 *
 * Wire shape (confirmed live): GET {base}/portals/resolve/{address-without-.portal}
 *   → { found, portalAddress, contactHash, signingPubkeyHex (RAW 64-hex), descriptor }
 */
import { spkiHexToRawPubkeyHex } from '../registry-client/relay-submit.js';
import { publicKeyWireToHex } from '../../lib/portal-crypto.js';
import type { InclusionProof, SignedTreeHead } from '../registry-client/types.js';

/** Ed25519 SubjectPublicKeyInfo DER prefix (12 bytes) — the bytes before the raw
 *  32-byte public key in an SPKI-encoded Ed25519 key. */
const ED25519_SPKI_PREFIX = '302a300506032b6570032100';

/** The public read base. Operators point this at their relay; defaults to the
 *  public relay (resolve is read-only + safe). RELAY_PORTAL_SUBMIT_URL already
 *  includes the /v1 suffix. */
function relayBase(override?: string): string {
  return (override ?? process.env.RELAY_PORTAL_SUBMIT_URL ?? 'https://relay.futurechain.eu/v1')
    .trim().replace(/\/+$/, '');
}

/** Normalise any Ed25519 public-key form (raw 64-hex / SPKI 88-hex / base64url
 *  wire) to the canonical RAW 32-byte hex used for cross-key comparison. */
export function toRawPubkeyHex(key: string): string | null {
  const k = key.trim();
  if (/^[0-9a-f]{64}$/i.test(k)) return k.toLowerCase();
  if (/^[0-9a-f]{88}$/i.test(k)) { try { return spkiHexToRawPubkeyHex(k).toLowerCase(); } catch { return null; } }
  try { return spkiHexToRawPubkeyHex(publicKeyWireToHex(k)).toLowerCase(); } catch { return null; }
}

/** Raw 32-byte hex → 88-char SPKI DER hex (the form signCanonical/verifyCanonical
 *  + the portals table store). */
export function rawToSpkiHex(rawHex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(rawHex)) throw new Error('rawToSpkiHex: expected 64-char raw hex');
  return ED25519_SPKI_PREFIX + rawHex.toLowerCase();
}

export interface RelayResolution {
  /** The relay-verified signing key, RAW 32-byte hex. */
  signingPubkeyRawHex: string;
  /** The relay's authoritative `name.namespace` (used to rebuild the log leaf). */
  portalAddress?: string;
  contactHash?: string;
  displayTitle?: string;
  descriptor: Record<string, unknown>;
  /** Transparency-log proof bundle (present only when the relay runs the log).
   *  All four arrive together or not at all; the caller recomputes the leaf from
   *  `descriptor` and verifies inclusion + the STH signature. */
  inclusionProof?: InclusionProof;
  leafIndex?: number;
  sth?: SignedTreeHead;
  sthSignature?: string;
}

export async function resolveViaRelay(
  portalAddress: string, opts: { fetchImpl?: typeof fetch; baseUrl?: string } = {},
): Promise<RelayResolution | null> {
  const f = opts.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
  if (!f) return null;
  const base = relayBase(opts.baseUrl);
  const addr = portalAddress.trim().replace(/\.portal$/i, ''); // relay resolves WITHOUT the .portal suffix
  if (!addr) return null;
  try {
    const res = await f(`${base}/portals/resolve/${encodeURIComponent(addr)}`,
      { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      found?: boolean; portalAddress?: string; signingPubkeyHex?: string; contactHash?: string;
      descriptor?: Record<string, unknown>;
      leafIndex?: number; inclusionProof?: InclusionProof; sth?: SignedTreeHead; sthSignature?: string;
    };
    if (!j.found || typeof j.signingPubkeyHex !== 'string' || !j.descriptor) return null;
    const raw = toRawPubkeyHex(j.signingPubkeyHex);
    if (!raw) return null;
    const portal = (j.descriptor as { portal?: { displayTitle?: unknown } }).portal;
    // The proof bundle is only used when ALL four parts are present (a relay that
    // hasn't enabled the log omits them → caller falls back to registry trust).
    const hasProof = !!j.inclusionProof && typeof j.leafIndex === 'number' && !!j.sth && typeof j.sthSignature === 'string';
    return {
      signingPubkeyRawHex: raw,
      ...(typeof j.portalAddress === 'string' ? { portalAddress: j.portalAddress } : {}),
      ...(typeof j.contactHash === 'string' ? { contactHash: j.contactHash } : {}),
      ...(typeof portal?.displayTitle === 'string' ? { displayTitle: portal.displayTitle } : {}),
      descriptor: j.descriptor,
      ...(hasProof ? { inclusionProof: j.inclusionProof, leafIndex: j.leafIndex, sth: j.sth, sthSignature: j.sthSignature } : {}),
    };
  } catch {
    return null;
  }
}
