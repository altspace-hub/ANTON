/**
 * wallet.ts — secp256k1 wallet generation + secure persistence on the device.
 *
 * v0.1 simplification: the OS keychain (expo-secure-store) is the
 * encryption-at-rest layer. We don't apply a second PIN-derived AES
 * layer yet — the PIN is currently just a UX gate. Spec §13.1 calls
 * for PBKDF2(PIN) → AES-GCM(privKey); that lands once the basic flow
 * is in users' hands. The threat being deferred: a forensically-
 * extracted device-encrypted-but-PIN-unprotected keychain. For the
 * Phase B beta target (student-union bar staff) this is acceptable;
 * the move to PIN-bound encryption is tracked separately.
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import * as SecureStore from 'expo-secure-store';
import { wallet as sdkWallet } from '@futurechain/sdk';

const PRIV_KEY = 'fc.wallet.priv';
const ADDR_KEY = 'fc.wallet.addr';

export interface Wallet {
  privateKey: Uint8Array;
  publicKeyCompressed: Uint8Array;
  address: string;
}

/** Generate + persist a new wallet. Throws if one already exists. */
export async function createAndStoreWallet(): Promise<Wallet> {
  if (await hasWallet()) {
    throw new Error('A wallet already exists on this device. Recover or reset first.');
  }
  // 32 random bytes from the platform CSPRNG via Web Crypto. RN/Hermes
  // exposes crypto.getRandomValues() via expo's crypto polyfill or the
  // built-in one in newer RN.
  const priv = new Uint8Array(32);
  globalThis.crypto.getRandomValues(priv);
  // Validate: secp256k1 scalars must be in [1, n-1]. Reject the
  // vanishingly unlikely all-zero result.
  if (priv.every((b) => b === 0)) {
    throw new Error('CSPRNG returned all zeros');
  }
  const pub = secp256k1.getPublicKey(priv, true); // 33-byte compressed
  const address = sdkWallet.addressFromPublicKey(pub);

  await SecureStore.setItemAsync(PRIV_KEY, bytesToHex(priv));
  await SecureStore.setItemAsync(ADDR_KEY, address);

  return { privateKey: priv, publicKeyCompressed: pub, address };
}

/** Load the persisted wallet. Returns null if none. */
export async function loadWallet(): Promise<Wallet | null> {
  const privHex = await SecureStore.getItemAsync(PRIV_KEY);
  if (!privHex) return null;
  const priv = hexToBytes(privHex);
  const pub = secp256k1.getPublicKey(priv, true);
  const address = sdkWallet.addressFromPublicKey(pub);
  return { privateKey: priv, publicKeyCompressed: pub, address };
}

export async function hasWallet(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PRIV_KEY)) !== null;
}

/** Destroy the local wallet. Cannot be undone. */
export async function wipeWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(PRIV_KEY);
  await SecureStore.deleteItemAsync(ADDR_KEY);
}

function bytesToHex(b: Uint8Array): string {
  let out = '';
  for (const byte of b) out += byte.toString(16).padStart(2, '0');
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
