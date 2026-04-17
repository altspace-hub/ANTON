/**
 * pairing-url.ts — pure URL parsing + validation helpers.
 *
 * Lives apart from enrollment.ts so it can be imported without dragging
 * in @noble/ed25519 (heavy dep, not always present in test runners).
 * enrollment.ts re-exports them for backwards compatibility.
 */

export interface ParsedPairingLink {
  kind: 'enroll' | 'join';
  server: string;
  token: string;
}

/**
 * Accepts the modern `anton://enroll?server=&token=` and the legacy
 * `anton://join?server=&token=`. Also `https://…/enroll?server=&token=`
 * universal links. Returns null if the input doesn't match.
 */
export function parsePairingLink(raw: string): ParsedPairingLink | null {
  try {
    const u = new URL(raw);
    const isAnton = u.protocol === 'anton:';
    const isHttp = u.protocol === 'http:' || u.protocol === 'https:';
    if (!isAnton && !isHttp) return null;
    const path = isAnton ? (u.host || u.pathname.replace(/^\/+/, '')) : u.pathname;
    const kind: 'enroll' | 'join' = path.includes('enroll') ? 'enroll' : 'join';
    const server = u.searchParams.get('server') ?? '';
    const token = u.searchParams.get('token') ?? u.searchParams.get('join') ?? '';
    if (!server || !token) return null;
    return { kind, server: decodeURIComponent(server), token };
  } catch { return null; }
}

/**
 * Validates a server URL — HTTPS only, or HTTP on local-dev / LAN.
 * Throws an Error with a user-friendly message on failure.
 */
export function validateServerUrl(url: string): void {
  if (!url) throw new Error('Server URL is required');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Invalid server URL'); }
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol === 'http:') {
    const host = parsed.hostname;
    const isLocal =
      host === 'localhost' || host === '127.0.0.1' ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /\.local$/.test(host);
    if (isLocal) return;
    throw new Error('Server URL must use HTTPS (HTTP only allowed on LAN)');
  }
  throw new Error('Server URL must use HTTPS');
}
