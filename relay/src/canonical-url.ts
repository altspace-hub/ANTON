/**
 * canonical-url.ts — implements the §4.2.1 canonicalization algorithm.
 *
 * The canonical URL appears in three places that MUST agree byte-for-byte:
 *   1. The Noise prologue (§4.2)
 *   2. The HELLO_INSTANCE `relay_url` field (§3.2 step 3)
 *   3. The relay's self-known canonical URL (config-supplied)
 *
 * If two implementations differ on canonicalization, handshake fails (MAC_FAIL)
 * and chat doesn't work. So this module is interop-critical.
 *
 * Rules (§4.2.1):
 *   1. Parse as URL (WHATWG). Reject on parse fail.
 *   2. Scheme MUST be `wss` (lowercase).
 *   3. Host:
 *      - IPv4 literal: preserved as-is
 *      - [bracketed IPv6 literal]: lowercased, brackets preserved
 *      - Domain: ASCII-lowercased and IDNA-ToASCII (Punycode)
 *   4. Port: omit if 443, else include `:port`
 *   5. Userinfo: stripped; reject if input had any
 *   6. Path: empty string only (or single `/` which we strip); else reject
 *   7. Query: reject if present
 *   8. Fragment: reject if present
 *
 * No path component appears in the canonical output (no trailing slash).
 */

export class CanonicalUrlError extends Error {
  constructor(public readonly reason: string, public readonly input: string) {
    super(`Cannot canonicalize "${input}": ${reason}`);
    this.name = 'CanonicalUrlError';
  }
}

/**
 * Canonicalize a relay URL per spec §4.2.1.
 *
 * Throws CanonicalUrlError on any rule violation. Callers MUST treat a
 * thrown error as "reject this URL" — never substitute a default.
 *
 * @param input  the URL to canonicalize
 * @param opts.allowInsecure  if true, accept ws:// in addition to wss://.
 *   ONLY for tests + behind-reverse-proxy mode. Production callers MUST
 *   leave this false (the default). The relay server forwards its
 *   `insecure` config flag through here for that purpose.
 */
export function canonicalizeRelayUrl(input: string, opts: { allowInsecure?: boolean } = {}): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new CanonicalUrlError('invalid URL syntax', input);
  }

  // Step 2 — scheme.
  const allowed = opts.allowInsecure ? ['wss:', 'ws:'] : ['wss:'];
  if (!allowed.includes(url.protocol)) {
    throw new CanonicalUrlError(
      `scheme "${url.protocol.replace(':', '')}" not allowed; only ${allowed.map(s => s.replace(':', '')).join(' or ')}`,
      input,
    );
  }

  // Step 5 — userinfo.
  if (url.username !== '' || url.password !== '') {
    throw new CanonicalUrlError('userinfo is forbidden in relay URLs', input);
  }

  // Step 7 — query.
  if (url.search !== '') {
    throw new CanonicalUrlError('query string is forbidden', input);
  }

  // Step 8 — fragment.
  if (url.hash !== '') {
    throw new CanonicalUrlError('fragment is forbidden', input);
  }

  // Step 6 — path.
  // WHATWG URL gives us '/' for an "empty" path on a hierarchical scheme,
  // and the path is "/" + segments otherwise. Allow "" and "/" only.
  if (url.pathname !== '' && url.pathname !== '/') {
    throw new CanonicalUrlError(
      `path "${url.pathname}" not allowed; canonical form has no path`,
      input,
    );
  }

  // Step 3 — host. URL.hostname is already IDNA-encoded by the WHATWG URL
  // parser AND already ASCII-lowercased for domains. IPv4 stays as-is.
  // For IPv6, Node returns the hostname WITH brackets (e.g. "[2001:db8::1]")
  // while some browser implementations return without — normalize by stripping
  // leading/trailing brackets, then re-applying after we've decided whether
  // it's an IPv6 literal. Reject empty host.
  let hostname = url.hostname;
  if (hostname === '') {
    throw new CanonicalUrlError('empty host', input);
  }
  // Strip wrapping brackets if present (Node) so the inner check + lowercase
  // both work on the bare address. We re-bracket below.
  let isIPv6 = false;
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
    isIPv6 = true;
  } else if (hostname.includes(':')) {
    // Defensive: a bare hostname with ':' must be an IPv6 literal.
    isIPv6 = true;
  }

  // The URL parser's IDNA conversion is non-strict in browsers but Node's
  // implementation follows IDNA2008 ToASCII rules for non-ASCII inputs.
  // Defensive check: ensure the canonical hostname is pure ASCII; non-ASCII
  // would mean the parser handed back a Unicode label which we don't accept.
  for (let i = 0; i < hostname.length; i++) {
    const c = hostname.charCodeAt(i);
    if (c > 0x7E || c < 0x20) {
      throw new CanonicalUrlError(
        `non-ASCII byte in canonical host (got 0x${c.toString(16)}); IDNA must produce Punycode`,
        input,
      );
    }
  }

  // Step 4 — port. WHATWG URL gives "" for default port.
  // For wss:, default is 443. For ws: (insecure mode), default is 80.
  const defaultPort = url.protocol === 'ws:' ? '80' : '443';
  const port = url.port === '' || url.port === defaultPort ? '' : `:${url.port}`;

  const hostPart = isIPv6 ? `[${hostname}]` : hostname;
  const scheme = url.protocol.replace(':', '');

  return `${scheme}://${hostPart}${port}`;
}

/**
 * Convenience: validate without canonicalizing — return the canonical form
 * if valid, throw otherwise. (Same as canonicalizeRelayUrl; kept as a name
 * that reads better at call sites that just want validation.)
 */
export function validateRelayUrl(input: string): string {
  return canonicalizeRelayUrl(input);
}
