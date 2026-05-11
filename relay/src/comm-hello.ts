/**
 * comm-hello.ts — HELLO_COMM parsing + verification per
 * docs/COMM_RELAY_PROTOCOL_v0_1.md §4.1 + §5.
 *
 * Simpler than HELLO_INSTANCE (hello.ts):
 *   - no separate Ed25519/X25519 binding (X25519 is derived deterministically
 *     from Ed25519 client-side; relay doesn't see X25519)
 *   - no instance_id field to cross-check (routing_id derived from pubkey)
 *
 * Verification mirrors hello.ts step-for-step where the steps apply:
 *   1. timestamp within ±30s of relay's clock
 *   2. relay_url matches relay's canonical URL
 *   3. Ed25519 verify(proof_sig, PROOF_DOMAIN || timestamp || relay_url, pubkey)
 *   4. proof_sig not in 60s replay cache (caller-injected via recordProof)
 *   5. derive routing_id = sha256(pubkey)[0..16]
 */

import { ed25519Verify, sha256, bytesToHex } from './primitives.js';

export enum CommHelloError {
  BAD_HELLO = 'BAD_HELLO',
  INVALID_PROOF = 'INVALID_PROOF',
}

export class CommHelloVerificationError extends Error {
  constructor(
    public readonly code: CommHelloError,
    public readonly step: number,
    message: string,
  ) {
    super(`step ${step} ${code}: ${message}`);
    this.name = 'CommHelloVerificationError';
  }
}

const PROOF_DOMAIN = new TextEncoder().encode('ANTON-COMM-HELLO/v1\n');

/** Spec §3.2 / §5 — proof timestamp window. */
export const PROOF_TIMESTAMP_WINDOW_S = 30;

/** Min payload: 32 (pubkey) + 4 (ts) + 2 (url_len) + 0 + 64 (sig) + 4 (caps) = 106 */
const HELLO_COMM_MIN_LEN = 32 + 4 + 2 + 0 + 64 + 4;

export interface ParsedHelloComm {
  ed25519_pubkey: Uint8Array;  // 32 bytes
  timestamp: number;            // u32 BE seconds since epoch
  relay_url: string;            // canonical relay URL claim
  proof_sig: Uint8Array;        // 64 bytes
  caps: number;                 // u32 BE bitfield
}

export function parseHelloComm(payload: Uint8Array): ParsedHelloComm {
  if (payload.length < HELLO_COMM_MIN_LEN) {
    throw new CommHelloVerificationError(
      CommHelloError.BAD_HELLO,
      0,
      `payload ${payload.length} bytes < min ${HELLO_COMM_MIN_LEN}`,
    );
  }
  let off = 0;
  const ed25519_pubkey = payload.slice(off, off + 32); off += 32;
  const timestamp = (payload[off]! << 24) | (payload[off + 1]! << 16) | (payload[off + 2]! << 8) | payload[off + 3]!;
  off += 4;
  const relay_url_len = (payload[off]! << 8) | payload[off + 1]!; off += 2;
  if (off + relay_url_len + 64 + 4 > payload.length) {
    throw new CommHelloVerificationError(
      CommHelloError.BAD_HELLO,
      0,
      `relay_url_len ${relay_url_len} would overrun payload`,
    );
  }
  const relay_url = new TextDecoder('utf-8', { fatal: false })
    .decode(payload.subarray(off, off + relay_url_len));
  off += relay_url_len;
  const proof_sig = payload.slice(off, off + 64); off += 64;
  const caps = (payload[off]! << 24) | (payload[off + 1]! << 16) | (payload[off + 2]! << 8) | payload[off + 3]!;
  off += 4;

  if (off !== payload.length) {
    throw new CommHelloVerificationError(
      CommHelloError.BAD_HELLO,
      0,
      `trailing bytes after caps: ${payload.length - off}`,
    );
  }

  // Treat timestamp / caps as unsigned by masking off any sign bit Math may apply.
  return {
    ed25519_pubkey,
    timestamp: timestamp >>> 0,
    relay_url,
    proof_sig,
    caps: caps >>> 0,
  };
}

export interface VerifyHelloCommOptions {
  /** Relay's canonical URL. HELLO_COMM must match exactly. */
  ownCanonicalUrl: string;
  /**
   * Caller-supplied replay-cache hook. Should return true if `key` was already
   * seen within the replay window (and is therefore a replay); false if fresh.
   * On false, the caller is expected to mark `key` as seen.
   */
  recordProof: (key: string) => boolean;
  /** Now, in seconds since epoch. Injectable for tests. */
  now: () => number;
}

/**
 * Returns the routing_id (16 bytes) on success. Throws on any verification
 * failure. The error includes a `step` field matching the spec for telemetry.
 */
export function verifyHelloComm(
  payload: Uint8Array,
  opts: VerifyHelloCommOptions,
): { parsed: ParsedHelloComm; routing_id: Uint8Array } {
  const parsed = parseHelloComm(payload);

  // Step 1 — timestamp window
  const nowSec = opts.now();
  const drift = Math.abs(nowSec - parsed.timestamp);
  if (drift > PROOF_TIMESTAMP_WINDOW_S) {
    throw new CommHelloVerificationError(
      CommHelloError.INVALID_PROOF,
      1,
      `timestamp drift ${drift}s > ${PROOF_TIMESTAMP_WINDOW_S}s`,
    );
  }

  // Step 2 — relay_url match
  if (parsed.relay_url !== opts.ownCanonicalUrl) {
    throw new CommHelloVerificationError(
      CommHelloError.BAD_HELLO,
      2,
      `relay_url claim ${JSON.stringify(parsed.relay_url)} != own ${JSON.stringify(opts.ownCanonicalUrl)}`,
    );
  }

  // Step 3 — sig verify
  const sigInput = buildProofInput(parsed.timestamp, parsed.relay_url);
  const sigOk = ed25519Verify(parsed.proof_sig, sigInput, parsed.ed25519_pubkey);
  if (!sigOk) {
    throw new CommHelloVerificationError(
      CommHelloError.INVALID_PROOF,
      3,
      'Ed25519 verify failed',
    );
  }

  // Step 4 — replay check
  const replayKey = `${bytesToHex(parsed.ed25519_pubkey)}|${parsed.timestamp}|${parsed.relay_url}`;
  if (opts.recordProof(replayKey)) {
    throw new CommHelloVerificationError(
      CommHelloError.INVALID_PROOF,
      4,
      'proof sig replayed within window',
    );
  }

  // Step 5 — derive routing_id
  const fullHash = sha256(parsed.ed25519_pubkey);
  const routing_id = fullHash.slice(0, 16);

  return { parsed, routing_id };
}

/** Spec §4.1 — proof input = PROOF_DOMAIN || timestamp_u32_be || relay_url. */
export function buildProofInput(timestamp: number, relay_url: string): Uint8Array {
  const urlBytes = new TextEncoder().encode(relay_url);
  const out = new Uint8Array(PROOF_DOMAIN.length + 4 + urlBytes.length);
  out.set(PROOF_DOMAIN, 0);
  out[PROOF_DOMAIN.length + 0] = (timestamp >>> 24) & 0xFF;
  out[PROOF_DOMAIN.length + 1] = (timestamp >>> 16) & 0xFF;
  out[PROOF_DOMAIN.length + 2] = (timestamp >>> 8) & 0xFF;
  out[PROOF_DOMAIN.length + 3] = timestamp & 0xFF;
  out.set(urlBytes, PROOF_DOMAIN.length + 4);
  return out;
}

/**
 * Build a HELLO_COMM payload. Used by tests + the Comm App's relay client.
 * The Comm App reimplements this in TypeScript-for-browser; this server-side
 * builder is the canonical reference.
 */
export function buildHelloCommPayload(
  ed25519_pubkey: Uint8Array,
  timestamp: number,
  relay_url: string,
  proof_sig: Uint8Array,
  caps = 0,
): Uint8Array {
  if (ed25519_pubkey.length !== 32) throw new Error('pubkey must be 32 bytes');
  if (proof_sig.length !== 64) throw new Error('sig must be 64 bytes');
  const urlBytes = new TextEncoder().encode(relay_url);
  if (urlBytes.length > 0xFFFF) throw new Error('relay_url too long');
  const out = new Uint8Array(32 + 4 + 2 + urlBytes.length + 64 + 4);
  let off = 0;
  out.set(ed25519_pubkey, off); off += 32;
  out[off++] = (timestamp >>> 24) & 0xFF;
  out[off++] = (timestamp >>> 16) & 0xFF;
  out[off++] = (timestamp >>> 8) & 0xFF;
  out[off++] = timestamp & 0xFF;
  out[off++] = (urlBytes.length >>> 8) & 0xFF;
  out[off++] = urlBytes.length & 0xFF;
  out.set(urlBytes, off); off += urlBytes.length;
  out.set(proof_sig, off); off += 64;
  out[off++] = (caps >>> 24) & 0xFF;
  out[off++] = (caps >>> 16) & 0xFF;
  out[off++] = (caps >>> 8) & 0xFF;
  out[off++] = caps & 0xFF;
  return out;
}
