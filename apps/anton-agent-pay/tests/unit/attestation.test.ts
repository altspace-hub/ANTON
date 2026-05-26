/**
 * attestation.test.ts — unit tests for the desktop-attestation primitive.
 *
 * Covers:
 *   install-keys.ts     — identity generation, idempotency, signing,
 *                         tamper detection.
 *   code-signature.ts   — cached, DEV-UNSIGNED fallback on unsigned
 *                         (we don't try to verify the signed paths here
 *                         since they need codesign/powershell/gpg
 *                         present + a signed binary).
 *   attestation/index.ts — buildAttestationPacket payload shape, signature
 *                          length, b64url no-pad encoding; attestForChainCall
 *                          session cache behaviour, error mapping.
 *
 * All tests run against InMemoryStorageBackend + injected
 * codeSignature / sign / fetch — no filesystem, no network, no
 * shelling out.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';

import {
  _resetInstallIdentity, getInstallIdentity, signWithAttestationKey,
} from '../../src/main/attestation/install-keys.js';
import {
  _resetCodeSignatureCache, getCodeSignature,
} from '../../src/main/attestation/code-signature.js';
import {
  _resetSessionCache, attestForChainCall, buildAttestationPacket,
} from '../../src/main/attestation/index.js';
import { InMemoryStorageBackend } from '../../src/main/wallet/storage.js';

beforeEach(() => {
  _resetSessionCache();
  _resetCodeSignatureCache();
});

// ── install-keys ────────────────────────────────────────────────

describe('install-keys', () => {
  it('generates a new identity on first call and is idempotent thereafter', async () => {
    const s = new InMemoryStorageBackend();
    const a = await getInstallIdentity(s);
    expect(a.installId).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.pubHex).toMatch(/^[0-9a-f]{64}$/);
    const b = await getInstallIdentity(s);
    expect(b.installId).toBe(a.installId);
    expect(b.pubHex).toBe(a.pubHex);
  });

  it('regenerates after _resetInstallIdentity', async () => {
    const s = new InMemoryStorageBackend();
    const a = await getInstallIdentity(s);
    await _resetInstallIdentity(s);
    const b = await getInstallIdentity(s);
    expect(b.installId).not.toBe(a.installId);
    expect(b.pubHex).not.toBe(a.pubHex);
  });

  it('signs with the install key in a way that verifies under the public key', async () => {
    const s = new InMemoryStorageBackend();
    const id = await getInstallIdentity(s);
    const msg = new TextEncoder().encode('hello attestation');
    const sig = await signWithAttestationKey(s, msg);
    expect(sig.length).toBe(64);
    const pubBytes = hexToBytes(id.pubHex);
    expect(ed25519.verify(sig, msg, pubBytes)).toBe(true);
  });

  it('refuses to use storage where pub does not match priv (tamper)', async () => {
    const s = new InMemoryStorageBackend();
    await getInstallIdentity(s);
    // Corrupt the stored pubkey — derived-pub-vs-stored-pub check
    // should trip on the next signing attempt.
    await s.set('install.attestation.pub_hex', 'f'.repeat(64));
    await expect(
      signWithAttestationKey(s, new Uint8Array([1, 2, 3])),
    ).rejects.toThrow(/does not match derived pubkey/);
  });

  it('signWithAttestationKey rejects when identity has not been generated yet', async () => {
    const s = new InMemoryStorageBackend();
    await expect(
      signWithAttestationKey(s, new Uint8Array([1])),
    ).rejects.toThrow(/attestation key missing/);
  });
});

// ── code-signature ──────────────────────────────────────────────

describe('code-signature', () => {
  it('returns a well-formed CodeSignature in all envs (DEV-UNSIGNED fallback OK)', () => {
    const cs = getCodeSignature();
    // Subject should mention either a CN or DEV UNSIGNED.
    expect(cs.subject).toMatch(/^CN=/);
    // Thumbprint MUST be 64 lowercase hex chars (matches Bahnhof's THUMBPRINT_RE).
    expect(cs.thumbprintHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('caches the result across calls (same instance)', () => {
    const a = getCodeSignature();
    const b = getCodeSignature();
    expect(a).toBe(b);
  });

  it('regenerates after _resetCodeSignatureCache', () => {
    const a = getCodeSignature();
    _resetCodeSignatureCache();
    const b = getCodeSignature();
    // Object identity differs after reset (but content may match if
    // the platform path is deterministic — for DEV-UNSIGNED the
    // thumbprint includes random bytes so it should differ).
    expect(b).not.toBe(a);
    if (a.subject.includes('DEV UNSIGNED')) {
      expect(b.thumbprintHex).not.toBe(a.thumbprintHex);
    }
  });
});

// ── buildAttestationPacket ──────────────────────────────────────

describe('buildAttestationPacket', () => {
  it('produces a parseable DESKTOP_V1 token verifiable under the install pubkey', async () => {
    const s = new InMemoryStorageBackend();
    const id = await getInstallIdentity(s);
    const { token, payloadBytes } = await buildAttestationPacket('nonce-1', {
      storage: s,
      endpoint: 'unused',
      apiKey: 'unused',
      codeSignature: () => ({ subject: 'CN=Test', thumbprintHex: 'a'.repeat(64) }),
      appVersion: '0.0.1',
      now: () => 1748097600000,
    });
    expect(token).toMatch(/^DESKTOP_V1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    const [, payloadB64, sigB64] = token.split(':');
    const decoded = JSON.parse(
      Buffer.from(padB64u(payloadB64), 'base64').toString('utf8'),
    );
    expect(decoded.install_id).toBe(id.installId);
    expect(decoded.platform).toBe(process.platform);
    expect(decoded.app_version).toBe('0.0.1');
    expect(decoded.code_signature_subject).toBe('CN=Test');
    expect(decoded.code_signature_thumbprint).toBe('a'.repeat(64));
    expect(decoded.nonce).toBe('nonce-1');
    expect(decoded.ts_ms).toBe(1748097600000);
    // Signature verifies against the install pubkey, over the raw
    // payload bytes the token transports.
    const sigBytes = new Uint8Array(Buffer.from(padB64u(sigB64), 'base64'));
    expect(sigBytes.length).toBe(64);
    const pubBytes = hexToBytes(id.pubHex);
    expect(ed25519.verify(sigBytes, payloadBytes, pubBytes)).toBe(true);
  });

  it('accepts an external sign callback (tests can use their own key)', async () => {
    const s = new InMemoryStorageBackend();
    const sk = randomBytes(32);
    const pk = ed25519.getPublicKey(sk);
    const { token, payloadBytes } = await buildAttestationPacket('nonce-x', {
      storage: s,
      endpoint: 'unused',
      apiKey: 'unused',
      codeSignature: () => ({ subject: 'CN=Test', thumbprintHex: 'b'.repeat(64) }),
      identity: async () => ({ installId: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', pubHex: bytesToHex(pk) }),
      sign: async (m) => ed25519.sign(m, sk),
      appVersion: '0.0.1',
      now: () => 1748097600000,
    });
    const [, , sigB64] = token.split(':');
    const sigBytes = new Uint8Array(Buffer.from(padB64u(sigB64), 'base64'));
    expect(ed25519.verify(sigBytes, payloadBytes, pk)).toBe(true);
  });

  it('throws if the sign callback returns the wrong number of bytes', async () => {
    const s = new InMemoryStorageBackend();
    await expect(buildAttestationPacket('nonce', {
      storage: s,
      endpoint: 'unused',
      apiKey: 'unused',
      codeSignature: () => ({ subject: 'CN', thumbprintHex: 'a'.repeat(64) }),
      identity: async () => ({ installId: '00000000-0000-0000-0000-000000000000', pubHex: '0'.repeat(64) }),
      sign: async () => new Uint8Array(63),  // one byte short
    })).rejects.toThrow(/signature must be 64 bytes/);
  });
});

// ── attestForChainCall ─────────────────────────────────────────

describe('attestForChainCall', () => {
  it('POSTs to /attest with the right shape and caches the result', async () => {
    const s = new InMemoryStorageBackend();
    const calls: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
    const fetch = stubFetch((url, init) => {
      calls.push({
        url,
        body: JSON.parse(String(init?.body)),
        headers: flattenHeaders(init?.headers),
      });
      return jsonOk({
        session_token: 'sess-tok-1234567890abcdefghij',
        expires_in: 86400,
        issued_at: '2026-05-24T12:00:00Z',
        verdict: 'DESKTOP|linux|0.0.1|aaaaaaaa',
      });
    });
    const sess = await attestForChainCall({
      storage: s,
      endpoint: 'https://rpc.test/',
      apiKey: 'install-bearer',
      fetch,
      codeSignature: () => ({ subject: 'CN=Test', thumbprintHex: 'a'.repeat(64) }),
      appVersion: '0.0.1',
      nonce: () => 'fixed-nonce-32-chars-aaaaaaaaaaaa',
    });
    expect(sess.sessionToken).toBe('sess-tok-1234567890abcdefghij');
    expect(sess.verdict).toBe('DESKTOP|linux|0.0.1|aaaaaaaa');
    expect(sess.expiresAtMs).toBeGreaterThan(Date.now() + 86400_000 - 1000);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://rpc.test/attest');
    expect(calls[0].headers['x-api-key']).toBe('install-bearer');
    // Body shape per AttestRequest.
    const body = calls[0].body as Record<string, string>;
    expect(body.nonce).toBe('fixed-nonce-32-chars-aaaaaaaaaaaa');
    expect(body.play_integrity_token).toMatch(/^DESKTOP_V1:/);

    // Second call uses the cache — fetch is not invoked again.
    const sess2 = await attestForChainCall({
      storage: s,
      endpoint: 'https://rpc.test/',
      apiKey: 'install-bearer',
      fetch,
      codeSignature: () => ({ subject: 'CN=Test', thumbprintHex: 'a'.repeat(64) }),
    });
    expect(sess2.sessionToken).toBe(sess.sessionToken);
    expect(calls).toHaveLength(1);
  });

  it('surfaces a non-200 /attest with the response detail in the error', async () => {
    const s = new InMemoryStorageBackend();
    const fetch = stubFetch(() => textRes(401, 'attestation rejected by floor check'));
    await expect(attestForChainCall({
      storage: s,
      endpoint: 'https://rpc.test/',
      apiKey: 'install-bearer',
      fetch,
      codeSignature: () => ({ subject: 'CN=Test', thumbprintHex: 'a'.repeat(64) }),
      nonce: () => 'fixed-nonce-32-chars-aaaaaaaaaaaa',
    })).rejects.toThrow(/401 .* attestation rejected by floor check/);
  });

  it('throws if /attest returns 200 but with malformed body', async () => {
    const s = new InMemoryStorageBackend();
    const fetch = stubFetch(() => jsonOk({ verdict: 'DESKTOP|x|y|z' }));  // missing session_token
    await expect(attestForChainCall({
      storage: s,
      endpoint: 'https://rpc.test/',
      apiKey: 'install-bearer',
      fetch,
      codeSignature: () => ({ subject: 'CN=Test', thumbprintHex: 'a'.repeat(64) }),
      nonce: () => 'fixed-nonce-32-chars-aaaaaaaaaaaa',
    })).rejects.toThrow(/missing session_token or expires_in/);
  });
});

// ── helpers ────────────────────────────────────────────────────

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function stubFetch(handler: (url: string, init?: RequestInit) => Response): FetchFn {
  return async (input, init) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  };
}

function jsonOk(body: unknown): Response {
  const text = JSON.stringify(body);
  return {
    ok: true, status: 200, statusText: 'OK',
    json: async () => JSON.parse(text),
    text: async () => text,
    headers: new Headers({ 'Content-Type': 'application/json' }),
  } as unknown as Response;
}

function textRes(status: number, body: string): Response {
  return {
    ok: status < 400, status, statusText: status === 401 ? 'Unauthorized' : '',
    json: async () => { throw new Error('not json'); },
    text: async () => body,
    headers: new Headers(),
  } as unknown as Response;
}

function flattenHeaders(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (h instanceof Headers) {
    h.forEach((v, k) => { out[k.toLowerCase()] = v; });
  } else if (Array.isArray(h)) {
    for (const [k, v] of h) out[k.toLowerCase()] = v;
  } else {
    for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
  }
  return out;
}

function padB64u(s: string): string {
  // Re-pad a urlsafe-base64-no-pad string so Node's Buffer.from can read it.
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const remainder = padded.length % 4;
  return remainder === 0 ? padded : padded + '='.repeat(4 - remainder);
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < h.length; i += 2) out[i / 2] = parseInt(h.slice(i, i + 2), 16);
  return out;
}
