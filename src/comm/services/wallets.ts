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
 * The WalletTx ledger in transactions.ts IS scoped per-wallet (as of 2026-05-31):
 * WalletTx carries an optional `walletAddress` and listTxs/computeBalanceMicroFtc
 * filter by the active wallet (legacy untagged rows stay visible).
 */
import { wallet as sdkWallet } from '@futurechain/sdk';
import { ed25519 } from '@noble/curves/ed25519';
import { assertBiometric } from './biometric';
import { getSecure, removeSecure, setSecure } from './secure-store';
import {
  hasAlias as nativeHasAlias, isSecureSignerAvailable,
  signWithAlias, wrapPriv, unwrapPriv,
} from './secure-signer';
import {
  hasPassphrase as hasWalletPassphrase,
  unlockPriv as unlockPrivWithPassphrase,
  wipePassphraseEnvelope,
  generateFalconKeyPair,
} from './wallet-passphrase';

const IDS_KEY     = 'fc.wallet.ids';
const ACTIVE_KEY  = 'fc.wallet.active';
const privKey       = (id: string) => `fc.wallet.${id}.priv`;
const addrKey       = (id: string) => `fc.wallet.${id}.addr`;
const mnemonicKey   = (id: string) => `fc.wallet.${id}.mnemonic`;
const backedUpKey   = (id: string) => `fc.wallet.${id}.backedUp`;
// Post-quantum FALCON-512 keypair (envelope v3 prep) — Pay parity (#86).
const falconPrivKey = (id: string) => `fc.wallet.${id}.falcon_priv`;
const falconPubKey  = (id: string) => `fc.wallet.${id}.falcon_pub`;

function falconBytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, '0');
  return s;
}

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
  /** Wave 7 — 32-byte Ed25519 public key as hex. See Pay's wallets.ts
   *  for the migration story. Required for the signer-callback path. */
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
  // ghost-address rationale. Pre-Ed25519 installs stored a
  // secp256k1 / Keccak placeholder that we must NOT trust.
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
  if (dirty) await writeRegistry(list);
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
  // FALCON-512 keypair (post-quantum prep, envelope v3) — Pay parity.
  // Keygen is non-deterministic so the priv must be stored, not derived
  // from the BIP-39 mnemonic; a restore-from-seed gets a fresh keypair.
  const falcon = generateFalconKeyPair();
  await setSecure(falconPrivKey(id), falconBytesToHex(falcon.falconPriv));
  await setSecure(falconPubKey(id),  falconBytesToHex(falcon.falconPub));
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
    publicKeyHex: bytesToHex(wallet.publicKey),
  };
  await setSecure(privKey(id), bytesToHex(wallet.privateKey));
  await setSecure(addrKey(id), wallet.address);
  await setSecure(mnemonicKey(id), trimmed);
  await setSecure(backedUpKey(id), '1');
  // FALCON-512 keypair (envelope v3) — non-deterministic, so a wallet
  // restored from the same mnemonic on another device gets a different
  // FALCON keypair (Pay parity).
  const falcon = generateFalconKeyPair();
  await setSecure(falconPrivKey(id), falconBytesToHex(falcon.falconPriv));
  await setSecure(falconPubKey(id),  falconBytesToHex(falcon.falconPub));
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
  await removeSecure(falconPrivKey(id));
  await removeSecure(falconPubKey(id));
  // Wipe the passphrase envelope too (even if none was set) so a deleted
  // wallet leaves no encrypted-priv residue in secure-store — Pay parity.
  await wipePassphraseEnvelope(id);
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

/** Like getMnemonicForActive but the caller supplies the wallet passphrase
 *  (required when the active wallet has one set — the mnemonic then lives only
 *  in the encrypted passphrase envelope, not the plain mnemonicKey row).
 *  Pay parity (#86). Throws from unlockMnemonic on a bad/absent passphrase. */
export async function getMnemonicForActiveWithPassphrase(
  passphrase: string,
): Promise<string | null> {
  const id = await getActiveWalletId();
  if (!id) return null;
  const { unlockMnemonic } = await import('./wallet-passphrase');
  return unlockMnemonic(id, passphrase);
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
    await removeSecure(falconPrivKey(w.id));
    await removeSecure(falconPubKey(w.id));
    await wipePassphraseEnvelope(w.id);
  }
  await removeSecure(IDS_KEY);
  await removeSecure(ACTIVE_KEY);
  await removeSecure(LEGACY_PRIV);
  await removeSecure(LEGACY_ADDR);
  await removeSecure(LEGACY_MNEMONIC);
  await removeSecure(LEGACY_BACKED_UP);
}

// ── Native-bound signer (Wave 7) — see src/pay/services/wallets.ts
// for the full design rationale. Identical implementation. ────────

export interface ActiveSigner {
  alias: string;
  publicKey: Uint8Array;
  address: string;
  sign: (digest: Uint8Array) => Promise<Uint8Array>;
}

/** Thrown by getActiveSigner when the active wallet has a passphrase set but no
 *  passphrase was provided. Callers catch this, prompt the user, and retry with
 *  the passphrase argument. */
export class PassphraseRequiredError extends Error {
  constructor(public readonly walletId: string) {
    super(`wallet ${walletId} has a passphrase — re-call getActiveSigner(passphrase)`);
    this.name = 'PassphraseRequiredError';
  }
}

export async function getActiveSigner(passphrase?: string): Promise<ActiveSigner | null> {
  const id = await getActiveWalletId();
  if (!id) return null;
  const list = await listWallets();
  let meta = list.find(w => w.id === id);
  if (!meta) return null;

  // Passphrase-protected wallets ALWAYS go through the in-JS path — the priv
  // lives in the wallet-passphrase envelope (not privKey(id), not the native
  // signer). Signing reconstructs the priv into JS for one op, then drops it.
  if (await hasWalletPassphrase(id)) {
    if (!passphrase) throw new PassphraseRequiredError(id);
    const hex = await unlockPrivWithPassphrase(id, passphrase);
    const w = sdkWallet.walletFromPrivateKey(hexToBytes(hex));
    return {
      alias: id,
      publicKey: w.publicKey,
      address: w.address,
      sign: async (digest: Uint8Array) => ed25519.sign(digest, w.privateKey),
    };
  }

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
      const mnemonic = await getSecure(mnemonicKey(id));
      if (mnemonic) await removeSecure(privKey(id));
    }
    if (!meta.publicKeyHex) {
      throw new Error(
        `getActiveSigner: wallet ${id} has no publicKeyHex; mnemonic-based recovery needed`,
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

/** True if the active wallet has a passphrase. Cheap to call from UI. */
export async function activeWalletHasPassphrase(): Promise<boolean> {
  const id = await getActiveWalletId();
  if (!id) return false;
  return hasWalletPassphrase(id);
}

/** Enable a passphrase on the active wallet (demigrating the priv out of the
 *  native signer first so the envelope can read the plaintext priv). */
export async function enablePassphraseForActiveWallet(passphrase: string): Promise<void> {
  const id = await getActiveWalletId();
  if (!id) throw new Error('no active wallet');
  await demigrateActiveToSecureStore(id);
  const { enableWalletPassphrase } = await import('./wallet-passphrase');
  await enableWalletPassphrase(id, passphrase);
}

/** Change the active wallet's passphrase. */
export async function changePassphraseForActiveWallet(oldP: string, newP: string): Promise<void> {
  const id = await getActiveWalletId();
  if (!id) throw new Error('no active wallet');
  const { changeWalletPassphrase } = await import('./wallet-passphrase');
  await changeWalletPassphrase(id, oldP, newP);
}

/** Remove the active wallet's passphrase (priv returns to the plain rows; the
 *  native signer re-wraps it on the next getActiveSigner if available). */
export async function removePassphraseFromActiveWallet(currentP: string): Promise<void> {
  const id = await getActiveWalletId();
  if (!id) throw new Error('no active wallet');
  const { removeWalletPassphrase } = await import('./wallet-passphrase');
  await removeWalletPassphrase(id, currentP);
}

/** Pull a wallet's priv hex out of the native signer back into the plaintext
 *  secure-store row, so enableWalletPassphrase can read + encrypt it. No-op when
 *  the priv is already in secure-store (dev/web path). */
async function demigrateActiveToSecureStore(id: string): Promise<void> {
  if (!isSecureSignerAvailable()) return;          // dev/web: priv already in store
  if (await getSecure(privKey(id))) return;        // already present
  if (!(await nativeHasAlias(id))) return;         // nothing wrapped yet
  const hex = await unwrapPriv(id);
  if (hex) await setSecure(privKey(id), hex);
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
