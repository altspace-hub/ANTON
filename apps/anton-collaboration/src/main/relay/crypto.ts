/**
 * relay/crypto.ts — E2E crypto for the phone↔agent relay channel, a Node port
 * of src/comm/services/crypto.ts (the ANTON Comm scheme), so an agent standalone
 * and the phone exchange messages exactly like two Comm peers.
 *
 * X25519 long-term keypair (derived deterministically from the agent's Ed25519
 * identity) + per-message HKDF salt + AES-256-GCM. Each message key is
 * HKDF(staticSharedSecret, freshRandomSalt) → per-message key separation.
 * NOT forward secrecy (static DH) — same caveat as Comm.
 *
 * Wire format (EncryptedEnvelope) is byte-compatible with the Comm browser
 * crypto: ciphertext/iv/authTag/salt base64, aadHash hex, optional senderPub.
 * AES-GCM is computed with node:crypto here; the phone uses WebCrypto — both
 * are standard AES-256-GCM and interoperate.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { x25519, edwardsToMontgomeryPriv, edwardsToMontgomeryPub } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export interface EncryptedEnvelope {
  ciphertext: string; // base64
  iv: string;         // base64 (12 bytes)
  authTag: string;    // base64 (16 bytes)
  salt: string;       // base64 (32 bytes)
  aadHash?: string;   // hex SHA-256 of the AAD
  /** Sender's Ed25519 pubkey (64 hex), attached in CLEARTEXT only while the
   *  peer hasn't confirmed us — lets a fresh peer derive the shared secret to
   *  open our first (contact_request) message. Leaks nothing new (the relay
   *  already routes by sha256(pub)); the body stays encrypted. */
  senderPub?: string;
}

export interface X25519Keypair {
  publicKeyHex: string;
  privateKey: Uint8Array;
}

/** Derive the X25519 keypair from a raw Ed25519 private seed (hex). The agent's
 *  agreement identity IS this Ed25519 key, so the agent has one long-term
 *  identity for both signing + the relay channel. */
export function xKeypairFromEdPriv(edPrivHex: string, edPubHex: string): X25519Keypair {
  const xPriv = edwardsToMontgomeryPriv(hexToBytes(edPrivHex));
  const xPub = edwardsToMontgomeryPub(hexToBytes(edPubHex));
  return { publicKeyHex: bytesToHex(xPub), privateKey: xPriv };
}

/** Convert a peer's Ed25519 pubkey (raw 32-byte hex) into their X25519 pubkey. */
export function peerEd25519ToX25519(edPubkeyHex: string): Uint8Array {
  return edwardsToMontgomeryPub(hexToBytes(edPubkeyHex));
}

export function deriveSharedSecret(myXPrivate: Uint8Array, peerX25519Pub: Uint8Array): Uint8Array {
  return x25519.scalarMult(myXPrivate, peerX25519Pub);
}

function deriveMessageKey(sharedSecret: Uint8Array, salt: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedSecret, salt, 'anton-p2p-message-v1', 32);
}

export function encryptMessage(plaintext: string, sharedSecret: Uint8Array, aad?: string): EncryptedEnvelope {
  const salt = randomBytes(32);
  const messageKey = deriveMessageKey(sharedSecret, new Uint8Array(salt));
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(messageKey), iv);
  const aadBuf = aad ? Buffer.from(aad, 'utf8') : undefined;
  if (aadBuf) cipher.setAAD(aadBuf);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
    ...(aadBuf ? { aadHash: bytesToHex(sha256(new Uint8Array(aadBuf))) } : {}),
  };
}

export function decryptMessage(envelope: EncryptedEnvelope, sharedSecret: Uint8Array, aad?: string): string {
  const salt = Buffer.from(envelope.salt, 'base64');
  const messageKey = deriveMessageKey(sharedSecret, new Uint8Array(salt));
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(messageKey), Buffer.from(envelope.iv, 'base64'));
  if (aad) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/** The canonical AAD: '<fromHash>:<toHash>' (same on both sides). */
export function buildAad(fromHash: string, toHash: string): string {
  return `${fromHash}:${toHash}`;
}

/** Seal a message for a peer whose Ed25519 pubkey we have. */
export function sealForPeer(
  plaintext: string,
  ownX: X25519Keypair,
  peerEd25519PubkeyHex: string,
  fromHash: string,
  toHash: string,
): EncryptedEnvelope {
  const shared = deriveSharedSecret(ownX.privateKey, peerEd25519ToX25519(peerEd25519PubkeyHex));
  return encryptMessage(plaintext, shared, buildAad(fromHash, toHash));
}

export function openFromPeer(
  envelope: EncryptedEnvelope,
  ownX: X25519Keypair,
  peerEd25519PubkeyHex: string,
  fromHash: string,
  toHash: string,
): string {
  const shared = deriveSharedSecret(ownX.privateKey, peerEd25519ToX25519(peerEd25519PubkeyHex));
  return decryptMessage(envelope, shared, buildAad(fromHash, toHash));
}
