/**
 * wallet.ts — Ed25519 wallet generation + secure persistence.
 *
 * Uses @futurechain/sdk's canonical signer (byte-exact against
 * futurechain/src/secure_crypto.rs). Stores the 32-byte private key,
 * the address, and the BIP-39 24-word recovery mnemonic in the OS
 * keychain via secure-store. The mnemonic stays on-device so the
 * Settings → Show recovery phrase flow can re-display it under PIN
 * gate; it is never sent off-device.
 *
 * Public surface preserved from the prior secp256k1 version
 * (createAndStoreWallet / loadWallet / hasWallet / wipeWallet) so the
 * UI callers don't need changes. The `Wallet.publicKey` field replaces
 * the old `publicKeyCompressed` — Ed25519 keys are 32 bytes.
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

/** Create a fresh wallet, persist private key + mnemonic + address to
 *  secure storage, mark the wallet as NOT yet backed up. */
export async function createAndStoreWallet(): Promise<Wallet> {
  if (await hasWallet()) {
    throw new Error('A wallet already exists on this device. Reset first.');
  }
  const { wallet, mnemonic } = sdkWallet.createWallet();
  await persist(wallet, mnemonic, false);
  return wallet;
}

/** Restore a wallet from a user-supplied 24-word BIP-39 mnemonic.
 *  Wipes any existing wallet first — caller should confirm with the
 *  user before invoking. Treats the restored wallet as already backed
 *  up (the user clearly has the phrase).
 *
 *  Gated behind a fresh biometric prompt to make a stolen-but-unlocked
 *  phone unable to silently swap the wallet under the user — even
 *  though the prompt below also requires the user to type 24 words,
 *  the gate keeps the threat model consistent ("any wallet-modifying
 *  action requires user presence"). */
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

export async function wipeWallet(): Promise<void> {
  await removeSecure(PRIV_KEY);
  await removeSecure(ADDR_KEY);
  await removeSecure(MNEMONIC_KEY);
  await removeSecure(BACKED_UP_KEY);
}

/** Read back the recovery phrase the user wrote down at wallet
 *  creation time. Returns null if the wallet has been wiped.
 *
 *  This raw accessor is used by the onboarding screens
 *  (BackupShow → BackupVerify) where the user has JUST seen the phrase
 *  and a biometric prompt would be both redundant and broken (biometry
 *  may not be enrolled yet on a fresh device). For the "re-show after
 *  onboarding" Settings flow, use {@link getMnemonicWithBiometric}. */
export async function getMnemonic(): Promise<string | null> {
  return getSecure(MNEMONIC_KEY);
}

/** Same as {@link getMnemonic} but gated behind a fresh biometric
 *  prompt. Throws on cancel / unavailable / failure — caller surfaces
 *  the message to the user. Use this on the Settings re-display flow
 *  and anywhere else outside the create/verify onboarding path. */
export async function getMnemonicWithBiometric(): Promise<string | null> {
  await assertBiometric({ reason: 'Show recovery phrase' });
  return getSecure(MNEMONIC_KEY);
}

/** True once the user has completed the backup confirmation flow. */
export async function isMnemonicBackedUp(): Promise<boolean> {
  return (await getSecure(BACKED_UP_KEY)) === '1';
}

/** Mark the wallet as backed up. Called by the backup-confirm UI once
 *  the user has correctly re-entered the verification words. */
export async function markMnemonicBackedUp(): Promise<void> {
  await setSecure(BACKED_UP_KEY, '1');
}

async function persist(
  wallet: Wallet,
  mnemonic: string,
  backedUp: boolean,
): Promise<void> {
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
