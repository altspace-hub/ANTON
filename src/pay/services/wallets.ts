/**
 * wallets.ts — multi-wallet registry on top of secure-store.
 *
 * Design: every wallet is one entry in a registry list, keyed by a
 * short opaque id. The active wallet is named by a single pointer.
 * All sensitive material (priv key, mnemonic) stays per-wallet under
 * id-prefixed secure-store keys, so a `getSecure` of any one key
 * surfaces only that wallet's material.
 *
 * Secure-store layout (v2):
 *   fc.wallet.ids                 JSON [{ id, label, address, createdAt, backedUp }]
 *   fc.wallet.active              <id>
 *   fc.wallet.<id>.priv           hex(32-byte Ed25519 privkey)
 *   fc.wallet.<id>.addr           fc_… address
 *   fc.wallet.<id>.mnemonic       BIP-39 24-word phrase
 *   fc.wallet.<id>.backedUp       '1' once user confirmed backup
 *
 * Legacy v1 layout (pre-multi-wallet) used unprefixed keys
 * `fc.wallet.priv` / `fc.wallet.addr` / `fc.wallet.mnemonic` /
 * `fc.wallet.backedUp`. {@link migrateLegacyIfNeeded} runs on every
 * read and lifts that singleton into v2 transparently.
 *
 * Public API surface kept narrow:
 *   - listWallets / getActiveWalletId / setActiveWallet
 *   - createWallet(label?)        → creates new + activates + returns mnemonic
 *   - importWalletFromMnemonic    → adds a wallet from a 24-word phrase
 *   - renameWallet / deleteWallet (refuses to delete the last)
 *
 * The legacy facade (loadWallet / hasWallet / wipeWallet / mnemonic
 * accessors) stays in wallet.ts and now reads through this module.
 */
import { wallet as sdkWallet } from '@futurechain/sdk';
import { assertBiometric } from './biometric';
import { getSecure, removeSecure, setSecure } from './secure-store';

// ── Secure-store key layout ─────────────────────────────────────────
const IDS_KEY     = 'fc.wallet.ids';
const ACTIVE_KEY  = 'fc.wallet.active';
const privKey     = (id: string) => `fc.wallet.${id}.priv`;
const addrKey     = (id: string) => `fc.wallet.${id}.addr`;
const mnemonicKey = (id: string) => `fc.wallet.${id}.mnemonic`;
const backedUpKey = (id: string) => `fc.wallet.${id}.backedUp`;

// ── Legacy (v1) keys, kept for one-way migration ────────────────────
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

// ── Registry I/O ────────────────────────────────────────────────────

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

// ── Migration v1 → v2 ───────────────────────────────────────────────

/** Lift a pre-multi-wallet singleton (if any) into the registry.
 *  Idempotent — only runs once. Cleans the legacy keys after a
 *  successful copy so future reads use only the v2 layout. */
export async function migrateLegacyIfNeeded(): Promise<void> {
  const existing = await readRegistry();
  if (existing.length > 0) return; // already migrated or fresh v2 install
  const legacyPriv = await getSecure(LEGACY_PRIV);
  if (!legacyPriv) return; // no legacy wallet to migrate
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

  // Clean legacy keys so nothing else ever reads them.
  await removeSecure(LEGACY_PRIV);
  await removeSecure(LEGACY_ADDR);
  await removeSecure(LEGACY_MNEMONIC);
  await removeSecure(LEGACY_BACKED_UP);
}

// ── Listing / active selection ──────────────────────────────────────

export async function listWallets(): Promise<WalletMeta[]> {
  await migrateLegacyIfNeeded();
  return readRegistry();
}

export async function getActiveWalletId(): Promise<string | null> {
  await migrateLegacyIfNeeded();
  const id = await getSecure(ACTIVE_KEY);
  if (!id) {
    // Auto-pick the first wallet if pointer is missing but a wallet
    // exists (could happen if the pointer was wiped manually).
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
  return loadWalletById(id);
}

export async function getActiveWalletMeta(): Promise<WalletMeta | null> {
  const id = await getActiveWalletId();
  if (!id) return null;
  const list = await readRegistry();
  return list.find(w => w.id === id) ?? null;
}

async function loadWalletById(id: string): Promise<Wallet | null> {
  const hex = await getSecure(privKey(id));
  if (!hex) return null;
  return sdkWallet.walletFromPrivateKey(hexToBytes(hex));
}

// ── Create / import / rename / delete ───────────────────────────────

/** Create a fresh Ed25519 wallet, persist it, register it, activate
 *  it. Returns the mnemonic for the caller's backup flow — the
 *  mnemonic is also stored on-device so the Settings re-display works. */
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

/** Add a wallet from a user-supplied 24-word BIP-39 mnemonic.
 *  Activates the imported wallet. Treats it as already backed up. */
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

/** Delete a wallet permanently. Refuses to delete the last wallet
 *  (the app expects at least one to exist). If the deleted wallet was
 *  active, the next one in the list becomes active. Biometric-gated
 *  to prevent silent removal by a stolen-but-unlocked device. */
export async function deleteWallet(id: string): Promise<void> {
  await assertBiometric({ reason: 'Delete wallet' });
  const list = await listWallets();
  if (list.length <= 1) {
    throw new Error('Cannot delete the last wallet. Add another first, or use Restore to start over.');
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

// ── Per-wallet mnemonic helpers (used by Backup / Settings flows) ───

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

// ── Wipe-everything (used by the Restore flow) ──────────────────────

/** Remove every wallet on the device. Used by the "I lost my phone,
 *  here's my recovery phrase" Restore flow before re-creating a single
 *  wallet from the phrase. */
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
  // Also stamp out legacy keys in case migration never ran.
  await removeSecure(LEGACY_PRIV);
  await removeSecure(LEGACY_ADDR);
  await removeSecure(LEGACY_MNEMONIC);
  await removeSecure(LEGACY_BACKED_UP);
}

// ── Helpers ─────────────────────────────────────────────────────────

function newId(): string {
  // 8 hex chars from crypto.getRandomValues — short, unique enough at
  // wallet-count scale (the user is creating <10).
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

/** Best-effort fallback for legacy rows that lack a stored address. */
function deriveAddressFromHex(privHex: string): string {
  const w = sdkWallet.walletFromPrivateKey(hexToBytes(privHex));
  return w.address;
}
