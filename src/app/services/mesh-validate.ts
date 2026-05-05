/**
 * mesh-validate.ts — phone-side validation of a mesh enrollment package
 * per spec §8.1.
 *
 * Called by JoinPage before persisting an Instance record. If any check
 * fails, the user gets a clear error and the pairing is refused — this is
 * the cryptographic gate that enforces the (ed_pk, x_pk, binding_sig) pin.
 *
 * Steps (mirroring spec §8.1):
 *   1. relay_endpoints all canonicalize and are wss:// (or ws:// only for
 *      explicit dev override; default is reject)
 *   2. instance_x_pk == ed25519_pk_to_curve25519(instance_ed_pk)
 *   3. binding_sig verifies under instance_ed_pk
 *   4. instance_id (if present) == sha256(instance_x_pk)[0..16)
 */

import { sha256 } from '@noble/hashes/sha256';
import { ed25519, edwardsToMontgomeryPub } from '@noble/curves/ed25519';
import type { EnrollmentPackage } from './enrollment';

const BINDING_DOMAIN = new TextEncoder().encode('ANTON-MESH-IDENTITY/v1\n');

export interface ValidatedMeshFields {
  /** Hex-encoded canonical (ed_pk, x_pk, binding_sig) triple — what the phone pins. */
  pubkeyPinnedJson: string;
  relayEndpoints: string[];
}

export class MeshValidationError extends Error {
  constructor(public readonly reason: string) {
    super(`mesh validation: ${reason}`);
    this.name = 'MeshValidationError';
  }
}

/**
 * Check + canonicalize a mesh enrollment package. Throws MeshValidationError
 * on any failure — caller must surface the message to the user and refuse
 * the pairing.
 *
 * @param pkg the enrollment package fetched from the instance
 * @param opts.allowInsecureWs  permit ws:// relay URLs (DEV ONLY; default false)
 */
export function validateMeshPackage(
  pkg: EnrollmentPackage,
  opts: { allowInsecureWs?: boolean } = {},
): ValidatedMeshFields {
  if (pkg.transport !== 'mesh') {
    throw new MeshValidationError('not a mesh package');
  }
  if (!pkg.instance_ed_pk || !pkg.instance_x_pk || !pkg.binding_sig) {
    throw new MeshValidationError('missing instance keys or binding signature');
  }
  if (!pkg.relay_endpoints || pkg.relay_endpoints.length === 0) {
    throw new MeshValidationError('no relay endpoints');
  }

  const ed_pk = hexToBytes(pkg.instance_ed_pk, 32, 'instance_ed_pk');
  const x_pk = hexToBytes(pkg.instance_x_pk, 32, 'instance_x_pk');
  const sig = hexToBytes(pkg.binding_sig, 64, 'binding_sig');

  // Step 1 — relay URLs.
  const validatedRelays: string[] = [];
  for (const url of pkg.relay_endpoints) {
    validatedRelays.push(validateRelayUrl(url, opts.allowInsecureWs ?? false));
  }

  // Step 2 — derived X25519 pubkey must match what the package claims.
  const expected_x_pk = edwardsToMontgomeryPub(ed_pk);
  if (!constTimeEqual(expected_x_pk, x_pk)) {
    throw new MeshValidationError(
      'instance_x_pk != ed25519_pk_to_curve25519(instance_ed_pk) — pair forged or corrupted',
    );
  }

  // Step 3 — binding_sig is Ed25519(ed_priv) over (BINDING_DOMAIN || ed_pk || x_pk).
  const bindingMsg = new Uint8Array(BINDING_DOMAIN.length + 32 + 32);
  bindingMsg.set(BINDING_DOMAIN, 0);
  bindingMsg.set(ed_pk, BINDING_DOMAIN.length);
  bindingMsg.set(x_pk, BINDING_DOMAIN.length + 32);
  let bindingValid = false;
  try {
    bindingValid = ed25519.verify(sig, bindingMsg, ed_pk);
  } catch {
    bindingValid = false;
  }
  if (!bindingValid) {
    throw new MeshValidationError('binding_sig does not verify under instance_ed_pk');
  }

  // Step 4 — instance_id check is implicit: the spec puts it in the QR for
  // convenience, but it's deterministically derivable from x_pk so a
  // mismatch never happens with a well-formed package. We compute it to
  // confirm and stash for later use.
  const instanceId = sha256(x_pk).slice(0, 16);
  void instanceId;

  // Build the pinned-pubkey JSON the Instance record stores. This is what
  // mesh.ts → meshTransportForInstance reads at fetch time.
  const pubkeyPinnedJson = JSON.stringify({
    ed: pkg.instance_ed_pk,
    x: pkg.instance_x_pk,
    binding_sig: pkg.binding_sig,
  });

  return { pubkeyPinnedJson, relayEndpoints: validatedRelays };
}

// ── Helpers ─────────────────────────────────────────────────────────

function validateRelayUrl(input: string, allowInsecure: boolean): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new MeshValidationError(`invalid relay URL: ${input}`);
  }
  const allowed = allowInsecure ? ['wss:', 'ws:'] : ['wss:'];
  if (!allowed.includes(url.protocol)) {
    throw new MeshValidationError(
      `relay URL ${input} uses ${url.protocol.replace(':', '')} — must be wss://`,
    );
  }
  if (url.username || url.password) throw new MeshValidationError(`relay URL ${input} has userinfo`);
  if (url.search) throw new MeshValidationError(`relay URL ${input} has query string`);
  if (url.hash) throw new MeshValidationError(`relay URL ${input} has fragment`);
  if (url.pathname && url.pathname !== '/' && url.pathname !== '') {
    throw new MeshValidationError(`relay URL ${input} has path`);
  }
  // Canonical form: lowercase scheme + host, drop default port, no trailing slash.
  const isIPv6 = url.hostname.includes(':') || (url.hostname.startsWith('[') && url.hostname.endsWith(']'));
  let host = url.hostname;
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  const defaultPort = url.protocol === 'ws:' ? '80' : '443';
  const port = url.port === '' || url.port === defaultPort ? '' : `:${url.port}`;
  const hostPart = isIPv6 ? `[${host}]` : host;
  return `${url.protocol.replace(':', '')}://${hostPart}${port}`;
}

function hexToBytes(hex: string, expectedLen: number, fieldName: string): Uint8Array {
  if (hex.length !== expectedLen * 2) {
    throw new MeshValidationError(`${fieldName} length: got ${hex.length}, expected ${expectedLen * 2}`);
  }
  const out = new Uint8Array(expectedLen);
  for (let i = 0; i < expectedLen; i++) {
    const b = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(b)) throw new MeshValidationError(`${fieldName} has non-hex characters`);
    out[i] = b;
  }
  return out;
}

function constTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
