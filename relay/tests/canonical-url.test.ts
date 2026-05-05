import { describe, it, expect } from 'vitest';
import { canonicalizeRelayUrl, CanonicalUrlError } from '../src/canonical-url.js';

describe('canonicalizeRelayUrl — happy path (matches §4.2.1 examples)', () => {
  it('lowercases scheme and host, drops default port + trailing slash', () => {
    expect(canonicalizeRelayUrl('wss://Relay.Example.com:443/')).toBe('wss://relay.example.com');
  });

  it('preserves a non-default port', () => {
    expect(canonicalizeRelayUrl('wss://r1.openexpert.org:8443')).toBe('wss://r1.openexpert.org:8443');
  });

  it('handles host without trailing slash', () => {
    expect(canonicalizeRelayUrl('wss://r1.openexpert.org')).toBe('wss://r1.openexpert.org');
  });

  it('lowercases mixed-case bare host', () => {
    expect(canonicalizeRelayUrl('wss://R1.OPENEXPERT.ORG')).toBe('wss://r1.openexpert.org');
  });

  it('punycodes an IDN host', () => {
    // Note: WHATWG URL parser handles IDN to ASCII automatically.
    // 中国 → xn--fiqs8s (CJK example domain part).
    const out = canonicalizeRelayUrl('wss://Relay.中国.example/');
    expect(out).toBe('wss://relay.xn--fiqs8s.example');
  });

  it('preserves a bracketed IPv6 literal and drops default port', () => {
    expect(canonicalizeRelayUrl('wss://[2001:db8::1]:443/')).toBe('wss://[2001:db8::1]');
  });

  it('preserves a non-default port on an IPv6 literal', () => {
    expect(canonicalizeRelayUrl('wss://[2001:db8::1]:9999')).toBe('wss://[2001:db8::1]:9999');
  });

  it('preserves an IPv4 literal as-is', () => {
    expect(canonicalizeRelayUrl('wss://192.0.2.10:8443')).toBe('wss://192.0.2.10:8443');
  });

  it('canonicalizes an explicit :443 to no port', () => {
    expect(canonicalizeRelayUrl('wss://relay.example.com:443')).toBe('wss://relay.example.com');
  });

  it('is idempotent — canonical-of-canonical is canonical', () => {
    const once = canonicalizeRelayUrl('wss://Relay.Example.com:443/');
    const twice = canonicalizeRelayUrl(once);
    expect(twice).toBe(once);
  });
});

describe('canonicalizeRelayUrl — rejects (every rule has a negative case)', () => {
  it('rejects ws:// scheme (cleartext WebSocket)', () => {
    expect(() => canonicalizeRelayUrl('ws://relay.example.com')).toThrow(CanonicalUrlError);
  });

  it('rejects http:// scheme', () => {
    expect(() => canonicalizeRelayUrl('http://relay.example.com')).toThrow(CanonicalUrlError);
  });

  it('rejects https:// scheme (must be wss for WebSocket)', () => {
    expect(() => canonicalizeRelayUrl('https://relay.example.com')).toThrow(CanonicalUrlError);
  });

  it('rejects userinfo (username only)', () => {
    expect(() => canonicalizeRelayUrl('wss://user@relay.example.com')).toThrow(CanonicalUrlError);
  });

  it('rejects userinfo (username + password)', () => {
    expect(() => canonicalizeRelayUrl('wss://user:pw@relay.example.com')).toThrow(CanonicalUrlError);
  });

  it('rejects a non-empty path', () => {
    expect(() => canonicalizeRelayUrl('wss://relay.example.com/api')).toThrow(CanonicalUrlError);
  });

  it('rejects a query string', () => {
    expect(() => canonicalizeRelayUrl('wss://relay.example.com?foo=bar')).toThrow(CanonicalUrlError);
  });

  it('rejects a fragment', () => {
    expect(() => canonicalizeRelayUrl('wss://relay.example.com#anchor')).toThrow(CanonicalUrlError);
  });

  it('rejects an unparseable URL', () => {
    expect(() => canonicalizeRelayUrl('not a url')).toThrow(CanonicalUrlError);
    expect(() => canonicalizeRelayUrl('')).toThrow(CanonicalUrlError);
  });

  it('rejects a URL with no host', () => {
    // Some URL inputs parse to empty host (e.g. mailto:); enforce.
    expect(() => canonicalizeRelayUrl('wss://')).toThrow(CanonicalUrlError);
  });

  it('error message names the actual reason', () => {
    try {
      canonicalizeRelayUrl('http://relay.example.com');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as CanonicalUrlError).reason).toContain('scheme');
      expect((e as CanonicalUrlError).input).toBe('http://relay.example.com');
    }
  });
});

describe('canonicalizeRelayUrl — bytewise interop guarantees', () => {
  it('produces pure ASCII output (no non-ASCII bytes)', () => {
    const out = canonicalizeRelayUrl('wss://relay.中国.example/');
    for (let i = 0; i < out.length; i++) {
      expect(out.charCodeAt(i)).toBeLessThanOrEqual(0x7E);
    }
  });

  it('two semantically equivalent inputs canonicalize to byte-identical output', () => {
    const a = canonicalizeRelayUrl('wss://Relay.Example.com:443/');
    const b = canonicalizeRelayUrl('wss://relay.example.com');
    const c = canonicalizeRelayUrl('wss://RELAY.EXAMPLE.COM:443');
    expect(a).toBe(b);
    expect(b).toBe(c);
    // Buffer-level equality
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);
    expect(aBytes).toEqual(bBytes);
  });
});
