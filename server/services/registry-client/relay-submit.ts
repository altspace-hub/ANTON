/**
 * relay-submit.ts — ANTON Local → relay portal submission client.
 *
 * Bridges ANTON Local's portal walkthrough finalize step to the relay's
 * /v1/portals/submit endpoint. Separate from the legacy registry-client
 * (which targets the un-deployed FutureChain registry protocol):
 *
 *   - This client is purpose-built for relay.futurechain.eu's HTTP API.
 *   - Carries KYC fields the relay needs for Tier 3 self-service.
 *   - Format-bridges between ANTON Local's storage (SPKI hex pubkey,
 *     PEM private key) and the relay's wire shape (raw 64-hex pubkey,
 *     base64url signature).
 *   - Derives a relay-style contact hash from the RAW 32-byte pubkey
 *     (matching the Comm App and the relay's deriveContactHash). NOT
 *     the same as ANTON Local's deriveContactHashFromPublicKey, which
 *     hashes the 44-byte SPKI DER — those two hashes diverge for the
 *     same keypair, and only the relay-style one validates server-side.
 *
 * The legacy registry-client stays in place for any future federation
 * with a real registry server; this module is what the walkthrough
 * actually calls today.
 */

import { createHash } from 'node:crypto';
import { signCanonical } from '../../lib/portal-crypto.js';

// ── Public types ───────────────────────────────────────────────────────────

export interface RelayKycFields {
  legalName: string;
  idDocumentType: 'passport' | 'national_id' | 'org_registration' | 'other';
  idDocumentNumber: string;       // plaintext from caller; relay hashes server-side
  idDocumentCountry: string;      // ISO 3166-1 alpha-2
  orgName?: string;
  orgRegistrationNumber?: string;
  contactEmail: string;
  contactPhone?: string;
  addressCountry: string;
  addressCity: string;
  addressStreet: string;
}

export interface RelaySubmitArgs {
  /** Base URL ending in /v1 (e.g. https://relay.futurechain.eu/v1). */
  relayBaseUrl: string;
  /** Portal name without namespace, lowercase, 3-32 chars. */
  name: string;
  /** Namespace (defaults to 'global' when omitted). */
  namespace: string;
  /** The full signed-descriptor JSON. The relay verifies the
   *  signature over canonicalize(this) so it must be the exact
   *  descriptor object — not a re-serialised copy. */
  descriptorJson: Record<string, unknown>;
  /** ANTON Local's SPKI hex pubkey (88 chars). Internally converted
   *  to raw 32-byte hex for the relay wire. */
  publicKeyHex: string;
  /** PEM PKCS#8 private key. Used by Node's crypto.sign() — never
   *  leaves the calling process. */
  privateKeyPem: string;
  /** KYC fields collected from the user. Tier 3 self-service shape;
   *  Tier 2 claim flow lives in a separate endpoint. */
  kyc: RelayKycFields;
  /** Override fetch (tests). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Override the timeout (ms). Defaults to 15 s. */
  timeoutMs?: number;
}

export interface RelaySubmitResult {
  submissionId: string;
  status: 'pending';
  tier: 'tier3_selfservice';
  submittedAt: string;
  message?: string;
}

export class RelaySubmitError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ── Format bridging helpers ────────────────────────────────────────────────

/**
 * Convert an 88-char SPKI DER hex pubkey (ANTON Local's storage form)
 * to a 64-char raw 32-byte hex (the relay's wire form, matching the
 * Comm App's @noble/ed25519 output).
 *
 * The SPKI for Ed25519 is:
 *   30 2a                               -- SEQUENCE (42 bytes)
 *     30 05                             --   SEQUENCE (5 bytes)
 *       06 03 2b 65 70                  --     OID 1.3.101.112 (Ed25519)
 *     03 21 00 <32-byte-pubkey>         --   BIT STRING (33 bytes: 1 unused + 32 data)
 *
 * So the raw 32 bytes are the last 32 of the 44-byte DER. We do strict
 * validation of the prefix to fail loud rather than silently mangling
 * non-Ed25519 keys.
 */
export function spkiHexToRawPubkeyHex(spkiHex: string): string {
  if (!/^[0-9a-f]{88}$/i.test(spkiHex)) {
    throw new RelaySubmitError(
      'invalid_pubkey',
      `expected 88-char SPKI hex, got ${spkiHex.length} chars`,
    );
  }
  const lower = spkiHex.toLowerCase();
  // The standard 12-byte Ed25519 SPKI prefix.
  const ED25519_SPKI_PREFIX = '302a300506032b6570032100';
  if (!lower.startsWith(ED25519_SPKI_PREFIX)) {
    throw new RelaySubmitError(
      'invalid_pubkey',
      'public key is not an Ed25519 SPKI DER',
    );
  }
  return lower.slice(24); // 24 hex = 12 byte prefix; rest is the raw 32-byte key
}

/**
 * Derive ANTON-XXXX-XXXX-XXXX-XXXX from a raw 32-byte pubkey hex.
 * Mirrors the algorithm in:
 *   - relay/src/registry/verify.ts deriveContactHash()
 *   - src/comm/services/identity.ts deriveContactHash()
 *
 * Deliberately NOT the same as
 * server/services/identity.ts deriveContactHashFromPublicKey() —
 * that one hashes 44 bytes of SPKI DER and produces a different value
 * for the same key. Both are "the contact hash for this key" within
 * their respective surfaces; they just don't agree on canonical form.
 */
const RELAY_HASH_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function deriveRelayContactHash(rawPubkeyHex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(rawPubkeyHex)) {
    throw new RelaySubmitError('invalid_pubkey', 'rawPubkeyHex must be 64 lowercase hex chars');
  }
  const hash = createHash('sha256').update(Buffer.from(rawPubkeyHex, 'hex')).digest();
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let segment = '';
    for (let c = 0; c < 4; c++) {
      const byte = hash[s * 4 + c]!;
      segment += RELAY_HASH_CHARSET[byte % RELAY_HASH_CHARSET.length];
    }
    segments.push(segment);
  }
  return `ANTON-${segments.join('-')}`;
}

// ── Submit ─────────────────────────────────────────────────────────────────

/**
 * POST to /v1/portals/submit. Throws RelaySubmitError on any failure
 * (network, timeout, non-2xx response). The caller decides whether
 * to surface that to the user or just log + continue.
 */
export async function submitToRelay(args: RelaySubmitArgs): Promise<RelaySubmitResult> {
  const fetchFn = args.fetchImpl ?? globalThis.fetch;
  const timeoutMs = args.timeoutMs ?? 15_000;

  const rawPubkey = spkiHexToRawPubkeyHex(args.publicKeyHex);
  const relayContactHash = deriveRelayContactHash(rawPubkey);

  // Sign the descriptor canonically. The relay re-canonicalises on its
  // side and verifies via @noble/ed25519. Cross-library Ed25519 works
  // because both Node's crypto.sign and @noble/ed25519 are RFC 8032
  // compliant — a signature produced by either verifies under the
  // other.
  const descriptorSignature = signCanonical(args.descriptorJson, args.privateKeyPem);

  const body = {
    proposedName: args.name,
    proposedNamespace: args.namespace,
    signingPubkeyHex: rawPubkey,
    submitterContactHash: relayContactHash,
    descriptorJson: args.descriptorJson,
    descriptorSignature,
    kyc: args.kyc,
  };

  const url = args.relayBaseUrl.replace(/\/+$/, '') + '/portals/submit';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new RelaySubmitError('timeout', `relay submit timed out after ${timeoutMs}ms`);
    }
    throw new RelaySubmitError('network_error', (err as Error).message);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail: Record<string, unknown> = {};
    try { detail = (await res.json()) as Record<string, unknown>; }
    catch { /* opaque error body */ }
    const code = typeof detail.error === 'string' ? detail.error : `http_${res.status}`;
    const message = typeof detail.message === 'string' ? detail.message : res.statusText;
    throw new RelaySubmitError(code, message, res.status);
  }

  return (await res.json()) as RelaySubmitResult;
}

// ── Status poll ────────────────────────────────────────────────────────────

export interface RelaySubmissionStatus {
  submissionId: string;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'withdrawn';
  tier: string;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  proposedName: string;
  proposedNamespace: string;
  portalAddress: string | null;
}

/**
 * Poll the relay for the current status of a submission. Used by the
 * portal management UI to display Pending / Approved / Rejected state
 * and to surface a rejection reason.
 */
export async function fetchSubmissionStatus(
  relayBaseUrl: string,
  submissionId: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<RelaySubmissionStatus> {
  const fetchFn = opts.fetchImpl ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const url = relayBaseUrl.replace(/\/+$/, '') + `/portals/submissions/${encodeURIComponent(submissionId)}/status`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) {
      throw new RelaySubmitError(`http_${res.status}`, res.statusText, res.status);
    }
    return (await res.json()) as RelaySubmissionStatus;
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new RelaySubmitError('timeout', `status poll timed out after ${timeoutMs}ms`);
    }
    if (err instanceof RelaySubmitError) throw err;
    throw new RelaySubmitError('network_error', (err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}
