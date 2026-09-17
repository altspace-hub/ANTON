/**
 * http-limits.ts — per-source budgets for the relay's HTTP surface.
 *
 * The WebSocket path has been rate-limited since Phase 1.8 (limits.ts,
 * consumed at every HELLO and every ENVELOPE). The HTTP handler in
 * server.ts was not: it dispatched /healthz, /metrics, /admin,
 * /comm/push/* and the whole /v1/* registry with no limiter anywhere,
 * and registry/routes.ts is a plain path switch that adds none either.
 * admin-login.ts's header comment promised this limiter ("Step 6's HTTP
 * rate limiter — added in a separate cut"); the cut was never landed.
 * Until it did, POST /v1/admin/login was an unbounded online oracle
 * against a single shared operator password with no counter, no delay
 * and no lockout — and an operator token approves portals into the
 * public registry that every ANTON instance resolves against. The same
 * absence left /v1/portals/search (a full-text query with a
 * window-function COUNT over the whole portals table) as a free
 * DB-load amplifier.
 *
 * Three classes, because one budget cannot serve all three callers:
 *
 *   'admin_login'  Strict. A handful of tries, then a trickle. The refill
 *                  rate IS the lockout: after the burst is spent an
 *                  attacker gets a few guesses per minute per source,
 *                  while an operator who fat-fingers the password twice
 *                  never notices.
 *   'general'      Generous. Bounds a flood of /v1/* and /comm/push/*
 *                  without ever touching a real ANTON instance resolving
 *                  a portal or a phone registering a push token.
 *   'exempt'       /healthz, /metrics, /admin and the legal pages. Caddy,
 *                  the uptime monitor and Prometheus MUST NOT be
 *                  throttled — a relay that 429s its own health check
 *                  looks down and gets restarted. These handlers are
 *                  constant-cost, hit neither the DB nor a secret, and
 *                  are the surface an operator debugs an outage with.
 *
 * SOURCE ADDRESS BEHIND A REVERSE PROXY — the load-bearing part.
 * The relay is documented to run behind Caddy on the same box (README,
 * Dockerfile, docker-compose.yml, RUNBOOK "curl localhost:8443/healthz
 * to bypass Caddy"), so req.socket.remoteAddress is 127.0.0.1 for every
 * production request. Keying buckets on that alone would collapse the
 * entire internet into one bucket, and the limiter would throttle
 * legitimate traffic globally the moment anybody floods — a worse bug
 * than the one being fixed. So when, and ONLY when, the direct peer is a
 * trusted proxy do we read X-Forwarded-For. Trusting that header
 * unconditionally is the opposite failure: any attacker could set it and
 * mint a fresh bucket per request, which is the same as having no
 * limiter at all. Do not "simplify" either half away.
 *
 * We take the RIGHTMOST X-Forwarded-For entry: that is the one our own
 * trusted proxy appended, i.e. the address it actually saw. Entries to
 * its left were supplied by the client and are attacker-writable.
 */

import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import { ipBucket } from './limits.js';

/** Which budget a request draws from. See the header comment. */
export type HttpLimitClass = 'admin_login' | 'general' | 'exempt';

/**
 * Classify a request URL (path + query) into a budget class.
 *
 * Path-prefix based on purpose: the operator-password endpoint is its own
 * class, everything that reaches the registry DB or the push-token store
 * shares the general budget, and the ops/static routes are exempt.
 */
export function classifyHttpPath(url: string): HttpLimitClass {
  const qIndex = url.indexOf('?');
  const path = qIndex >= 0 ? url.slice(0, qIndex) : url;
  if (path === '/v1/admin/login' || path === '/v1/admin/login/') return 'admin_login';
  if (path.startsWith('/v1/') || path.startsWith('/comm/push/')) return 'general';
  return 'exempt';
}

/**
 * Parse RELAY_TRUSTED_PROXY_IPS (comma-separated literal addresses) into a
 * set. Loopback is always trusted and does not need listing; this is for
 * a proxy that runs on a different host. Invalid entries are dropped
 * rather than throwing — a typo in an ops env var must not stop the relay
 * from booting, and the consequence of a dropped entry is a *stricter*
 * limiter (that proxy's XFF is ignored), never a laxer one.
 */
export function parseTrustedProxyIps(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!raw) return out;
  for (const part of raw.split(',')) {
    const ip = normalizeIp(part.trim());
    if (ip) out.add(ip);
  }
  return out;
}

/**
 * Resolve the address to rate-limit a request against. Returns null when
 * no usable address exists (socket already gone) — the caller buckets
 * those together rather than letting them through unlimited.
 */
export function httpSourceIp(
  req: Pick<IncomingMessage, 'headers' | 'socket'>,
  trustedProxyIps: ReadonlySet<string>,
): string | null {
  const peer = normalizeIp(req.socket?.remoteAddress ?? '');
  if (!peer) return null;
  // Untrusted direct peer: it IS the client, and its own X-Forwarded-For
  // header is just something it typed. Ignore the header entirely.
  if (!isLoopback(peer) && !trustedProxyIps.has(peer)) return peer;

  const header = req.headers['x-forwarded-for'];
  // Node gives an array when the header appeared more than once; the last
  // occurrence is the one closest to us, same rule as the rightmost entry.
  const raw = Array.isArray(header) ? header[header.length - 1] : header;
  if (!raw) return peer;
  const parts = raw.split(',');
  for (let i = parts.length - 1; i >= 0; i--) {
    const ip = normalizeIp(stripPort(parts[i]!.trim()));
    if (ip) return ip;
  }
  return peer;
}

/**
 * Rate-limit bucket key for an HTTP request: the same /32-or-/64 bucketing
 * limits.ts already applies on the WS path, so an IPv6 attacker can't walk
 * their /64 for a fresh bucket per request.
 */
export function httpBucketKey(
  req: Pick<IncomingMessage, 'headers' | 'socket'>,
  trustedProxyIps: ReadonlySet<string>,
): string {
  const ip = httpSourceIp(req, trustedProxyIps);
  if (!ip) return 'unknown';
  try {
    return ipBucket(ip);
  } catch {
    // ipBucket throws on anything that isn't an IP literal. normalizeIp
    // already validated, so this is defensive — share one bucket rather
    // than fall open.
    return 'unknown';
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Validate + canonicalize an address literal. IPv4-mapped IPv6
 * ("::ffff:192.0.2.1") is unwrapped so a client buckets identically
 * whether it arrives over a v4 or a dual-stack socket. Returns null for
 * anything that is not an IP literal — never a best guess.
 */
function normalizeIp(addr: string): string | null {
  if (!addr) return null;
  // Strip an IPv6 zone identifier ("fe80::1%eth0").
  const sansZone = addr.includes('%') ? addr.split('%')[0]! : addr;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(sansZone);
  const candidate = mapped ? mapped[1]! : sansZone;
  return isIP(candidate) !== 0 ? candidate : null;
}

function isLoopback(ip: string): boolean {
  return ip === '::1' || ip.startsWith('127.');
}

/**
 * Drop a trailing port from an X-Forwarded-For entry. Some proxies write
 * "203.0.113.7:51514" or "[2001:db8::1]:51514". A bare IPv6 address has
 * several colons, so only a single colon is treated as a port separator.
 */
function stripPort(entry: string): string {
  if (entry.startsWith('[')) {
    const close = entry.indexOf(']');
    return close > 0 ? entry.slice(1, close) : entry;
  }
  const firstColon = entry.indexOf(':');
  if (firstColon > 0 && entry.indexOf(':', firstColon + 1) === -1) {
    return entry.slice(0, firstColon);
  }
  return entry;
}
