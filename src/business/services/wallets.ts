/**
 * wallets.ts — Business App multi-wallet registry.
 *
 * Lifted from src/pay/services/wallets.ts; same secure-store layout
 * and same migration story. Business merchants might want separate
 * "main till", "tips", "events" wallets — each with its own balance
 * and recovery phrase.
 *
 * Secure-store layout (v2):
 *   fc.wallet.ids                JSON [{ id, label, address, ... }]
 *   fc.wallet.active             <id>
 *   fc.wallet.<id>.priv          per-wallet privkey hex
 *   fc.wallet.<id>.addr          per-wallet address
 *   fc.wallet.<id>.mnemonic      per-wallet 24-word BIP-39 phrase
 *   fc.wallet.<id>.backedUp      '1' once verified
 *
 * Legacy v1 layout (pre-2026-05-21) used unprefixed keys;
 * migrateLegacyIfNeeded() runs on every read and lifts the singleton
 * into the registry as "Main wallet" then deletes the legacy keys.
 *
 * The MerchantConfig.safelloReceiveAddress field is kept in sync
 * with the active wallet by setActiveWallet() so the QR-building
 * code paths see the right address without each having to call
 * getActiveWalletMeta() separately.
 */
import { wallet as sdkWallet } from '@futurechain/sdk';
import { ed25519 } from '@noble/curves/ed25519';
import { assertBiometric } from './biometric';
import { getSecure, removeSecure, setSecure } from './secure-store';
import { loadConfig, saveConfig } from './merchant';
import {
  hasAlias as nativeHasAlias, isSecureSignerAvailable,
  signWithAlias, wrapPriv,
} from './secure-signer';

const IDS_KEY     = 'fc.wallet.ids';
const ACTIVE_KEY  = 'fc.wallet.active';
const privKey     = (id: string) => `fc.wallet.${id}.priv`;
const addrKey     = (id: string) => `fc.wallet.${id}.addr`;
const mnemonicKey = (id: string) => `fc.wallet.${id}.mnemonic`;
const backedUpKey = (id: string) => `fc.wallet.${id}.backedUp`;

const LEGACY_PRIV       = 'fc.wallet.priv';
const LEGACY_ADDR       = 'fc.wallet.addr';
const LEGACY_MNEMONIC   = 'fc.wallet.mnemonic';
const LEGACY_BACKED_UP  = 'fc.wallet.backedUp';

export interface WalletMeta {
  id: string;
  label: string;
  address: string;
  createdAt: number;
  backedUp: boolean;
  /** Wave 7 — 32-byte Ed25519 public key as hex. Required by the
   *  signer-callback path so the SDK can attach the pubkey to a
   *  signed tx without having the priv. See Pay's wallets.ts for
   *  the migration story. */
  publicKeyHex?: string;
}

export interface Wallet {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  address: string;
}

async function readRegistry(): Promise<WalletMeta[]> {
  const raw = await getSecure(IDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((w): w is WalletMeta =>
      typeof w === 'object' && w !== null &&
      typeof (w as WalletMeta).id === 'string' &&
      typeof (w as WalletMeta).address === 'string',
    );
  } catch {
    return [];
  }
}

async function writeRegistry(list: WalletMeta[]): Promise<void> {
  await setSecure(IDS_KEY, JSON.stringify(list));
}

/** Mirror the active wallet's address into MerchantConfig so the QR
 *  builder + onboarding logic see the same value. Best-effort — a
 *  missing config (pre-onboarding) is just a no-op. */
async function syncMerchantAddress(address: string): Promise<void> {
  try {
    const cfg = await loadConfig();
    if (cfg && cfg.safelloReceiveAddress !== address) {
      await saveConfig({ ...cfg, safelloReceiveAddress: address });
    }
  } catch { /* swallow — merchant not yet onboarded */ }
}

export async function migrateLegacyIfNeeded(): Promise<void> {
  const existing = await readRegistry();
  if (existing.length > 0) return;
  const legacyPriv = await getSecure(LEGACY_PRIV);
  if (!legacyPriv) return;
  const legacyAddr = await getSecure(LEGACY_ADDR);
  const legacyMnemonic = await getSecure(LEGACY_MNEMONIC);
  const legacyBackedUp = (await getSecure(LEGACY_BACKED_UP)) === '1';

  const id = newId();
  // ALWAYS derive — see src/pay/services/wallets.ts for the
  // ghost-address rationale.
  const derivedAddress = deriveAddressFromHex(legacyPriv);
  const meta: WalletMeta = {
    id,
    label: 'Main wallet',
    address: derivedAddress,
    createdAt: Date.now(),
    backedUp: legacyBackedUp,
  };
  void legacyAddr;
  await setSecure(privKey(id), legacyPriv);
  await setSecure(addrKey(id), derivedAddress);
  if (legacyMnemonic) await setSecure(mnemonicKey(id), legacyMnemonic);
  if (legacyBackedUp) await setSecure(backedUpKey(id), '1');
  await writeRegistry([meta]);
  await setSecure(ACTIVE_KEY, id);
  await syncMerchantAddress(meta.address);

  await removeSecure(LEGACY_PRIV);
  await removeSecure(LEGACY_ADDR);
  await removeSecure(LEGACY_MNEMONIC);
  await removeSecure(LEGACY_BACKED_UP);
}

async function healAddressesIfNeeded(list: WalletMeta[]): Promise<WalletMeta[]> {
  let dirty = false;
  for (const w of list) {
    const hex = await getSecure(privKey(w.id));
    if (!hex) continue;
    const real = deriveAddressFromHex(hex);
    if (w.address !== real) {
      w.address = real;
      await setSecure(addrKey(w.id), real);
      dirty = true;
    }
  }
  if (dirty) {
    await writeRegistry(list);
    // Business also mirrors the active address into MerchantConfig
    // for QR builders — keep them in sync. Best-effort.
    try {
      const active = await getSecure(ACTIVE_KEY);
      const cur = list.find(w => w.id === active);
      if (cur) await syncMerchantAddress(cur.address);
    } catch { /* swallow */ }
  }
  return list;
}

export async function listWallets(): Promise<WalletMeta[]> {
  await migrateLegacyIfNeeded();
  const list = await readRegistry();
  return healAddressesIfNeeded(list);
}

export async function getActiveWalletId(): Promise<string | null> {
  await migrateLegacyIfNeeded();
  const id = await getSecure(ACTIVE_KEY);
  if (!id) {
    const list = await readRegistry();
    if (list.length === 0) return null;
    await setSecure(ACTIVE_KEY, list[0].id);
    await syncMerchantAddress(list[0].address);
    return list[0].id;
  }
  return id;
}

export async function setActiveWallet(id: string): Promise<void> {
  const list = await listWallets();
  const found = list.find(w => w.id === id);
  if (!found) throw new Error(`Wallet ${id} does not exist`);
  await setSecure(ACTIVE_KEY, id);
  await syncMerchantAddress(found.address);
}

/**
 * Load the full `Wallet` — INCLUDING the private key in the JS heap.
 *
 * This is valid ONLY in the moments before the native-signer
 * migration runs: right after `createWalletInRegistry` /
 * `importWalletFromMnemonic`, while the priv is still in secure-store.
 * Once `getActiveSigner()` has run once (e.g. the first day-close) the
 * priv is wrapped into the native Keystore and removed from
 * secure-store — and this returns `null`.
 *
 * Do NOT use this for signing or for "is a wallet connected" checks.
 * Signing goes through `getActiveSigner()` (priv never enters JS);
 * existence + address come from `getActiveWalletMeta()`.
 */
export async function getActiveWallet(): Promise<Wallet | null> {
  const id = await getActiveWalletId();
  if (!id) return null;
  const hex = await getSecure(privKey(id));
  if (!hex) return null;
  return sdkWallet.walletFromPrivateKey(hexToBytes(hex));
}

export async function getActiveWalletMeta(): Promise<WalletMeta | null> {
  const id = await getActiveWalletId();
  if (!id) return null;
  const list = await listWallets();
  return list.find(w => w.id === id) ?? null;
}

export async function createWallet(
  label = 'Wallet',
): Promise<{ meta: WalletMeta; mnemonic: string }> {
  await migrateLegacyIfNeeded();
  const { wallet, mnemonic } = sdkWallet.createWallet();
  const id = newId();
  const meta: WalletMeta = {
    id,
    label: label.trim() || defaultLabelForIndex((await readRegistry()).length),
    address: wallet.address,
    createdAt: Date.now(),
    backedUp: false,
    publicKeyHex: bytesToHex(wallet.publicKey),
  };
  await setSecure(privKey(id), bytesToHex(wallet.privateKey));
  await setSecure(addrKey(id), wallet.address);
  await setSecure(mnemonicKey(id), mnemonic);
  const list = await readRegistry();
  list.push(meta);
  await writeRegistry(list);
  await setSecure(ACTIVE_KEY, id);
  await syncMerchantAddress(meta.address);
  return { meta, mnemonic };
}

export async function importWalletFromMnemonic(
  mnemonic: string,
  label = 'Imported',
): Promise<WalletMeta> {
  await assertBiometric({ reason: 'Import wallet from recovery phrase' });
  const trimmed = mnemonic.trim().split(/\s+/).join(' ');
  const seed = sdkWallet.seedPhraseFromMnemonic(trimmed);
  const wallet = sdkWallet.walletFromSeedPhrase(seed);
  await migrateLegacyIfNeeded();
  const list = await readRegistry();
  if (list.some(w => w.address === wallet.address)) {
    throw new Error('That wallet is already imported.');
  }
  const id = newId();
  const meta: WalletMeta = {
    id,
    label: label.trim() || 'Imported',
    address: wallet.address,
    createdAt: Date.now(),
    backedUp: true,
    publicKeyHex: bytesToHex(wallet.publicKey),
  };
  await setSecure(privKey(id), bytesToHex(wallet.privateKey));
  await setSecure(addrKey(id), wallet.address);
  await setSecure(mnemonicKey(id), trimmed);
  await setSecure(backedUpKey(id), '1');
  list.push(meta);
  await writeRegistry(list);
  await setSecure(ACTIVE_KEY, id);
  await syncMerchantAddress(meta.address);
  return meta;
}

export async function renameWallet(id: string, label: string): Promise<void> {
  const list = await listWallets();
  const found = list.find(w => w.id === id);
  if (!found) throw new Error(`Wallet ${id} does not exist`);
  found.label = label.trim() || found.label;
  await writeRegistry(list);
}

export async function deleteWallet(id: string): Promise<void> {
  await assertBiometric({ reason: 'Delete wallet' });
  const list = await listWallets();
  if (list.length <= 1) {
    throw new Error('Cannot delete the last wallet. Add another first, or restore from a phrase.');
  }
  if (!list.some(w => w.id === id)) return;
  await removeSecure(privKey(id));
  await removeSecure(addrKey(id));
  await removeSecure(mnemonicKey(id));
  await removeSecure(backedUpKey(id));
  const next = list.filter(w => w.id !== id);
  await writeRegistry(next);
  const active = await getSecure(ACTIVE_KEY);
  if (active === id) {
    await setSecure(ACTIVE_KEY, next[0].id);
    await syncMerchantAddress(next[0].address);
  }
}

export async function getMnemonicFor(id: string): Promise<string | null> {
  return getSecure(mnemonicKey(id));
}

export async function getMnemonicForActive(): Promise<string | null> {
  const id = await getActiveWalletId();
  if (!id) return null;
  return getSecure(mnemonicKey(id));
}

export async function markBackedUp(id: string): Promise<void> {
  await setSecure(backedUpKey(id), '1');
  const list = await listWallets();
  const found = list.find(w => w.id === id);
  if (found) {
    found.backedUp = true;
    await writeRegistry(list);
  }
}

export async function isBackedUp(id: string): Promise<boolean> {
  return (await getSecure(backedUpKey(id))) === '1';
}

export async function wipeAllWallets(): Promise<void> {
  const list = await readRegistry();
  for (const w of list) {
    await removeSecure(privKey(w.id));
    await removeSecure(addrKey(w.id));
    await removeSecure(mnemonicKey(w.id));
    await removeSecure(backedUpKey(w.id));
  }
  await removeSecure(IDS_KEY);
  await removeSecure(ACTIVE_KEY);
  await removeSecure(LEGACY_PRIV);
  await removeSecure(LEGACY_ADDR);
  await removeSecure(LEGACY_MNEMONIC);
  await removeSecure(LEGACY_BACKED_UP);
}

// ── Native-bound signer (Wave 7) — see src/pay/services/wallets.ts
// for the full rationale. Used here by z-reports.ts to sign the
// daily Z-rapport without the priv ever entering JS heap. ─────────

export interface ActiveSigner {
  alias: string;
  publicKey: Uint8Array;
  address: string;
  sign: (digest: Uint8Array) => Promise<Uint8Array>;
}

export async function getActiveSigner(): Promise<ActiveSigner | null> {
  const id = await getActiveWalletId();
  if (!id) return null;
  const list = await listWallets();
  let meta = list.find(w => w.id === id);
  if (!meta) return null;

  if (isSecureSignerAvailable()) {
    const wrapped = await nativeHasAlias(id);
    if (!wrapped) {
      const hex = await getSecure(privKey(id));
      if (!hex) {
        throw new Error(
          `getActiveSigner: priv hex missing for wallet ${id} and no native alias yet`,
        );
      }
      if (!meta.publicKeyHex) {
        const w = sdkWallet.walletFromPrivateKey(hexToBytes(hex));
        meta.publicKeyHex = bytesToHex(w.publicKey);
        const updated = list.map(x => (x.id === id ? meta! : x));
        await writeRegistry(updated);
      }
      await wrapPriv(id, hex);
      // Destroy the JS-readable priv copy once the wrap is CONFIRMED
      // present in the native Keystore. Previously this was gated on
      // `if (mnemonic)` — but the mnemonic is a separate recovery
      // anchor and has nothing to do with whether the cleartext priv
      // should linger in secure-store. A priv-only imported wallet
      // (no mnemonic) was left with the cleartext priv readable from
      // JS *and* a native copy — two copies, one of them exposed.
      // The native Keystore is now the storage; the JS copy goes.
      if (await nativeHasAlias(id)) {
        await removeSecure(privKey(id));
      }
    }
    if (!meta.publicKeyHex) {
      throw new Error(
        `getActiveSigner: wallet ${id} has no publicKeyHex`,
      );
    }
    return {
      alias: id,
      publicKey: hexToBytes(meta.publicKeyHex),
      address: meta.address,
      sign: (digest: Uint8Array) => signWithAlias(id, digest),
    };
  }

  // Dev / web fallback.
  const hex = await getSecure(privKey(id));
  if (!hex) throw new Error('getActiveSigner: no priv hex and no native signer (dev only)');
  const w = sdkWallet.walletFromPrivateKey(hexToBytes(hex));
  return {
    alias: id,
    publicKey: w.publicKey,
    address: w.address,
    sign: async (digest: Uint8Array) => ed25519.sign(digest, w.privateKey),
  };
}

function newId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function defaultLabelForIndex(i: number): string {
  if (i === 0) return 'Main wallet';
  if (i === 1) return 'Tips';
  return `Wallet ${i + 1}`;
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

function deriveAddressFromHex(privHex: string): string {
  const w = sdkWallet.walletFromPrivateKey(hexToBytes(privHex));
  return w.address;
}
