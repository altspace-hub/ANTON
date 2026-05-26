/**
 * install-keys.ts — install-scoped identity for desktop attestation.
 *
 * Spec: DESKTOP_ATTESTATION_SPEC.md §3 + §7
 *
 * The install owns three pieces of identity material:
 *   - install_id: stable UUID v4 generated at first run.
 *   - attestation_priv: Ed25519 private key used to sign DESKTOP_V1
 *     attestation packets. Registered with Bahnhof's /enroll as
 *     attestation_pubkey at first enrollment.
 *   - attestation_pub: matching public key.
 *
 * Storage uses the existing StorageBackend (same backend the wallet
 * uses) with the namespace prefix `install.attestation.*`. In production
 * this is the file backend at mode 0600; tests use the in-memory backend.
 *
 * Phase 2 will replace the file storage with OS keychain (keytar) so the
 * attestation private key gets the same boundary as the wallet priv.
 * For MVP the file-backed store + DPAPI/Keychain wrap is good enough —
 * the attestation key is NOT a payment authorisation key (a stolen
 * attestation key still can't bypass the OS-native modal); it only
 * proves "this install is the install Bahnhof previously enrolled".
 */
import { ed25519 } from '@noble/curves/ed25519';
import { randomBytes, randomUUID } from 'node:crypto';

import type { StorageBackend } from '../wallet/storage.js';

const KEY_INSTALL_ID    = 'install.attestation.install_id';
const KEY_PRIV_HEX      = 'install.attestation.priv_hex';
const KEY_PUB_HEX       = 'install.attestation.pub_hex';

export interface InstallIdentity {
  installId: string;
  /** Ed25519 public key, 32 bytes — lowercase hex (Bahnhof's pubkey
   *  format). Always safe to log / send to the server. */
  pubHex: string;
}

/** Internal-only — never returned across module boundaries. The signing
 *  flow opens, signs, drops it via Uint8Array reuse — no separate
 *  "unlock" step because there is no passphrase (the attestation key
 *  itself is not a payment-authorisation key). */
interface FullIdentity extends InstallIdentity {
  privBytes: Uint8Array;
}

/** Load the install identity, generating it on first run. Idempotent —
 *  subsequent calls return the same install_id + pubkey. The private
 *  key STAYS in storage; only the public material is returned. */
export async function getInstallIdentity(
  storage: StorageBackend,
): Promise<InstallIdentity> {
  const existing = await _loadFull(storage);
  if (existing) {
    // Zero the priv we briefly loaded — we don't return it.
    existing.privBytes.fill(0);
    return { installId: existing.installId, pubHex: existing.pubHex };
  }
  const full = await _createNew(storage);
  full.privBytes.fill(0);
  return { installId: full.installId, pubHex: full.pubHex };
}

/** Sign `message` with the install's attestation private key. The key
 *  is loaded, used, and immediately zeroed — no caller-visible handle.
 *  Returns the 64-byte Ed25519 signature. */
export async function signWithAttestationKey(
  storage: StorageBackend, message: Uint8Array,
): Promise<Uint8Array> {
  const full = await _loadFull(storage);
  if (!full) {
    throw new Error(
      'install-keys: attestation key missing — call getInstallIdentity() first '
      + 'so the install identity is generated',
    );
  }
  try {
    return ed25519.sign(message, full.privBytes);
  } finally {
    full.privBytes.fill(0);
  }
}

/** Test helper — completely reset the install identity. Production code
 *  should never call this; the install_id is meant to be stable for the
 *  lifetime of the install. */
export async function _resetInstallIdentity(
  storage: StorageBackend,
): Promise<void> {
  await storage.remove(KEY_INSTALL_ID);
  await storage.remove(KEY_PRIV_HEX);
  await storage.remove(KEY_PUB_HEX);
}

// ── internals ────────────────────────────────────────────────────

async function _loadFull(storage: StorageBackend): Promise<FullIdentity | null> {
  const installId = await storage.get(KEY_INSTALL_ID);
  const privHex   = await storage.get(KEY_PRIV_HEX);
  const pubHex    = await storage.get(KEY_PUB_HEX);
  if (!installId || !privHex || !pubHex) {
    // Any missing piece → treat as "not yet generated". We don't try to
    // partially recover; the install hasn't enrolled with Bahnhof yet
    // anyway, so a clean re-generate is the right call.
    return null;
  }
  const privBytes = hexToBytes(privHex);
  // Defence-in-depth: re-derive pubkey from priv and verify it matches
  // the stored pubHex. A mismatch means the on-disk material was
  // tampered with — refuse to use it.
  const derivedPub = bytesToHex(ed25519.getPublicKey(privBytes));
  if (derivedPub !== pubHex.toLowerCase()) {
    privBytes.fill(0);
    throw new Error(
      'install-keys: stored attestation_pub does not match derived pubkey '
      + 'from stored priv — refusing to continue (storage tampered?)',
    );
  }
  return { installId, pubHex: pubHex.toLowerCase(), privBytes };
}

async function _createNew(storage: StorageBackend): Promise<FullIdentity> {
  // randomUUID is RFC 4122 v4 — same format Bahnhof's INSTALL_ID_RE
  // expects (^[0-9a-fA-F-]{32,40}$). Lowercased to match the server's
  // canonical form.
  const installId = randomUUID().toLowerCase();
  // ed25519 wants a 32-byte seed; @noble/curves derives the priv from
  // it deterministically. randomBytes(32) is the right entropy source.
  const seed = randomBytes(32);
  // We store the SEED (32 bytes) as the "priv" — the noble API accepts
  // it that way and the standard convention is to call this the
  // "private key". The actual scalar is derived on demand.
  const privBytes = new Uint8Array(seed);
  const pubBytes = ed25519.getPublicKey(privBytes);
  const privHex = bytesToHex(privBytes);
  const pubHex = bytesToHex(pubBytes);
  await storage.set(KEY_INSTALL_ID, installId);
  await storage.set(KEY_PRIV_HEX,   privHex);
  await storage.set(KEY_PUB_HEX,    pubHex);
  return { installId, pubHex, privBytes };
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(h: string): Uint8Array {
  const s = h.toLowerCase();
  if (s.length % 2 !== 0) throw new Error('install-keys: odd-length hex');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < s.length; i += 2) {
    const v = parseInt(s.slice(i, i + 2), 16);
    if (Number.isNaN(v)) throw new Error('install-keys: bad hex char');
    out[i / 2] = v;
  }
  return out;
}
