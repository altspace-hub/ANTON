/**
 * community-e2e.ts — End-to-end encryption for community messaging
 *
 * Uses X25519 Diffie-Hellman for key agreement and AES-256-GCM for
 * symmetric encryption. Keys are stored alongside Ed25519 identity keys.
 *
 * Node.js 22+ supports X25519 natively via the crypto module.
 */

import crypto from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { encrypt, decrypt } from './credential-vault.js';

// ── Key Generation ──────────────────────────────────────────────

export function generateX25519Keypair(): { publicKeyHex: string; privateKeyHex: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');

  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
  const privateKeyDer = privateKey.export({ type: 'pkcs8', format: 'der' });

  return {
    publicKeyHex: publicKeyDer.toString('hex'),
    privateKeyHex: privateKeyDer.toString('hex'),
  };
}

export async function generateAndStoreX25519Keypair(
  db: DatabaseAdapter,
  identityId: string
): Promise<string> {
  const { publicKeyHex, privateKeyHex } = generateX25519Keypair();

  // Encrypt private key at rest using credential vault
  const encryptedPrivateKey = encrypt(privateKeyHex);

  await db.run(
    'UPDATE community_identity SET x25519_public_key = ?, x25519_private_key_encrypted = ? WHERE id = ?',
    publicKeyHex, encryptedPrivateKey, identityId
  );

  return publicKeyHex;
}

// ── Key Retrieval ───────────────────────────────────────────────

export async function getMyX25519Keys(db: DatabaseAdapter): Promise<{
  publicKeyHex: string;
  privateKeyHex: string;
} | null> {
  const identity = await db.get<{
    x25519_public_key: string | null;
    x25519_private_key_encrypted: string | null;
  }>('SELECT x25519_public_key, x25519_private_key_encrypted FROM community_identity LIMIT 1');

  if (!identity?.x25519_public_key || !identity?.x25519_private_key_encrypted) {
    return null;
  }

  return {
    publicKeyHex: identity.x25519_public_key,
    privateKeyHex: decrypt(identity.x25519_private_key_encrypted),
  };
}

export async function getPeerX25519PublicKey(
  db: DatabaseAdapter,
  contactHash: string
): Promise<string | null> {
  const conn = await db.get<{ x25519_public_key: string | null }>(
    'SELECT x25519_public_key FROM community_connections WHERE contact_hash = ?',
    contactHash
  );
  return conn?.x25519_public_key ?? null;
}

// ── Diffie-Hellman Shared Secret ────────────────────────────────

export function deriveSharedSecret(myPrivateKeyHex: string, peerPublicKeyHex: string): Buffer {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(myPrivateKeyHex, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });

  const publicKey = crypto.createPublicKey({
    key: Buffer.from(peerPublicKeyHex, 'hex'),
    format: 'der',
    type: 'spki',
  });

  return crypto.diffieHellman({ privateKey, publicKey });
}

// ── HKDF Key Derivation (per-message key SEPARATION) ────────────
// Derives a unique per-message key from the static shared secret + random salt.
//
// NOT forward secrecy. The shared secret is STATIC (both inputs are long-term
// keys) and the salt travels in the envelope, so anyone who later obtains a
// long-term X25519 private key can re-derive every past message key. What this
// buys is key SEPARATION: cracking or reusing one message's key does not help
// with another. Real forward secrecy needs an ephemeral handshake (X3DH +
// Double Ratchet). Do not describe this layer as forward secret in code
// comments, UI, or marketing — see src/comm/services/crypto.ts:9-18.

function deriveMessageKey(sharedSecret: Buffer, salt: Buffer): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', sharedSecret, salt, 'anton-p2p-message-v1', 32)
  );
}

// ── AES-256-GCM Encryption with AAD + per-message key separation ─
// - HKDF derives per-message key from shared secret + random salt
// - AAD (Additional Authenticated Data) binds sender/recipient to ciphertext
//   so metadata tampering breaks the auth tag

export interface EncryptedEnvelope {
  ciphertext: string;
  iv: string;
  authTag: string;
  salt: string;    // HKDF salt for per-message key derivation
  aadHash?: string; // SHA-256 hash of the AAD for verification
}

export function encryptMessage(
  plaintext: string,
  sharedSecret: Buffer,
  aad?: string
): EncryptedEnvelope {
  const salt = crypto.randomBytes(32); // Random salt for HKDF
  const messageKey = deriveMessageKey(sharedSecret, salt);
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', messageKey, iv);

  // Bind metadata to ciphertext via AAD — any tampering breaks the auth tag
  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf8'));
  }

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
    aadHash: aad ? crypto.createHash('sha256').update(aad).digest('hex') : undefined,
  };
}

export function decryptMessage(
  params: { ciphertext: string; iv: string; authTag: string; salt?: string; aadHash?: string },
  sharedSecret: Buffer,
  aad?: string
): string {
  // Use HKDF-derived key if salt is present (new format), otherwise raw shared secret (legacy)
  const key = params.salt
    ? deriveMessageKey(sharedSecret, Buffer.from(params.salt, 'base64'))
    : sharedSecret;

  const iv = Buffer.from(params.iv, 'base64');
  const authTag = Buffer.from(params.authTag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  // Bind same AAD for verification — must match what was used during encryption
  if (aad) {
    decipher.setAAD(Buffer.from(aad, 'utf8'));
  }

  let decrypted = decipher.update(params.ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
