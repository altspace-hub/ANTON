// Tests for the URL parsers + server-URL validator used by JoinPage and
// the deep-link / share intent handlers.

import { describe, it, expect } from 'vitest';
// Import from pairing-url.ts directly so the test runs without the
// runtime @noble/ed25519 dependency that identity.ts pulls in.
import {
  parsePairingLink, validateServerUrl,
  describeInlinePackage, buildInlinePairingUrl, encodeBase64UrlJson,
} from '../../src/app/services/pairing-url';

describe('parsePairingLink', () => {
  it('parses anton://enroll', () => {
    const r = parsePairingLink('anton://enroll?server=https%3A%2F%2Fanton.example.com&token=abcd1234efgh');
    expect(r).toEqual({ kind: 'enroll', server: 'https://anton.example.com', token: 'abcd1234efgh' });
  });

  it('parses legacy anton://join', () => {
    const r = parsePairingLink('anton://join?server=https%3A%2F%2Fanton.example.com&token=ABCD1234');
    expect(r).toEqual({ kind: 'join', server: 'https://anton.example.com', token: 'ABCD1234' });
  });

  it('parses https universal links', () => {
    const r = parsePairingLink('https://anton.example.com/app/enroll?server=https%3A%2F%2Fanton.example.com&token=abc');
    expect(r?.kind).toBe('enroll');
    expect(r?.token).toBe('abc');
  });

  it('returns null for unrelated URLs', () => {
    expect(parsePairingLink('https://example.com/random')).toBeNull();
    expect(parsePairingLink('not a url')).toBeNull();
  });

  it('returns null when token or server is missing', () => {
    expect(parsePairingLink('anton://enroll?server=https://x.example')).toBeNull();
    expect(parsePairingLink('anton://enroll?token=abc')).toBeNull();
  });

  it('accepts the legacy ?join= alias for token', () => {
    const r = parsePairingLink('anton://join?server=http%3A%2F%2F192.168.1.10%3A3011&join=ABCD');
    expect(r?.token).toBe('ABCD');
  });
});

describe('validateServerUrl', () => {
  it('accepts https URLs', () => {
    expect(() => validateServerUrl('https://anton.example.com')).not.toThrow();
    expect(() => validateServerUrl('https://anton.example.com:8443/foo')).not.toThrow();
  });

  it('accepts http only on same-device loopback', () => {
    expect(() => validateServerUrl('http://localhost:3011')).not.toThrow();
    expect(() => validateServerUrl('http://127.0.0.1')).not.toThrow();
    expect(() => validateServerUrl('http://[::1]:3011')).not.toThrow();
  });

  it('rejects http on LAN / .local — networked plaintext requires HTTPS (or mesh)', () => {
    // Previously allowed; tightened so "all networked data encrypted in transit"
    // holds. A cert-less local instance should pair with a mesh QR instead.
    expect(() => validateServerUrl('http://192.168.1.10')).toThrow(/HTTPS/);
    expect(() => validateServerUrl('http://10.0.0.5:3011')).toThrow(/HTTPS/);
    expect(() => validateServerUrl('http://172.16.0.5')).toThrow(/HTTPS/);
    expect(() => validateServerUrl('http://anton.local')).toThrow(/HTTPS/);
  });

  it('rejects http on public hostnames', () => {
    expect(() => validateServerUrl('http://anton.example.com')).toThrow(/HTTPS/);
    expect(() => validateServerUrl('http://8.8.8.8')).toThrow(/HTTPS/);
  });

  it('rejects unknown protocols', () => {
    expect(() => validateServerUrl('ftp://anton.example.com')).toThrow();
    expect(() => validateServerUrl('javascript:alert(1)')).toThrow();
  });

  it('rejects malformed URLs', () => {
    expect(() => validateServerUrl('')).toThrow();
    expect(() => validateServerUrl('not a url')).toThrow();
  });
});

describe('buildInlinePairingUrl', () => {
  // The mesh QR inlines the whole /enrollment/start response. That response also
  // carries confirmation_code — the six digits the ADMIN reads aloud, and the only
  // out-of-band factor in the pairing ritual. Spreading the response wholesale put
  // the code inside the very artefact it exists to protect: anyone who photographs
  // or swaps the QR gets the code with it, and the server-side gate in
  // app-enrollment-service.completeEnrollment() then waves them through.
  const startResponse = {
    token: 'tok123', nonce: 'nonce123',
    transport: 'mesh' as const,
    relay_endpoints: ['wss://relay.example/ws'],
    instance_display_name: 'Acme ANTON',
    instance_contact_hash: 'ANTON-AAAA-BBBB-CCCC-DDDD',
    requires_confirmation_code: true,
    confirmation_code: '482913',
  };

  function decodePkg(url: string): Record<string, unknown> {
    const enc = new URL(url).searchParams.get('pkg')!;
    const pad = enc.length % 4;
    const b64 = (pad ? enc + '='.repeat(4 - pad) : enc).replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  }

  it('never encodes the out-of-band confirmation code into the QR', () => {
    const url = buildInlinePairingUrl(startResponse, 'anton.example.com');
    expect(url).not.toContain('482913');
    expect(decodePkg(url)).not.toHaveProperty('confirmation_code');
  });

  it('still tells the phone a code will be required', () => {
    // The paired positive — stripping the whole flag would silently turn the
    // OOB gate off in the app's UI instead of just hiding the secret.
    expect(decodePkg(buildInlinePairingUrl(startResponse, 'anton.example.com')))
      .toMatchObject({ requires_confirmation_code: true, token: 'tok123', nonce: 'nonce123' });
  });

  it('carries the rest of the package and the server label, and round-trips', () => {
    const url = buildInlinePairingUrl(startResponse, 'anton.example.com');
    const parsed = parsePairingLink(url);
    expect(parsed?.kind).toBe('enroll');
    expect(parsed?.token).toBe('tok123');
    expect(parsed?.inlinePackage).toMatchObject({
      instance_display_name: 'Acme ANTON',
      relay_endpoints: ['wss://relay.example/ws'],
      server_label: 'anton.example.com',
    });
  });

  it('does not mutate the caller\'s package (the admin UI still shows the code)', () => {
    buildInlinePairingUrl(startResponse, 'anton.example.com');
    expect(startResponse.confirmation_code).toBe('482913');
  });
});

describe('describeInlinePackage', () => {
  it('surfaces who the user would be pairing with', () => {
    expect(describeInlinePackage({
      instance_display_name: 'Acme ANTON',
      instance_contact_hash: 'ANTON-AAAA-BBBB-CCCC-DDDD',
      transport: 'mesh',
      relay_endpoints: ['wss://relay.example:9443/ws'],
      intended_role: 'member',
      requires_confirmation_code: true,
    })).toEqual({
      instanceName: 'Acme ANTON',
      contactHash: 'ANTON-AAAA-BBBB-CCCC-DDDD',
      transport: 'mesh',
      reachVia: 'relay.example:9443',
      requiresCode: true,
      boundRole: 'member',
    });
  });

  it('stays total on a hostile / malformed package', () => {
    // The confirm screen is the last line of defence, so it has to render for
    // exactly the packages that are trying to break it.
    const d = describeInlinePackage({ relay_endpoints: 'not-an-array', endpoints: null, transport: 'ftp' });
    expect(d.instanceName).toBe('Unnamed instance');
    expect(d.transport).toBe('unknown');
    expect(d.reachVia).toBeNull();
    expect(d.requiresCode).toBe(false);
  });

  it('clamps an oversized display name so the Pair/Cancel buttons stay on screen', () => {
    const d = describeInlinePackage({ instance_display_name: 'A'.repeat(5000) });
    expect(d.instanceName.length).toBe(64);
  });

  it('falls back to endpoints when there are no relays', () => {
    expect(describeInlinePackage({
      transport: 'public_https',
      endpoints: { wan: 'https://anton.example.com:8443' },
    }).reachVia).toBe('anton.example.com:8443');
  });
});

describe('encodeBase64UrlJson', () => {
  it('round-trips non-ASCII through parsePairingLink', () => {
    const enc = encodeBase64UrlJson({ token: 't', instance_display_name: 'Ådalens ANTON — 東京' });
    expect(parsePairingLink(`anton://enroll?pkg=${enc}`)?.inlinePackage)
      .toMatchObject({ instance_display_name: 'Ådalens ANTON — 東京' });
  });
});
