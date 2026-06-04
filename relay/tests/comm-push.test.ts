/**
 * comm-push.test.ts — the signed registration binding for Comm FCM push.
 * The relay must only accept a token registration when the caller proves it
 * holds the identity key behind the routing_id (no token-hijacking).
 */
import { describe, it, expect } from 'vitest';
import * as ed from '@noble/ed25519';
import { sha256, bytesToHex } from '../src/primitives.js';
import { __test } from '../src/comm-push.js';

const { verifyRegistration, COMM_PUSH_DOMAIN } = __test;

function signed(priv: Uint8Array, platform: string, token: string): Promise<Uint8Array> {
  return ed.signAsync(new TextEncoder().encode(`${COMM_PUSH_DOMAIN}|${platform}|${token}`), priv);
}

describe('comm-push verifyRegistration', () => {
  it('derives the routing_id from the signing key on a valid signature', async () => {
    const priv = ed.utils.randomPrivateKey();
    const pub = await ed.getPublicKeyAsync(priv);
    const token = 'fcm-token-abc';
    const sig = await signed(priv, 'fcm', token);
    const routing = verifyRegistration(bytesToHex(pub), 'fcm', token, bytesToHex(sig));
    expect(routing).toBe(bytesToHex(sha256(pub).slice(0, 16)));
  });

  it('rejects a signature taken over a DIFFERENT token (no hijack via replay)', async () => {
    const priv = ed.utils.randomPrivateKey();
    const pub = await ed.getPublicKeyAsync(priv);
    const sig = await signed(priv, 'fcm', 'TOKEN-A');
    expect(verifyRegistration(bytesToHex(pub), 'fcm', 'TOKEN-B', bytesToHex(sig))).toBeNull();
  });

  it('rejects a signature from a different key claiming someone else\'s pubkey', async () => {
    const victim = await ed.getPublicKeyAsync(ed.utils.randomPrivateKey());
    const attacker = ed.utils.randomPrivateKey();
    const token = 'fcm-token-xyz';
    const sig = await signed(attacker, 'fcm', token);
    expect(verifyRegistration(bytesToHex(victim), 'fcm', token, bytesToHex(sig))).toBeNull();
  });

  it('rejects malformed inputs', async () => {
    expect(verifyRegistration('not-hex', 'fcm', 't', 'deadbeef')).toBeNull();
    expect(verifyRegistration('ab', 'fcm', 't', 'cd')).toBeNull(); // pubkey not 32 bytes
  });
});
