/**
 * wallet.ts — top-level wallet API for Anton Agent Pay.
 *
 * Spec: docs/ANTON_AGENT_PAY_SPEC.md §5
 *
 * MVP: one wallet per install (the spec's explicit choice). The wallet
 * lives in a StorageBackend (injected — file in production, in-memory
 * for tests) under the namespace prefix `wallet.`.
 *
 * Storage layout (one wallet, MVP — multi-wallet is a Phase 2c extension
 * where these keys get an `<id>.` infix):
 *
 *   No passphrase:
 *     wallet.address         fc_… address (always present once created)
 *     wallet.pub             Ed25519 pub hex (always present, derives the address)
 *     wallet.priv            Ed25519 priv hex (plaintext)
 *     wallet.mnemonic        BIP-39 24-word phrase (plaintext)
 *     wallet.falcon_priv     FALCON-512 priv hex (plaintext)
 *     wallet.falcon_pub      FALCON-512 pub hex (plaintext)
 *
 *   With passphrase:
 *     wallet.address         (unchanged — public)
 *     wallet.pub             (unchanged — public)
 *     wallet.envelope        JSON-encoded PassphraseEnvelopeV3 holding
 *                            priv + mnemonic + falcon_priv (encrypted) +
 *                            falcon_pub (plaintext, public)
 *
 *  i.e. address + Ed25519 pub + FALCON pub stay plaintext-accessible
 *  even with a passphrase set (these are public values the server uses
 *  for getStatus / getBalance / counterparty rendering without needing
 *  to prompt the user).
 *
 * FALCON-aware: every wallet has a FALCON-512 keypair pre-stashed at
 * create+import time, matching ANTON Pay envelope v3 — when the
 * user-side PQ hard fork lands (see [[PAY_FALCON_ROTATION_SPEC]]),
 * the rotation flow drops in without UX disruption.
 */
import { falcon512 } from '@noble/post-quantum/falcon.js';
import { wallet as sdkWallet } from '@futurechain/sdk';
import {
  buildEnvelope, openEnvelope,
  parseEnvelopeJSON, rotateEnvelope,
  bytesToHex, hexToBytes, type PassphraseEnvelopeV3,
} from './envelope.js';
import type { StorageBackend } from './storage.js';

const KEY_ADDRESS  = 'wallet.address';
const KEY_PUB      = 'wallet.pub';
const KEY_PRIV     = 'wallet.priv';
const KEY_MNEMONIC = 'wallet.mnemonic';
const KEY_FALCON_PRIV = 'wallet.falcon_priv';
const KEY_FALCON_PUB  = 'wallet.falcon_pub';
const KEY_ENVELOPE = 'wallet.envelope';

export class NoWalletError extends Error {
  constructor() { super('no wallet present in this install'); this.name = 'NoWalletError'; }
}
export class WalletAlreadyExistsError extends Error {
  constructor() { super('wallet already exists — refusing to overwrite'); this.name = 'WalletAlreadyExistsError'; }
}
export class PassphraseRequiredError extends Error {
  constructor() { super('wallet is passphrase-protected and no passphrase was supplied'); this.name = 'PassphraseRequiredError'; }
}
export { BadPassphraseError } from './envelope.js';

export interface PublicWalletInfo {
  address: string;
  pubHex: string;
  falconPubHex: string;
  hasPassphrase: boolean;
}

/** Material an unlocked wallet exposes — exposed ONLY for the duration
 *  of a single signing operation. Callers must NOT persist or log these. */
export interface UnlockedWallet {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  address: string;
  falconPrivHex: string;
  falconPub: Uint8Array;
  /** Best-effort zeroisation — callers should call when done. After
   *  zero() the priv fields contain garbage; sign with the priv before. */
  zero(): void;
}

export class Wallet {
  constructor(private readonly storage: StorageBackend) {}

  // ── Existence + public info ────────────────────────────────────

  async exists(): Promise<boolean> {
    return (await this.storage.get(KEY_ADDRESS)) !== null;
  }

  async hasPassphrase(): Promise<boolean> {
    return (await this.storage.get(KEY_ENVELOPE)) !== null;
  }

  async publicInfo(): Promise<PublicWalletInfo> {
    const address = await this.storage.get(KEY_ADDRESS);
    const pubHex = await this.storage.get(KEY_PUB);
    if (!address || !pubHex) throw new NoWalletError();
    let falconPubHex: string | null = await this.storage.get(KEY_FALCON_PUB);
    if (!falconPubHex) {
      // Passphrase-on path — read from envelope's plaintext falcon_pub.
      const env = await this.readEnvelope();
      if (env) falconPubHex = bytesToHex(
        new Uint8Array(Buffer.from(env.falcon_pub, 'base64')),
      );
    }
    if (!falconPubHex) throw new NoWalletError(); // shouldn't happen
    return {
      address,
      pubHex,
      falconPubHex,
      hasPassphrase: (await this.storage.get(KEY_ENVELOPE)) !== null,
    };
  }

  // ── Creation paths ─────────────────────────────────────────────

  /** Create a fresh wallet: new seed → Ed25519 keypair → fresh FALCON
   *  keypair → store plaintext (no passphrase initially). Returns the
   *  24-word mnemonic so the caller can show it for backup. */
  async create(): Promise<{ address: string; mnemonic: string }> {
    if (await this.exists()) throw new WalletAlreadyExistsError();
    const { wallet, mnemonic } = sdkWallet.createWallet();
    const falcon = falcon512.keygen();
    await this.writePlaintext({
      address: wallet.address,
      pubHex: bytesToHex(wallet.publicKey),
      privHex: bytesToHex(wallet.privateKey),
      mnemonic,
      falconPrivHex: bytesToHex(falcon.secretKey),
      falconPubHex: bytesToHex(falcon.publicKey),
    });
    return { address: wallet.address, mnemonic };
  }

  /** Import a wallet from an existing 24-word mnemonic. Generates a
   *  FRESH FALCON keypair (FALCON keygen is non-deterministic — the
   *  mnemonic doesn't pin a FALCON keypair). See
   *  PAY_FALCON_ROTATION_SPEC.md for the post-hard-fork rotation UX
   *  that handles wallets restored from the same seed on a new install. */
  async importFromMnemonic(mnemonic: string): Promise<{ address: string }> {
    if (await this.exists()) throw new WalletAlreadyExistsError();
    const trimmed = mnemonic.trim().split(/\s+/).join(' ');
    const seed = sdkWallet.seedPhraseFromMnemonic(trimmed);
    const wallet = sdkWallet.walletFromSeedPhrase(seed);
    const falcon = falcon512.keygen();
    await this.writePlaintext({
      address: wallet.address,
      pubHex: bytesToHex(wallet.publicKey),
      privHex: bytesToHex(wallet.privateKey),
      mnemonic: trimmed,
      falconPrivHex: bytesToHex(falcon.secretKey),
      falconPubHex: bytesToHex(falcon.publicKey),
    });
    return { address: wallet.address };
  }

  /** Wipe the wallet entirely (used by Restore-from-seed flows or the
   *  Settings → Delete wallet button). Clears EVERY wallet.* key. */
  async wipe(): Promise<void> {
    for (const k of [
      KEY_ADDRESS, KEY_PUB, KEY_PRIV, KEY_MNEMONIC,
      KEY_FALCON_PRIV, KEY_FALCON_PUB, KEY_ENVELOPE,
    ]) await this.storage.remove(k);
  }

  // ── Passphrase management ──────────────────────────────────────

  /** Enable a passphrase on a wallet that currently has none. Encrypts
   *  priv + mnemonic + FALCON priv into a v3 envelope, then deletes
   *  the plaintext rows (address + Ed25519 pub + FALCON pub stay
   *  plaintext — they're public). */
  async enablePassphrase(passphrase: string): Promise<void> {
    if (await this.hasPassphrase()) {
      throw new Error('wallet already has a passphrase — use changePassphrase');
    }
    const privHex = await this.storage.get(KEY_PRIV);
    const mnemonic = await this.storage.get(KEY_MNEMONIC);
    const falconPrivHex = await this.storage.get(KEY_FALCON_PRIV);
    const falconPubHex = await this.storage.get(KEY_FALCON_PUB);
    if (!privHex || !falconPrivHex || !falconPubHex) {
      throw new NoWalletError();
    }
    const env = await buildEnvelope({
      privHex,
      mnemonic, // may be null for imported-without-mnemonic wallets
      falconPrivHex,
      falconPub: hexToBytes(falconPubHex),
      passphrase,
    });
    await this.storage.set(KEY_ENVELOPE, JSON.stringify(env));
    // Drop the plaintext rows only AFTER the envelope is durable.
    await this.storage.remove(KEY_PRIV);
    await this.storage.remove(KEY_MNEMONIC);
    await this.storage.remove(KEY_FALCON_PRIV);
    await this.storage.remove(KEY_FALCON_PUB);
  }

  async changePassphrase(oldPassphrase: string, newPassphrase: string): Promise<void> {
    const env = await this.readEnvelope();
    if (!env) throw new Error('no passphrase set — call enablePassphrase first');
    const next = await rotateEnvelope(env, oldPassphrase, newPassphrase);
    await this.storage.set(KEY_ENVELOPE, JSON.stringify(next));
  }

  /** Remove the passphrase wrap. The current passphrase is required.
   *  After this call the priv + mnemonic + FALCON keypair are back
   *  in plaintext storage slots. */
  async removePassphrase(currentPassphrase: string): Promise<void> {
    const env = await this.readEnvelope();
    if (!env) throw new Error('no passphrase set');
    const opened = await openEnvelope(env, currentPassphrase);
    await this.storage.set(KEY_PRIV, opened.privHex);
    if (opened.mnemonic) await this.storage.set(KEY_MNEMONIC, opened.mnemonic);
    await this.storage.set(KEY_FALCON_PRIV, opened.falconPrivHex);
    await this.storage.set(KEY_FALCON_PUB, bytesToHex(opened.falconPub));
    await this.storage.remove(KEY_ENVELOPE);
  }

  // ── Unlocking for signing ─────────────────────────────────────

  /** Return an UnlockedWallet ready to sign. When the wallet has a
   *  passphrase, `passphrase` is required and a wrong value throws
   *  BadPassphraseError. The unlocked material is in-memory only;
   *  callers should call `.zero()` after the signing operation. */
  async unlock(passphrase?: string): Promise<UnlockedWallet> {
    const address = await this.storage.get(KEY_ADDRESS);
    const pubHex = await this.storage.get(KEY_PUB);
    if (!address || !pubHex) throw new NoWalletError();

    const env = await this.readEnvelope();
    if (env) {
      if (!passphrase) throw new PassphraseRequiredError();
      const opened = await openEnvelope(env, passphrase);
      return makeUnlocked({
        address, pubHex,
        privHex: opened.privHex,
        falconPrivHex: opened.falconPrivHex,
        falconPub: opened.falconPub,
      });
    }

    const privHex = await this.storage.get(KEY_PRIV);
    const falconPrivHex = await this.storage.get(KEY_FALCON_PRIV);
    const falconPubHex = await this.storage.get(KEY_FALCON_PUB);
    if (!privHex || !falconPrivHex || !falconPubHex) throw new NoWalletError();
    return makeUnlocked({
      address, pubHex,
      privHex,
      falconPrivHex,
      falconPub: hexToBytes(falconPubHex),
    });
  }

  /** Return the wallet's mnemonic, if available. Requires the
   *  passphrase if one is set. Returns null when the wallet was
   *  imported without the mnemonic being kept. */
  async revealMnemonic(passphrase?: string): Promise<string | null> {
    const env = await this.readEnvelope();
    if (env) {
      if (!passphrase) throw new PassphraseRequiredError();
      const opened = await openEnvelope(env, passphrase);
      return opened.mnemonic;
    }
    return this.storage.get(KEY_MNEMONIC);
  }

  // ── Internal helpers ───────────────────────────────────────────

  private async readEnvelope(): Promise<PassphraseEnvelopeV3 | null> {
    const raw = await this.storage.get(KEY_ENVELOPE);
    if (!raw) return null;
    return parseEnvelopeJSON(raw);
  }

  private async writePlaintext(args: {
    address: string;
    pubHex: string;
    privHex: string;
    mnemonic: string | null;
    falconPrivHex: string;
    falconPubHex: string;
  }): Promise<void> {
    await this.storage.set(KEY_ADDRESS, args.address);
    await this.storage.set(KEY_PUB, args.pubHex);
    await this.storage.set(KEY_PRIV, args.privHex);
    if (args.mnemonic !== null) await this.storage.set(KEY_MNEMONIC, args.mnemonic);
    await this.storage.set(KEY_FALCON_PRIV, args.falconPrivHex);
    await this.storage.set(KEY_FALCON_PUB, args.falconPubHex);
  }
}

function makeUnlocked(args: {
  address: string;
  pubHex: string;
  privHex: string;
  falconPrivHex: string;
  falconPub: Uint8Array;
}): UnlockedWallet {
  const privateKey = hexToBytes(args.privHex);
  const publicKey = hexToBytes(args.pubHex);
  let zeroed = false;
  return {
    privateKey,
    publicKey,
    address: args.address,
    falconPrivHex: args.falconPrivHex,
    falconPub: args.falconPub,
    zero() {
      if (zeroed) return;
      privateKey.fill(0);
      // Best-effort string zeroisation isn't possible in V8 (strings are
      // immutable); we can drop the ref + hope GC reclaims promptly.
      // The Uint8Array zeroisation IS effective.
      zeroed = true;
    },
  };
}
