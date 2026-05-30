import { describe, it, expect } from 'vitest';
import { isBlockedIp, assertSafeEgressUrl } from '../../server/lib/ssrf-guard';

describe('isBlockedIp', () => {
  it('blocks loopback / private / link-local / CGNAT IPv4', () => {
    for (const ip of [
      '127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '172.31.255.255',
      '169.254.169.254', '100.64.0.1', '0.0.0.0',
    ]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  it('allows public IPv4 (incl. near-miss ranges)', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '192.169.0.1', '100.63.0.1']) {
      expect(isBlockedIp(ip)).toBe(false);
    }
  });

  it('blocks loopback / unique-local / link-local IPv6', () => {
    for (const ip of ['::1', 'fc00::1', 'fd12:3456::1', 'fe80::1']) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  it('allows public IPv6 and unwraps IPv4-mapped IPv6', () => {
    expect(isBlockedIp('2001:4860:4860::8888')).toBe(false);
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
  });
});

describe('assertSafeEgressUrl', () => {
  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafeEgressUrl('ftp://example.com')).rejects.toThrow();
    await expect(assertSafeEgressUrl('file:///etc/passwd')).rejects.toThrow();
  });

  it('rejects localhost-family hostnames', async () => {
    await expect(assertSafeEgressUrl('http://localhost/x')).rejects.toThrow();
    await expect(assertSafeEgressUrl('http://svc.internal/x')).rejects.toThrow();
  });

  it('rejects private / metadata IP literals', async () => {
    await expect(assertSafeEgressUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow();
    await expect(assertSafeEgressUrl('http://10.0.0.5:8080/admin')).rejects.toThrow();
    await expect(assertSafeEgressUrl('http://[::1]/x')).rejects.toThrow();
  });

  it('allows a public IP literal', async () => {
    await expect(assertSafeEgressUrl('https://8.8.8.8/x')).resolves.toBeUndefined();
  });

  it('rejects a malformed URL', async () => {
    await expect(assertSafeEgressUrl('not a url')).rejects.toThrow();
  });
});
