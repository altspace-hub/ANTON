/**
 * request-origin.ts — where a request came from, and where a link we send
 * should point.
 *
 * Both questions were answered from the raw request, which is wrong behind a
 * reverse proxy and wrong when the sender controls a header:
 *
 *  - Links in emails (project invitations) were built from the Host header.
 *    Whoever sends the request picks that header, so the owner's mail server
 *    could be made to send a link to any host. publicBaseUrl() reads
 *    APP_PUBLIC_URL (then BASE_URL) and falls back to the request only on a
 *    dev machine where neither is set — the same rule as password-reset links
 *    in routes/auth.ts.
 *
 *  - "Is this caller on this machine?" used req.socket.remoteAddress. Behind a
 *    same-host nginx every visitor's socket is 127.0.0.1, so a loopback-only
 *    endpoint (/metrics, /mcp without MCP_SECRET) was open to the internet.
 *    isLoopbackRequest() now asks both: the socket must be on this machine AND
 *    req.ip (which honours TRUST_PROXY) must be too. req.ip alone was not
 *    enough: with TRUST_PROXY a hop count or `true`, Express trusts whatever
 *    socket connects, so a remote client reaching port 3001 directly could
 *    send `X-Forwarded-For: 127.0.0.1` and be taken for a local one.
 */
import net from 'node:net';

/** APP_PUBLIC_URL (then BASE_URL) when set, never the request's Host header;
 *  the request is the fallback on a dev machine. No trailing slash. */
export function publicBaseUrl(req: { protocol: string; get(name: string): string | undefined }): string {
  const configured = (process.env.APP_PUBLIC_URL || process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  return configured || `${req.protocol}://${req.get('host')}`;
}

/** True for 127.0.0.0/8, ::1 and their IPv4-mapped IPv6 form. */
export function isLoopbackAddress(ip: string | undefined | null): boolean {
  if (!ip) return false;
  const addr = ip.toLowerCase().startsWith('::ffff:') ? ip.slice(7) : ip;
  if (net.isIPv4(addr)) return addr.startsWith('127.');
  return net.isIPv6(addr) && (addr === '::1' || addr === '0:0:0:0:0:0:0:1');
}

/**
 * Whether the client is on this machine: the socket is (so no remote peer
 * chose the forwarded headers), and so is the client after the trusted
 * proxies (so a visitor forwarded by a same-host proxy is not).
 */
export function isLoopbackRequest(req: { ip?: string; socket?: { remoteAddress?: string } }): boolean {
  return isLoopbackAddress(req.socket?.remoteAddress) && isLoopbackAddress(req.ip);
}
