/**
 * wallet.ts — facade over the multi-wallet registry in wallets.ts.
 *
 * Thin compatibility layer for legacy callsites (payment.ts,
 * WalletScreen, WalletConnectScreen, payment-identity). Every call
 * resolves to the active wallet — switching wallets is done via
 * setActiveWallet() in wallets.ts, after which the next loadWallet()
 * returns the new active wallet.
 *
 * History: this used to own Ed25519 keygen + secure persistence
 * directly (Phase C3 swap from secp256k1, May 20 2026). As of
 * 2026-05-21 the on-disk layout is v2 (per-wallet prefixed keys +
 * a registry list); legacy v1 installs migrate transparently — see
 * wallets.migrateLegacyIfNeeded().
 *
 * Separate from the Comm App's Ed25519 messaging identity in
 * identity.ts:
 *   - identity.ts → contactHash + signed envelopes for E2E chat.
 *   - this module → FutureChain payment wallet.
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
} from './wallets';

export type { Wallet };

/** Create the FIRST wallet on this device. Used by the onboarding
 *  flow (WalletConnectScreen). Throws if any wallet already exists —
 *  Settings → "+ New wallet" is the path for additional wallets. */
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

/** Restore a wallet from a 24-word BIP-39 mnemonic. Wipes every
 *  existing wallet first — caller confirms with the user before
 *  invoking. Biometric-gated. */
export async function restoreFromMnemonic(mnemonic: string): Promise<Wallet> {
  await assertBiometric({ reason: 'Restore wallet from recovery phrase' });
  await wipeAllWallets();
  await importWalletFromMnemonic(mnemonic, 'Main wallet');
  const wallet = await getActiveWallet();
  if (!wallet) throw new Error('Restore succeeded but wallet was not retrievable');
  return wallet;
}

export async function loadWallet(): Promise<Wallet | null> {
  return getActiveWallet();
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
