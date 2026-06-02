/**
 * wallet-passphrase.ts — opt-in second factor on top of biometric.
 *
 * Ported verbatim from src/pay/services/wallet-passphrase.ts (#79 wallet
 * parity). Same secure-store key layout (fc.wallet.<id>.priv / .mnemonic /
 * .falcon_priv / .falcon_pub / .passphrase_envelope), same v2→v3 FALCON
 * envelope, same crypto. Spec: docs/PAY_WALLET_PASSPHRASE_SPEC.md.
 *
 * v3 envelope: { v, salt, iv_priv, priv_ct, iv_mnem?, mnem_ct?, iv_falcon,
 *   falcon_priv_ct, falcon_pub }, where the passphrase derives a PBKDF2
 *   AES-256-GCM key. secure-store provides the OUTER Keystore wrap on a real
 *   device, giving the double envelope (passphrase inner + Keystore outer).
 *   When a passphrase is on, the priv stays in this envelope and is
 *   reconstructed into JS for one signing op, then dropped.
 */
import { falcon512 } from '@noble/post-quantum/falcon.js';
import { getSecure, removeSecure, setSecure } from './secure-store';

const KDF_ITERATIONS = 600_000;          // OWASP 2023 floor
const KDF_SALT_BYTES = 16;
const KDF_KEY_BITS   = 256;
const AES_IV_BYTES   = 12;

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return btoa(s);
}

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, '0');
  return s;
}

function hexToBytes(s: string): Uint8Array {
  const len = s.length >>> 1;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = parseInt(s.substr(i << 1, 2), 16);
  return out;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n)) as Uint8Array<ArrayBuffer>;
}

async function deriveKey(
  passphrase: string, salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KDF_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: KDF_KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function aesEncrypt(
  plain: string, key: CryptoKey,
): Promise<{ iv: string; ct: string }> {
  const iv = randomBytes(AES_IV_BYTES);
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ctBuf)) };
}

async function aesDecrypt(iv: string, ct: string, key: CryptoKey): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(iv) }, key, b64ToBytes(ct),
  );
  return dec.decode(plain);
}

export interface FalconKeyPair {
  /** ~1281-byte FALCON-512 secret key (raw bytes). */
  falconPriv: Uint8Array;
  /** ~897-byte FALCON-512 public key (raw bytes). */
  falconPub: Uint8Array;
}

export function generateFalconKeyPair(): FalconKeyPair {
  const { secretKey, publicKey } = falcon512.keygen();
  return { falconPriv: secretKey, falconPub: publicKey };
}

interface PassphraseEnvelopeV2 {
  v: 2;
  salt: string;
  iv_priv: string;
  priv_ct: string;
  iv_mnem?: string;
  mnem_ct?: string;
}

interface PassphraseEnvelopeV3 {
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

type AnyEnvelope = PassphraseEnvelopeV2 | PassphraseEnvelopeV3;

const envelopeKey   = (id: string) => `fc.wallet.${id}.passphrase_envelope`;
const privKey       = (id: string) => `fc.wallet.${id}.priv`;
const mnemonicKey   = (id: string) => `fc.wallet.${id}.mnemonic`;
const falconPrivKey = (id: string) => `fc.wallet.${id}.falcon_priv`;
const falconPubKey  = (id: string) => `fc.wallet.${id}.falcon_pub`;

function isV2(env: AnyEnvelope): env is PassphraseEnvelopeV2 { return env.v === 2; }
function isV3(env: AnyEnvelope): env is PassphraseEnvelopeV3 { return env.v === 3; }

async function readEnvelope(id: string): Promise<AnyEnvelope | null> {
  const raw = await getSecure(envelopeKey(id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const e = parsed as AnyEnvelope;
    if (e.v === 2) {
      if (typeof e.salt === 'string' && typeof e.iv_priv === 'string'
          && typeof e.priv_ct === 'string') return e;
    } else if (e.v === 3) {
      if (typeof e.salt === 'string' && typeof e.iv_priv === 'string'
          && typeof e.priv_ct === 'string' && typeof e.iv_falcon === 'string'
          && typeof e.falcon_priv_ct === 'string' && typeof e.falcon_pub === 'string') return e;
    }
  } catch { /* fall through */ }
  return null;
}

async function writeEnvelope(id: string, env: AnyEnvelope): Promise<void> {
  await setSecure(envelopeKey(id), JSON.stringify(env));
}

export class BadPassphraseError extends Error {
  constructor() { super('wallet passphrase is incorrect'); this.name = 'BadPassphraseError'; }
}

export class NoPassphraseError extends Error {
  constructor() { super('wallet has no passphrase set'); this.name = 'NoPassphraseError'; }
}

/** Returns true if a wallet currently has a passphrase envelope. */
export async function hasPassphrase(walletId: string): Promise<boolean> {
  return (await readEnvelope(walletId)) !== null;
}

/** Set the first passphrase on a wallet that currently has none. Reads the
 *  plaintext priv (+ optional mnemonic + FALCON keypair), encrypts under the
 *  passphrase, removes the plaintext rows. Caller must have gated on biometric
 *  and demigrated the priv out of any native signer alias first. */
export async function enableWalletPassphrase(
  walletId: string, passphrase: string,
): Promise<void> {
  if ((await readEnvelope(walletId)) !== null) {
    throw new Error('wallet already has a passphrase — use changeWalletPassphrase');
  }
  const privHex = await getSecure(privKey(walletId));
  if (!privHex) {
    throw new Error(
      'wallet priv is not in secure-store (likely held by native signer); demigrate first',
    );
  }
  const mnemonic = await getSecure(mnemonicKey(walletId));
  let falconPrivHex = await getSecure(falconPrivKey(walletId));
  let falconPubHex  = await getSecure(falconPubKey(walletId));
  if (!falconPrivHex || !falconPubHex) {
    const kp = generateFalconKeyPair();
    falconPrivHex = bytesToHex(kp.falconPriv);
    falconPubHex  = bytesToHex(kp.falconPub);
  }
  const falconPubBytes = hexToBytes(falconPubHex);

  const salt = randomBytes(KDF_SALT_BYTES);
  const key = await deriveKey(passphrase, salt);
  const priv = await aesEncrypt(privHex, key);
  const falconPriv = await aesEncrypt(falconPrivHex, key);
  const env: PassphraseEnvelopeV3 = {
    v: 3,
    salt: bytesToB64(salt),
    iv_priv: priv.iv,
    priv_ct: priv.ct,
    iv_falcon: falconPriv.iv,
    falcon_priv_ct: falconPriv.ct,
    falcon_pub: bytesToB64(falconPubBytes),
  };
  if (mnemonic) {
    const mnem = await aesEncrypt(mnemonic, key);
    env.iv_mnem = mnem.iv;
    env.mnem_ct = mnem.ct;
  }
  await writeEnvelope(walletId, env);
  await removeSecure(privKey(walletId));
  if (mnemonic) await removeSecure(mnemonicKey(walletId));
  await removeSecure(falconPrivKey(walletId));
  await removeSecure(falconPubKey(walletId));
}

async function migrateV2toV3(
  walletId: string, env: PassphraseEnvelopeV2, passphrase: string,
): Promise<{ env: PassphraseEnvelopeV3; key: CryptoKey }> {
  const salt = b64ToBytes(env.salt);
  const key = await deriveKey(passphrase, salt);
  try {
    await aesDecrypt(env.iv_priv, env.priv_ct, key);
  } catch {
    throw new BadPassphraseError();
  }
  const kp = generateFalconKeyPair();
  const falconPrivHex = bytesToHex(kp.falconPriv);
  const falconPriv = await aesEncrypt(falconPrivHex, key);
  const next: PassphraseEnvelopeV3 = {
    v: 3,
    salt: env.salt,
    iv_priv: env.iv_priv,
    priv_ct: env.priv_ct,
    iv_mnem: env.iv_mnem,
    mnem_ct: env.mnem_ct,
    iv_falcon: falconPriv.iv,
    falcon_priv_ct: falconPriv.ct,
    falcon_pub: bytesToB64(kp.falconPub),
  };
  await writeEnvelope(walletId, next);
  return { env: next, key };
}

async function readEnvelopeV3(
  walletId: string, passphrase: string,
): Promise<{ env: PassphraseEnvelopeV3; key: CryptoKey }> {
  const env = await readEnvelope(walletId);
  if (!env) throw new NoPassphraseError();
  if (isV2(env)) return migrateV2toV3(walletId, env, passphrase);
  if (isV3(env)) {
    const key = await deriveKey(passphrase, b64ToBytes(env.salt));
    return { env, key };
  }
  throw new Error('unknown envelope version');
}

/** Decrypt and return the wallet's priv hex. Throws BadPassphraseError on a
 *  wrong passphrase, NoPassphraseError if no envelope. v2→v3 migrates lazily. */
export async function unlockPriv(walletId: string, passphrase: string): Promise<string> {
  const { env, key } = await readEnvelopeV3(walletId, passphrase);
  try { return await aesDecrypt(env.iv_priv, env.priv_ct, key); }
  catch { throw new BadPassphraseError(); }
}

/** Decrypt and return the wallet's mnemonic, or null if the envelope has none. */
export async function unlockMnemonic(walletId: string, passphrase: string): Promise<string | null> {
  const { env, key } = await readEnvelopeV3(walletId, passphrase);
  if (!env.iv_mnem || !env.mnem_ct) return null;
  try { return await aesDecrypt(env.iv_mnem, env.mnem_ct, key); }
  catch { throw new BadPassphraseError(); }
}

/** Decrypt and return the wallet's FALCON-512 secret key as hex. */
export async function unlockFalconPriv(walletId: string, passphrase: string): Promise<string> {
  const { env, key } = await readEnvelopeV3(walletId, passphrase);
  try { return await aesDecrypt(env.iv_falcon, env.falcon_priv_ct, key); }
  catch { throw new BadPassphraseError(); }
}

/** Return the wallet's FALCON-512 public key as raw bytes (no passphrase). */
export async function getFalconPub(walletId: string): Promise<Uint8Array | null> {
  const env = await readEnvelope(walletId);
  if (env && isV3(env)) return b64ToBytes(env.falcon_pub);
  const hex = await getSecure(falconPubKey(walletId));
  if (hex) return hexToBytes(hex);
  return null;
}

/** Re-encrypt the envelope under a new passphrase. The old one is required. */
export async function changeWalletPassphrase(
  walletId: string, oldPassphrase: string, newPassphrase: string,
): Promise<void> {
  const { env, key: oldKey } = await readEnvelopeV3(walletId, oldPassphrase);
  let privHex: string;
  let mnemonic: string | null = null;
  let falconPrivHex: string;
  try {
    privHex = await aesDecrypt(env.iv_priv, env.priv_ct, oldKey);
    if (env.iv_mnem && env.mnem_ct) mnemonic = await aesDecrypt(env.iv_mnem, env.mnem_ct, oldKey);
    falconPrivHex = await aesDecrypt(env.iv_falcon, env.falcon_priv_ct, oldKey);
  } catch {
    throw new BadPassphraseError();
  }
  const newSalt = randomBytes(KDF_SALT_BYTES);
  const newKey = await deriveKey(newPassphrase, newSalt);
  const newPriv = await aesEncrypt(privHex, newKey);
  const newFalconPriv = await aesEncrypt(falconPrivHex, newKey);
  const next: PassphraseEnvelopeV3 = {
    v: 3,
    salt: bytesToB64(newSalt),
    iv_priv: newPriv.iv,
    priv_ct: newPriv.ct,
    iv_falcon: newFalconPriv.iv,
    falcon_priv_ct: newFalconPriv.ct,
    falcon_pub: env.falcon_pub,
  };
  if (mnemonic) {
    const newMnem = await aesEncrypt(mnemonic, newKey);
    next.iv_mnem = newMnem.iv;
    next.mnem_ct = newMnem.ct;
  }
  await writeEnvelope(walletId, next);
}

/** Remove the passphrase wrap. The current passphrase is required; after this
 *  the priv + mnemonic + FALCON material are back in plain secure-store rows. */
export async function removeWalletPassphrase(
  walletId: string, currentPassphrase: string,
): Promise<void> {
  const { env, key } = await readEnvelopeV3(walletId, currentPassphrase);
  let privHex: string;
  let mnemonic: string | null = null;
  let falconPrivHex: string;
  try {
    privHex = await aesDecrypt(env.iv_priv, env.priv_ct, key);
    if (env.iv_mnem && env.mnem_ct) mnemonic = await aesDecrypt(env.iv_mnem, env.mnem_ct, key);
    falconPrivHex = await aesDecrypt(env.iv_falcon, env.falcon_priv_ct, key);
  } catch {
    throw new BadPassphraseError();
  }
  await setSecure(privKey(walletId), privHex);
  if (mnemonic) await setSecure(mnemonicKey(walletId), mnemonic);
  await setSecure(falconPrivKey(walletId), falconPrivHex);
  await setSecure(falconPubKey(walletId), bytesToHex(b64ToBytes(env.falcon_pub)));
  await removeSecure(envelopeKey(walletId));
}

/** Used by the wipe-wallet flow. Safe to call when no envelope is present. */
export async function wipePassphraseEnvelope(walletId: string): Promise<void> {
  await removeSecure(envelopeKey(walletId));
}
