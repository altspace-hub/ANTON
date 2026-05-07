/**
 * hello.ts — HELLO_INSTANCE / HELLO_PHONE parsing + the §3.2 6-step
 * verification of HELLO_INSTANCE.
 *
 * The verification is the relay's primary security duty: it guards against
 * instance squatting (T14), proof replay (across relays — closed by the
 * `relay_url` binding), and bad signatures (closed by binding_sig + proof_sig).
 *
 * Spec references:
 *   §3.2  HELLO_INSTANCE payload + 6-step verification
 *   §3.3  HELLO_PHONE payload
 *   §1.5  instance_id derivation
 *   §4.4  Ed25519 → X25519 conversion
 */

import {
  ed25519PkToCurve25519,
  ed25519Verify,
  deriveInstanceId,
  constantTimeEqual,
  sha256,
  bytesToHex,
} from './primitives.js';

/** §6.2 HELLO-related error codes (subset). */
export enum HelloError {
  BAD_HELLO = 'BAD_HELLO',         // 0x0002 — malformed payload, mismatched id, bad binding, wrong relay_url
  INVALID_PROOF = 'INVALID_PROOF', // 0x0003 — bad timestamp, bad sig, replay
}

export class HelloVerificationError extends Error {
  constructor(
    public readonly code: HelloError,
    public readonly step: number,
    message: string,
  ) {
    super(`step ${step} ${code}: ${message}`);
    this.name = 'HelloVerificationError';
  }
}

// ── Constants from spec §3.2 ─────────────────────────────────────────

/** Fixed domain-separation prefix for HELLO_INSTANCE proof signatures. */
const PROOF_DOMAIN = new TextEncoder().encode('ANTON-MESH-HELLO-INSTANCE/v1\n');

/** Fixed domain-separation prefix for instance binding signatures. */
const BINDING_DOMAIN = new TextEncoder().encode('ANTON-MESH-IDENTITY/v1\n');

/** Spec §3.2 — proof timestamp window. */
export const PROOF_TIMESTAMP_WINDOW_S = 30;

/** Spec §3.2 step 6 — replay-cache TTL. */
export const PROOF_REPLAY_TTL_MS = 60_000;

// ── Layout sizes ─────────────────────────────────────────────────────

/** Min payload size: 16+32+32+64+2+0+4+64+4 = 218. relay_url length is
 *  encoded as u16; if 0 (empty), payload is 218 bytes minimum. */
const HELLO_INSTANCE_MIN_LEN = 16 + 32 + 32 + 64 + 2 + 0 + 4 + 64 + 4;

// ── HELLO_INSTANCE ─────────────────────────────────────────────────

export interface ParsedHelloInstance {
  instance_id: Uint8Array;       // 16 bytes
  instance_static_pk: Uint8Array; // 32 bytes (X25519)
  instance_ed_pk: Uint8Array;    // 32 bytes (Ed25519)
  binding_sig: Uint8Array;       // 64 bytes
  relay_url: string;             // canonical relay URL the HELLO claims
  timestamp: number;             // u32 BE seconds since epoch
  proof_sig: Uint8Array;         // 64 bytes
  caps: number;                  // u32 BE bitfield
}

export function parseHelloInstance(payload: Uint8Array): ParsedHelloInstance {
  if (payload.length < HELLO_INSTANCE_MIN_LEN) {
    throw new HelloVerificationError(
      HelloError.BAD_HELLO,
      0,
      `payload ${payload.length} bytes < min ${HELLO_INSTANCE_MIN_LEN}`,
    );
  }
  let off = 0;
  const instance_id = payload.slice(off, off + 16); off += 16;
  const instance_static_pk = payload.slice(off, off + 32); off += 32;
  const instance_ed_pk = payload.slice(off, off + 32); off += 32;
  const binding_sig = payload.slice(off, off + 64); off += 64;
  const relay_url_len = (payload[off]! << 8) | payload[off + 1]!; off += 2;
  if (off + relay_url_len + 4 + 64 + 4 > payload.length) {
    throw new HelloVerificationError(
      HelloError.BAD_HELLO,
      0,
      `relay_url_len ${relay_url_len} would overrun payload`,
    );
  }
  const relay_url = new TextDecoder('utf-8', { fatal: false }).decode(
    payload.subarray(off, off + relay_url_len),
  );
  off += relay_url_len;
  const timestamp = (payload[off]! << 24) | (payload[off + 1]! << 16)
                  | (payload[off + 2]! << 8) | payload[off + 3]!;
  off += 4;
  const proof_sig = payload.slice(off, off + 64); off += 64;
  const caps = (payload[off]! << 24) | (payload[off + 1]! << 16)
             | (payload[off + 2]! << 8) | payload[off + 3]!;
  off += 4;
  if (off !== payload.length) {
    throw new HelloVerificationError(
      HelloError.BAD_HELLO,
      0,
      `trailing ${payload.length - off} bytes after caps`,
    );
  }
  return {
    instance_id, instance_static_pk, instance_ed_pk,
    binding_sig, relay_url, timestamp, proof_sig, caps,
  };
}

/**
 * Verifier interface — the relay implementation passes its own canonical
 * URL and a replay-cache backend. Replay cache stores `(instance_id, sha256(proof_sig))`
 * keys for PROOF_REPLAY_TTL_MS; `recordProof` returns true if the entry was new
 * (accept) or false if already seen (reject as replay).
 */
export interface HelloVerifierConfig {
  /** This relay's canonical URL — already canonicalized (§4.2.1). */
  ownCanonicalUrl: string;
  /** Returns true if this proof was newly recorded; false if already seen. */
  recordProof(key: string): boolean;
  /** Source of "now" in seconds since UNIX epoch. Tests inject; production uses Date.now / 1000. */
  now(): number;
}

/**
 * Spec §3.2 — perform all 6 verification steps. Throws HelloVerificationError
 * on any failure (with step number); returns the parsed HELLO on success.
 */
export function verifyHelloInstance(
  payload: Uint8Array,
  cfg: HelloVerifierConfig,
): ParsedHelloInstance {
  const parsed = parseHelloInstance(payload);

  // Step 1: instance_id == sha256(instance_static_pk)[0..16)
  const expected_id = deriveInstanceId(parsed.instance_static_pk);
  if (!constantTimeEqual(parsed.instance_id, expected_id)) {
    throw new HelloVerificationError(
      HelloError.BAD_HELLO,
      1,
      `instance_id ${bytesToHex(parsed.instance_id)} != sha256(static_pk)[0..16) ${bytesToHex(expected_id)}`,
    );
  }

  // Step 2: binding_sig is a valid Ed25519(instance_ed_pk) over
  //   "ANTON-MESH-IDENTITY/v1\n" || instance_ed_pk || instance_static_pk
  const bindingMsg = concat(BINDING_DOMAIN, parsed.instance_ed_pk, parsed.instance_static_pk);
  if (!ed25519Verify(parsed.binding_sig, bindingMsg, parsed.instance_ed_pk)) {
    throw new HelloVerificationError(
      HelloError.BAD_HELLO,
      2,
      'binding_sig does not verify under instance_ed_pk',
    );
  }

  // Step 2b (additional check the spec implies): the X25519 derived from
  // instance_ed_pk must equal instance_static_pk. Belt-and-braces with
  // step 2 — protects against an attacker registering a forged binding
  // signature for a key pair that wouldn't actually work in Noise IK.
  // This is cheap and guarantees the operator's claimed pair is the pair
  // the rest of the protocol will use.
  const derived_x_pk = ed25519PkToCurve25519(parsed.instance_ed_pk);
  if (!constantTimeEqual(derived_x_pk, parsed.instance_static_pk)) {
    throw new HelloVerificationError(
      HelloError.BAD_HELLO,
      2,
      'instance_static_pk != ed25519_pk_to_curve25519(instance_ed_pk)',
    );
  }

  // Step 3: relay_url matches THIS relay's canonical URL.
  if (parsed.relay_url !== cfg.ownCanonicalUrl) {
    throw new HelloVerificationError(
      HelloError.BAD_HELLO,
      3,
      `relay_url "${parsed.relay_url}" != own "${cfg.ownCanonicalUrl}"`,
    );
  }

  // Step 4: timestamp in [now-30s, now+30s].
  const now = cfg.now();
  const skew = Math.abs(now - parsed.timestamp);
  if (skew > PROOF_TIMESTAMP_WINDOW_S) {
    throw new HelloVerificationError(
      HelloError.INVALID_PROOF,
      4,
      `timestamp ${parsed.timestamp} skew ${skew}s > ±${PROOF_TIMESTAMP_WINDOW_S}s window (now=${now})`,
    );
  }

  // Step 5: proof_sig is a valid Ed25519(instance_ed_pk) over
  //   PROOF_DOMAIN || instance_id || instance_static_pk || instance_ed_pk
  //   || relay_url || timestamp_u32_be
  const proofMsg = concat(
    PROOF_DOMAIN,
    parsed.instance_id,
    parsed.instance_static_pk,
    parsed.instance_ed_pk,
    new TextEncoder().encode(parsed.relay_url),
    u32BE(parsed.timestamp),
  );
  if (!ed25519Verify(parsed.proof_sig, proofMsg, parsed.instance_ed_pk)) {
    throw new HelloVerificationError(
      HelloError.INVALID_PROOF,
      5,
      'proof_sig does not verify under instance_ed_pk',
    );
  }

  // Step 6: replay cache miss. Key = (instance_id || sha256(proof_sig)).
  const replayKey = bytesToHex(parsed.instance_id) + ':' + bytesToHex(sha256(parsed.proof_sig));
  if (!cfg.recordProof(replayKey)) {
    throw new HelloVerificationError(
      HelloError.INVALID_PROOF,
      6,
      'proof_sig already seen within replay window',
    );
  }

  return parsed;
}

// ── HELLO_PHONE ────────────────────────────────────────────────────

export interface ParsedHelloPhone {
  instance_id: Uint8Array;       // 16 bytes — which instance the phone wants
  phone_ephem_pk: Uint8Array;    // 32 bytes — X25519 ephemeral
  noise_init_msg: Uint8Array;    // variable — opaque to relay
}

export function parseHelloPhone(payload: Uint8Array): ParsedHelloPhone {
  // 16 (instance_id) + 32 (phone_ephem_pk) + remainder (noise_init_msg)
  const FIXED = 16 + 32;
  if (payload.length < FIXED) {
    throw new HelloVerificationError(
      HelloError.BAD_HELLO,
      0,
      `HELLO_PHONE payload ${payload.length} < ${FIXED}`,
    );
  }
  const instance_id = payload.slice(0, 16);
  const phone_ephem_pk = payload.slice(16, 48);
  const noise_init_msg = payload.slice(48);
  return { instance_id, phone_ephem_pk, noise_init_msg };
}

// ── DIAL_INSTANCE (§3.11) ─────────────────────────────────────────
// Same wire shape as HELLO_PHONE — instance_id is the peer the dialer
// wants to reach, plus the Noise IK msg 1. Identity is established by
// the dialer's pre-existing HELLO_INSTANCE registration on the same
// WS connection, so no proof_sig here.

export interface ParsedDialInstance {
  target_instance_id: Uint8Array;     // 16 bytes — the peer the dialer wants
  initiator_ephem_pk: Uint8Array;     // 32 bytes — X25519 ephemeral
  noise_init_msg: Uint8Array;         // variable — opaque to relay
}

export function parseDialInstance(payload: Uint8Array): ParsedDialInstance {
  const FIXED = 16 + 32;
  if (payload.length < FIXED) {
    throw new HelloVerificationError(
      HelloError.BAD_HELLO,
      0,
      `DIAL_INSTANCE payload ${payload.length} < ${FIXED}`,
    );
  }
  const target_instance_id = payload.slice(0, 16);
  const initiator_ephem_pk = payload.slice(16, 48);
  const noise_init_msg = payload.slice(48);
  return { target_instance_id, initiator_ephem_pk, noise_init_msg };
}

// ── helpers ────────────────────────────────────────────────────────

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function u32BE(n: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (n >>> 24) & 0xFF;
  out[1] = (n >>> 16) & 0xFF;
  out[2] = (n >>> 8) & 0xFF;
  out[3] = n & 0xFF;
  return out;
}

// ── HELLO_INSTANCE construction (test + tooling helper) ────────────

/**
 * Build a valid HELLO_INSTANCE payload using the given keypair and a
 * supplied signer. The sign function MUST be Ed25519(instance_ed_priv).
 *
 * Used by tests + by the future Phase 3 instance dialer.
 */
export interface BuildHelloInstanceInput {
  instance_ed_pk: Uint8Array;     // 32 bytes
  instance_static_pk: Uint8Array;  // 32 bytes (X25519, derived from ed_pk)
  binding_sig: Uint8Array;         // 64 bytes — pre-computed self-binding
  relay_url: string;               // canonical URL of the relay being dialed
  timestamp: number;               // u32 seconds since UNIX epoch
  caps: number;                    // u32 capabilities bitfield
  sign: (msg: Uint8Array) => Uint8Array; // Ed25519 signer with instance_ed_priv
}

export function buildHelloInstance(input: BuildHelloInstanceInput): Uint8Array {
  const instance_id = deriveInstanceId(input.instance_static_pk);
  const relayBytes = new TextEncoder().encode(input.relay_url);
  if (relayBytes.length > 0xFFFF) {
    throw new Error(`relay_url too long: ${relayBytes.length} bytes`);
  }
  const proofMsg = concat(
    PROOF_DOMAIN,
    instance_id,
    input.instance_static_pk,
    input.instance_ed_pk,
    relayBytes,
    u32BE(input.timestamp),
  );
  const proof_sig = input.sign(proofMsg);
  if (proof_sig.length !== 64) {
    throw new Error(`signer produced ${proof_sig.length}-byte sig, expected 64`);
  }
  // Pack payload
  const out = new Uint8Array(
    16 + 32 + 32 + 64 + 2 + relayBytes.length + 4 + 64 + 4,
  );
  let off = 0;
  out.set(instance_id, off); off += 16;
  out.set(input.instance_static_pk, off); off += 32;
  out.set(input.instance_ed_pk, off); off += 32;
  out.set(input.binding_sig, off); off += 64;
  out[off] = (relayBytes.length >>> 8) & 0xFF;
  out[off + 1] = relayBytes.length & 0xFF;
  off += 2;
  out.set(relayBytes, off); off += relayBytes.length;
  out.set(u32BE(input.timestamp), off); off += 4;
  out.set(proof_sig, off); off += 64;
  out.set(u32BE(input.caps), off); off += 4;
  return out;
}

/** Build the binding signature over (BINDING_DOMAIN || ed_pk || x_pk). */
export function buildBindingSig(
  instance_ed_pk: Uint8Array,
  instance_static_pk: Uint8Array,
  sign: (msg: Uint8Array) => Uint8Array,
): Uint8Array {
  const msg = concat(BINDING_DOMAIN, instance_ed_pk, instance_static_pk);
  return sign(msg);
}
