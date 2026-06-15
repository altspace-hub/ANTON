/**
 * pairing-url.ts — pure URL parsing + validation helpers.
 *
 * Lives apart from enrollment.ts so it can be imported without dragging
 * in @noble/ed25519 (heavy dep, not always present in test runners).
 * enrollment.ts re-exports them for backwards compatibility.
 *
 * Three QR formats supported:
 *   1. anton://enroll?pkg=<base64url-json>     ← mesh, fully self-contained
 *   2. anton://enroll?server=<base>&token=<t>  ← public_https, requires server fetch
 *   3. anton://join?server=&token=             ← legacy invitation (back-compat)
 *
 * Format (1) makes mesh pairing work with no direct phone→instance HTTP — the
 * package the server returned is encoded inline in the QR, the phone routes
 * the completion call through the relay using the pinned x_pk.
 */

export interface ParsedPairingLink {
  kind: 'enroll' | 'join';
  /** May be empty when an inline package is present (mesh pairs don't need
   *  a directly-reachable server URL). */
  server: string;
  /** May be empty when an inline package is present — the package carries the token. */
  token: string;
  /** Set when the QR encoded the full enrollment package as base64url JSON.
   *  When present, the phone skips fetchEnrollment() and uses this directly. */
  inlinePackage?: Record<string, unknown>;
}

/**
 * Accepts:
 *   • anton://enroll?pkg=<base64url-json>
 *   • anton://enroll?server=&token= (modern public_https)
 *   • anton://join?server=&token= (legacy invitation)
 *   • https://…/enroll?... universal links
 * Returns null if the input doesn't match.
 */
export function parsePairingLink(raw: string): ParsedPairingLink | null {
  try {
    const u = new URL(raw);
    const isAnton = u.protocol === 'anton:';
    const isHttp = u.protocol === 'http:' || u.protocol === 'https:';
    if (!isAnton && !isHttp) return null;
    const path = isAnton ? (u.host || u.pathname.replace(/^\/+/, '')) : u.pathname;
    const kind: 'enroll' | 'join' = path.includes('enroll') ? 'enroll' : 'join';

    // Format (1): inline package
    const pkgEnc = u.searchParams.get('pkg');
    if (pkgEnc && kind === 'enroll') {
      const pkg = decodeBase64UrlJson(pkgEnc);
      if (!pkg || typeof pkg !== 'object') return null;
      const obj = pkg as Record<string, unknown>;
      const token = typeof obj.token === 'string' ? obj.token : '';
      // For inline packages the server field is informational only — the
      // phone never directly fetches from it. We keep whatever the package
      // claims so the UI can show "paired with anton.example.com".
      const server = (typeof obj.server_label === 'string' ? obj.server_label : '');
      return { kind, server, token, inlinePackage: obj };
    }

    // Formats (2) and (3): server + token in querystring
    const server = u.searchParams.get('server') ?? '';
    const token = u.searchParams.get('token') ?? u.searchParams.get('join') ?? '';
    if (!server || !token) return null;
    return { kind, server: decodeURIComponent(server), token };
  } catch { return null; }
}

/**
 * Validates a direct-fetch server URL. HTTPS is required for any host reached
 * over a network; plain HTTP is permitted ONLY for same-device loopback
 * (developer / in-browser testing), which never crosses the wire.
 *
 * A LAN instance without a TLS certificate must pair with a mesh QR
 * (anton://enroll?pkg=…) — that path is end-to-end encrypted through the relay
 * and makes no direct HTTP call, so it bypasses this check entirely. This keeps
 * the app's promise that all *networked* user data is encrypted in transit
 * (previously LAN HTTP sent pairing tokens / queries / photos in cleartext).
 *
 * Throws an Error with a user-friendly message on failure.
 */
export function validateServerUrl(url: string): void {
  if (!url) throw new Error('Server URL is required');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('Invalid server URL'); }
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol === 'http:') {
    // Loopback only: localhost / 127.0.0.1 / ::1 stay on the same device and
    // never hit the network, so plain HTTP there cannot be intercepted. Any
    // other host (LAN IP, *.local, public) over HTTP would expose the pairing
    // token, queries, photos and messages in cleartext — require HTTPS (or the
    // encrypted mesh QR for a cert-less local instance).
    const host = parsed.hostname;
    const isLoopback =
      host === 'localhost' || host === '127.0.0.1' ||
      host === '::1' || host === '[::1]';
    if (isLoopback) return;
    throw new Error('This connection must use HTTPS. For a local instance without a certificate, pair with a mesh QR code (it stays encrypted).');
  }
  throw new Error('Server URL must use HTTPS');
}

/**
 * Encode a JSON-serialisable value as URL-safe base64 (no padding).
 * Used for embedding the enrollment package in the pairing QR.
 */
export function encodeBase64UrlJson(value: unknown): string {
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json);
  // btoa expects a binary string. Build one byte at a time so non-ASCII
  // characters in the JSON survive the round trip.
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeBase64UrlJson(s: string): unknown {
  try {
    const pad = s.length % 4;
    const padded = pad ? s + '='.repeat(4 - pad) : s;
    const bin = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch {
    return null;
  }
}
