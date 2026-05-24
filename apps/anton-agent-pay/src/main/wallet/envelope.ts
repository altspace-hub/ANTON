/**
 * envelope.ts — passphrase-wrapped wallet envelope (v3, FALCON-aware).
 *
 * Mirrors ANTON Pay's envelope v3 design (see
 * /home/daniel/openexpert/ANTON/docs/PAY_WALLET_PASSPHRASE_SPEC.md §3.2.1)
 * so both surfaces share the same on-disk shape — a future refactor
 * can hoist this whole module into @futurechain/sdk and have both
 * Pay (Capacitor) and Agent Pay (Node) import it.
 *
 * v3 envelope (JSON, stored as a single string in a StorageBackend slot):
 *
 *   v              = 3
 *   salt           = base64(16)
 *   iv_priv        = base64(12)
 *   priv_ct        = base64(AES-256-GCM(priv_hex, passphraseKey, iv_priv))
 *   iv_mnem?       = base64(12)  // optional, omitted if no mnemonic
 *   mnem_ct?       = base64(AES-256-GCM(mnemonic, passphraseKey, iv_mnem))
 *   iv_falcon      = base64(12)
 *   falcon_priv_ct = base64(AES-256-GCM(falcon_priv_hex, passphraseKey, iv_falcon))
 *   falcon_pub     = base64(897-byte raw FALCON-512 pub)
 *
 * KDF: PBKDF2-HMAC-SHA256, 600,000 iters (OWASP 2023 floor), 32-byte key.
 * AEAD: AES-256-GCM with 12-byte random IVs per slot.
 *
 * Node-side crypto: uses `node:crypto`'s `webcrypto` so the
 * implementation is the same primitive set as the Pay app (which
 * uses the browser `crypto.subtle`).
 */
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;

const KDF_ITERATIONS = 600_000;
const KDF_SALT_BYTES = 16;
const KDF_KEY_BITS = 256;
const AES_IV_BYTES = 12;

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface PassphraseEnvelopeV3 {
  v: 3;
  salt: string;
  iv_priv: string;
  priv_ct: string;
  iv_mnem?: string;
  mnem_ct?: string;
  iv_falcon: string;
  falcon_priv_ct: string;
  falcon_pub: string;
}

export interface OpenedEnvelope {
  privHex: string;
  mnemonic: string | null;
  falconPrivHex: string;
  falconPub: Uint8Array;
}

export interface BuildEnvelopeInput {
  privHex: string;
  mnemonic: string | null;
  falconPrivHex: string;
  falconPub: Uint8Array;
  passphrase: string;
}

// ── Serialisation helpers ────────────────────────────────────────

export function b64encode(b: Uint8Array): string {
  return Buffer.from(b).toString('base64');
}
export function b64decode(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}
export function hexToBytes(s: string): Uint8Array {
  if (s.length % 2 !== 0) throw new Error('hex string has odd length');
  const out = new Uint8Array(s.length >>> 1);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(s.substr(i << 1, 2), 16);
  }
  return out;
}
export function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, '0');
  return s;
}

function randomBytes(n: number): Uint8Array {
  return webcrypto.getRandomValues(new Uint8Array(n));
}

// ── KDF + AEAD ───────────────────────────────────────────────────

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await subtle.importKey(
    'raw', enc.encode(passphrase.normalize('NFC')),
    'PBKDF2', false, ['deriveKey'],
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
      iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: KDF_KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function aesEncrypt(plain: string, key: CryptoKey): Promise<{ iv: string; ct: string }> {
  const iv = randomBytes(AES_IV_BYTES);
  const ctBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer },
    key, enc.encode(plain),
  );
  return { iv: b64encode(iv), ct: b64encode(new Uint8Array(ctBuf)) };
}

async function aesDecrypt(iv: string, ct: string, key: CryptoKey): Promise<string> {
  const ivBytes = b64decode(iv);
  const ctBytes = b64decode(ct);
  const plain = await subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes.buffer.slice(ivBytes.byteOffset, ivBytes.byteOffset + ivBytes.byteLength) as ArrayBuffer },
    key, ctBytes.buffer.slice(ctBytes.byteOffset, ctBytes.byteOffset + ctBytes.byteLength) as ArrayBuffer,
  );
  return dec.decode(plain);
}

// ── Public API ───────────────────────────────────────────────────

export class BadPassphraseError extends Error {
  constructor() { super('wallet passphrase is incorrect'); this.name = 'BadPassphraseError'; }
}

/** Build a v3 envelope from raw wallet material + a passphrase. */
export async function buildEnvelope(input: BuildEnvelopeInput): Promise<PassphraseEnvelopeV3> {
  const salt = randomBytes(KDF_SALT_BYTES);
  const key = await deriveKey(input.passphrase, salt);
  const priv = await aesEncrypt(input.privHex, key);
  const falconPriv = await aesEncrypt(input.falconPrivHex, key);
  const env: PassphraseEnvelopeV3 = {
    v: 3,
    salt: b64encode(salt),
    iv_priv: priv.iv,
    priv_ct: priv.ct,
    iv_falcon: falconPriv.iv,
    falcon_priv_ct: falconPriv.ct,
    falcon_pub: b64encode(input.falconPub),
  };
  if (input.mnemonic) {
    const mnem = await aesEncrypt(input.mnemonic, key);
    env.iv_mnem = mnem.iv;
    env.mnem_ct = mnem.ct;
  }
  return env;
}

/** Decrypt a v3 envelope under `passphrase`. Throws BadPassphraseError
 *  on AES-GCM tag failure (wrong passphrase). */
export async function openEnvelope(
  env: PassphraseEnvelopeV3, passphrase: string,
): Promise<OpenedEnvelope> {
  const key = await deriveKey(passphrase, b64decode(env.salt));
  let privHex: string;
  let falconPrivHex: string;
  let mnemonic: string | null = null;
  try {
    privHex = await aesDecrypt(env.iv_priv, env.priv_ct, key);
    falconPrivHex = await aesDecrypt(env.iv_falcon, env.falcon_priv_ct, key);
    if (env.iv_mnem && env.mnem_ct) {
      mnemonic = await aesDecrypt(env.iv_mnem, env.mnem_ct, key);
    }
  } catch {
    throw new BadPassphraseError();
  }
  return {
    privHex,
    mnemonic,
    falconPrivHex,
    falconPub: b64decode(env.falcon_pub),
  };
}

/** Re-encrypt: decrypt under oldPassphrase, encrypt under newPassphrase.
 *  Returns the freshly-built v3 envelope; caller persists. */
export async function rotateEnvelope(
  env: PassphraseEnvelopeV3, oldPassphrase: string, newPassphrase: string,
): Promise<PassphraseEnvelopeV3> {
  const opened = await openEnvelope(env, oldPassphrase);
  return buildEnvelope({
    privHex: opened.privHex,
    mnemonic: opened.mnemonic,
    falconPrivHex: opened.falconPrivHex,
    falconPub: opened.falconPub,
    passphrase: newPassphrase,
  });
}

/** Parse a JSON-serialised envelope, asserting v3 shape. Returns null
 *  if not v3 or shape doesn't validate. */
export function parseEnvelopeJSON(json: string): PassphraseEnvelopeV3 | null {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const e = parsed as PassphraseEnvelopeV3;
    if (e.v !== 3) return null;
    if (typeof e.salt !== 'string') return null;
    if (typeof e.iv_priv !== 'string' || typeof e.priv_ct !== 'string') return null;
    if (typeof e.iv_falcon !== 'string' || typeof e.falcon_priv_ct !== 'string') return null;
    if (typeof e.falcon_pub !== 'string') return null;
    return e;
  } catch {
    return null;
  }
}
