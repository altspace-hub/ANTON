/**
 * mesh-validate.test.ts — phone-side QR validator for mesh pairings.
 *
 * The validator is the cryptographic gate at QR-scan time. Tests confirm:
 *   - happy path: valid package returns canonicalized relay URLs + pinned-key JSON
 *   - rejects mismatched (ed_pk, x_pk) pair (forged binding scenario)
 *   - rejects forged binding_sig
 *   - rejects each individually-invalid relay URL (ws://, http://, path,
 *     query, fragment, userinfo)
 *   - rejects non-mesh package
 *   - canonicalizes relay URL bytes match the relay's own canonicalize()
 */

import { describe, it, expect } from 'vitest';
import { ed25519, edwardsToMontgomeryPub } from '@noble/curves/ed25519';
import { createHash } from 'node:crypto';
import {
  validateMeshPackage,
  MeshValidationError,
} from '../../src/app/services/mesh-validate';
import type { EnrollmentPackage } from '../../src/app/services/enrollment';

const BINDING_DOMAIN = new TextEncoder().encode('ANTON-MESH-IDENTITY/v1\n');

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, '0');
  return s;
}

function makeValidMeshPackage(overrides: Partial<EnrollmentPackage> = {}): EnrollmentPackage {
  const ed_priv = ed25519.utils.randomPrivateKey();
  const ed_pk = ed25519.getPublicKey(ed_priv);
  const x_pk = edwardsToMontgomeryPub(ed_pk);
  const bindingMsg = new Uint8Array(BINDING_DOMAIN.length + 32 + 32);
  bindingMsg.set(BINDING_DOMAIN, 0);
  bindingMsg.set(ed_pk, BINDING_DOMAIN.length);
  bindingMsg.set(x_pk, BINDING_DOMAIN.length + 32);
  const binding_sig = ed25519.sign(bindingMsg, ed_priv);
  const instance_id = createHash('sha256').update(x_pk).digest().subarray(0, 16);
  void instance_id;

  return {
    token: 'tkn',
    nonce: 'nonce',
    instance_pubkey: 'legacy-der-hex',
    instance_cert_fp: null,
    endpoints: {},
    intended_user_id: null,
    org_id: null,
    intended_role: null,
    display_name_hint: null,
    language_hint: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    instance_contact_hash: null,
    instance_display_name: null,
    requires_confirmation_code: false,
    transport: 'mesh',
    relay_endpoints: ['wss://r1.openexpert.org'],
    instance_ed_pk: bytesToHex(ed_pk),
    instance_x_pk: bytesToHex(x_pk),
    binding_sig: bytesToHex(binding_sig),
    ...overrides,
  };
}

describe('validateMeshPackage — happy path', () => {
  it('accepts a valid mesh package and returns canonicalized fields', () => {
    const pkg = makeValidMeshPackage();
    const v = validateMeshPackage(pkg);
    expect(v.relayEndpoints).toEqual(['wss://r1.openexpert.org']);
    const pinned = JSON.parse(v.pubkeyPinnedJson) as { ed: string; x: string; binding_sig: string };
    expect(pinned.ed).toBe(pkg.instance_ed_pk);
    expect(pinned.x).toBe(pkg.instance_x_pk);
    expect(pinned.binding_sig).toBe(pkg.binding_sig);
  });

  it('canonicalizes relay URLs to match the relay-side spec form', () => {
    const pkg = makeValidMeshPackage({
      relay_endpoints: [
        'wss://Relay.Example.com:443/',           // case + default port + slash
        'wss://r2.openexpert.org:8443',            // non-default port preserved
      ],
    });
    const v = validateMeshPackage(pkg);
    expect(v.relayEndpoints[0]).toBe('wss://relay.example.com');
    expect(v.relayEndpoints[1]).toBe('wss://r2.openexpert.org:8443');
  });
});

describe('validateMeshPackage — rejects forged or corrupted packages', () => {
  it('rejects when transport != mesh', () => {
    const pkg = makeValidMeshPackage({ transport: 'public_https' });
    expect(() => validateMeshPackage(pkg)).toThrow(MeshValidationError);
  });

  it('rejects when instance_ed_pk is missing', () => {
    const pkg = makeValidMeshPackage({ instance_ed_pk: undefined });
    expect(() => validateMeshPackage(pkg)).toThrow(/missing/);
  });

  it('rejects when instance_x_pk does not match ed25519_pk_to_curve25519(ed_pk)', () => {
    const pkg = makeValidMeshPackage();
    // Substitute x_pk with bytes from a different keypair → derived check fails.
    const otherEd = ed25519.utils.randomPrivateKey();
    const otherX = edwardsToMontgomeryPub(ed25519.getPublicKey(otherEd));
    pkg.instance_x_pk = bytesToHex(otherX);
    expect(() => validateMeshPackage(pkg)).toThrow(/x_pk/);
  });

  it('rejects when binding_sig does not verify under instance_ed_pk', () => {
    const pkg = makeValidMeshPackage();
    // Flip a byte in the binding_sig.
    const sigBytes = pkg.binding_sig!.split('');
    sigBytes[0] = sigBytes[0] === '0' ? '1' : '0';
    pkg.binding_sig = sigBytes.join('');
    expect(() => validateMeshPackage(pkg)).toThrow(/binding_sig/);
  });

  it('rejects when relay_endpoints is empty', () => {
    const pkg = makeValidMeshPackage({ relay_endpoints: [] });
    expect(() => validateMeshPackage(pkg)).toThrow(/no relay/);
  });
});

describe('validateMeshPackage — rejects each invalid relay URL form', () => {
  for (const [bad, why] of [
    ['ws://relay.example.com', 'cleartext WebSocket'],
    ['http://relay.example.com', 'wrong scheme'],
    ['https://relay.example.com', 'wrong scheme'],
    ['wss://relay.example.com/api', 'has path'],
    ['wss://relay.example.com?foo=bar', 'has query'],
    ['wss://relay.example.com#frag', 'has fragment'],
    ['wss://user:pw@relay.example.com', 'has userinfo'],
    ['not-a-url', 'unparseable'],
  ] as const) {
    it(`rejects relay URL "${bad}" (${why})`, () => {
      const pkg = makeValidMeshPackage({ relay_endpoints: [bad] });
      expect(() => validateMeshPackage(pkg)).toThrow(MeshValidationError);
    });
  }

  it('rejects when ANY url in the list is invalid (one bad apple)', () => {
    const pkg = makeValidMeshPackage({
      relay_endpoints: ['wss://r1.openexpert.org', 'ws://r2.bad'],
    });
    expect(() => validateMeshPackage(pkg)).toThrow(MeshValidationError);
  });
});

describe('validateMeshPackage — opt-in dev override', () => {
  it('accepts ws:// only when allowInsecureWs=true', () => {
    const pkg = makeValidMeshPackage({ relay_endpoints: ['ws://localhost:8443'] });
    expect(() => validateMeshPackage(pkg)).toThrow(MeshValidationError);
    expect(() => validateMeshPackage(pkg, { allowInsecureWs: true })).not.toThrow();
  });
});
