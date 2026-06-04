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
import { ed25519 } from '@noble/curves/ed25519';
import { assertBiometric } from './biometric';
import { getSecure, removeSecure, setSecure } from './secure-store';
import {
  clearAlias, hasAlias as nativeHasAlias, isSecureSignerAvailable,
  signWithAlias, unwrapPriv, wrapPriv,
} from './secure-signer';
import { getEndpoint } from './fc-rpc';
import {
  getOrCreateInstallId, registerAddress, type RegisterAddressPayload,
} from './enrollment';
import {
  hasPassphrase as hasWalletPassphrase,
  unlockPriv as unlockPrivWithPassphrase,
  wipePassphraseEnvelope,
  enableWalletPassphrase,
  changeWalletPassphrase as changeWalletPassphraseRaw,
  removeWalletPassphrase as removeWalletPassphraseRaw,
  generateFalconKeyPair,
} from './wallet-passphrase';

// ── Secure-store key layout ─────────────────────────────────────────
const IDS_KEY     = 'fc.wallet.ids';
const ACTIVE_KEY  = 'fc.wallet.active';
const privKey       = (id: string) => `fc.wallet.${id}.priv`;
const addrKey       = (id: string) => `fc.wallet.${id}.addr`;
const mnemonicKey   = (id: string) => `fc.wallet.${id}.mnemonic`;
const backedUpKey   = (id: string) => `fc.wallet.${id}.backedUp`;
const falconPrivKey = (id: string) => `fc.wallet.${id}.falcon_priv`;
const falconPubKey  = (id: string) => `fc.wallet.${id}.falcon_pub`;

function falconBytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, '0');
  return s;
}

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
  /** 32-byte Ed25519 public key as hex. Lazy-added in Wave 7: pre-
   *  Wave-7 wallets derive the pubkey from the priv hex still in
   *  secure-store; on first sign attempt the migration writes this
   *  field and wraps the priv into the native signer. Required for
   *  the signer-callback path because the SDK needs the pubkey to
   *  attach to the signed tx, and the priv may no longer be
   *  reachable from JS. */
  publicKeyHex?: string;
  /** Epoch ms when this wallet's fc_ address was registered with the
   *  Bahnhof node — the install ↔ address mapping in the sidecar.
   *  Undefined = not yet registered (the next syncRegisteredAddresses
   *  call retries it). The private key is never sent; only the
   *  public address. */
  registeredAt?: number;
  /** #88 — wallet kind. Undefined / 'own' = a normal personal wallet. 'agent'
   *  = an ANTON agent wallet: it has its own keypair (so the agent can send
   *  autonomously) but transacts under the pseudonymous "ANTON <addr6>"
   *  identity, with the human owner disclosed as the Ultimate Debtor (UBO).
   *  'watch' = a watch-only wallet added by address with NO keys on this device:
   *  it shows the address's live balance + incoming activity but cannot send.
   *  Used to keep tabs on another wallet (e.g. an agent's). */
  kind?: 'own' | 'agent' | 'watch';
}

/** #88 — the pseudonymous debtor name an agent wallet presents on the wire:
 *  "ANTON " + the first 6 Base58 chars after the `fc_` prefix. The real owner
 *  is disclosed separately as the Ultimate Debtor (UBO). */
export function agentDebtorName(address: string): string {
  const body = address.startsWith('fc_') ? address.slice(3) : address;
  return `ANTON ${body.slice(0, 6)}`;
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
  // ALWAYS derive the address from the priv hex, NEVER trust
  // `legacyAddr`. Pre-2026-05-20 installs stored a secp256k1 / Keccak
  // placeholder (Ethereum-style 40-hex `fc_…` "ghost address") that
  // does not match the Ed25519 SDK's `addressFromPublicKey` output.
  // Funds sent to a ghost are unspendable; we must surface the real
  // Ed25519-derived address everywhere or the Receive QR will route
  // money to the void.
  const derivedAddress = deriveAddressFromHex(legacyPriv);
  const meta: WalletMeta = {
    id,
    label: 'Main wallet',
    address: derivedAddress,
    createdAt: Date.now(),
    backedUp: legacyBackedUp,
  };
  // Suppress the unused-var lint — we deliberately ignore legacyAddr.
  void legacyAddr;
  await setSecure(privKey(id), legacyPriv);
  await setSecure(addrKey(id), derivedAddress);
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

/**
 * Self-heal pass for the "ghost address" bug (2026-05-21):
 * historical installs that ran the first registry migration before
 * the `derivedAddress` fix above had `meta.address` set to a
 * secp256k1 / Keccak placeholder rather than the real Ed25519
 * `addressFromPublicKey`. If we detect a mismatch between the
 * registry's stored address and the priv-derived one we update the
 * row in-place. Runs on every list/read — cheap, idempotent.
 */
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
  // Go through listWallets so the self-heal pass runs — guarantees
  // the returned meta carries the priv-derived address rather than a
  // stale legacy value.
  const list = await listWallets();
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
  kind: 'own' | 'agent' = 'own',
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
    // Only stamp non-default kinds so 'own' wallets stay registry-identical.
    ...(kind === 'agent' ? { kind } : {}),
  };
  await setSecure(privKey(id), bytesToHex(wallet.privateKey));
  await setSecure(addrKey(id), wallet.address);
  await setSecure(mnemonicKey(id), mnemonic);
  // FALCON-512 keypair (envelope v3, post-quantum prep). Generated
  // here so the future user-side PQ hard fork is a no-UX-change event.
  // FALCON keygen is non-deterministic — the priv must be stored, not
  // derived from the BIP-39 mnemonic; see docs/PAY_WALLET_PASSPHRASE_SPEC.md
  // §3.2.1 for the envelope v3 schema and task #289 for the
  // post-hard-fork rotation UX that handles restore-from-seed.
  const falcon = generateFalconKeyPair();
  await setSecure(falconPrivKey(id), falconBytesToHex(falcon.falconPriv));
  await setSecure(falconPubKey(id),  falconBytesToHex(falcon.falconPub));
  const list = await readRegistry();
  list.push(meta);
  await writeRegistry(list);
  await setSecure(ACTIVE_KEY, id);
  // Best-effort: tell the Bahnhof node about the new wallet
  // (install ↔ address mapping; the private key never leaves the
  // device). A network failure here does NOT block wallet creation —
  // the address stays unregistered and is retried on the next
  // syncRegisteredAddresses call (any subsequent create / import).
  await syncRegisteredAddresses();
  return { meta, mnemonic };
}

/** #88 — add a WATCH-ONLY wallet by address. No keys are stored on this device,
 *  so it can show the address's live balance + incoming activity but can never
 *  sign / send. Activates it so the user can monitor it immediately; switch back
 *  to an own/agent wallet to pay. */
export async function addWatchWallet(label: string, address: string): Promise<WalletMeta> {
  await migrateLegacyIfNeeded();
  const addr = address.trim();
  if (!/^fc_[1-9A-HJ-NP-Za-km-z]{20,64}$/.test(addr)) {
    throw new Error('Enter a valid fc_ address to watch.');
  }
  const list = await readRegistry();
  if (list.some((w) => w.address === addr)) {
    throw new Error('That address is already one of your wallets.');
  }
  const id = newId();
  const meta: WalletMeta = {
    id,
    label: label.trim() || 'Watch wallet',
    address: addr,
    createdAt: Date.now(),
    backedUp: true,    // nothing to back up — no keys held
    kind: 'watch',
  };
  // Only the address is persisted (addrKey). No priv / mnemonic / falcon /
  // publicKeyHex — healAddressesIfNeeded skips it (no priv to re-derive from),
  // and syncRegisteredAddresses skips it (no priv to sign the registration).
  await setSecure(addrKey(id), addr);
  list.push(meta);
  await writeRegistry(list);
  await setSecure(ACTIVE_KEY, id);
  return meta;
}

/** True when the active wallet is watch-only (no signing key) — the UI uses this
 *  to hide the pay/scan affordances. */
export async function activeWalletIsWatchOnly(): Promise<boolean> {
  const meta = await getActiveWalletMeta();
  return meta?.kind === 'watch';
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
    publicKeyHex: bytesToHex(wallet.publicKey),
  };
  await setSecure(privKey(id), bytesToHex(wallet.privateKey));
  await setSecure(addrKey(id), wallet.address);
  await setSecure(mnemonicKey(id), trimmed);
  await setSecure(backedUpKey(id), '1');
  // FALCON-512 keypair (envelope v3). FALCON keygen is non-deterministic
  // so a wallet restored from the same mnemonic on a different device
  // gets a DIFFERENT FALCON keypair — task #289 covers the
  // post-hard-fork rotation UX that handles this.
  const falcon = generateFalconKeyPair();
  await setSecure(falconPrivKey(id), falconBytesToHex(falcon.falconPriv));
  await setSecure(falconPubKey(id),  falconBytesToHex(falcon.falconPub));
  list.push(meta);
  await writeRegistry(list);
  await setSecure(ACTIVE_KEY, id);
  // Best-effort registration of the restored wallet with Bahnhof —
  // see createWallet for the rationale + retry mechanism.
  await syncRegisteredAddresses();
  return meta;
}

/** Register every locally-known wallet address with the Bahnhof
 *  node — the install ↔ fc_ address mapping in the sidecar. The
 *  private key is never sent. For each still-unregistered wallet:
 *    1. Load the private key from secure-store.
 *    2. Sign `"register-address|<install_id>|<fc_address>|<ts>"`
 *       with the wallet's Ed25519 key on-device (proves we hold the
 *       key — only the SIGNATURE crosses the wire, not the key).
 *    3. POST the address + public key + signature + timestamp.
 *  Idempotent on the server (install_id × fc_address); locally each
 *  wallet records `registeredAt` once it succeeds so subsequent
 *  calls only retry the ones still un-registered. Best-effort — a
 *  transport / verification failure is logged but never thrown, so
 *  wallet creation never fails because the node is briefly
 *  unreachable. Exported so App.tsx can retry on launch. */
export async function syncRegisteredAddresses(): Promise<void> {
  let endpoint: string;
  try {
    endpoint = await getEndpoint();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`syncRegisteredAddresses: no RPC endpoint (${String(err)})`);
    return;
  }
  const installId = await getOrCreateInstallId();
  const list = await readRegistry();
  let dirty = false;
  for (const meta of list) {
    if (meta.registeredAt) continue;
    try {
      const privHex = await getSecure(privKey(meta.id));
      if (!privHex) {
        // The priv has been migrated into the native signer and erased
        // from secure-store. Today we can't produce the registration
        // signature from JS for that wallet; note + skip. (Wallets
        // created post-this-change register at create-time, before
        // any sign + migrate, so the common path is unaffected.)
        // eslint-disable-next-line no-console
        console.warn(
          `syncRegisteredAddresses: ${meta.address} priv unreachable ` +
          `from JS (native signer); registration deferred.`,
        );
        continue;
      }
      const priv = hexToBytes(privHex);
      const pub = ed25519.getPublicKey(priv);
      const timestamp = Math.floor(Date.now() / 1000);
      const message = new TextEncoder().encode(
        `register-address|${installId}|${meta.address}|${timestamp}`,
      );
      const signature = ed25519.sign(message, priv);
      const payload: RegisterAddressPayload = {
        fc_address: meta.address,
        public_key: bytesToHex(pub),
        signature: bytesToHex(signature),
        timestamp,
        label: meta.label ? meta.label.slice(0, 64) : undefined,
      };
      await registerAddress(endpoint, payload);
      meta.registeredAt = Date.now();
      dirty = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `syncRegisteredAddresses: failed for ${meta.address} ` +
        `(${String(err)}); will retry on next launch / create.`,
      );
    }
  }
  if (dirty) await writeRegistry(list);
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
  await removeSecure(falconPrivKey(id));
  await removeSecure(falconPubKey(id));
  await wipePassphraseEnvelope(id);
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

/** Like getMnemonicForActive but the caller supplies the wallet
 *  passphrase (required when the active wallet has one set).
 *  Throws BadPassphraseError / NoPassphraseError as appropriate. */
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
    await removeSecure(falconPrivKey(w.id));
    await removeSecure(falconPubKey(w.id));
    await wipePassphraseEnvelope(w.id);
  }
  await removeSecure(IDS_KEY);
  await removeSecure(ACTIVE_KEY);
  // Also stamp out legacy keys in case migration never ran.
  await removeSecure(LEGACY_PRIV);
  await removeSecure(LEGACY_ADDR);
  await removeSecure(LEGACY_MNEMONIC);
  await removeSecure(LEGACY_BACKED_UP);
}

// ── Native-bound signer (Wave 7) ────────────────────────────────────

export interface ActiveSigner {
  /** Wallet id — used as the native plugin's alias. */
  alias: string;
  /** 32-byte Ed25519 public key. Safe to expose. */
  publicKey: Uint8Array;
  /** fc_… Base58 address derived from the public key. */
  address: string;
  /** Async sign — delegates to the native plugin on a real device,
   *  falls back to in-JS @noble/ed25519 in dev / browser preview.
   *  The priv key never leaves native on the native path. */
  sign: (digest: Uint8Array) => Promise<Uint8Array>;
}

/**
 * Get a signer for the active wallet. Wave 7 of the security plan:
 *
 *   • On native (Capacitor Android): the priv is held under an
 *     Android-Keystore-bound AES-GCM key in the FcSecureSigner
 *     plugin. Signing happens in JVM via i2p eddsa. The priv NEVER
 *     enters JS heap.
 *
 *   • First call for a pre-Wave-7 wallet TRANSPARENTLY migrates:
 *       1. Read priv hex from secure-store.
 *       2. Wrap it into the native plugin under the wallet's alias.
 *       3. Stamp the wallet meta's `publicKeyHex` for future signs.
 *       4. If the mnemonic is also stored (it is for every wallet
 *          created in-app), DELETE the priv hex from secure-store —
 *          the mnemonic is the recoverable source of truth.
 *
 *   • Dev / web preview falls back to in-JS @noble/ed25519. The
 *     priv comes from secure-store, fills a Uint8Array for a few
 *     ms, signs, and is dropped. This is the legacy path; it
 *     stays so the existing unit tests + dev preview keep working.
 *
 * Returns null when no wallet is active.
 */
/** Thrown by getActiveSigner when the active wallet has a passphrase
 *  set but no passphrase was provided. Callers must catch this, prompt
 *  the user, and retry with the passphrase argument. */
export class PassphraseRequiredError extends Error {
  constructor(public readonly walletId: string) {
    super(`wallet ${walletId} has a passphrase — re-call getActiveSigner(passphrase)`);
    this.name = 'PassphraseRequiredError';
  }
}

export async function getActiveSigner(passphrase?: string): Promise<ActiveSigner | null> {
  const id = await getActiveWalletId();
  if (!id) return null;
  // listWallets runs migrateLegacy + heal — guarantees meta is fresh.
  const list = await listWallets();
  let meta = list.find(w => w.id === id);
  if (!meta) return null;

  // Passphrase-protected wallets ALWAYS go through the in-JS path —
  // the priv lives in the wallet-passphrase envelope (not in
  // `privKey(id)`, not in the native signer). When a passphrase is on
  // we trade the "priv never enters JS heap" property for a true
  // second factor; this is the explicit deal in the spec.
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
    // Native path. Migrate if the plugin doesn't yet hold this wallet.
    const wrapped = await nativeHasAlias(id);
    if (!wrapped) {
      const hex = await getSecure(privKey(id));
      if (!hex) {
        throw new Error(
          `getActiveSigner: priv hex missing for wallet ${id} and no native alias yet; cannot sign`,
        );
      }
      // Stamp the publicKeyHex on the meta if it isn't already there.
      if (!meta.publicKeyHex) {
        const w = sdkWallet.walletFromPrivateKey(hexToBytes(hex));
        meta.publicKeyHex = bytesToHex(w.publicKey);
        const updated = list.map(x => (x.id === id ? meta! : x));
        await writeRegistry(updated);
      }
      await wrapPriv(id, hex);
      // Only delete the priv hex if the mnemonic is around to
      // restore from. If the mnemonic is missing (shouldn't happen
      // for in-app-created wallets, but defensive) keep the priv as
      // backup — losing the wallet is worse than the residual.
      const mnemonic = await getSecure(mnemonicKey(id));
      if (mnemonic) await removeSecure(privKey(id));
    }
    if (!meta.publicKeyHex) {
      // Defensive: at this point the priv is in the plugin only and
      // we have no pubkey on the meta. We need the priv to derive
      // pubkey — unwrap, derive, drop. This is the migration-edge
      // case; should not happen on a fresh install.
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

  // Dev / web fallback — in-JS signing via @noble. Priv lives in
  // secure-store and transits the JS heap. Acceptable in dev.
  const hex = await getSecure(privKey(id));
  if (!hex) {
    throw new Error('getActiveSigner: no priv hex and no native signer (dev only)');
  }
  const w = sdkWallet.walletFromPrivateKey(hexToBytes(hex));
  return {
    alias: id,
    publicKey: w.publicKey,
    address: w.address,
    sign: async (digest: Uint8Array) => ed25519.sign(digest, w.privateKey),
  };
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

// ── Wallet-passphrase orchestration (Settings → Security flows) ─────

/** True if the active wallet has a passphrase. Cheap to call from UI. */
export async function activeWalletHasPassphrase(): Promise<boolean> {
  const id = await getActiveWalletId();
  if (!id) return false;
  return hasWalletPassphrase(id);
}

/** Demigrate the priv out of the native signer back into secure-store
 *  so the passphrase envelope can wrap it. No-op when the priv is
 *  already in secure-store (pre-migration wallet or dev/web). */
async function ensurePrivInSecureStore(id: string): Promise<void> {
  if (await getSecure(privKey(id))) return; // already there
  if (!isSecureSignerAvailable()) {
    throw new Error(
      'ensurePrivInSecureStore: priv missing on a non-native platform — wallet is corrupt',
    );
  }
  if (!(await nativeHasAlias(id))) {
    throw new Error(
      `ensurePrivInSecureStore: wallet ${id} has neither secure-store priv nor a native alias`,
    );
  }
  const hex = await unwrapPriv(id);
  await setSecure(privKey(id), hex);
  await clearAlias(id);
}

/** Enable a passphrase on the active wallet. Caller must have already
 *  gated on biometric. Handles native-signer demigration transparently. */
export async function enablePassphraseForActiveWallet(passphrase: string): Promise<void> {
  const id = await getActiveWalletId();
  if (!id) throw new Error('enablePassphraseForActiveWallet: no active wallet');
  await ensurePrivInSecureStore(id);
  await enableWalletPassphrase(id, passphrase);
}

/** Rotate the passphrase on the active wallet. Caller must have
 *  already gated on biometric. */
export async function changePassphraseForActiveWallet(
  oldPassphrase: string, newPassphrase: string,
): Promise<void> {
  const id = await getActiveWalletId();
  if (!id) throw new Error('changePassphraseForActiveWallet: no active wallet');
  await changeWalletPassphraseRaw(id, oldPassphrase, newPassphrase);
}

/** Remove the passphrase from the active wallet. Caller must have
 *  already gated on biometric. Priv lands back in secure-store
 *  (Keystore-wrapped) and signing reverts to the standard flow,
 *  which will re-migrate the priv into the native signer on the
 *  next sign. */
export async function removePassphraseFromActiveWallet(
  currentPassphrase: string,
): Promise<void> {
  const id = await getActiveWalletId();
  if (!id) throw new Error('removePassphraseFromActiveWallet: no active wallet');
  await removeWalletPassphraseRaw(id, currentPassphrase);
}

/** Hook for wipe / restore flows so the passphrase envelope is
 *  cleaned alongside the rest of the wallet's secure-store keys. */
export async function wipePassphraseFor(walletId: string): Promise<void> {
  await wipePassphraseEnvelope(walletId);
}
