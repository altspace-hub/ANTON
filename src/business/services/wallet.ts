/**
 * wallet.ts — secp256k1 wallet generation + secure persistence.
 *
 * Same surface as the Expo project's wallet.ts. The OS keychain (via
 * secure-store) is the encryption-at-rest layer. PIN-bound encryption
 * (PBKDF2(PIN) → AES-GCM(privKey)) per spec §13.1 lands once the
 * basic flow is in users' hands.
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

export async function createAndStoreWallet(): Promise<Wallet> {
  if (await hasWallet()) {
    throw new Error('A wallet already exists on this device. Recover or reset first.');
  }
  const priv = new Uint8Array(32);
  globalThis.crypto.getRandomValues(priv);
  if (priv.every((b) => b === 0)) {
    throw new Error('CSPRNG returned all zeros');
  }
  const pub = secp256k1.getPublicKey(priv, true);
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
