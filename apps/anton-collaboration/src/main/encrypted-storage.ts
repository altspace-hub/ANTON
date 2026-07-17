/**
 * encrypted-storage.ts — at-rest encryption for the standalone's sensitive
 * storage keys (2026-07-17 hardening).
 *
 * The agreement/relay Ed25519 seed (`identity.agreement.v1`) and the phone
 * pairing secret (`relay.pairsecret.v1`) were persisted as PLAINTEXT JSON files
 * (mode 0600 — effectively decorative on Windows, the primary deployment OS).
 * A leaked seed is catastrophic: the relay E2E scheme is static-static X25519
 * DH derived from this key, so one file decrypts ALL captured phone-channel
 * ciphertext in both directions, past and future, AND impersonates the agent
 * AND forges agreement signatures.
 *
 * This decorator transparently AES-256-GCM-wraps the protected keys when
 * ANTON_COLLAB_KEY_ENCRYPTION_KEY (64 hex chars = 32 bytes) is set — mirroring
 * the ANTON server's INSTANCE_KEY_ENCRYPTION_KEY pattern, including the
 * opportunistic one-time migration of legacy plaintext rows on first read and
 * a one-time warning when running without a key. Everything else in the store
 * passes through untouched.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { StorageBackend } from './storage.js';

const PROTECTED_KEYS = new Set(['identity.agreement.v1', 'relay.pairsecret.v1']);

interface EncEnvelope {
  enc: 'aes-256-gcm';
  v: 1;
  iv: string;
  ct: string;
  tag: string;
}

/** Parse ANTON_COLLAB_KEY_ENCRYPTION_KEY. Returns null when unset; throws on a
 *  malformed value (a typo'd key must fail loudly, not silently store plaintext). */
export function parseKeyEncryptionKey(envValue: string | undefined): Buffer | null {
  if (!envValue || envValue.trim() === '') return null;
  const v = envValue.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(v)) {
    throw new Error('ANTON_COLLAB_KEY_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return Buffer.from(v, 'hex');
}

function seal(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const env: EncEnvelope = {
    enc: 'aes-256-gcm', v: 1,
    iv: iv.toString('hex'), ct: ct.toString('hex'), tag: cipher.getAuthTag().toString('hex'),
  };
  return JSON.stringify(env);
}

function tryParseEnvelope(raw: string): EncEnvelope | null {
  try {
    const p = JSON.parse(raw) as Partial<EncEnvelope>;
    if (p && p.enc === 'aes-256-gcm' && p.v === 1
      && typeof p.iv === 'string' && typeof p.ct === 'string' && typeof p.tag === 'string') {
      return p as EncEnvelope;
    }
  } catch { /* not JSON → not an envelope */ }
  return null;
}

function open(env: EncEnvelope, key: Buffer): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(env.tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(env.ct, 'hex')), decipher.final()]).toString('utf8');
}

export class EncryptedKeyStorage implements StorageBackend {
  private warnedPlaintext = false;
  private migrated = new Set<string>();

  constructor(
    private readonly inner: StorageBackend,
    private readonly key: Buffer | null,
    private readonly log: (msg: string) => void = (m) => console.error(m),
  ) {}

  async get(storageKey: string): Promise<string | null> {
    const raw = await this.inner.get(storageKey);
    if (raw === null || !PROTECTED_KEYS.has(storageKey)) return raw;

    const env = tryParseEnvelope(raw);
    if (env) {
      if (!this.key) {
        throw new Error(`${storageKey} is encrypted at rest but ANTON_COLLAB_KEY_ENCRYPTION_KEY is not set`);
      }
      return open(env, this.key);
    }

    // Legacy plaintext row.
    if (this.key) {
      if (!this.migrated.has(storageKey)) {
        await this.inner.set(storageKey, seal(raw, this.key));
        this.migrated.add(storageKey);
        this.log(`[storage] migrated ${storageKey} from plaintext to AES-256-GCM at-rest encryption`);
      }
    } else if (!this.warnedPlaintext) {
      this.warnedPlaintext = true;
      this.log('[storage] WARNING: signing identity is stored in PLAINTEXT — set ANTON_COLLAB_KEY_ENCRYPTION_KEY (64 hex chars) to encrypt it at rest');
    }
    return raw;
  }

  async set(storageKey: string, value: string): Promise<void> {
    if (PROTECTED_KEYS.has(storageKey) && this.key) {
      return this.inner.set(storageKey, seal(value, this.key));
    }
    return this.inner.set(storageKey, value);
  }

  async remove(storageKey: string): Promise<void> {
    return this.inner.remove(storageKey);
  }

  async listKeys(): Promise<string[]> {
    return this.inner.listKeys ? this.inner.listKeys() : [];
  }
}
