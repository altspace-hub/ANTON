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

// Wave 2 extension: classification is byte-level, so every textual spelling and
// every IPv4 embedding lands on the same rules, and the ranges the prefix-string
// version missed (fe81–febf, fec0::/10, ff00::/8, ::/96, NAT64, 6to4, 224/4, 240/4)
// are covered.
describe('isBlockedIp — spellings and embeddings', () => {
  it('blocks every spelling of :: and ::1', () => {
    for (const ip of [
      '0:0:0:0:0:0:0:1', '0000:0000:0000:0000:0000:0000:0000:0001', '::0', '0:0:0:0:0:0:0:0',
      'fe80::1%eth0', 'FE80::1', 'FD00::1',
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('blocks the whole fe80::/10 link-local block, fec0::/10 site-local and ff00::/8 multicast', () => {
    for (const ip of ['fe81::1', 'fe9f::1', 'feaf::1', 'febf::1', 'fec0::1', 'feff::1', 'ff02::1', 'ff0e::1']) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('allows the IPv6 neighbours of those blocks', () => {
    for (const ip of ['fe7f::1', 'fe00::1', 'fb00::1', 'fe::1', '2001:db8::1', '2606:4700::1111']) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it('unwraps IPv4-mapped (any spelling), IPv4-compatible, NAT64 and 6to4 embeddings', () => {
    for (const ip of [
      '0:0:0:0:0:ffff:7f00:1', '0000:0000:0000:0000:0000:ffff:127.0.0.1', '::ffff:100.64.0.1', '::ffff:6440:1',
      '::127.0.0.1', '::7f00:1', '::a9fe:a9fe',
      '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '64:ff9b::10.0.0.1',
      '2002:7f00:1::1', '2002:a9fe:a9fe::', '2002:c0a8:101::1', '2002:0a00:1::',
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it('keeps embeddings of PUBLIC IPv4 allowed', () => {
    for (const ip of ['::ffff:8.8.8.8', '::ffff:808:808', '::8.8.8.8', '64:ff9b::808:808', '2002:808:808::1']) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it('blocks IPv4 multicast, reserved and broadcast; allows the last public octet', () => {
    for (const ip of ['224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255']) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
    expect(isBlockedIp('223.255.255.255')).toBe(false);
  });

  it('returns false for a hostname (not an IP literal)', () => {
    expect(isBlockedIp('example.com')).toBe(false);
    expect(isBlockedIp('')).toBe(false);
  });
});

describe('assertSafeEgressUrl — bracketed IPv6 and alternative IPv4 spellings', () => {
  it.each([
    'http://[::ffff:127.0.0.1]/', 'http://[::ffff:169.254.169.254]/', 'http://[fd00::1]/', 'http://[fc00::1]/',
    'http://[::]/', 'http://[0:0:0:0:0:0:0:1]/', 'http://[fe81::1]/', 'http://[fec0::1]/', 'http://[::127.0.0.1]/',
    'http://[64:ff9b::7f00:1]/', 'http://[2002:7f00:1::1]/', 'http://[ff02::1]/',
    'http://100.64.0.1/', 'http://224.0.0.1/', 'http://255.255.255.255/',
    'http://0x7f000001/', 'http://2130706433/', 'http://127.1/', 'http://017700000001/',
  ])('rejects %s', async (url) => {
    await expect(assertSafeEgressUrl(url)).rejects.toThrow();
  });

  it.each(['http://[2001:4860:4860::8888]/', 'http://[64:ff9b::808:808]/', 'https://1.1.1.1/', 'http://[::ffff:8.8.8.8]/'])(
    'allows public literal %s',
    async (url) => {
      await expect(assertSafeEgressUrl(url)).resolves.toBeUndefined();
    },
  );

  it('the optional label only changes the message prefix', async () => {
    await expect(assertSafeEgressUrl('http://127.0.0.1/', 'Online reference')).rejects.toThrow(/^Online reference target/);
    await expect(assertSafeEgressUrl('http://127.0.0.1/')).rejects.toThrow(/^Connector target/);
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

  it('classifies spellings and embeddings the same way as isBlockedIp, minus the LAN ranges', () => {
    for (const ip of ['0:0:0:0:0:0:0:1', '::ffff:7f00:1', '::127.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::', '2002:a9fe:a9fe::', 'fe9f::1', 'febf::1']) {
      expect(isLoopbackOrLinkLocal(ip), ip).toBe(true);
    }
    // LAN-side embeddings and site-local/multicast stay reachable on the LAN path.
    for (const ip of ['2002:c0a8:101::', '::ffff:192.168.1.10', '64:ff9b::10.0.0.5', 'fec0::1', 'ff02::1']) {
      expect(isLoopbackOrLinkLocal(ip), ip).toBe(false);
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
