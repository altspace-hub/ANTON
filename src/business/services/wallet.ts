/**
 * wallet.ts — Ed25519 wallet generation + secure persistence (merchant side).
 *
 * Phase C2 (May 20 2026): swapped from the legacy secp256k1 stub to the
 * real @futurechain/sdk Ed25519 keypair + Base58 `fc_` address. Mirrors
 * the pay-app wallet.ts so the two apps' wallet code paths stay aligned.
 *
 * Public surface preserved (`createAndStoreWallet`/`loadWallet`/
 * `hasWallet`/`wipeWallet`) so existing callers (ConnectWalletScreen,
 * SettingsScreen, SimpleScreen, ExtendedScreen) compile unchanged. The
 * `publicKeyCompressed` field on the Wallet interface is renamed
 * `publicKey` (Ed25519 keys are 32 bytes, not the 33-byte compressed
 * secp256k1 layout). The only call sites that touched it were inside
 * this file, so no UI changes needed.
 *
 * What the merchant uses the wallet for today: deriving the `fc_…`
 * address that goes into the payment QR. No signing path lives here
 * yet — when receive-side accounting moves to verifying inbound txs,
 * it'll plug into the same SDK.
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

/** Create a fresh wallet (Ed25519 + 24-word BIP-39 mnemonic), persist
 *  privkey + address + mnemonic, mark as NOT yet backed up. */
export async function createAndStoreWallet(): Promise<Wallet> {
  if (await hasWallet()) {
    throw new Error('A wallet already exists on this device. Recover or reset first.');
  }
  const { wallet, mnemonic } = sdkWallet.createWallet();
  await persist(wallet, mnemonic, false);
  return wallet;
}

/** Restore from a user-supplied 24-word BIP-39 mnemonic. Wipes any
 *  existing wallet first (caller confirms with the user before calling).
 *  Gated behind a fresh biometric prompt — wallet replacement is one of
 *  the actions a stolen-but-unlocked phone should NOT be able to do
 *  silently. */
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

/** Raw mnemonic read — used by the onboarding backup flow (BackupShow
 *  / BackupVerify when those screens land for Business). Settings
 *  re-display should use {@link getMnemonicWithBiometric} instead. */
export async function getMnemonic(): Promise<string | null> {
  return getSecure(MNEMONIC_KEY);
}

/** Same as {@link getMnemonic} but gated behind a biometric prompt.
 *  Throws on cancel / unavailable. */
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
