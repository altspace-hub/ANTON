/**
 * wallet-passphrase.ts — opt-in second factor on top of biometric.
 *
 * Spec: docs/PAY_WALLET_PASSPHRASE_SPEC.md
 * v3 amendment: docs/PAY_WALLET_PASSPHRASE_SPEC.md §3.2.1 (envelope v3,
 * 2026-05-24).
 *
 * v2 envelope (Ed25519 priv + optional mnemonic, encrypted under a
 * PBKDF2-derived AES-256-GCM key):
 *
 *   passphraseKey = PBKDF2-HMAC-SHA256(passphrase, salt, 600_000, 32)
 *   priv_ct       = AES-256-GCM(priv_hex,    passphraseKey, iv_priv)
 *   mnem_ct       = AES-256-GCM(mnemonic,    passphraseKey, iv_mnem)
 *   stored JSON   = { v: 2, salt, iv_priv, priv_ct, iv_mnem?, mnem_ct? }
 *
 * v3 envelope adds FALCON-512 keypair material so the future user-side
 * post-quantum hard fork is a no-UX-change event:
 *
 *   falcon_priv_ct = AES-256-GCM(falcon_priv_hex, passphraseKey, iv_falcon)
 *   falcon_pub     = base64( raw FALCON-512 pubkey bytes — public, plaintext )
 *   stored JSON    = { v: 3, salt, iv_priv, priv_ct, iv_mnem?, mnem_ct?,
 *                      iv_falcon, falcon_priv_ct, falcon_pub }
 *
 * v2 envelopes are migrated to v3 lazily on the first unlock: when a
 * v2 envelope is observed, the current passphrase decrypts the Ed25519
 * fields, a fresh FALCON-512 keypair is generated via @noble/post-quantum
 * (keygen is NON-deterministic — same seed produces different keys, so
 * the FALCON priv cannot be derived from the BIP-39 mnemonic and must
 * be stored), and a v3 envelope is rewritten under the SAME passphrase
 * (same salt + KDF key, fresh IV for the FALCON field). The original
 * unlock call returns its result as if v3 had always been there.
 *
 * Secure-store already provides the OUTER Keystore-bound AES-GCM wrap
 * on a real device, so this gives the double envelope from the spec
 * (passphrase inner + Keystore outer) without re-implementing the
 * outer layer here.
 *
 * Trade-off: when a passphrase is on, the priv stays in secure-store
 * (this envelope) and does NOT migrate into the FcSecureSigner native
 * plugin. Signing reconstructs the priv into JS for one operation,
 * then it's dropped — exactly the dev-fallback path. The user gains
 * a knowledge-factor at the cost of the "priv never enters JS heap"
 * property. This trade is explicit in the spec.
 */
import { falcon512 } from '@noble/post-quantum/falcon.js';
import { getSecure, removeSecure, setSecure } from './secure-store';

// ── Key derivation + envelope primitives ────────────────────────────

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

// ── FALCON keypair generation ───────────────────────────────────────
//
// FALCON-512 is the post-quantum signature scheme our chain's
// compliance signers already use (HSM-backed, server-side). User-side
// adoption is a future hard-fork; this module just makes sure every
// wallet has a FALCON keypair pre-stashed so the flip is no-UX.
//
// IMPORTANT: FALCON keygen is non-deterministic — a given BIP-39 seed
// will NOT regenerate the same FALCON keypair on each call. Therefore
// the FALCON priv MUST be stored (we can't derive it from the
// mnemonic at restore time). See PAY_FALCON_ROTATION_SPEC.md for the
// post-hard-fork rotation UX that handles wallets restored from seed.

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

// ── Envelope shape + secure-store layout ────────────────────────────

interface PassphraseEnvelopeV2 {
  v: 2;
  salt: string;       // base64 16 bytes
  iv_priv: string;    // base64 12 bytes
  priv_ct: string;    // base64 ciphertext of priv hex
  iv_mnem?: string;   // base64 12 bytes — omitted if wallet had no mnemonic
  mnem_ct?: string;   // base64 ciphertext of mnemonic
}

interface PassphraseEnvelopeV3 {
  v: 3;
  salt: string;
  iv_priv: string;
  priv_ct: string;
  iv_mnem?: string;
  mnem_ct?: string;
  iv_falcon: string;       // base64 12 bytes (FALCON priv IV)
  falcon_priv_ct: string;  // base64 ciphertext of FALCON priv hex
  falcon_pub: string;      // base64 raw FALCON pub bytes (public, not encrypted)
}

type AnyEnvelope = PassphraseEnvelopeV2 | PassphraseEnvelopeV3;

const envelopeKey   = (id: string) => `fc.wallet.${id}.passphrase_envelope`;
const privKey       = (id: string) => `fc.wallet.${id}.priv`;
const mnemonicKey   = (id: string) => `fc.wallet.${id}.mnemonic`;
const falconPrivKey = (id: string) => `fc.wallet.${id}.falcon_priv`;
const falconPubKey  = (id: string) => `fc.wallet.${id}.falcon_pub`;

function isV2(env: AnyEnvelope): env is PassphraseEnvelopeV2 {
  return env.v === 2;
}
function isV3(env: AnyEnvelope): env is PassphraseEnvelopeV3 {
  return env.v === 3;
}

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

// ── Public API ──────────────────────────────────────────────────────

export class BadPassphraseError extends Error {
  constructor() {
    super('wallet passphrase is incorrect');
    this.name = 'BadPassphraseError';
  }
}

export class NoPassphraseError extends Error {
  constructor() {
    super('wallet has no passphrase set');
    this.name = 'NoPassphraseError';
  }
}

/** Returns true if a wallet currently has a passphrase envelope. */
export async function hasPassphrase(walletId: string): Promise<boolean> {
  return (await readEnvelope(walletId)) !== null;
}

/** Set the first passphrase on a wallet that currently has none.
 *
 *  Reads the existing `fc.wallet.<id>.priv` (+ optional mnemonic +
 *  FALCON keypair if present), encrypts under the passphrase, removes
 *  the plaintext rows.
 *
 *  If the wallet doesn't yet have a FALCON keypair (legacy wallet
 *  created before FALCON-on-create wiring shipped), a fresh keypair is
 *  generated here so v3 is always complete after enable.
 *
 *  Caller must:
 *   - have already gated on biometric,
 *   - ensure the wallet's priv has been demigrated out of any native
 *     signer alias before calling (see callers in wallets.ts).
 */
export async function enableWalletPassphrase(
  walletId: string, passphrase: string,
): Promise<void> {
  if ((await readEnvelope(walletId)) !== null) {
    throw new Error('wallet already has a passphrase — use changeWalletPassphrase');
  }
  const privHex = await getSecure(privKey(walletId));
  if (!privHex) {
    throw new Error(
      'wallet priv is not in secure-store (likely held by native signer); ' +
      'demigrate first via callers in wallets.ts',
    );
  }
  const mnemonic = await getSecure(mnemonicKey(walletId));

  // FALCON: prefer existing plaintext rows; generate fresh if missing.
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
  // Only AFTER the envelope is durable: drop the plaintext rows.
  await removeSecure(privKey(walletId));
  if (mnemonic) await removeSecure(mnemonicKey(walletId));
  await removeSecure(falconPrivKey(walletId));
  await removeSecure(falconPubKey(walletId));
}

/** Decrypt the v2 envelope and write a v3 envelope under the SAME
 *  passphrase. The salt + priv ciphertext are preserved; only a fresh
 *  FALCON keypair + its IV are added. Idempotent: returns the v3
 *  envelope and the derived passphrase key for subsequent decrypts.
 *
 *  This is called from every unlock-style API when it sees a v2
 *  envelope, so the user never has to perform an explicit migration.
 */
async function migrateV2toV3(
  walletId: string, env: PassphraseEnvelopeV2, passphrase: string,
): Promise<{ env: PassphraseEnvelopeV3; key: CryptoKey }> {
  const salt = b64ToBytes(env.salt);
  const key = await deriveKey(passphrase, salt);
  // Verify the passphrase by decrypting the priv slot — if this throws,
  // the migration aborts and the v2 envelope is left untouched.
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

/** Internal helper: read the envelope, auto-migrate v2 → v3 if needed,
 *  and return both the v3 envelope and the passphrase-derived key
 *  (so callers can decrypt multiple slots without re-running PBKDF2).
 */
async function readEnvelopeV3(
  walletId: string, passphrase: string,
): Promise<{ env: PassphraseEnvelopeV3; key: CryptoKey }> {
  const env = await readEnvelope(walletId);
  if (!env) throw new NoPassphraseError();
  if (isV2(env)) {
    return migrateV2toV3(walletId, env, passphrase);
  }
  if (isV3(env)) {
    const key = await deriveKey(passphrase, b64ToBytes(env.salt));
    return { env, key };
  }
  throw new Error('unknown envelope version');
}

/** Decrypt and return the wallet's priv hex.
 *  Throws BadPassphraseError on auth-tag failure (AES-GCM).
 *  Throws NoPassphraseError if no envelope is present.
 *  Triggers transparent v2 → v3 migration if the envelope is v2.
 */
export async function unlockPriv(
  walletId: string, passphrase: string,
): Promise<string> {
  const { env, key } = await readEnvelopeV3(walletId, passphrase);
  try {
    return await aesDecrypt(env.iv_priv, env.priv_ct, key);
  } catch {
    throw new BadPassphraseError();
  }
}

/** Decrypt and return the wallet's mnemonic, or null if the envelope
 *  doesn't carry one (e.g. an imported wallet that the user never
 *  pasted the mnemonic for). Triggers transparent v2 → v3 migration. */
export async function unlockMnemonic(
  walletId: string, passphrase: string,
): Promise<string | null> {
  const { env, key } = await readEnvelopeV3(walletId, passphrase);
  if (!env.iv_mnem || !env.mnem_ct) return null;
  try {
    return await aesDecrypt(env.iv_mnem, env.mnem_ct, key);
  } catch {
    throw new BadPassphraseError();
  }
}

/** Decrypt and return the wallet's FALCON-512 secret key as hex.
 *  Triggers transparent v2 → v3 migration if needed. Throws the same
 *  Bad/NoPassphraseError as the other unlock APIs. */
export async function unlockFalconPriv(
  walletId: string, passphrase: string,
): Promise<string> {
  const { env, key } = await readEnvelopeV3(walletId, passphrase);
  try {
    return await aesDecrypt(env.iv_falcon, env.falcon_priv_ct, key);
  } catch {
    throw new BadPassphraseError();
  }
}

/** Return the wallet's FALCON-512 public key as raw bytes.
 *  Does NOT require the passphrase — the public key is public.
 *
 *  Resolution order:
 *   1. If a v3 envelope exists, return its plaintext falcon_pub.
 *   2. Else if a plaintext `fc.wallet.<id>.falcon_pub` row exists
 *      (wallet without passphrase), return that.
 *   3. Else return null (legacy wallet that pre-dates FALCON-on-create;
 *      the next unlock-with-passphrase will populate it via migration,
 *      OR a future helper can backfill it for no-passphrase wallets).
 */
export async function getFalconPub(walletId: string): Promise<Uint8Array | null> {
  const env = await readEnvelope(walletId);
  if (env && isV3(env)) {
    return b64ToBytes(env.falcon_pub);
  }
  const hex = await getSecure(falconPubKey(walletId));
  if (hex) return hexToBytes(hex);
  return null;
}

/** Re-encrypt the envelope under a new passphrase. The old one is
 *  required so a bystander who picks up an unlocked phone can't
 *  rotate the passphrase out from under the legitimate user.
 *  Migrates v2 → v3 in the same operation if needed. */
export async function changeWalletPassphrase(
  walletId: string, oldPassphrase: string, newPassphrase: string,
): Promise<void> {
  // Read-or-migrate under the OLD passphrase so we have a guaranteed v3
  // shape with a fresh FALCON keypair iff this was a v2 envelope.
  const { env, key: oldKey } = await readEnvelopeV3(walletId, oldPassphrase);

  // Decrypt every slot under oldKey.
  let privHex: string;
  let mnemonic: string | null = null;
  let falconPrivHex: string;
  try {
    privHex = await aesDecrypt(env.iv_priv, env.priv_ct, oldKey);
    if (env.iv_mnem && env.mnem_ct) {
      mnemonic = await aesDecrypt(env.iv_mnem, env.mnem_ct, oldKey);
    }
    falconPrivHex = await aesDecrypt(env.iv_falcon, env.falcon_priv_ct, oldKey);
  } catch {
    throw new BadPassphraseError();
  }

  // Re-encrypt under newKey with a fresh salt.
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

/** Remove the passphrase wrap. The current passphrase is required.
 *  After this call the priv + mnemonic + FALCON priv + FALCON pub are
 *  back in the plain secure-store rows (still Keystore-wrapped on
 *  native). Migrates v2 → v3 first so the FALCON material is generated
 *  and then immediately exported to its plain row.
 */
export async function removeWalletPassphrase(
  walletId: string, currentPassphrase: string,
): Promise<void> {
  const { env, key } = await readEnvelopeV3(walletId, currentPassphrase);
  let privHex: string;
  let mnemonic: string | null = null;
  let falconPrivHex: string;
  try {
    privHex = await aesDecrypt(env.iv_priv, env.priv_ct, key);
    if (env.iv_mnem && env.mnem_ct) {
      mnemonic = await aesDecrypt(env.iv_mnem, env.mnem_ct, key);
    }
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

/** Used by the wipe-wallet flow to remove the envelope row alongside
 *  the rest of the wallet's secure-store keys. Safe to call when no
 *  envelope is present. */
export async function wipePassphraseEnvelope(walletId: string): Promise<void> {
  await removeSecure(envelopeKey(walletId));
}
