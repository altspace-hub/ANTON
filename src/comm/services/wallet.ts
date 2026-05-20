/**
 * wallet.ts — Comm App FutureChain wallet.
 *
 * Phase C3 (May 20 2026): swapped from the legacy secp256k1 stub to the
 * real @futurechain/sdk Ed25519 keypair + Base58 `fc_` address. Mirrors
 * the pay-app wallet.ts so all three ANTON apps share the same curve +
 * address shape.
 *
 * Separate from the Comm App's Ed25519 messaging identity in
 * identity.ts:
 *   - identity.ts → contactHash + signed envelopes for E2E chat.
 *   - this module → FutureChain payment wallet (also Ed25519, but
 *     keyed for `fc_…` addresses + transaction signing, not for chat).
 *
 * The private key lives in the tier-aware secure-store (native
 * Keystore on Android; AES-GCM-wrapped IndexedDB on web fallback). On
 * a real device the store is fail-closed: a missing native plugin
 * throws rather than silently downgrading.
 *
 * Public surface preserved (`createAndStoreWallet`/`loadWallet`/
 * `hasWallet`/`wipeWallet`) so existing callers compile unchanged. The
 * `publicKeyCompressed` field on the Wallet interface is renamed
 * `publicKey` (Ed25519 keys are 32 bytes, not the 33-byte compressed
 * secp256k1 layout). The only call site that touched it was inside
 * this file.
 *
 * Send path: today's WalletSendScreen records local-only `send` txs;
 * once the Comm wallet wires up to Bahnhof, the signing path lands in
 * a sibling `payment.ts` mirroring `src/pay/services/payment.ts`.
 */
import { wallet as sdkWallet } from '@futurechain/sdk';
import { assertBiometric } from './biometric';
import { getSecure, removeSecure, setSecure } from './secure-store';

const PRIV_KEY = 'fc.wallet.priv';
const ADDR_KEY = 'fc.wallet.addr';
const MNEMONIC_KEY = 'fc.wallet.mnemonic';
const BACKED_UP_KEY = 'fc.wallet.backedUp';

export interface Wallet {
  /** 32-byte Ed25519 private key — sensitive, never log. */
  privateKey: Uint8Array;
  /** 32-byte Ed25519 public key. */
  publicKey: Uint8Array;
  /** `fc_…` Base58 address derived from the public key. */
  address: string;
}

/** Generate + persist a new wallet (Ed25519 + 24-word BIP-39 mnemonic).
 *  Throws if one already exists on the device — recovery from seed is
 *  a deliberate, separate flow via {@link restoreFromMnemonic}. */
export async function createAndStoreWallet(): Promise<Wallet> {
  if (await hasWallet()) {
    throw new Error('A wallet already exists on this device.');
  }
  const { wallet, mnemonic } = sdkWallet.createWallet();
  await persist(wallet, mnemonic, false);
  return wallet;
}

/** Restore from a 24-word BIP-39 mnemonic. Wipes any existing wallet
 *  first (caller confirms with the user before calling). Gated behind
 *  a biometric prompt. */
export async function restoreFromMnemonic(mnemonic: string): Promise<Wallet> {
  await assertBiometric({ reason: 'Restore wallet from recovery phrase' });
  const trimmed = mnemonic.trim().split(/\s+/).join(' ');
  const seed = sdkWallet.seedPhraseFromMnemonic(trimmed);
  const wallet = sdkWallet.walletFromSeedPhrase(seed);
  await wipeWallet();
  await persist(wallet, trimmed, true);
  return wallet;
}

export async function loadWallet(): Promise<Wallet | null> {
  const privHex = await getSecure(PRIV_KEY);
  if (!privHex) return null;
  const priv = hexToBytes(privHex);
  return sdkWallet.walletFromPrivateKey(priv);
}

export async function hasWallet(): Promise<boolean> {
  return (await getSecure(PRIV_KEY)) !== null;
}

/** Destroy the local wallet. Cannot be undone. */
export async function wipeWallet(): Promise<void> {
  await removeSecure(PRIV_KEY);
  await removeSecure(ADDR_KEY);
  await removeSecure(MNEMONIC_KEY);
  await removeSecure(BACKED_UP_KEY);
}

/** Raw mnemonic read — used by the onboarding backup flow. Settings
 *  re-display should use {@link getMnemonicWithBiometric}. */
export async function getMnemonic(): Promise<string | null> {
  return getSecure(MNEMONIC_KEY);
}

/** Same as {@link getMnemonic} but gated behind a biometric prompt. */
export async function getMnemonicWithBiometric(): Promise<string | null> {
  await assertBiometric({ reason: 'Show recovery phrase' });
  return getSecure(MNEMONIC_KEY);
}

export async function isMnemonicBackedUp(): Promise<boolean> {
  return (await getSecure(BACKED_UP_KEY)) === '1';
}

export async function markMnemonicBackedUp(): Promise<void> {
  await setSecure(BACKED_UP_KEY, '1');
}

async function persist(wallet: Wallet, mnemonic: string, backedUp: boolean): Promise<void> {
  await setSecure(PRIV_KEY, bytesToHex(wallet.privateKey));
  await setSecure(ADDR_KEY, wallet.address);
  await setSecure(MNEMONIC_KEY, mnemonic);
  if (backedUp) {
    await setSecure(BACKED_UP_KEY, '1');
  } else {
    await removeSecure(BACKED_UP_KEY);
  }
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
