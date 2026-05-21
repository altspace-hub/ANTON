/**
 * wallet.ts — facade over the multi-wallet registry in wallets.ts.
 *
 * Kept as a thin compatibility layer because the rest of the app
 * (payment.ts, the onboarding screens, HomeScreen, WalletScreen) was
 * written against the original single-wallet surface. Every call here
 * resolves to the active wallet — switching wallets is done via
 * setActiveWallet() in wallets.ts, after which the next loadWallet()
 * naturally returns the new active wallet.
 *
 * History: originally implemented Ed25519 keygen + secure persistence
 * directly. As of 2026-05-21 the on-disk layout is v2 (per-wallet
 * prefixed keys + a registry list). Legacy v1 installs are migrated
 * transparently — see {@link import('./wallets').migrateLegacyIfNeeded}.
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
 *  flow. Throws if any wallet already exists — Settings → "+ New
 *  wallet" is the path for additional wallets. */
export async function createAndStoreWallet(): Promise<Wallet> {
  if (await hasWallet()) {
    throw new Error('A wallet already exists on this device. Reset first.');
  }
  const { meta } = await createWalletInRegistry('Main wallet');
  // createWalletInRegistry activates it, so getActiveWallet returns
  // this fresh wallet. The caller (DoneScreen / Welcome) only needs
  // the address, but we return the full Wallet shape for parity.
  const wallet = await getActiveWallet();
  if (!wallet) {
    // Should be impossible — we just created and activated it.
    throw new Error(`Wallet ${meta.id} created but not retrievable`);
  }
  return wallet;
}

/** Restore a wallet from a user-supplied 24-word BIP-39 mnemonic.
 *  Wipes any existing wallets first — caller should confirm with the
 *  user before invoking. Treats the restored wallet as already backed
 *  up (the user clearly has the phrase). Biometric-gated. */
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

/** Used by the Restore flow before importing a new wallet. The
 *  multi-wallet UI calls deleteWallet() in wallets.ts for single-
 *  wallet removal — this is "burn it all down." */
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

// Re-export the active meta as a convenience for components that
// want the label + address pair (e.g. the wallet chip on Home).
export { getActiveWalletMeta };
