// Tests for the Companion App FCM dispatch (server/services/app-push-service.ts).
// Covers the content-free payload builder + the credential gate (no creds →
// graceful no-op, never a throw). No real network calls — fetch is mocked.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  buildFcmMessage,
  loadFcmConfig,
  createAppPushService,
  type PushPayload,
} from '../../server/services/app-push-service';
import type { DatabaseAdapter } from '../../server/db/database';

const PAYLOAD: PushPayload = {
  title: 'Approval needed',
  event_id: 'evt_abc123',
  severity: 'high',
  category: 'approval',
  deep_link: '/approvals/evt_abc123',
};

// ── buildFcmMessage — content-free payload contract ──────────────────────

describe('buildFcmMessage', () => {
  it('carries only opaque routing fields — never confidential content', () => {
    const msg = buildFcmMessage('tok-1', PAYLOAD, null);
    expect(msg.message.token).toBe('tok-1');
    // Title is the only human-readable string; it is a localised label, not content.
    expect(msg.message.notification).toEqual({ title: 'Approval needed' });
    expect(msg.message.data).toEqual({
      event_id: 'evt_abc123',
      severity: 'high',
      category: 'approval',
      deep_link: '/approvals/evt_abc123',
    });
    // No body, no sender, no recipient, no message text anywhere.
    const json = JSON.stringify(msg);
    expect(json).not.toContain('body');
  });

  it('omits optional fields when absent', () => {
    const msg = buildFcmMessage('tok-2', { title: 'X', event_id: 'e1', severity: 'low' }, null);
    expect(msg.message.data).toEqual({ event_id: 'e1', severity: 'low' });
  });

  it('maps high/critical severity to high android priority, else normal', () => {
    expect(buildFcmMessage('t', { ...PAYLOAD, severity: 'critical' }, null).message.android.priority).toBe('high');
    expect(buildFcmMessage('t', { ...PAYLOAD, severity: 'high' }, null).message.android.priority).toBe('high');
    expect(buildFcmMessage('t', { ...PAYLOAD, severity: 'normal' }, null).message.android.priority).toBe('normal');
    expect(buildFcmMessage('t', { ...PAYLOAD, severity: 'low' }, null).message.android.priority).toBe('normal');
  });

  it('threads the topic through as a collapse_key', () => {
    expect(buildFcmMessage('t', PAYLOAD, 'radar').message.android.collapse_key).toBe('radar');
    expect(buildFcmMessage('t', PAYLOAD, null).message.android.collapse_key).toBeUndefined();
  });
});

// ── loadFcmConfig — env gate ─────────────────────────────────────────────

describe('loadFcmConfig', () => {
  it('returns null when FCM_SERVICE_ACCOUNT_JSON is absent', () => {
    expect(loadFcmConfig({})).toBeNull();
  });

  it('returns null when the inline JSON is missing required fields', () => {
    expect(loadFcmConfig({ FCM_SERVICE_ACCOUNT_JSON: '{"client_email":"a@b.c"}' })).toBeNull();
  });

  it('parses inline JSON and prefers FCM_PROJECT_ID override', () => {
    const sa = JSON.stringify({ client_email: 'a@b.c', private_key: 'k', project_id: 'sa-proj' });
    expect(loadFcmConfig({ FCM_SERVICE_ACCOUNT_JSON: sa })?.projectId).toBe('sa-proj');
    expect(loadFcmConfig({ FCM_SERVICE_ACCOUNT_JSON: sa, FCM_PROJECT_ID: 'override' })?.projectId).toBe('override');
  });
});

// ── dispatch — credential gate (no creds → no-op, not a throw) ───────────

function makeDb(tokens: Array<Record<string, unknown>>): DatabaseAdapter {
  return {
    // listTokensForUser uses db.all; dispatch's last_used_at update uses db.run.
    all: vi.fn(async () => tokens),
    get: vi.fn(async () => undefined),
    run: vi.fn(async () => undefined),
  } as unknown as DatabaseAdapter;
}

describe('dispatch — FCM credential gate', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.APP_GATEWAY_PUSH = 'true';
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.APP_GATEWAY_PUSH;
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    vi.restoreAllMocks();
  });

  it('no FCM creds → fcm token is a graceful no-op (never a throw, never a network call)', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const db = makeDb([{ id: 'tk1', platform: 'fcm', token: 'dev-token', environment: 'production', topic: null }]);

    const svc = createAppPushService(db);
    const res = await svc.dispatch('user-1', PAYLOAD);

    // No throw, dispatch reported the token as handled, and we never hit the network.
    expect(res.failed).toBe(0);
    expect(res.succeeded).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('with FCM creds → mints a token then POSTs the v1 message (mocked fetch, no real network)', async () => {
    // Real RSA key so the JWT signing path actually exercises.
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'svc@proj.iam.gserviceaccount.com',
      private_key: pem,
      project_id: 'my-proj',
    });

    const calls: string[] = [];
    const fetchSpy = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'at-123', expires_in: 3600 }), { status: 200 });
      }
      return new Response('{}', { status: 200 }); // fcm send ok
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const db = makeDb([{ id: 'tk1', platform: 'fcm', token: 'dev-token', environment: 'production', topic: null }]);
    const svc = createAppPushService(db);
    const res = await svc.dispatch('user-1', PAYLOAD);

    expect(res.succeeded).toBe(1);
    expect(res.failed).toBe(0);
    expect(calls.some((u) => u.includes('oauth2.googleapis.com'))).toBe(true);
    expect(calls.some((u) => u.includes('fcm.googleapis.com/v1/projects/my-proj/messages:send'))).toBe(true);
  });

  it('FCM 404 UNREGISTERED → disables the token and records a failure', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'svc@proj.iam.gserviceaccount.com',
      private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      project_id: 'my-proj',
    });
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url.includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }), { status: 200 });
      }
      return new Response('UNREGISTERED', { status: 404 });
    }) as unknown as typeof fetch;

    const db = makeDb([{ id: 'tk1', platform: 'fcm', token: 'stale', environment: 'production', topic: null }]);
    const runSpy = db.run as unknown as ReturnType<typeof vi.fn>;
    const svc = createAppPushService(db);
    const res = await svc.dispatch('user-1', PAYLOAD);

    expect(res.failed).toBe(1);
    expect(res.succeeded).toBe(0);
    // The stale token was disabled.
    expect(runSpy.mock.calls.some((c: unknown[]) => String(c[0]).includes('SET enabled = FALSE'))).toBe(true);
  });

  it('apns token → no-op (iOS fast-follow), never throws', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    const db = makeDb([{ id: 'tk-ios', platform: 'apns', token: 'apns-tok', environment: 'production', topic: null }]);
    const svc = createAppPushService(db);
    const res = await svc.dispatch('user-1', PAYLOAD);
    expect(res.failed).toBe(0);
    expect(res.succeeded).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
