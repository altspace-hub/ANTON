/**
 * crypto.ts — Browser port of server/services/community-e2e.ts.
 *
 * Forward-secret messaging: X25519 long-term keypair + per-message HKDF
 * salt + AES-256-GCM. Compromising the long-term private key does not
 * decrypt past messages; each message uses a key derived from the static
 * shared secret + a fresh random salt.
 *
 * The X25519 keypair is derived deterministically from the user's Ed25519
 * identity (same trick as src/app/services/identity.ts §getDeviceX25519Keypair).
 * This means there's a single long-term identity per device, not two
 * unrelated ones.
 *
 * Wire format matches server/services/community-e2e.ts so a Comm App can
 * eventually interoperate with the Companion App's community-mail layer if
 * we wire that bridge later.
 */

import { x25519 } from '@noble/curves/ed25519';
import { edwardsToMontgomeryPriv, edwardsToMontgomeryPub } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { getSecure } from './secure-store';
import { getIdentity } from './identity';

const SECURE_KEY_PRIVKEY = 'identity-private-key';

export interface EncryptedEnvelope {
  ciphertext: string; // base64
  iv: string;         // base64 (12 bytes)
  authTag: string;    // base64 (16 bytes — last 16 of GCM ciphertext)
  salt: string;       // base64 (32 bytes)
  aadHash?: string;   // hex SHA-256 of the AAD
}

// ── Local long-term X25519 keypair ──────────────────────────────────────

export interface X25519Keypair {
  publicKeyHex: string;
  privateKey: Uint8Array;
}

/**
 * Derive the device's long-term X25519 keypair from the stored Ed25519
 * private key. Throws if no identity is set up.
 */
export async function getOwnX25519Keypair(): Promise<X25519Keypair> {
  const edPrivHex = await getSecure(SECURE_KEY_PRIVKEY);
  if (!edPrivHex) throw new Error('No identity key on this device');
  const edPriv = hexToBytes(edPrivHex);
  const xPriv = edwardsToMontgomeryPriv(edPriv);
  const xPub = edwardsToMontgomeryPub(await derivePubkey(edPriv));
  return { publicKeyHex: bytesToHex(xPub), privateKey: xPriv };
}

async function derivePubkey(edPriv: Uint8Array): Promise<Uint8Array> {
  const ed = await import('@noble/ed25519');
  return ed.getPublicKeyAsync(edPriv);
}

/** Convert a peer's Ed25519 pubkey (raw 32 bytes hex) into their X25519 pubkey. */
export function peerEd25519ToX25519(edPubkeyHex: string): Uint8Array {
  return edwardsToMontgomeryPub(hexToBytes(edPubkeyHex));
}

// ── Diffie-Hellman shared secret ────────────────────────────────────────

export function deriveSharedSecret(
  myPrivateKey: Uint8Array,
  peerX25519Pubkey: Uint8Array,
): Uint8Array {
  return x25519.scalarMult(myPrivateKey, peerX25519Pubkey);
}

// ── HKDF per-message key derivation ─────────────────────────────────────

function deriveMessageKey(sharedSecret: Uint8Array, salt: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedSecret, salt, 'anton-p2p-message-v1', 32);
}

// ── AES-256-GCM via WebCrypto ───────────────────────────────────────────

export async function encryptMessage(
  plaintext: string,
  sharedSecret: Uint8Array,
  aad?: string,
): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const messageKey = deriveMessageKey(sharedSecret, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', messageKey as BufferSource, { name: 'AES-GCM' }, false, ['encrypt']);

  const aadBytes = aad ? new TextEncoder().encode(aad) : undefined;
  const combined = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aadBytes as BufferSource | undefined },
      key,
      new TextEncoder().encode(plaintext) as BufferSource,
    ),
  );
  // WebCrypto AES-GCM returns ciphertext||authTag concatenated; split.
  const ciphertext = combined.subarray(0, combined.length - 16);
  const authTag = combined.subarray(combined.length - 16);

  return {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
    authTag: bytesToBase64(authTag),
    salt: bytesToBase64(salt),
    aadHash: aad ? bytesToHex(sha256(aadBytes!)) : undefined,
  };
}

export async function decryptMessage(
  envelope: EncryptedEnvelope,
  sharedSecret: Uint8Array,
  aad?: string,
): Promise<string> {
  const salt = base64ToBytes(envelope.salt);
  const messageKey = deriveMessageKey(sharedSecret, salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const authTag = base64ToBytes(envelope.authTag);

  // WebCrypto wants ciphertext||authTag.
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext, 0);
  combined.set(authTag, ciphertext.length);

  const key = await crypto.subtle.importKey('raw', messageKey as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);
  const aadBytes = aad ? new TextEncoder().encode(aad) : undefined;
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, additionalData: aadBytes as BufferSource | undefined },
    key,
    combined as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}

// ── High-level send/receive convenience ─────────────────────────────────

/**
 * Encrypt a message for delivery to a peer whose Ed25519 pubkey we have.
 * AAD binds sender + recipient contact hashes into the auth tag so the
 * relay can't swap routing metadata without breaking decryption.
 */
export async function sealForPeer(
  plaintext: string,
  peerEd25519PubkeyHex: string,
  fromHash: string,
  toHash: string,
): Promise<EncryptedEnvelope> {
  const own = await getOwnX25519Keypair();
  const peerX = peerEd25519ToX25519(peerEd25519PubkeyHex);
  const shared = deriveSharedSecret(own.privateKey, peerX);
  return encryptMessage(plaintext, shared, `${fromHash}:${toHash}`);
}

export async function openFromPeer(
  envelope: EncryptedEnvelope,
  peerEd25519PubkeyHex: string,
  fromHash: string,
  toHash: string,
): Promise<string> {
  const own = await getOwnX25519Keypair();
  const peerX = peerEd25519ToX25519(peerEd25519PubkeyHex);
  const shared = deriveSharedSecret(own.privateKey, peerX);
  return decryptMessage(envelope, shared, `${fromHash}:${toHash}`);
}

/**
 * Build the canonical AAD string for a message: '<fromHash>:<toHash>'.
 * Same shape on both sides so AES-GCM auth-tag verification passes.
 */
export function buildAad(fromHash: string, toHash: string): string {
  return `${fromHash}:${toHash}`;
}

// ── Codec helpers ───────────────────────────────────────────────────────

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

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Self-derived identity hint (for diagnostics + tests) ────────────────

export function ownContactHash(): string | null {
  return getIdentity()?.contactHash ?? null;
}
