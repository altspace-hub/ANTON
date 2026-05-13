/**
 * relay-submit.test.ts — Step 11 unit tests for the bridging helpers
 * that convert ANTON Local's portal identity (SPKI hex pubkey + PEM
 * private key) into the relay's wire format (raw 64-hex pubkey + raw
 * 32-byte-derived contact hash).
 *
 * Round-trips a real Ed25519 keypair through both code paths and
 * asserts the relay's verify function would accept the resulting
 * signature. End-to-end submit-against-a-running-relay tests live in
 * relay/tests/registry-endpoints.test.ts (Step 8) — those cover the
 * wire shape from the server side.
 */

import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { canonify } from '@truestamp/canonify';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { signCanonical } from '../../server/lib/portal-crypto.js';
import {
  spkiHexToRawPubkeyHex,
  deriveRelayContactHash,
  submitToRelay,
  RelaySubmitError,
} from '../../server/services/registry-client/relay-submit.js';

ed25519.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed25519.etc.concatBytes(...m));

function makeKeypair(): { spkiHex: string; rawHex: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spkiHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  return { spkiHex, rawHex: spkiHex.slice(-64), privateKeyPem };
}

describe('spkiHexToRawPubkeyHex', () => {
  it('strips the 12-byte Ed25519 SPKI prefix and returns the raw 32-byte key', () => {
    const { spkiHex, rawHex } = makeKeypair();
    expect(spkiHexToRawPubkeyHex(spkiHex)).toBe(rawHex);
    expect(spkiHexToRawPubkeyHex(spkiHex).length).toBe(64);
  });

  it('is case-insensitive on input but normalises to lowercase', () => {
    const { spkiHex } = makeKeypair();
    expect(spkiHexToRawPubkeyHex(spkiHex.toUpperCase())).toBe(spkiHex.slice(-64));
  });

  it('throws on wrong length', () => {
    expect(() => spkiHexToRawPubkeyHex('abcd')).toThrow(RelaySubmitError);
  });

  it('throws when the SPKI prefix is not Ed25519', () => {
    // 88 hex chars total but wrong prefix (used a P-256 SPKI structure here).
    const fake = '00'.repeat(12) + 'aa'.repeat(32);
    expect(() => spkiHexToRawPubkeyHex(fake)).toThrow(/not an Ed25519/);
  });
});

describe('deriveRelayContactHash', () => {
  it('produces an ANTON-XXXX-XXXX-XXXX-XXXX hash from raw 32-byte pubkey hex', () => {
    const { rawHex } = makeKeypair();
    const hash = deriveRelayContactHash(rawHex);
    expect(hash).toMatch(/^ANTON-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it('is deterministic for the same key', () => {
    const { rawHex } = makeKeypair();
    expect(deriveRelayContactHash(rawHex)).toBe(deriveRelayContactHash(rawHex));
  });

  it('agrees with the relay-server algorithm (verified by an inline reimplementation)', () => {
    const { rawHex } = makeKeypair();
    // Mirror of relay/src/registry/verify.ts deriveContactHash.
    const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const hash = createHash('sha256').update(Buffer.from(rawHex, 'hex')).digest();
    const segs: string[] = [];
    for (let s = 0; s < 4; s++) {
      let seg = '';
      for (let c = 0; c < 4; c++) seg += CHARSET[hash[s * 4 + c]! % CHARSET.length];
      segs.push(seg);
    }
    const expected = `ANTON-${segs.join('-')}`;
    expect(deriveRelayContactHash(rawHex)).toBe(expected);
  });

  it('throws on malformed input', () => {
    expect(() => deriveRelayContactHash('not-hex')).toThrow(RelaySubmitError);
    expect(() => deriveRelayContactHash('ab'.repeat(31))).toThrow(); // 62 chars, wrong length
  });
});

describe('signature round-trip (Node sign → @noble verify)', () => {
  it('a signature produced via signCanonical(PEM) verifies under @noble/ed25519(raw)', async () => {
    const { spkiHex, privateKeyPem } = makeKeypair();
    const rawHex = spkiHexToRawPubkeyHex(spkiHex);

    // What ANTON Local will actually send: signed descriptor + raw pubkey.
    const descriptor = {
      name: 'test-portal',
      namespace: 'global',
      displayTitle: 'Test',
      capabilities: [{ verb: 'contact' }],
    };
    const signature = signCanonical(descriptor, privateKeyPem);

    // What the relay does: canonicalise, decode base64url, verify with raw pubkey.
    const canonical = canonify(descriptor);
    if (!canonical) throw new Error('canonical undefined');
    const padded = signature.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - signature.length % 4) % 4);
    const sigBytes = new Uint8Array(Buffer.from(padded, 'base64'));
    expect(sigBytes.length).toBe(64);
    const pubBytes = new Uint8Array(Buffer.from(rawHex, 'hex'));
    expect(pubBytes.length).toBe(32);

    const ok = await ed25519.verifyAsync(sigBytes, new TextEncoder().encode(canonical), pubBytes);
    expect(ok).toBe(true);
  });

  it('a tampered descriptor breaks verification', async () => {
    const { spkiHex, privateKeyPem } = makeKeypair();
    const rawHex = spkiHexToRawPubkeyHex(spkiHex);
    const descriptor = { name: 'test', tag: 'original' };
    const signature = signCanonical(descriptor, privateKeyPem);

    const tampered = { ...descriptor, tag: 'attacker-modified' };
    const canonical = canonify(tampered);
    if (!canonical) throw new Error('canonical undefined');
    const padded = signature.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - signature.length % 4) % 4);
    const sigBytes = new Uint8Array(Buffer.from(padded, 'base64'));
    const pubBytes = new Uint8Array(Buffer.from(rawHex, 'hex'));

    const ok = await ed25519.verifyAsync(sigBytes, new TextEncoder().encode(canonical), pubBytes);
    expect(ok).toBe(false);
  });
});

describe('submitToRelay', () => {
  it('sends the correct body shape and surfaces the relay response', async () => {
    const { spkiHex, rawHex, privateKeyPem } = makeKeypair();
    const expectedHash = deriveRelayContactHash(rawHex);

    // Fake fetch that captures the request + returns a synthetic 201.
    let capturedBody: Record<string, unknown> | null = null;
    let capturedUrl = '';
    const fakeFetch: typeof fetch = async (input, init) => {
      capturedUrl = typeof input === 'string' ? input : input.toString();
      capturedBody = JSON.parse(init!.body as string) as Record<string, unknown>;
      return new Response(JSON.stringify({
        submissionId: '00000000-0000-4000-8000-000000000000',
        status: 'pending',
        tier: 'tier3_selfservice',
        submittedAt: '2026-05-13T10:00:00.000Z',
      }), { status: 201, headers: { 'content-type': 'application/json' } });
    };

    const result = await submitToRelay({
      relayBaseUrl: 'https://relay.test/v1',
      name: 'sample-portal',
      namespace: 'global',
      descriptorJson: { name: 'sample-portal', displayTitle: 'Sample' },
      publicKeyHex: spkiHex,
      privateKeyPem,
      kyc: {
        legalName: 'Test User',
        idDocumentType: 'national_id',
        idDocumentNumber: '199001011234',
        idDocumentCountry: 'SE',
        contactEmail: 'test@example.com',
        addressCountry: 'SE', addressCity: 'Stockholm', addressStreet: 'Testgatan 1',
      },
      fetchImpl: fakeFetch,
    });

    expect(capturedUrl).toBe('https://relay.test/v1/portals/submit');
    expect(capturedBody).not.toBeNull();
    expect(capturedBody!.signingPubkeyHex).toBe(rawHex);
    expect(capturedBody!.submitterContactHash).toBe(expectedHash);
    expect(capturedBody!.proposedName).toBe('sample-portal');
    expect((capturedBody!.kyc as { legalName: string }).legalName).toBe('Test User');
    expect(typeof capturedBody!.descriptorSignature).toBe('string');
    expect(result.submissionId).toBe('00000000-0000-4000-8000-000000000000');
    expect(result.status).toBe('pending');
  });

  it('throws RelaySubmitError on non-2xx with the relay-provided error code', async () => {
    const { spkiHex, privateKeyPem } = makeKeypair();
    const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
      error: 'name_reserved',
      message: 'reserved by FutureChain',
      claimable: true,
    }), { status: 409, headers: { 'content-type': 'application/json' } });
    await expect(submitToRelay({
      relayBaseUrl: 'https://relay.test/v1',
      name: 'reserved-name', namespace: 'global',
      descriptorJson: { name: 'reserved-name' },
      publicKeyHex: spkiHex, privateKeyPem,
      kyc: {
        legalName: 'X', idDocumentType: 'national_id', idDocumentNumber: 'D1',
        idDocumentCountry: 'SE', contactEmail: 'x@example.com',
        addressCountry: 'SE', addressCity: 'C', addressStreet: 'S',
      },
      fetchImpl: fakeFetch,
    })).rejects.toMatchObject({ code: 'name_reserved', status: 409 });
  });
});
