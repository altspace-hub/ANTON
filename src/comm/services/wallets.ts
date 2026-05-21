/**
 * wallets.ts — Comm App multi-wallet registry.
 *
 * Lifted from src/pay/services/wallets.ts; same secure-store layout
 * and same migration story, just scoped to the Comm App's keystore
 * namespace.
 *
 * Secure-store layout (v2):
 *   fc.wallet.ids              JSON [{ id, label, address, createdAt, backedUp }]
 *   fc.wallet.active           <id of currently-active wallet>
 *   fc.wallet.<id>.priv        per-wallet privkey hex
 *   fc.wallet.<id>.addr        per-wallet address
 *   fc.wallet.<id>.mnemonic    per-wallet 24-word BIP-39 phrase
 *   fc.wallet.<id>.backedUp    '1' once verified
 *
 * Legacy v1 layout (pre-2026-05-21) used unprefixed keys; migrateLegacyIfNeeded
 * runs on every read and lifts that singleton into the registry. Idempotent.
 *
 * Known limitation: the WalletTx ledger in transactions.ts is NOT yet
 * scoped per-wallet — switching active wallet currently shows every
 * tx the device has ever recorded. The fix is a `walletAddress`
 * column on WalletTx + a filter in listTxs; deferred to a follow-up
 * so this milestone can ship.
 */
import { wallet as sdkWallet } from '@futurechain/sdk';
import { assertBiometric } from './biometric';
import { getSecure, removeSecure, setSecure } from './secure-store';

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

export async function migrateLegacyIfNeeded(): Promise<void> {
  const existing = await readRegistry();
  if (existing.length > 0) return;
  const legacyPriv = await getSecure(LEGACY_PRIV);
  if (!legacyPriv) return;
  const legacyAddr = await getSecure(LEGACY_ADDR);
  const legacyMnemonic = await getSecure(LEGACY_MNEMONIC);
  const legacyBackedUp = (await getSecure(LEGACY_BACKED_UP)) === '1';

  const id = newId();
  const meta: WalletMeta = {
    id,
    label: 'Main wallet',
    address: legacyAddr ?? deriveAddressFromHex(legacyPriv),
    createdAt: Date.now(),
    backedUp: legacyBackedUp,
  };
  await setSecure(privKey(id), legacyPriv);
  await setSecure(addrKey(id), meta.address);
  if (legacyMnemonic) await setSecure(mnemonicKey(id), legacyMnemonic);
  if (legacyBackedUp) await setSecure(backedUpKey(id), '1');
  await writeRegistry([meta]);
  await setSecure(ACTIVE_KEY, id);

  await removeSecure(LEGACY_PRIV);
  await removeSecure(LEGACY_ADDR);
  await removeSecure(LEGACY_MNEMONIC);
  await removeSecure(LEGACY_BACKED_UP);
}

export async function listWallets(): Promise<WalletMeta[]> {
  await migrateLegacyIfNeeded();
  return readRegistry();
}

export async function getActiveWalletId(): Promise<string | null> {
  await migrateLegacyIfNeeded();
  const id = await getSecure(ACTIVE_KEY);
  if (!id) {
    const list = await readRegistry();
    if (list.length === 0) return null;
    await setSecure(ACTIVE_KEY, list[0].id);
    return list[0].id;
  }
  return id;
}

export async function setActiveWallet(id: string): Promise<void> {
  const list = await listWallets();
  if (!list.some(w => w.id === id)) {
    throw new Error(`Wallet ${id} does not exist`);
  }
  await setSecure(ACTIVE_KEY, id);
}

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
  const list = await readRegistry();
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
  };
  await setSecure(privKey(id), bytesToHex(wallet.privateKey));
  await setSecure(addrKey(id), wallet.address);
  await setSecure(mnemonicKey(id), mnemonic);
  const list = await readRegistry();
  list.push(meta);
  await writeRegistry(list);
  await setSecure(ACTIVE_KEY, id);
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
  };
  await setSecure(privKey(id), bytesToHex(wallet.privateKey));
  await setSecure(addrKey(id), wallet.address);
  await setSecure(mnemonicKey(id), trimmed);
  await setSecure(backedUpKey(id), '1');
  list.push(meta);
  await writeRegistry(list);
  await setSecure(ACTIVE_KEY, id);
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

function newId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function defaultLabelForIndex(i: number): string {
  if (i === 0) return 'Main wallet';
  if (i === 1) return 'Wallet 2';
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
