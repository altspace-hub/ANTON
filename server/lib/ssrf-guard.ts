/**
 * SSRF egress guard for outbound HTTP made on behalf of user/admin-configured
 * targets: Specialized Agents REST/webhook connectors, portal peers, missions,
 * and the Mode 2 "Online References" fetcher (url-fetcher.ts). Without this, a
 * URL pointed at an internal address could be abused to pivot into the private
 * network or read cloud metadata (169.254.169.254).
 *
 * Policy:
 *   - Only http/https schemes.
 *   - If ALLOWED_AGENT_HOSTS is set (comma-separated), ONLY those hosts are
 *     permitted (explicit allowlist — strongest posture for locked-down deploys).
 *   - Otherwise, block localhost-family names and any host that is — or resolves
 *     to — a loopback / private / link-local / unique-local / CGNAT / multicast /
 *     reserved address.
 *
 * IP classification works on the 16-byte (or 4-byte) value, not on the textual
 * spelling, so `::1`, `0:0:0:0:0:0:0:1`, `[::ffff:127.0.0.1]` (which WHATWG
 * canonicalises to `[::ffff:7f00:1]`), `::ffff:7f00:1`, `fe80::1%eth0` and the
 * IPv4 embeddings (IPv4-mapped `::ffff:0:0/96`, IPv4-compatible `::/96`, NAT64
 * `64:ff9b::/96`, 6to4 `2002::/16`) all land on the same rules.
 *
 * `isBlockedIp` / `isLoopbackOrLinkLocal` are pure functions (unit-tested);
 * `assertSafeEgressUrl` / `assertSafeLanEgressUrl` do the async DNS resolution
 * and throw on a blocked target.
 */
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const ALLOWED_HOSTS = (process.env.ALLOWED_AGENT_HOSTS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

type Ipv4Octets = readonly [number, number, number, number];

/** Dotted-quad → octets, or null when `ip` is not an IPv4 literal. */
function parseIpv4(ip: string): Ipv4Octets | null {
  if (!net.isIPv4(ip)) return null;
  const [a, b, c, d] = ip.split('.').map(Number);
  return [a, b, c, d];
}

/**
 * IPv6 literal → 16 bytes, or null when `ip` is not an IPv6 literal. Accepts
 * every textual spelling Node's `net.isIPv6` accepts: compressed (`::1`),
 * uncompressed (`0:0:0:0:0:0:0:1`), leading zeros, uppercase, an embedded
 * dotted-quad tail (`::ffff:127.0.0.1`) and a zone id suffix (`fe80::1%eth0`).
 */
function parseIpv6(ip: string): Uint8Array | null {
  let v = ip.toLowerCase();
  const zone = v.indexOf('%');
  if (zone >= 0) v = v.slice(0, zone); // fe80::1%eth0 — the zone id is not part of the address
  if (!net.isIPv6(v)) return null;

  // Rewrite an embedded dotted-quad tail as two hex groups so the group walk below is uniform.
  const lastColon = v.lastIndexOf(':');
  const tail = v.slice(lastColon + 1);
  if (tail.includes('.')) {
    const quad = parseIpv4(tail);
    if (!quad) return null;
    v = `${v.slice(0, lastColon + 1)}${((quad[0] << 8) | quad[1]).toString(16)}:${((quad[2] << 8) | quad[3]).toString(16)}`;
  }

  const [head, rest] = v.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = rest === undefined ? [] : rest ? rest.split(':') : [];
  const fill = rest === undefined ? 0 : 8 - headGroups.length - tailGroups.length;
  if (rest === undefined ? headGroups.length !== 8 : fill < 1) return null;

  const groups = [...headGroups, ...Array<string>(fill).fill('0'), ...tailGroups];
  const bytes = new Uint8Array(16);
  groups.forEach((g, i) => {
    const n = parseInt(g, 16);
    bytes[i * 2] = n >> 8;
    bytes[i * 2 + 1] = n & 0xff;
  });
  return bytes;
}

function isZeroRange(b: Uint8Array, from: number, to: number): boolean {
  for (let i = from; i < to; i++) if (b[i] !== 0) return false;
  return true;
}

/**
 * The IPv4 address an IPv6 address embeds, if it is one of the transition forms
 * that a resolver or a router turns back into IPv4 traffic:
 *   - IPv4-mapped   ::ffff:a.b.c.d  (dotted or hex — both reach the IPv4 stack)
 *   - IPv4-compat   ::a.b.c.d       (deprecated ::/96, still parsed by some stacks)
 *   - NAT64         64:ff9b::a.b.c.d (RFC 6052 well-known prefix)
 *   - 6to4          2002:abcd:efgh:: (RFC 3056 — the IPv4 sits in bytes 2-5)
 * Returns null for a native IPv6 address.
 */
function embeddedIpv4(b: Uint8Array): Ipv4Octets | null {
  if (isZeroRange(b, 0, 10) && b[10] === 0xff && b[11] === 0xff) return [b[12], b[13], b[14], b[15]];
  if (isZeroRange(b, 0, 12)) return [b[12], b[13], b[14], b[15]];
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && isZeroRange(b, 4, 12)) {
    return [b[12], b[13], b[14], b[15]];
  }
  if (b[0] === 0x20 && b[1] === 0x02) return [b[2], b[3], b[4], b[5]];
  return null;
}

/** Loopback / private / link-local / CGNAT / multicast / reserved IPv4. */
function isBlockedIpv4([a, b]: Ipv4Octets): boolean {
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved incl. 255.255.255.255
  return false;
}

/** Unspecified / loopback / link-local IPv4 only (the LAN-tolerant subset). */
function isLoopbackOrLinkLocalIpv4([a, b]: Ipv4Octets): boolean {
  if (a === 0 || a === 127) return true; // unspecified / loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  return false;
}

/**
 * True if `ip` is a loopback / private / link-local / unique-local / site-local /
 * CGNAT / multicast / reserved address, in any IPv4 or IPv6 spelling. Non-IP
 * strings (hostnames) return false — resolve them first.
 */
export function isBlockedIp(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4) return isBlockedIpv4(v4);

  const b = parseIpv6(ip);
  if (!b) return false; // not an IP literal

  if (isZeroRange(b, 0, 15) && (b[15] === 0 || b[15] === 1)) return true; // :: unspecified / ::1 loopback
  const embedded = embeddedIpv4(b);
  if (embedded) return isBlockedIpv4(embedded);
  if ((b[0] & 0xfe) === 0xfc) return true; // unique-local fc00::/7
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // link-local fe80::/10 (fe80–febf)
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true; // site-local fec0::/10 (deprecated, still routable on LANs)
  if (b[0] === 0xff) return true; // multicast ff00::/8
  return false;
}

/** Throws if `rawUrl` is not a safe outbound target. `label` names the caller in messages. */
export async function assertSafeEgressUrl(rawUrl: string, label = 'Connector'): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error(`${label} URL is not a valid URL`);
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`${label} URL scheme not allowed: ${u.protocol}`);
  }

  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase(); // strip IPv6 brackets

  if (ALLOWED_HOSTS.length > 0) {
    if (!ALLOWED_HOSTS.includes(host)) {
      throw new Error(`${label} host is not in ALLOWED_AGENT_HOSTS: ${host}`);
    }
    return; // operator has explicitly trusted this host
  }

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error(`${label} host not allowed: ${host}`);
  }

  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error(`${label} target is a private/link-local address: ${host}`);
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error(`Cannot resolve ${label.toLowerCase()} host: ${host}`);
  }
  if (addresses.length === 0) {
    throw new Error(`Cannot resolve ${label.toLowerCase()} host: ${host}`);
  }
  for (const a of addresses) {
    if (isBlockedIp(a.address)) {
      throw new Error(`${label} host ${host} resolves to a private/link-local address`);
    }
  }
}

/**
 * True if `ip` is loopback or link-local (incl. 169.254.169.254 cloud metadata).
 * Narrower than `isBlockedIp`: it does NOT flag private LAN ranges
 * (10/172.16/192.168/CGNAT/ULA), so LAN-trusted paths (portal peer proxying) can
 * still reach private LAN peers while never reaching loopback or cloud metadata.
 * Same byte-level classification, so every spelling and IPv4 embedding is covered.
 */
export function isLoopbackOrLinkLocal(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4) return isLoopbackOrLinkLocalIpv4(v4);

  const b = parseIpv6(ip);
  if (!b) return false;

  if (isZeroRange(b, 0, 15) && (b[15] === 0 || b[15] === 1)) return true; // :: / ::1
  const embedded = embeddedIpv4(b);
  if (embedded) return isLoopbackOrLinkLocalIpv4(embedded);
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // link-local fe80::/10
  return false;
}

/**
 * Like `assertSafeEgressUrl` but ALLOWS private LAN ranges + `.local` mDNS names
 * (for LAN peer proxying, e.g. Portals reaching a peer ANTON on 192.168.x). Still
 * blocks loopback and link-local/metadata. Honors ALLOWED_AGENT_HOSTS allowlist.
 */
export async function assertSafeLanEgressUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error('URL is not valid');
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`URL scheme not allowed: ${u.protocol}`);
  }

  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (ALLOWED_HOSTS.length > 0) {
    if (!ALLOWED_HOSTS.includes(host)) {
      throw new Error(`Host is not in ALLOWED_AGENT_HOSTS: ${host}`);
    }
    return;
  }

  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new Error(`Host not allowed (loopback): ${host}`);
  }

  if (net.isIP(host)) {
    if (isLoopbackOrLinkLocal(host)) throw new Error(`Target is a loopback/link-local address: ${host}`);
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error(`Cannot resolve host: ${host}`);
  }
  if (addresses.length === 0) {
    throw new Error(`Cannot resolve host: ${host}`);
  }
  for (const a of addresses) {
    if (isLoopbackOrLinkLocal(a.address)) {
      throw new Error(`Host ${host} resolves to a loopback/link-local address`);
    }
  }
}
