/**
 * SSRF egress guard for outbound HTTP made on behalf of user/admin-configured
 * connectors (Specialized Agents REST/webhook connectors). Without this, an
 * agent connector pointed at an internal address could be abused to pivot into
 * the private network or read cloud metadata (169.254.169.254).
 *
 * Policy:
 *   - Only http/https schemes.
 *   - If ALLOWED_AGENT_HOSTS is set (comma-separated), ONLY those hosts are
 *     permitted (explicit allowlist — strongest posture for locked-down deploys).
 *   - Otherwise, block localhost-family names and any host that is — or resolves
 *     to — a loopback / private / link-local / unique-local / CGNAT address.
 *
 * `isBlockedIp` is a pure function (unit-tested); `assertSafeEgressUrl` does the
 * async DNS resolution and throws on a blocked target.
 */
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const ALLOWED_HOSTS = (process.env.ALLOWED_AGENT_HOSTS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/**
 * Normalize an IP literal: fully unwrap IPv4-mapped IPv6 — both the dotted form
 * (`::ffff:127.0.0.1`) AND the hex form (`::ffff:7f00:1`) — to dotted IPv4 so the
 * IPv4 rules apply. Without the hex unwrap, `::ffff:a9fe:a9fe` (=169.254.169.254)
 * and `::ffff:7f00:1` (=127.0.0.1) slip past the IPv4/IPv6 checks (they parse as
 * neither once the `::ffff:` prefix is naively stripped) and reach metadata/loopback.
 */
function normalizeIp(ip: string): string {
  const v = ip.toLowerCase();
  const dotted = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1];
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
  }
  return v;
}

/** True if `ip` is a loopback/private/link-local/unique-local/CGNAT address. */
export function isBlockedIp(ip: string): boolean {
  const v = normalizeIp(ip); // unwrap IPv4-mapped IPv6 (dotted + hex)

  if (net.isIPv4(v)) {
    const [a, b] = v.split('.').map(Number);
    if (a === 0) return true; // 0.0.0.0/8 "this host"
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254 cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    return false;
  }

  if (net.isIPv6(v)) {
    if (v === '::1' || v === '::') return true; // loopback / unspecified
    if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique-local fc00::/7
    if (v.startsWith('fe80')) return true; // link-local
    return false;
  }

  return false; // not an IP literal
}

/** Throws if `rawUrl` is not a safe outbound target. */
export async function assertSafeEgressUrl(rawUrl: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error('Connector URL is not a valid URL');
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Connector URL scheme not allowed: ${u.protocol}`);
  }

  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase(); // strip IPv6 brackets

  if (ALLOWED_HOSTS.length > 0) {
    if (!ALLOWED_HOSTS.includes(host)) {
      throw new Error(`Connector host is not in ALLOWED_AGENT_HOSTS: ${host}`);
    }
    return; // operator has explicitly trusted this host
  }

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error(`Connector host not allowed: ${host}`);
  }

  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error(`Connector target is a private/link-local address: ${host}`);
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error(`Cannot resolve connector host: ${host}`);
  }
  for (const a of addresses) {
    if (isBlockedIp(a.address)) {
      throw new Error(`Connector host ${host} resolves to a private/link-local address`);
    }
  }
}

/**
 * True if `ip` is loopback or link-local (incl. 169.254.169.254 cloud metadata).
 * Narrower than `isBlockedIp`: it does NOT flag private LAN ranges
 * (10/172.16/192.168/CGNAT), so LAN-trusted paths (portal peer proxying) can
 * still reach private LAN peers while never reaching loopback or cloud metadata.
 */
export function isLoopbackOrLinkLocal(ip: string): boolean {
  const v = normalizeIp(ip); // unwrap IPv4-mapped IPv6 (dotted + hex)
  if (net.isIPv4(v)) {
    const [a, b] = v.split('.').map(Number);
    if (a === 0 || a === 127) return true; // unspecified / loopback
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    return false;
  }
  if (net.isIPv6(v)) {
    if (v === '::1' || v === '::') return true; // loopback / unspecified
    if (v.startsWith('fe80')) return true; // link-local
    return false;
  }
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
  for (const a of addresses) {
    if (isLoopbackOrLinkLocal(a.address)) {
      throw new Error(`Host ${host} resolves to a loopback/link-local address`);
    }
  }
}
