/**
 * wallet.test.ts — full coverage of the Wallet API + the envelope
 * primitives + the storage backends.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Wallet,
  InMemoryStorageBackend, FileStorageBackend,
  BadPassphraseError, NoWalletError, WalletAlreadyExistsError, PassphraseRequiredError,
  bytesToHex, hexToBytes,
  buildEnvelope, openEnvelope, parseEnvelopeJSON,
} from '../../src/main/wallet/index.js';

// Use a fixed, known mnemonic across tests so derive-then-recreate
// flows are deterministic on the Ed25519 side. (FALCON keygen is
// non-deterministic, expected — see spec.)
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon abandon abandon abandon abandon abandon '
  + 'abandon abandon abandon abandon abandon abandon abandon art';

describe('Wallet', () => {
  let storage: InMemoryStorageBackend;
  let wallet: Wallet;
  beforeEach(() => {
    storage = new InMemoryStorageBackend();
    wallet = new Wallet(storage);
  });

  // ── exists / publicInfo on empty backend ────────────────────

  it('exists returns false on a fresh install', async () => {
    expect(await wallet.exists()).toBe(false);
  });
  it('hasPassphrase returns false on a fresh install', async () => {
    expect(await wallet.hasPassphrase()).toBe(false);
  });
  it('publicInfo throws NoWalletError on a fresh install', async () => {
    await expect(wallet.publicInfo()).rejects.toBeInstanceOf(NoWalletError);
  });
  it('unlock throws NoWalletError on a fresh install', async () => {
    await expect(wallet.unlock()).rejects.toBeInstanceOf(NoWalletError);
  });

  // ── create ─────────────────────────────────────────────────

  it('create() yields an address + 24-word mnemonic + plaintext storage', async () => {
    const { address, mnemonic } = await wallet.create();
    expect(address).toMatch(/^fc_/);
    expect(mnemonic.split(' ').length).toBe(24);
    expect(await wallet.exists()).toBe(true);
    expect(await wallet.hasPassphrase()).toBe(false);
    const info = await wallet.publicInfo();
    expect(info.address).toBe(address);
    expect(info.pubHex).toMatch(/^[0-9a-f]{64}$/);
    // FALCON-512 pubkey is 897 bytes → 1794 hex chars.
    expect(info.falconPubHex.length).toBe(1794);
    expect(info.hasPassphrase).toBe(false);
  });

  it('create() refuses on an existing wallet', async () => {
    await wallet.create();
    await expect(wallet.create()).rejects.toBeInstanceOf(WalletAlreadyExistsError);
  });

  // ── importFromMnemonic ─────────────────────────────────────

  it('importFromMnemonic derives a deterministic Ed25519 address', async () => {
    const r1 = await wallet.importFromMnemonic(TEST_MNEMONIC);
    expect(r1.address).toMatch(/^fc_/);
    await wallet.wipe();
    const wallet2 = new Wallet(new InMemoryStorageBackend());
    const r2 = await wallet2.importFromMnemonic(TEST_MNEMONIC);
    expect(r2.address).toBe(r1.address); // same address, deterministic
  });

  it('importFromMnemonic generates a FRESH FALCON keypair each call', async () => {
    await wallet.importFromMnemonic(TEST_MNEMONIC);
    const info1 = await wallet.publicInfo();
    await wallet.wipe();
    await wallet.importFromMnemonic(TEST_MNEMONIC);
    const info2 = await wallet.publicInfo();
    expect(info1.address).toBe(info2.address); // Ed25519 = deterministic
    expect(info1.falconPubHex).not.toBe(info2.falconPubHex); // FALCON ≠
  });

  it('importFromMnemonic refuses on an existing wallet', async () => {
    await wallet.create();
    await expect(wallet.importFromMnemonic(TEST_MNEMONIC))
      .rejects.toBeInstanceOf(WalletAlreadyExistsError);
  });

  it('importFromMnemonic normalises whitespace in the input', async () => {
    const noisy = '   ' + TEST_MNEMONIC.split(' ').join('  \n  ') + '   ';
    const { address } = await wallet.importFromMnemonic(noisy);
    expect(address).toMatch(/^fc_/);
  });

  // ── unlock ─────────────────────────────────────────────────

  it('unlock without a passphrase returns the priv + falcon material', async () => {
    await wallet.create();
    const u = await wallet.unlock();
    expect(u.address).toMatch(/^fc_/);
    expect(u.privateKey.length).toBe(32);     // Ed25519 priv
    expect(u.publicKey.length).toBe(32);      // Ed25519 pub
    expect(u.falconPub.length).toBe(897);     // FALCON-512 pub raw bytes
    expect(u.falconPrivHex.length).toBeGreaterThan(0);
    u.zero();
  });

  it('zero() wipes the private key buffer (zeros it in-place)', async () => {
    await wallet.create();
    const u = await wallet.unlock();
    expect(Array.from(u.privateKey).some(b => b !== 0)).toBe(true);
    u.zero();
    expect(Array.from(u.privateKey).every(b => b === 0)).toBe(true);
  });

  // ── enablePassphrase + unlock-with-passphrase ──────────────

  it('enablePassphrase wraps priv + mnemonic + FALCON into the envelope', async () => {
    const { mnemonic } = await wallet.create();
    await wallet.enablePassphrase('correct-horse-battery-staple');
    expect(await wallet.hasPassphrase()).toBe(true);
    // Plaintext rows are gone.
    expect(await storage.get('wallet.priv')).toBeNull();
    expect(await storage.get('wallet.mnemonic')).toBeNull();
    expect(await storage.get('wallet.falcon_priv')).toBeNull();
    expect(await storage.get('wallet.falcon_pub')).toBeNull();
    // Public stuff stays.
    const info = await wallet.publicInfo();
    expect(info.hasPassphrase).toBe(true);
    expect(info.address).toMatch(/^fc_/);
    // Unlock with correct passphrase recovers the original mnemonic.
    const recovered = await wallet.revealMnemonic('correct-horse-battery-staple');
    expect(recovered).toBe(mnemonic);
  });

  it('unlock without passphrase on a protected wallet throws', async () => {
    await wallet.create();
    await wallet.enablePassphrase('pw');
    await expect(wallet.unlock()).rejects.toBeInstanceOf(PassphraseRequiredError);
  });

  it('unlock with WRONG passphrase throws BadPassphraseError', async () => {
    await wallet.create();
    await wallet.enablePassphrase('right');
    await expect(wallet.unlock('wrong')).rejects.toBeInstanceOf(BadPassphraseError);
  });

  // ── changePassphrase ───────────────────────────────────────

  it('changePassphrase rotates the key — old fails, new works', async () => {
    await wallet.create();
    await wallet.enablePassphrase('old');
    await wallet.changePassphrase('old', 'new');
    await expect(wallet.unlock('old')).rejects.toBeInstanceOf(BadPassphraseError);
    const u = await wallet.unlock('new');
    expect(u.address).toMatch(/^fc_/);
  });

  it('changePassphrase with wrong oldPassphrase throws', async () => {
    await wallet.create();
    await wallet.enablePassphrase('old');
    await expect(wallet.changePassphrase('NOT-old', 'new'))
      .rejects.toBeInstanceOf(BadPassphraseError);
  });

  // ── removePassphrase ───────────────────────────────────────

  it('removePassphrase restores plaintext rows + clears the envelope', async () => {
    const { mnemonic } = await wallet.create();
    await wallet.enablePassphrase('pw');
    await wallet.removePassphrase('pw');
    expect(await wallet.hasPassphrase()).toBe(false);
    expect(await storage.get('wallet.priv')).toBeTruthy();
    expect(await storage.get('wallet.mnemonic')).toBe(mnemonic);
    expect(await storage.get('wallet.falcon_priv')).toBeTruthy();
    expect(await storage.get('wallet.falcon_pub')).toBeTruthy();
  });

  it('removePassphrase with wrong passphrase throws', async () => {
    await wallet.create();
    await wallet.enablePassphrase('pw');
    await expect(wallet.removePassphrase('NOT-pw'))
      .rejects.toBeInstanceOf(BadPassphraseError);
    expect(await wallet.hasPassphrase()).toBe(true);
  });

  // ── revealMnemonic ────────────────────────────────────────

  it('revealMnemonic plaintext-no-passphrase path returns the mnemonic', async () => {
    const { mnemonic } = await wallet.create();
    expect(await wallet.revealMnemonic()).toBe(mnemonic);
  });

  it('revealMnemonic with-passphrase path requires + uses the passphrase', async () => {
    const { mnemonic } = await wallet.create();
    await wallet.enablePassphrase('pw');
    await expect(wallet.revealMnemonic()).rejects.toBeInstanceOf(PassphraseRequiredError);
    expect(await wallet.revealMnemonic('pw')).toBe(mnemonic);
    await expect(wallet.revealMnemonic('WRONG')).rejects.toBeInstanceOf(BadPassphraseError);
  });

  // ── wipe ───────────────────────────────────────────────────

  it('wipe clears every wallet.* key including the envelope', async () => {
    await wallet.create();
    await wallet.enablePassphrase('pw');
    await wallet.wipe();
    expect(await wallet.exists()).toBe(false);
    expect(await wallet.hasPassphrase()).toBe(false);
    // Backend lists nothing wallet-related.
    const remaining = (await storage.listKeys()).filter(k => k.startsWith('wallet.'));
    expect(remaining).toEqual([]);
  });
});

// ── Envelope primitives ──────────────────────────────────────────

describe('envelope', () => {
  const PRIV = '11'.repeat(32);
  const FALCON_PRIV = 'aa'.repeat(64);
  const FALCON_PUB = new Uint8Array(897); FALCON_PUB.fill(0xbb);
  const MNEMONIC = 'test mnemonic words abc';

  it('roundtrip: build → open returns the same material', async () => {
    const env = await buildEnvelope({
      privHex: PRIV, mnemonic: MNEMONIC,
      falconPrivHex: FALCON_PRIV, falconPub: FALCON_PUB,
      passphrase: 'pw',
    });
    expect(env.v).toBe(3);
    const opened = await openEnvelope(env, 'pw');
    expect(opened.privHex).toBe(PRIV);
    expect(opened.mnemonic).toBe(MNEMONIC);
    expect(opened.falconPrivHex).toBe(FALCON_PRIV);
    expect(bytesToHex(opened.falconPub)).toBe(bytesToHex(FALCON_PUB));
  });

  it('open with wrong passphrase throws BadPassphraseError', async () => {
    const env = await buildEnvelope({
      privHex: PRIV, mnemonic: null,
      falconPrivHex: FALCON_PRIV, falconPub: FALCON_PUB,
      passphrase: 'right',
    });
    await expect(openEnvelope(env, 'wrong')).rejects.toBeInstanceOf(BadPassphraseError);
  });

  it('mnemonic is optional in the envelope', async () => {
    const env = await buildEnvelope({
      privHex: PRIV, mnemonic: null,
      falconPrivHex: FALCON_PRIV, falconPub: FALCON_PUB,
      passphrase: 'pw',
    });
    expect(env.iv_mnem).toBeUndefined();
    expect(env.mnem_ct).toBeUndefined();
    const opened = await openEnvelope(env, 'pw');
    expect(opened.mnemonic).toBeNull();
  });

  it('salt is fresh on every build — same input produces different ciphertext', async () => {
    const inp = {
      privHex: PRIV, mnemonic: null,
      falconPrivHex: FALCON_PRIV, falconPub: FALCON_PUB,
      passphrase: 'pw',
    };
    const a = await buildEnvelope(inp);
    const b = await buildEnvelope(inp);
    expect(a.salt).not.toBe(b.salt);
    expect(a.priv_ct).not.toBe(b.priv_ct);
  });

  it('parseEnvelopeJSON rejects malformed input', async () => {
    expect(parseEnvelopeJSON('not-json')).toBeNull();
    expect(parseEnvelopeJSON('{"v":2}')).toBeNull(); // wrong version
    expect(parseEnvelopeJSON('{}')).toBeNull(); // missing fields
    expect(parseEnvelopeJSON('null')).toBeNull();
  });
});

// ── FileStorageBackend ────────────────────────────────────────────

describe('FileStorageBackend', () => {
  let dir: string;
  let backend: FileStorageBackend;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agent-pay-storage-'));
    backend = new FileStorageBackend(dir);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('set + get roundtrip', async () => {
    await backend.set('wallet.priv', 'hex-deadbeef');
    expect(await backend.get('wallet.priv')).toBe('hex-deadbeef');
  });

  it('get on a missing key returns null', async () => {
    expect(await backend.get('nope')).toBeNull();
  });

  it('remove deletes the key', async () => {
    await backend.set('k', 'v');
    expect(await backend.get('k')).toBe('v');
    await backend.remove('k');
    expect(await backend.get('k')).toBeNull();
  });

  it('listKeys returns all set keys', async () => {
    await backend.set('a', '1');
    await backend.set('b', '2');
    await backend.set('c', '3');
    const ks = (await backend.listKeys()).sort();
    expect(ks).toEqual(['a', 'b', 'c']);
  });

  it('remove updates the listKeys index', async () => {
    await backend.set('a', '1');
    await backend.set('b', '2');
    await backend.remove('a');
    expect(await backend.listKeys()).toEqual(['b']);
  });

  it('end-to-end: a Wallet backed by FileStorageBackend round-trips', async () => {
    const w = new Wallet(backend);
    const { address, mnemonic } = await w.create();
    await w.enablePassphrase('pw');
    // Reload through a NEW Wallet instance pointed at the same dir.
    const w2 = new Wallet(new FileStorageBackend(dir));
    expect(await w2.exists()).toBe(true);
    expect(await w2.hasPassphrase()).toBe(true);
    expect((await w2.publicInfo()).address).toBe(address);
    expect(await w2.revealMnemonic('pw')).toBe(mnemonic);
  });
});

// ── helpers ───────────────────────────────────────────────────────

describe('bytesToHex / hexToBytes', () => {
  it('roundtrip', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(bytesToHex(bytes)).toBe('deadbeef');
    expect(hexToBytes('deadbeef')).toEqual(bytes);
  });
  it('hexToBytes throws on odd-length input', () => {
    expect(() => hexToBytes('abc')).toThrow(/odd length/);
  });
});
