/**
 * identity.ts — device identity per spec §5.4 + §11.1
 *
 * Uses @noble/ed25519 (shared crypto primitive with ANTON core + AAP +
 * Gateway) so the app and the instance use exactly one Ed25519
 * implementation across the codebase.
 *
 * Key storage tier (best to worst):
 *   1. Native — @aparajita/capacitor-secure-storage (Keychain / Keystore)
 *      with biometric-gated read via @capgo/capacitor-native-biometric
 *   2. Web    — IndexedDB (page lifecycle only — never plaintext localStorage)
 *   3. Memory — fallback when neither above works (PWA dev / SSR)
 *
 * The PRIVATE key never leaves the secure store. Public material
 * (pubkey, contact_hash, display_name) is mirrored in localStorage for
 * synchronous access at startup — those are not secrets.
 *
 * Legacy compat: existing register-simple users have a localStorage
 * identity blob without a stored Ed25519 keypair. signMessage() will
 * throw for them; callers should fall back to the legacy auth path.
 */

import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { edwardsToMontgomeryPriv, edwardsToMontgomeryPub } from '@noble/curves/ed25519';
import { setSecure, getSecure, removeSecure } from './secure-store';

// ed25519 v2 needs SHA-512 wired explicitly for sync paths
ed25519.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed25519.etc.concatBytes(...m));

// ── Public surface ──────────────────────────────────────────────────────

export interface AppIdentity {
  /** Hex-encoded Ed25519 raw public key (32 bytes) */
  publicKeyHex: string;
  /** Server-issued ANTON-XXXX-XXXX-XXXX-XXXX */
  contactHash: string;
  /** Display name the user picked at pairing */
  displayName: string;
  /** ISO BCP-47 language tag */
  preferredLanguage: string;
  /** Legacy field — kept for migration; ignore in new code */
  privateKeyHex?: string;
}

const STORAGE_KEY_IDENTITY = 'anton-companion-identity';
const SECURE_KEY_PRIVKEY = 'identity-private-key';

// ── Public identity (pubkey + contact_hash + display_name) — sync ───────
// Tier-aware secret storage is delegated to secure-store.ts so identity.ts
// + instances.ts share one detection ladder (Phase H fix Arch 4).

export function getIdentity(): AppIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_IDENTITY);
    return raw ? (JSON.parse(raw) as AppIdentity) : null;
  } catch {
    return null;
  }
}

export function saveIdentityPublic(identity: AppIdentity): void {
  // Strip legacy privateKeyHex if a caller passes it — never persist plaintext.
  const safe: AppIdentity = {
    publicKeyHex: identity.publicKeyHex,
    contactHash: identity.contactHash,
    displayName: identity.displayName,
    preferredLanguage: identity.preferredLanguage,
  };
  localStorage.setItem(STORAGE_KEY_IDENTITY, JSON.stringify(safe));
}

/** Legacy alias kept for old call sites. New code should use saveIdentityPublic. */
export function saveIdentity(identity: AppIdentity): void {
  saveIdentityPublic(identity);
  if (identity.privateKeyHex) {
    setSecure(SECURE_KEY_PRIVKEY, identity.privateKeyHex).catch(() => {});
  }
}

export async function clearIdentity(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY_IDENTITY);
  await removeSecure(SECURE_KEY_PRIVKEY);
}

// ── Private key — secure-only ───────────────────────────────────────────

export async function savePrivateKey(privateKeyHex: string): Promise<void> {
  await setSecure(SECURE_KEY_PRIVKEY, privateKeyHex);
}

async function loadPrivateKey(): Promise<Uint8Array | null> {
  const hex = await getSecure(SECURE_KEY_PRIVKEY);
  if (!hex) return null;
  return hexToBytes(hex);
}

export async function hasPrivateKey(): Promise<boolean> {
  return (await getSecure(SECURE_KEY_PRIVKEY)) !== null;
}

// ── Ed25519 keypair generation + signing ────────────────────────────────

export async function generateKeypair(): Promise<{ publicKeyHex: string; privateKeyHex: string }> {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  return { publicKeyHex: bytesToHex(pub), privateKeyHex: bytesToHex(priv) };
}

/** Generate a fresh keypair AND store the private key in the secure store. */
export async function generateAndStoreKeypair(): Promise<string> {
  const { publicKeyHex, privateKeyHex } = await generateKeypair();
  await savePrivateKey(privateKeyHex);
  return publicKeyHex;
}

/** Sign a UTF-8 string with the stored private key. Throws if no key. */
export async function signMessage(message: string): Promise<string> {
  const priv = await loadPrivateKey();
  if (!priv) throw new Error('No identity key on this device');
  const sig = await ed25519.signAsync(new TextEncoder().encode(message), priv);
  return bytesToHex(sig);
}

/** Sign an arbitrary byte payload with the stored private key. */
export async function signBytes(bytes: Uint8Array): Promise<string> {
  const priv = await loadPrivateKey();
  if (!priv) throw new Error('No identity key on this device');
  const sig = await ed25519.signAsync(bytes, priv);
  return bytesToHex(sig);
}

// ── X25519 keypair derivation (Phase 5 — mesh transport) ───────────────
//
// Mesh transport (Noise IK initiator) needs an X25519 keypair on the phone
// that's deterministically derived from the existing Ed25519 device key —
// so the phone has ONE long-term identity, not two unrelated ones. The
// derivation matches libsodium's `crypto_sign_ed25519_*_to_curve25519`.

export interface X25519Keypair {
  publicKey: Uint8Array;   // 32 bytes
  privateKey: Uint8Array;  // 32 bytes
}

/**
 * Get the X25519 keypair derived from the device's Ed25519 identity. Throws
 * if the device has no Ed25519 keypair stored (caller must set up identity
 * first; for legacy register-simple users without keys, mesh isn't supported).
 */
export async function getDeviceX25519Keypair(): Promise<X25519Keypair> {
  const ed_priv = await loadPrivateKey();
  if (!ed_priv) throw new Error('No Ed25519 device key — mesh transport requires identity setup');
  const id = getIdentity();
  if (!id) throw new Error('No device identity record');
  const ed_pub = hexToBytes(id.publicKeyHex);
  return {
    publicKey: edwardsToMontgomeryPub(ed_pub),
    privateKey: edwardsToMontgomeryPriv(ed_priv),
  };
}

/** Verify a signature against a message — used in tests + envelope verification. */
export async function verifyMessage(message: string, signatureHex: string, publicKeyHex: string): Promise<boolean> {
  try {
    return await ed25519.verifyAsync(hexToBytes(signatureHex), new TextEncoder().encode(message), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

// ── Legacy challenge-response sign helper (kept for old auth path) ──────

export async function signNonce(nonce: string, _privateKeyHex?: string): Promise<string> {
  // Legacy callers passed privateKeyHex from localStorage; we now read it
  // from the secure store. The argument is ignored.
  return signMessage(nonce);
}

// ── Signed envelope (spec §5.3) — payload + nonce + signature ───────────

export interface SignedEnvelope {
  payload: string;       // JSON-stringified body
  nonce: string;         // monotonic per-device
  signature: string;     // hex-encoded Ed25519
  device_pubkey: string; // hex-encoded Ed25519 pubkey
}

let lastNonce = 0;

/** Build a signed envelope for the given JSON-serialisable body. */
export async function signEnvelope(body: unknown): Promise<SignedEnvelope> {
  const id = getIdentity();
  if (!id) throw new Error('No identity available');
  // Monotonic nonce: timestamp + counter, ensures uniqueness even under burst
  const ts = Date.now();
  lastNonce = Math.max(lastNonce + 1, ts);
  const nonce = String(lastNonce);
  const payload = JSON.stringify(body);
  const signaturePayload = `${nonce}.${payload}`;
  const signature = await signMessage(signaturePayload);
  return { payload, nonce, signature, device_pubkey: id.publicKeyHex };
}

// ── Hashes ──────────────────────────────────────────────────────────────

export function hashSha256Hex(input: string): string {
  return bytesToHex(sha256(input));
}

// ── Hex codec ───────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.substr(i, 2), 16);
  return out;
}
