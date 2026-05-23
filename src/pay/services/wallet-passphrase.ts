/**
 * wallet-passphrase.ts — opt-in second factor on top of biometric.
 *
 * Spec: docs/PAY_WALLET_PASSPHRASE_SPEC.md
 *
 * Envelope (when a passphrase is set, the priv + mnemonic live ONLY in
 * this envelope under `fc.wallet.<id>.passphrase_envelope` — the
 * single-key `fc.wallet.<id>.priv` / `.mnemonic` rows are removed):
 *
 *   passphraseKey = PBKDF2-HMAC-SHA256(passphrase, salt, 600_000, 32)
 *   priv_ct       = AES-256-GCM(priv_hex,    passphraseKey, iv_priv)
 *   mnem_ct       = AES-256-GCM(mnemonic,    passphraseKey, iv_mnem)
 *   stored JSON   = { v: 2, salt, iv_priv, priv_ct, iv_mnem, mnem_ct? }
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

// ── Envelope shape + secure-store layout ────────────────────────────

interface PassphraseEnvelopeV2 {
  v: 2;
  salt: string;       // base64 16 bytes
  iv_priv: string;    // base64 12 bytes
  priv_ct: string;    // base64 ciphertext of priv hex
  iv_mnem?: string;   // base64 12 bytes — omitted if wallet had no mnemonic
  mnem_ct?: string;   // base64 ciphertext of mnemonic
}

const envelopeKey = (id: string) => `fc.wallet.${id}.passphrase_envelope`;
const privKey     = (id: string) => `fc.wallet.${id}.priv`;
const mnemonicKey = (id: string) => `fc.wallet.${id}.mnemonic`;

async function readEnvelope(id: string): Promise<PassphraseEnvelopeV2 | null> {
  const raw = await getSecure(envelopeKey(id));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' && parsed !== null &&
      (parsed as PassphraseEnvelopeV2).v === 2 &&
      typeof (parsed as PassphraseEnvelopeV2).salt === 'string' &&
      typeof (parsed as PassphraseEnvelopeV2).iv_priv === 'string' &&
      typeof (parsed as PassphraseEnvelopeV2).priv_ct === 'string'
    ) {
      return parsed as PassphraseEnvelopeV2;
    }
  } catch { /* fall through */ }
  return null;
}

async function writeEnvelope(id: string, env: PassphraseEnvelopeV2): Promise<void> {
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
 *  Reads the existing `fc.wallet.<id>.priv` (+ optional mnemonic),
 *  encrypts under the passphrase, removes the plaintext rows.
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

  const salt = randomBytes(KDF_SALT_BYTES);
  const key = await deriveKey(passphrase, salt);
  const priv = await aesEncrypt(privHex, key);
  const env: PassphraseEnvelopeV2 = {
    v: 2,
    salt: bytesToB64(salt),
    iv_priv: priv.iv,
    priv_ct: priv.ct,
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
}

/** Decrypt and return the wallet's priv hex.
 *  Throws BadPassphraseError on auth-tag failure (AES-GCM).
 *  Throws NoPassphraseError if no envelope is present.
 */
export async function unlockPriv(
  walletId: string, passphrase: string,
): Promise<string> {
  const env = await readEnvelope(walletId);
  if (!env) throw new NoPassphraseError();
  const key = await deriveKey(passphrase, b64ToBytes(env.salt));
  try {
    return await aesDecrypt(env.iv_priv, env.priv_ct, key);
  } catch {
    throw new BadPassphraseError();
  }
}

/** Decrypt and return the wallet's mnemonic, or null if the envelope
 *  doesn't carry one (e.g. an imported wallet that the user never
 *  pasted the mnemonic for). */
export async function unlockMnemonic(
  walletId: string, passphrase: string,
): Promise<string | null> {
  const env = await readEnvelope(walletId);
  if (!env) throw new NoPassphraseError();
  if (!env.iv_mnem || !env.mnem_ct) return null;
  const key = await deriveKey(passphrase, b64ToBytes(env.salt));
  try {
    return await aesDecrypt(env.iv_mnem, env.mnem_ct, key);
  } catch {
    throw new BadPassphraseError();
  }
}

/** Re-encrypt the envelope under a new passphrase. The old one is
 *  required so a bystander who picks up an unlocked phone can't
 *  rotate the passphrase out from under the legitimate user. */
export async function changeWalletPassphrase(
  walletId: string, oldPassphrase: string, newPassphrase: string,
): Promise<void> {
  const env = await readEnvelope(walletId);
  if (!env) throw new NoPassphraseError();
  const oldKey = await deriveKey(oldPassphrase, b64ToBytes(env.salt));
  let privHex: string;
  let mnemonic: string | null = null;
  try {
    privHex = await aesDecrypt(env.iv_priv, env.priv_ct, oldKey);
    if (env.iv_mnem && env.mnem_ct) {
      mnemonic = await aesDecrypt(env.iv_mnem, env.mnem_ct, oldKey);
    }
  } catch {
    throw new BadPassphraseError();
  }
  const newSalt = randomBytes(KDF_SALT_BYTES);
  const newKey = await deriveKey(newPassphrase, newSalt);
  const newPriv = await aesEncrypt(privHex, newKey);
  const next: PassphraseEnvelopeV2 = {
    v: 2,
    salt: bytesToB64(newSalt),
    iv_priv: newPriv.iv,
    priv_ct: newPriv.ct,
  };
  if (mnemonic) {
    const newMnem = await aesEncrypt(mnemonic, newKey);
    next.iv_mnem = newMnem.iv;
    next.mnem_ct = newMnem.ct;
  }
  await writeEnvelope(walletId, next);
}

/** Remove the passphrase wrap. The current passphrase is required.
 *  After this call the priv + mnemonic are back in the plain
 *  secure-store rows (still Keystore-wrapped on native). */
export async function removeWalletPassphrase(
  walletId: string, currentPassphrase: string,
): Promise<void> {
  const env = await readEnvelope(walletId);
  if (!env) throw new NoPassphraseError();
  const key = await deriveKey(currentPassphrase, b64ToBytes(env.salt));
  let privHex: string;
  let mnemonic: string | null = null;
  try {
    privHex = await aesDecrypt(env.iv_priv, env.priv_ct, key);
    if (env.iv_mnem && env.mnem_ct) {
      mnemonic = await aesDecrypt(env.iv_mnem, env.mnem_ct, key);
    }
  } catch {
    throw new BadPassphraseError();
  }
  await setSecure(privKey(walletId), privHex);
  if (mnemonic) await setSecure(mnemonicKey(walletId), mnemonic);
  await removeSecure(envelopeKey(walletId));
}

/** Used by the wipe-wallet flow to remove the envelope row alongside
 *  the rest of the wallet's secure-store keys. Safe to call when no
 *  envelope is present. */
export async function wipePassphraseEnvelope(walletId: string): Promise<void> {
  await removeSecure(envelopeKey(walletId));
}
