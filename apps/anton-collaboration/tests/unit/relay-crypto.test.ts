/**
 * relay-crypto.test.ts — the phone↔agent E2E channel crypto (Comm scheme,
 * ported to Node): identity derivation + a seal→open round-trip + AAD binding.
 */
import { describe, it, expect } from 'vitest';
import { generateAgreementKeypair } from '../../src/main/agreement-crypto.js';
import { relayIdentityFrom, deriveContactHash, isValidContactHash } from '../../src/main/relay/identity.js';
import { sealForPeer, openFromPeer } from '../../src/main/relay/crypto.js';

describe('relay E2E channel', () => {
  it('contact hash is well-formed + stable for a key', async () => {
    const kp = await generateAgreementKeypair();
    const id = relayIdentityFrom(kp.privHex, kp.pubHex);
    expect(isValidContactHash(id.contactHash)).toBe(true);
    expect(deriveContactHash(kp.pubHex)).toBe(id.contactHash);
  });

  it('A seals → B opens (round-trip), with AAD binding', async () => {
    const a = relayIdentityFrom(...kp(await generateAgreementKeypair()));
    const b = relayIdentityFrom(...kp(await generateAgreementKeypair()));

    const env = sealForPeer('book me a table for two', a.x, b.edPubHex, a.contactHash, b.contactHash);
    const opened = openFromPeer(env, b.x, a.edPubHex, a.contactHash, b.contactHash);
    expect(opened).toBe('book me a table for two');

    // The reverse direction works too (DH is symmetric).
    const env2 = sealForPeer('on it', b.x, a.edPubHex, b.contactHash, a.contactHash);
    expect(openFromPeer(env2, a.x, b.edPubHex, b.contactHash, a.contactHash)).toBe('on it');
  });

  it('a swapped AAD (wrong sender/recipient binding) fails to open', async () => {
    const a = relayIdentityFrom(...kp(await generateAgreementKeypair()));
    const b = relayIdentityFrom(...kp(await generateAgreementKeypair()));
    const env = sealForPeer('secret', a.x, b.edPubHex, a.contactHash, b.contactHash);
    // B tries to open with the AAD reversed → GCM auth fails.
    expect(() => openFromPeer(env, b.x, a.edPubHex, b.contactHash, a.contactHash)).toThrow();
  });

  it('a third party (wrong key) cannot open', async () => {
    const a = relayIdentityFrom(...kp(await generateAgreementKeypair()));
    const b = relayIdentityFrom(...kp(await generateAgreementKeypair()));
    const c = relayIdentityFrom(...kp(await generateAgreementKeypair()));
    const env = sealForPeer('for B only', a.x, b.edPubHex, a.contactHash, b.contactHash);
    // C uses its own key + the right AAD → wrong shared secret → fails.
    expect(() => openFromPeer(env, c.x, a.edPubHex, a.contactHash, b.contactHash)).toThrow();
  });
});

function kp(k: { privHex: string; pubHex: string }): [string, string] {
  return [k.privHex, k.pubHex];
}
