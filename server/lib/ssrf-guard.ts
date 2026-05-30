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

/** True if `ip` is a loopback/private/link-local/unique-local/CGNAT address. */
export function isBlockedIp(ip: string): boolean {
  const v = ip.replace(/^::ffff:/i, '').toLowerCase(); // unwrap IPv4-mapped IPv6

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
