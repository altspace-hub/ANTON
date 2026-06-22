/**
 * relay-resolve.test.ts — the independent registry-anchor client + the pubkey
 * format normalisers (raw / SPKI / wire all reduce to the same raw key).
 */
import { describe, it, expect } from 'vitest';
import { toRawPubkeyHex, rawToSpkiHex, resolveViaRelay } from '../../../server/services/trusted-stores/relay-resolve.js';

// A real Ed25519 raw 32-byte public key (the Sharks test portal's, from the relay).
const RAW = '6afa2e5f2720f2d209a203f66a933c05f8d8bfef4e349e0328e11ef3543ac078';

function wireOf(spkiHex: string): string {
  return Buffer.from(spkiHex, 'hex').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('pubkey normalisers', () => {
  it('rawToSpkiHex prepends the Ed25519 SPKI prefix → 88 hex chars', () => {
    const spki = rawToSpkiHex(RAW);
    expect(spki).toHaveLength(88);
    expect(spki.startsWith('302a300506032b6570032100')).toBe(true);
    expect(spki.endsWith(RAW)).toBe(true);
  });

  it('toRawPubkeyHex reduces raw / SPKI / wire to the SAME raw key', () => {
    const spki = rawToSpkiHex(RAW);
    expect(toRawPubkeyHex(RAW)).toBe(RAW);                 // raw 64-hex
    expect(toRawPubkeyHex(spki)).toBe(RAW);                // SPKI 88-hex
    expect(toRawPubkeyHex(wireOf(spki))).toBe(RAW);        // base64url wire
  });

  it('toRawPubkeyHex returns null for garbage', () => {
    expect(toRawPubkeyHex('not-a-key')).toBeNull();
    expect(toRawPubkeyHex('')).toBeNull();
  });
});

describe('resolveViaRelay', () => {
  const body = { found: true, signingPubkeyHex: RAW, contactHash: 'ANTON-XXXX', descriptor: { portal: { displayTitle: 'Shop' } } };
  const stub = (b: unknown, ok = true): typeof fetch =>
    (async () => ({ ok, json: async () => b })) as unknown as typeof fetch;

  it('returns the normalised resolution on a found result', async () => {
    const r = await resolveViaRelay('shop.global.portal', { fetchImpl: stub(body), baseUrl: 'https://relay.test/v1' });
    expect(r?.signingPubkeyRawHex).toBe(RAW);
    expect(r?.displayTitle).toBe('Shop');
    expect(r?.contactHash).toBe('ANTON-XXXX');
  });

  it('returns null on not-found / non-ok / network error', async () => {
    expect(await resolveViaRelay('x.global.portal', { fetchImpl: stub({ found: false }) })).toBeNull();
    expect(await resolveViaRelay('x.global.portal', { fetchImpl: stub(body, false) })).toBeNull();
    const boom = (async () => { throw new Error('net'); }) as unknown as typeof fetch;
    expect(await resolveViaRelay('x.global.portal', { fetchImpl: boom })).toBeNull();
  });
});
