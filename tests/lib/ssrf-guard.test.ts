import { describe, it, expect } from 'vitest';
import { isBlockedIp, assertSafeEgressUrl, isLoopbackOrLinkLocal, assertSafeLanEgressUrl } from '../../server/lib/ssrf-guard';

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

  it('allows public IPv6 and unwraps IPv4-mapped IPv6 (dotted + hex)', () => {
    expect(isBlockedIp('2001:4860:4860::8888')).toBe(false);
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    // Hex IPv4-mapped form must be unwrapped too (the bypass the review caught):
    expect(isBlockedIp('::ffff:7f00:1')).toBe(true);     // 127.0.0.1
    expect(isBlockedIp('::ffff:a9fe:a9fe')).toBe(true);  // 169.254.169.254 metadata
    expect(isBlockedIp('::FFFF:7F00:1')).toBe(true);     // uppercase
    expect(isBlockedIp('::ffff:0808:0808')).toBe(false); // 8.8.8.8 public — still allowed
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

  it('rejects hex IPv4-mapped IPv6 metadata/loopback literals', async () => {
    await expect(assertSafeEgressUrl('http://[::ffff:a9fe:a9fe]/latest')).rejects.toThrow();
    await expect(assertSafeEgressUrl('http://[::ffff:7f00:1]/x')).rejects.toThrow();
  });

  it('rejects a malformed URL', async () => {
    await expect(assertSafeEgressUrl('not a url')).rejects.toThrow();
  });
});

// LAN-aware variant (Portals peer proxying): blocks loopback/link-local/metadata
// but ALLOWS private LAN ranges, since LAN portals legitimately reach 192.168.x peers.
describe('isLoopbackOrLinkLocal', () => {
  it('blocks loopback + link-local/metadata only', () => {
    for (const ip of ['127.0.0.1', '0.0.0.0', '169.254.169.254', '::1', 'fe80::1']) {
      expect(isLoopbackOrLinkLocal(ip)).toBe(true);
    }
  });

  it('ALLOWS private LAN ranges (the portal LAN feature)', () => {
    for (const ip of ['192.168.1.10', '10.0.0.5', '172.16.0.1', '100.64.0.1', 'fc00::1']) {
      expect(isLoopbackOrLinkLocal(ip)).toBe(false);
    }
  });
});

describe('assertSafeLanEgressUrl', () => {
  it('allows a private LAN peer (192.168.x) but blocks loopback + metadata', async () => {
    await expect(assertSafeLanEgressUrl('http://192.168.1.50:3001')).resolves.toBeUndefined();
    await expect(assertSafeLanEgressUrl('http://10.0.0.9/api')).resolves.toBeUndefined();
    await expect(assertSafeLanEgressUrl('http://127.0.0.1/x')).rejects.toThrow();
    await expect(assertSafeLanEgressUrl('http://localhost/x')).rejects.toThrow();
    await expect(assertSafeLanEgressUrl('http://169.254.169.254/latest')).rejects.toThrow();
    await expect(assertSafeLanEgressUrl('http://[::1]/x')).rejects.toThrow();
    // hex IPv4-mapped form must also be blocked on the LAN path:
    await expect(assertSafeLanEgressUrl('http://[::ffff:7f00:1]/x')).rejects.toThrow();
    await expect(assertSafeLanEgressUrl('http://[::ffff:a9fe:a9fe]/latest')).rejects.toThrow();
  });

  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafeLanEgressUrl('file:///etc/passwd')).rejects.toThrow();
  });
});
