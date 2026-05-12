/**
 * identity.ts — Comm App identity. Fully client-side: the contact hash is
 * derived from the Ed25519 public key without server enrollment, so each
 * Comm App owns its identity end-to-end.
 *
 * Differs from the Companion App in two ways:
 *   - No server registration step. The hash is derived locally.
 *   - The hash is derived from the raw 32-byte Ed25519 pubkey (as produced
 *     by @noble/ed25519), not the DER-encoded server form. The unambiguous
 *     charset and ANTON-XXXX-XXXX-XXXX-XXXX shape match the Companion App
 *     spec so contact hashes are visually identical across the two surfaces.
 */

import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sha256 } from '@noble/hashes/sha256';
import { setSecure, getSecure, removeSecure } from './secure-store';

ed25519.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed25519.etc.concatBytes(...m));

export interface CommIdentity {
  publicKeyHex: string;      // 64 hex chars = 32 raw Ed25519 bytes
  contactHash: string;       // ANTON-XXXX-XXXX-XXXX-XXXX (locally derived)
  displayName: string;
  preferredLanguage: string;
  createdAt: string;         // ISO timestamp
}

const STORAGE_KEY_IDENTITY = 'anton-comm-identity';
const SECURE_KEY_PRIVKEY = 'identity-private-key';

const UNAMBIGUOUS_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

// ── Public identity (sync) ──────────────────────────────────────────────

export function getIdentity(): CommIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_IDENTITY);
    return raw ? (JSON.parse(raw) as CommIdentity) : null;
  } catch {
    return null;
  }
}

export function hasIdentity(): boolean {
  return getIdentity() !== null;
}

function saveIdentityPublic(identity: CommIdentity): void {
  localStorage.setItem(STORAGE_KEY_IDENTITY, JSON.stringify(identity));
}

export async function clearIdentity(): Promise<void> {
  // P2-5 audit fix: tear down every module-level cache or active timer
  // attached to the old identity BEFORE we wipe the storage. Otherwise
  // a sign-out leaves stale live-share intervals, cached permission
  // promises, and replay-cache entries from the previous user.
  try {
    const [{ stopAllLiveShares }, { clearReminderCaches }, { clearReplayCache }, { stopRelayClient }] = await Promise.all([
      import('./geo'),
      import('./event-reminders'),
      import('./replay-cache'),
      import('./relay-client'),
    ]);
    try { stopAllLiveShares(); } catch { /* ignore */ }
    try { clearReminderCaches(); } catch { /* ignore */ }
    try { clearReplayCache(); } catch { /* ignore */ }
    try { stopRelayClient(); } catch { /* ignore */ }
  } catch { /* dynamic import failures shouldn't block sign-out */ }
  localStorage.removeItem(STORAGE_KEY_IDENTITY);
  await removeSecure(SECURE_KEY_PRIVKEY);
}

// ── Contact hash derivation ─────────────────────────────────────────────

/**
 * Derive ANTON-XXXX-XXXX-XXXX-XXXX from the raw 32-byte Ed25519 public key.
 * Stable: same pubkey → same hash forever.
 */
export function deriveContactHash(publicKeyHex: string): string {
  const pubKeyBytes = hexToBytes(publicKeyHex);
  const hash = sha256(pubKeyBytes);
  const segments: string[] = [];
  for (let s = 0; s < 4; s++) {
    let segment = '';
    for (let c = 0; c < 4; c++) {
      const byte = hash[s * 4 + c];
      segment += UNAMBIGUOUS_CHARSET[byte % UNAMBIGUOUS_CHARSET.length];
    }
    segments.push(segment);
  }
  return `ANTON-${segments.join('-')}`;
}

/** Match ANTON-XXXX-XXXX-XXXX-XXXX with the legal charset only. */
export function isValidContactHash(s: string): boolean {
  return /^ANTON-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(s);
}

/**
 * Derive the 16-byte routing_id used on the relay wire from a raw Ed25519
 * pubkey (hex). Matches `relay/src/primitives.ts §deriveInstanceId` and
 * `docs/COMM_RELAY_PROTOCOL_v0_1.md §2`: first 16 bytes of sha256(pubkey).
 */
export function deriveRoutingId(publicKeyHex: string): Uint8Array {
  const pubKeyBytes = hexToBytes(publicKeyHex);
  return sha256(pubKeyBytes).slice(0, 16);
}

// ── Identity creation ───────────────────────────────────────────────────

/**
 * Generate an Ed25519 keypair, store the private key securely, and persist
 * the public identity. Idempotent: returns the existing identity if one
 * already exists (does not overwrite).
 */
export async function createIdentity(
  displayName: string,
  preferredLanguage: string = 'en'
): Promise<CommIdentity> {
  const existing = getIdentity();
  if (existing) return existing;

  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  const publicKeyHex = bytesToHex(pub);
  const contactHash = deriveContactHash(publicKeyHex);

  await setSecure(SECURE_KEY_PRIVKEY, bytesToHex(priv));

  const identity: CommIdentity = {
    publicKeyHex,
    contactHash,
    displayName: displayName.trim(),
    preferredLanguage,
    createdAt: new Date().toISOString(),
  };
  saveIdentityPublic(identity);
  return identity;
}

export function updateDisplayName(displayName: string): CommIdentity | null {
  const id = getIdentity();
  if (!id) return null;
  const next: CommIdentity = { ...id, displayName: displayName.trim() };
  saveIdentityPublic(next);
  return next;
}

// ── Signing ─────────────────────────────────────────────────────────────

async function loadPrivateKey(): Promise<Uint8Array | null> {
  const hex = await getSecure(SECURE_KEY_PRIVKEY);
  return hex ? hexToBytes(hex) : null;
}

export async function signMessage(message: string): Promise<string> {
  const priv = await loadPrivateKey();
  if (!priv) throw new Error('No identity key on this device');
  const sig = await ed25519.signAsync(new TextEncoder().encode(message), priv);
  return bytesToHex(sig);
}

export async function signBytes(bytes: Uint8Array): Promise<string> {
  const priv = await loadPrivateKey();
  if (!priv) throw new Error('No identity key on this device');
  const sig = await ed25519.signAsync(bytes, priv);
  return bytesToHex(sig);
}

export async function verifyMessage(
  message: string,
  signatureHex: string,
  publicKeyHex: string
): Promise<boolean> {
  try {
    return await ed25519.verifyAsync(
      hexToBytes(signatureHex),
      new TextEncoder().encode(message),
      hexToBytes(publicKeyHex),
    );
  } catch {
    return false;
  }
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
