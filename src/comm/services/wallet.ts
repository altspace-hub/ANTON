/**
 * wallet.ts — Comm App FutureChain wallet.
 *
 * Mirrors the Business app's src/business/services/wallet.ts pattern
 * (commit f116954). The key derivation lives in @futurechain/sdk so
 * the same `fc_…` address shape comes out across Business, Comm and
 * any future ANTON-suite wallet.
 *
 * Separate from the Comm App's Ed25519 messaging identity in
 * identity.ts:
 *   - Ed25519 → contactHash + signed envelopes for E2E chat
 *   - secp256k1 → FutureChain payment wallet
 *
 * The private key lives in the tier-aware secure-store (native
 * Keystore on Android; AES-GCM-wrapped IndexedDB on web fallback).
 *
 * v0.1 simplification: no PIN-bound encryption layer. Same threat
 * model the Business app accepts for the same v0 reasons — the OS
 * keychain is the encryption-at-rest layer. PIN-derived AES-GCM
 * wrap is a follow-up once the basic flow is in users' hands.
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import { wallet as sdkWallet } from '@futurechain/sdk';
import { getSecure, removeSecure, setSecure } from './secure-store';

const PRIV_KEY = 'fc.wallet.priv';
const ADDR_KEY = 'fc.wallet.addr';

export interface Wallet {
  privateKey: Uint8Array;
  publicKeyCompressed: Uint8Array;
  address: string;
}

/** Generate + persist a new wallet. Throws if one already exists on
 *  the device — recovery from seed is a deliberate, separate flow
 *  (lands when the seed-phrase service ships in a later phase). */
export async function createAndStoreWallet(): Promise<Wallet> {
  if (await hasWallet()) {
    throw new Error('A wallet already exists on this device.');
  }
  const priv = new Uint8Array(32);
  globalThis.crypto.getRandomValues(priv);
  if (priv.every((b) => b === 0)) {
    throw new Error('CSPRNG returned all zeros');
  }
  const pub = secp256k1.getPublicKey(priv, true); // 33-byte compressed
  const address = sdkWallet.addressFromPublicKey(pub);

  await setSecure(PRIV_KEY, bytesToHex(priv));
  await setSecure(ADDR_KEY, address);

  return { privateKey: priv, publicKeyCompressed: pub, address };
}

export async function loadWallet(): Promise<Wallet | null> {
  const privHex = await getSecure(PRIV_KEY);
  if (!privHex) return null;
  const priv = hexToBytes(privHex);
  const pub = secp256k1.getPublicKey(priv, true);
  const address = sdkWallet.addressFromPublicKey(pub);
  return { privateKey: priv, publicKeyCompressed: pub, address };
}

export async function hasWallet(): Promise<boolean> {
  return (await getSecure(PRIV_KEY)) !== null;
}

/** Destroy the local wallet. Cannot be undone. */
export async function wipeWallet(): Promise<void> {
  await removeSecure(PRIV_KEY);
  await removeSecure(ADDR_KEY);
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
