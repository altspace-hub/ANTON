/**
 * crypto.test.ts — round-trip + replay-protection coverage for the
 * Comm App's sealForPeer / openFromPeer pair.
 *
 * The test creates two identities (Alice + Bob) by writing each side's
 * Ed25519 private key into the secure store. To send A→B we leave A's
 * key in place and call sealForPeer with B's pubkey; to open as B we
 * swap A's key for B's key before calling openFromPeer.
 *
 * Tests that ride on this:
 *   - happy-path round-trip survives base64 / AEAD / shared-secret math.
 *   - replay-cache rejects identical (fromHash, salt, iv) twice in a row
 *     with ReplayError (Phase 2 P2-... no, this is the pre-existing
 *     replay layer that this test pins down).
 *   - tampering with the AAD (swapping fromHash with attacker's) breaks
 *     decryption.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { sealForPeer, openFromPeer } from '../services/crypto';
import { setSecure, removeSecure } from '../services/secure-store';
import { deriveContactHash } from '../services/identity';
import { ReplayError } from '../services/replay-cache';

ed25519.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed25519.etc.concatBytes(...m));

const SECURE_KEY_PRIVKEY = 'identity-private-key';

interface Peer {
  privHex: string;
  pubHex: string;
  hash: string;
}

async function freshPeer(): Promise<Peer> {
  const priv = ed25519.utils.randomPrivateKey();
  const pub = await ed25519.getPublicKeyAsync(priv);
  const privHex = bytesToHex(priv);
  const pubHex = bytesToHex(pub);
  return { privHex, pubHex, hash: deriveContactHash(pubHex) };
}

function bytesToHex(b: Uint8Array): string {
  let out = '';
  for (let i = 0; i < b.length; i++) out += b[i].toString(16).padStart(2, '0');
  return out;
}

async function actAs(peer: Peer): Promise<void> {
  await removeSecure(SECURE_KEY_PRIVKEY);
  await setSecure(SECURE_KEY_PRIVKEY, peer.privHex);
  // Identity localStorage is also read by crypto helpers — give them a
  // matching public hash so any internal logging is coherent.
  localStorage.setItem('anton-comm-identity', JSON.stringify({
    publicKeyHex: peer.pubHex,
    contactHash: peer.hash,
    displayName: 'test',
    preferredLanguage: 'en',
    createdAt: new Date().toISOString(),
  }));
}

describe('crypto round-trip', () => {
  let alice: Peer;
  let bob: Peer;

  beforeEach(async () => {
    alice = await freshPeer();
    bob = await freshPeer();
  });

  it('decrypts a sealed message back to the original plaintext', async () => {
    const plaintext = 'hello bob, this is alice';
    await actAs(alice);
    const env = await sealForPeer(plaintext, bob.pubHex, alice.hash, bob.hash);
    await actAs(bob);
    const opened = await openFromPeer(env, alice.pubHex, alice.hash, bob.hash);
    expect(opened).toBe(plaintext);
  });

  it('round-trips multi-line UTF-8 with emojis intact', async () => {
    const plaintext = 'Hello 👋\n— über die straße 🛣️\nок?';
    await actAs(alice);
    const env = await sealForPeer(plaintext, bob.pubHex, alice.hash, bob.hash);
    await actAs(bob);
    const opened = await openFromPeer(env, alice.pubHex, alice.hash, bob.hash);
    expect(opened).toBe(plaintext);
  });

  it('rejects an envelope replayed under the same (fromHash, salt, iv)', async () => {
    await actAs(alice);
    const env = await sealForPeer('replay me', bob.pubHex, alice.hash, bob.hash);
    await actAs(bob);
    // First open accepted, second open with identical envelope rejected.
    const first = await openFromPeer(env, alice.pubHex, alice.hash, bob.hash);
    expect(first).toBe('replay me');
    await expect(
      openFromPeer(env, alice.pubHex, alice.hash, bob.hash),
    ).rejects.toBeInstanceOf(ReplayError);
  });

  it('refuses to decrypt when AAD (from/to hashes) has been tampered with', async () => {
    await actAs(alice);
    const env = await sealForPeer('secret', bob.pubHex, alice.hash, bob.hash);
    await actAs(bob);
    // Swap the AAD — pretend the message came from a third party. AES-GCM
    // tag verification must fail, opening must throw.
    const attackerHash = 'ANTON-XXXX-XXXX-XXXX-XXXX';
    await expect(
      openFromPeer(env, alice.pubHex, attackerHash, bob.hash),
    ).rejects.toThrow();
  });
});
