/**
 * wallet.ts — Business App: facade over the multi-wallet registry in
 * wallets.ts.
 *
 * Thin compatibility layer for legacy callsites (ConnectWalletScreen,
 * SettingsScreen, SimpleScreen, ExtendedScreen). Every call resolves
 * to the active wallet — switching wallets is done via setActiveWallet
 * in wallets.ts, after which the next loadWallet() returns the new
 * active wallet AND merchant.safelloReceiveAddress is updated to match.
 *
 * History: originally implemented Ed25519 keygen + secure persistence
 * directly (Phase C2 swap from secp256k1, May 20 2026). As of
 * 2026-05-21 the on-disk layout is v2 (per-wallet prefixed keys +
 * a registry list). Legacy v1 installs are migrated transparently —
 * see wallets.migrateLegacyIfNeeded().
 */
import { assertBiometric } from './biometric';
import {
  createWallet as createWalletInRegistry,
  getActiveWallet,
  getActiveWalletId,
  getActiveWalletMeta,
  getMnemonicForActive,
  isBackedUp as isBackedUpInRegistry,
  markBackedUp as markBackedUpInRegistry,
  migrateLegacyIfNeeded,
  wipeAllWallets,
  importWalletFromMnemonic,
  type Wallet,
  type WalletMeta,
} from './wallets';

export type { Wallet, WalletMeta };

/** Create the FIRST wallet on this device. Used by the onboarding
 *  ConnectWalletScreen flow. Throws if any wallet already exists —
 *  Settings → Wallets → "+ New wallet" is the path for additional. */
export async function createAndStoreWallet(): Promise<Wallet> {
  if (await hasWallet()) {
    throw new Error('A wallet already exists on this device.');
  }
  const { meta } = await createWalletInRegistry('Main wallet');
  const wallet = await getActiveWallet();
  if (!wallet) {
    throw new Error(`Wallet ${meta.id} created but not retrievable`);
  }
  return wallet;
}

/** Restore from a 24-word BIP-39 mnemonic. Wipes every existing
 *  wallet first — caller confirms with the user. Biometric-gated. */
export async function restoreFromMnemonic(mnemonic: string): Promise<Wallet> {
  await assertBiometric({ reason: 'Restore wallet from recovery phrase' });
  await wipeAllWallets();
  await importWalletFromMnemonic(mnemonic, 'Main wallet');
  const wallet = await getActiveWallet();
  if (!wallet) throw new Error('Restore succeeded but wallet was not retrievable');
  return wallet;
}

/**
 * The active wallet as a priv-LESS view — id, label, address,
 * publicKeyHex. This is what the UI should use: sale screens, the
 * settings wallet card, the "is a wallet connected" check all need
 * the address, never the private key.
 *
 * Sourced from the registry meta, so it keeps working after the
 * native-signer migration has removed the JS-readable priv from
 * secure-store. (The old implementation returned a full `Wallet` via
 * `getActiveWallet()`, which silently became `null` the moment the
 * priv was wrapped into the Keystore — breaking every wallet-aware
 * screen after the first day-close.)
 */
export async function loadWallet(): Promise<WalletMeta | null> {
  return getActiveWalletMeta();
}

export async function hasWallet(): Promise<boolean> {
  await migrateLegacyIfNeeded();
  return (await getActiveWalletId()) !== null;
}

/** Erase EVERY wallet on the device. Used by the Restore flow before
 *  importing a new one. Settings → single-wallet delete uses
 *  deleteWallet() in wallets.ts instead. */
export async function wipeWallet(): Promise<void> {
  await wipeAllWallets();
}

export async function getMnemonic(): Promise<string | null> {
  return getMnemonicForActive();
}

export async function getMnemonicWithBiometric(): Promise<string | null> {
  await assertBiometric({ reason: 'Show recovery phrase' });
  return getMnemonicForActive();
}

export async function isMnemonicBackedUp(): Promise<boolean> {
  const id = await getActiveWalletId();
  if (!id) return false;
  return isBackedUpInRegistry(id);
}

export async function markMnemonicBackedUp(): Promise<void> {
  const id = await getActiveWalletId();
  if (!id) throw new Error('No active wallet to mark backed up');
  await markBackedUpInRegistry(id);
}

export { getActiveWalletMeta };
