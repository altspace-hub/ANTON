/**
 * device-attestation.test.ts — caching, dev-mode escape, refresh
 * triggers, failure handling.
 *
 * Spec: docs/PAY_DEVICE_ATTESTATION_SPEC.md
 *
 * vitest runs in jsdom — `Capacitor.isNativePlatform()` returns
 * false, so the native plugin path is never exercised here. The
 * tests focus on the contract the JS layer guarantees:
 *
 *   - Returns a session token from the cache when fresh.
 *   - Calls POST /attest with the dev-mode token in browser-like envs.
 *   - Honours the headroom + min-remaining caching policy.
 *   - Clears the cache via invalidateCachedAttestation.
 *   - makeAttestationTokenProvider returns null (rather than throws)
 *     on any underlying failure, so the SDK's no-header branch fires
 *     and the server gets to return 401 + WWW-Authenticate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSecure, removeSecure, setSecure } from '../secure-store';

// Mock the enrollment install-id resolver to be deterministic across runs.
const FAKE_INSTALL_ID = '11111111-1111-1111-1111-111111111111';
vi.mock('../enrollment', () => ({
  getOrCreateInstallId: vi.fn(async () => FAKE_INSTALL_ID),
}));

import {
  getAttestationToken, invalidateCachedAttestation,
  makeAttestationTokenProvider, AttestationError,
} from '../device-attestation';

const ENDPOINT = 'https://test.example.com';
const API_KEY = 'a'.repeat(64);
const SESSION_KEY = 'fc.attestation.session_token';
const EXPIRES_KEY = 'fc.attestation.expires_at';

async function clearAll(): Promise<void> {
  await removeSecure(SESSION_KEY);
  await removeSecure(EXPIRES_KEY);
}

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function mockFetch(
  response: { ok: boolean; status?: number; body?: unknown },
): { fn: ReturnType<typeof vi.fn>; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 400),
      json: async () => response.body ?? {},
    } as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return { fn, calls };
}

describe('device-attestation', () => {
  beforeEach(async () => {
    await clearAll();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await clearAll();
  });

  // ── Happy paths ──────────────────────────────────────────────────

  it('cache miss → POST /attest with dev-mode token → caches session', async () => {
    const { calls } = mockFetch({
      ok: true,
      body: { session_token: 'sess-1', expires_in: 86400,
              issued_at: 'now', verdict: 'DEV_NO_ATTESTATION' },
    });
    const tok = await getAttestationToken(ENDPOINT, API_KEY);
    expect(tok).toBe('sess-1');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${ENDPOINT}/attest`);
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body.play_integrity_token).toBe(`DEV_NO_ATTESTATION:${FAKE_INSTALL_ID}`);
    expect(typeof body.nonce).toBe('string');
    expect(body.nonce.length).toBeGreaterThanOrEqual(16);
    // X-API-Key forwarded
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers['X-API-Key']).toBe(API_KEY);
    // Session + expiry written to secure-store
    expect(await getSecure(SESSION_KEY)).toBe('sess-1');
    const exp = Number(await getSecure(EXPIRES_KEY));
    expect(exp).toBeGreaterThan(Date.now() + 86_000_000); // ~24h ahead
  });

  it('cache hit (fresh) → returns cached token without calling /attest', async () => {
    await setSecure(SESSION_KEY, 'sess-cached');
    await setSecure(EXPIRES_KEY, String(Date.now() + 12 * 3600 * 1000));
    const { fn } = mockFetch({ ok: true, body: {} });
    const tok = await getAttestationToken(ENDPOINT, API_KEY);
    expect(tok).toBe('sess-cached');
    expect(fn).not.toHaveBeenCalled();
  });

  it('cache hit (expired) → falls through to a fresh /attest', async () => {
    await setSecure(SESSION_KEY, 'sess-stale');
    await setSecure(EXPIRES_KEY, String(Date.now() - 5000));
    const { calls } = mockFetch({
      ok: true,
      body: { session_token: 'sess-fresh', expires_in: 86400,
              issued_at: 'now', verdict: 'DEV_NO_ATTESTATION' },
    });
    const tok = await getAttestationToken(ENDPOINT, API_KEY);
    expect(tok).toBe('sess-fresh');
    expect(calls).toHaveLength(1);
    expect(await getSecure(SESSION_KEY)).toBe('sess-fresh');
  });

  it('cache hit (in headroom) → returns cached + schedules background refresh', async () => {
    // 4 minutes left — well inside the 5-minute headroom but above
    // the 1-minute floor, so the foreground call returns the cached
    // token and a background refresh is scheduled.
    await setSecure(SESSION_KEY, 'sess-warm');
    await setSecure(EXPIRES_KEY, String(Date.now() + 4 * 60 * 1000));
    const { fn } = mockFetch({
      ok: true,
      body: { session_token: 'sess-fresher', expires_in: 86400,
              issued_at: 'now', verdict: 'DEV_NO_ATTESTATION' },
    });
    const tok = await getAttestationToken(ENDPOINT, API_KEY);
    expect(tok).toBe('sess-warm'); // foreground returns the cached one
    // Background refresh fires eventually — flush a microtask + event loop tick
    await new Promise(r => setTimeout(r, 0));
    expect(fn).toHaveBeenCalled();
    // And the cache now holds the fresh one.
    expect(await getSecure(SESSION_KEY)).toBe('sess-fresher');
  });

  // ── Errors ────────────────────────────────────────────────────────

  it('throws AttestationError on 401 from /attest', async () => {
    mockFetch({ ok: false, status: 401,
                body: { detail: 'dev-mode attestation token rejected (production)' } });
    await expect(getAttestationToken(ENDPOINT, API_KEY))
      .rejects.toBeInstanceOf(AttestationError);
    // Cache remains empty
    expect(await getSecure(SESSION_KEY)).toBeNull();
  });

  it('throws AttestationError on 501 (server not configured)', async () => {
    mockFetch({ ok: false, status: 501,
                body: { detail: 'Play Integrity verification not configured' } });
    try {
      await getAttestationToken(ENDPOINT, API_KEY);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AttestationError);
      expect((e as AttestationError).retryable).toBe(false);
    }
  });

  // ── Cache management ─────────────────────────────────────────────

  it('invalidateCachedAttestation clears both secure-store rows', async () => {
    await setSecure(SESSION_KEY, 'sess');
    await setSecure(EXPIRES_KEY, '1');
    await invalidateCachedAttestation();
    expect(await getSecure(SESSION_KEY)).toBeNull();
    expect(await getSecure(EXPIRES_KEY)).toBeNull();
  });

  // ── Provider semantics ──────────────────────────────────────────

  it('makeAttestationTokenProvider returns null on /attest failure (does not throw)', async () => {
    mockFetch({ ok: false, status: 500 });
    const provider = makeAttestationTokenProvider(ENDPOINT, API_KEY);
    const tok = await provider();
    expect(tok).toBeNull();
  });

  it('makeAttestationTokenProvider returns the session token on success', async () => {
    mockFetch({
      ok: true,
      body: { session_token: 'provider-sess', expires_in: 86400,
              issued_at: 'now', verdict: 'DEV_NO_ATTESTATION' },
    });
    const provider = makeAttestationTokenProvider(ENDPOINT, API_KEY);
    const tok = await provider();
    expect(tok).toBe('provider-sess');
  });

  it('makeAttestationTokenProvider reuses cache across calls', async () => {
    const { fn } = mockFetch({
      ok: true,
      body: { session_token: 'shared-sess', expires_in: 86400,
              issued_at: 'now', verdict: 'DEV_NO_ATTESTATION' },
    });
    const provider = makeAttestationTokenProvider(ENDPOINT, API_KEY);
    expect(await provider()).toBe('shared-sess');
    expect(await provider()).toBe('shared-sess');
    expect(await provider()).toBe('shared-sess');
    expect(fn).toHaveBeenCalledTimes(1); // only one /attest round-trip
  });

  it('cache survives a malformed expires_at row by re-attesting', async () => {
    await setSecure(SESSION_KEY, 'sess-survives');
    await setSecure(EXPIRES_KEY, 'not-a-number');
    mockFetch({
      ok: true,
      body: { session_token: 'sess-replacement', expires_in: 86400,
              issued_at: 'now', verdict: 'DEV_NO_ATTESTATION' },
    });
    const tok = await getAttestationToken(ENDPOINT, API_KEY);
    expect(tok).toBe('sess-replacement');
  });
});
