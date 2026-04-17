// Tests for the URL parsers + server-URL validator used by JoinPage and
// the deep-link / share intent handlers.

import { describe, it, expect } from 'vitest';
// Import from pairing-url.ts directly so the test runs without the
// runtime @noble/ed25519 dependency that identity.ts pulls in.
import { parsePairingLink, validateServerUrl } from '../../src/app/services/pairing-url';

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

  it('accepts http on localhost / 127.0.0.1', () => {
    expect(() => validateServerUrl('http://localhost:3011')).not.toThrow();
    expect(() => validateServerUrl('http://127.0.0.1')).not.toThrow();
  });

  it('accepts http on private LAN ranges', () => {
    expect(() => validateServerUrl('http://192.168.1.10')).not.toThrow();
    expect(() => validateServerUrl('http://10.0.0.5:3011')).not.toThrow();
    expect(() => validateServerUrl('http://172.16.0.5')).not.toThrow();
    expect(() => validateServerUrl('http://anton.local')).not.toThrow();
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
