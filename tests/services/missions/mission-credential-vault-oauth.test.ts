/**
 * mission-credential-vault-oauth.test.ts — Wave-3 3A.2.
 *
 * refreshOauthToken() existed with zero callers, so the Gmail pack died
 * after ~1h. These tests lock the pure refresh layer that resolveSecret now
 * drives: the needs-refresh decision predicate, the raw-vs-JSON secret
 * shape, and the token-endpoint response handling (mocked fetch) — incl.
 * the guarantees that failures never throw and never carry token material
 * in the reason.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  OAUTH_REFRESH_SKEW_MS,
  needsOauthRefresh,
  parseOauthSecret,
  serialiseOauthSecret,
  requestOauthTokenRefresh,
} from '../../../server/services/missions/mission-credential-vault.js';

const NOW = Date.parse('2026-06-10T12:00:00.000Z');

function iso(offsetMs: number): string {
  return new Date(NOW + offsetMs).toISOString();
}

const BASE = {
  credential_type: 'oauth2',
  oauth_token_url: 'https://oauth2.googleapis.com/token',
  oauth_expires_at: iso(-1000),
  has_refresh_token: true,
};

describe('needsOauthRefresh (decision predicate)', () => {
  it('true for an oauth2 credential expired or expiring within the 60s skew', () => {
    expect(needsOauthRefresh(BASE, NOW)).toBe(true);
    expect(needsOauthRefresh({ ...BASE, oauth_expires_at: iso(OAUTH_REFRESH_SKEW_MS - 1) }, NOW)).toBe(true);
  });

  it('false when the token is still comfortably valid', () => {
    expect(needsOauthRefresh({ ...BASE, oauth_expires_at: iso(OAUTH_REFRESH_SKEW_MS + 1000) }, NOW)).toBe(false);
  });

  it('false for non-oauth2 credential types regardless of expiry', () => {
    expect(needsOauthRefresh({ ...BASE, credential_type: 'api_key' }, NOW)).toBe(false);
    expect(needsOauthRefresh({ ...BASE, credential_type: 'bearer_token' }, NOW)).toBe(false);
  });

  it('false when the refresh machinery is missing (no token URL / no refresh token)', () => {
    expect(needsOauthRefresh({ ...BASE, oauth_token_url: null }, NOW)).toBe(false);
    expect(needsOauthRefresh({ ...BASE, has_refresh_token: false }, NOW)).toBe(false);
  });

  it('false when the expiry is missing or unparseable (cannot know staleness — let the API call 401 visibly)', () => {
    expect(needsOauthRefresh({ ...BASE, oauth_expires_at: null }, NOW)).toBe(false);
    expect(needsOauthRefresh({ ...BASE, oauth_expires_at: 'not-a-date' }, NOW)).toBe(false);
  });
});

describe('parseOauthSecret / serialiseOauthSecret (secret shape)', () => {
  it('treats a raw token string as the access token', () => {
    const s = parseOauthSecret('ya29.raw-token');
    expect(s).toEqual({ access_token: 'ya29.raw-token', is_json: false, extra: {} });
    expect(serialiseOauthSecret(s, 'ya29.new')).toBe('ya29.new');
  });

  it('extracts access_token + client fields from a JSON-shaped secret', () => {
    const s = parseOauthSecret(JSON.stringify({
      access_token: 'ya29.old', client_id: 'cid.apps', client_secret: 'cs-1', note: 'kept',
    }));
    expect(s.access_token).toBe('ya29.old');
    expect(s.client_id).toBe('cid.apps');
    expect(s.client_secret).toBe('cs-1');
    expect(s.is_json).toBe(true);
    expect(s.extra).toEqual({ note: 'kept' });
  });

  it('re-serialisation preserves client fields + extras with the new access token', () => {
    const s = parseOauthSecret(JSON.stringify({ access_token: 'old', client_id: 'cid', client_secret: 'cs', note: 'kept' }));
    const out = JSON.parse(serialiseOauthSecret(s, 'new-token')) as Record<string, unknown>;
    expect(out).toEqual({ access_token: 'new-token', client_id: 'cid', client_secret: 'cs', note: 'kept' });
  });

  it('JSON without access_token falls back to raw-token semantics (never returns undefined)', () => {
    const blob = JSON.stringify({ token: 'misnamed' });
    const s = parseOauthSecret(blob);
    expect(s.is_json).toBe(false);
    expect(s.access_token).toBe(blob);
  });
});

describe('requestOauthTokenRefresh (mocked fetch)', () => {
  function fetchReturning(status: number, json: unknown): typeof fetch {
    return vi.fn(async () => ({
      status,
      json: async () => json,
    })) as unknown as typeof fetch;
  }

  it('POSTs a form-encoded grant_type=refresh_token body with client credentials when present', async () => {
    const fetchImpl = fetchReturning(200, { access_token: 'fresh', expires_in: 1800 });
    await requestOauthTokenRefresh({
      tokenUrl: 'https://oauth2.googleapis.com/token',
      refreshToken: 'rt-1',
      clientId: 'cid',
      clientSecret: 'cs',
      fetchImpl,
      nowMs: NOW,
    });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('rt-1');
    expect(body.get('client_id')).toBe('cid');
    expect(body.get('client_secret')).toBe('cs');
  });

  it('omits client fields when not stored (public clients)', async () => {
    const fetchImpl = fetchReturning(200, { access_token: 'fresh' });
    await requestOauthTokenRefresh({ tokenUrl: 'https://t/token', refreshToken: 'rt', fetchImpl, nowMs: NOW });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));
    expect(body.has('client_id')).toBe(false);
    expect(body.has('client_secret')).toBe(false);
  });

  it('success: computes the ISO expiry from expires_in and carries a rotated refresh token', async () => {
    const out = await requestOauthTokenRefresh({
      tokenUrl: 'https://t/token', refreshToken: 'rt',
      fetchImpl: fetchReturning(200, { access_token: 'fresh', expires_in: 1800, refresh_token: 'rt-rotated' }),
      nowMs: NOW,
    });
    expect(out).toEqual({
      ok: true,
      access_token: 'fresh',
      expires_at: new Date(NOW + 1800 * 1000).toISOString(),
      refresh_token: 'rt-rotated',
    });
  });

  it('success without expires_in defaults to 3600s; no refresh_token field when not rotated', async () => {
    const out = await requestOauthTokenRefresh({
      tokenUrl: 'https://t/token', refreshToken: 'rt',
      fetchImpl: fetchReturning(200, { access_token: 'fresh' }),
      nowMs: NOW,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.expires_at).toBe(new Date(NOW + 3600 * 1000).toISOString());
      expect(out.refresh_token).toBeUndefined();
    }
  });

  it('non-2xx: returns the HTTP status + OAuth error code — never the token', async () => {
    const out = await requestOauthTokenRefresh({
      tokenUrl: 'https://t/token', refreshToken: 'rt-SECRET',
      fetchImpl: fetchReturning(400, { error: 'invalid_grant', error_description: 'Token revoked' }),
      nowMs: NOW,
    });
    expect(out).toEqual({ ok: false, reason: 'HTTP 400 (invalid_grant)' });
    if (!out.ok) expect(out.reason).not.toContain('rt-SECRET');
  });

  it('2xx with no access_token is a clean failure', async () => {
    const out = await requestOauthTokenRefresh({
      tokenUrl: 'https://t/token', refreshToken: 'rt',
      fetchImpl: fetchReturning(200, { token_type: 'Bearer' }),
      nowMs: NOW,
    });
    expect(out).toEqual({ ok: false, reason: 'token endpoint returned no access_token' });
  });

  it('transport errors never throw — they come back as { ok: false }', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const out = await requestOauthTokenRefresh({
      tokenUrl: 'https://t/token', refreshToken: 'rt', fetchImpl, nowMs: NOW,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('ECONNREFUSED');
  });

  it('non-JSON response bodies do not crash the handler', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 502,
      json: async () => { throw new Error('not json'); },
    })) as unknown as typeof fetch;
    const out = await requestOauthTokenRefresh({
      tokenUrl: 'https://t/token', refreshToken: 'rt', fetchImpl, nowMs: NOW,
    });
    expect(out).toEqual({ ok: false, reason: 'HTTP 502' });
  });
});
