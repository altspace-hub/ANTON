// ── App Push Service — Companion App push notifications per spec §8.7 ───
//
// Three transports:
//   • APNs        — iOS native build       (no-op — iOS fast-follow, see sendViaApns)
//   • FCM         — Android native build   (REAL — FCM HTTP v1 via Node crypto)
//   • web-push    — PWA fallback           (real, via `web-push` package)
//
// End-to-end privacy: payload to the platform NEVER carries confidential
// content — only an opaque event id + severity + a localised title.
// The app fetches details via the authenticated channel.
//
// Dispatch is gated by APP_GATEWAY_PUSH=true. Within enabled mode each
// platform additionally requires its provider keys; if a platform is
// unconfigured, its dispatch is a graceful no-op (one-time logged warning)
// rather than a throw — so a checkpoint/approval that fans out to a mixed
// token set never fails because one transport is unconfigured.
//
// FCM uses the HTTP v1 API with an OAuth2 access token minted from the
// service-account key using Node's built-in crypto (RS256) — NO firebase-admin
// dependency. The token-minting logic is ported from the mesh relay's
// `relay/src/comm-push.ts` (the proven, dependency-free implementation).

import webpush from 'web-push';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { DatabaseAdapter } from '../db/database.js';

// ── VAPID one-time setup ────────────────────────────────────────────────
// Configures web-push at module-load when both VAPID keys are present.
// Without VAPID keys, web-push dispatch will throw a clear error.
let webpushReady = false;
if (process.env.WEBPUSH_VAPID_PUBLIC_KEY && process.env.WEBPUSH_VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(
      process.env.WEBPUSH_VAPID_SUBJECT ?? 'mailto:admin@anton.local',
      process.env.WEBPUSH_VAPID_PUBLIC_KEY,
      process.env.WEBPUSH_VAPID_PRIVATE_KEY,
    );
    webpushReady = true;
  } catch (err) {
    console.warn('[push] VAPID setup failed:', err instanceof Error ? err.message : err);
  }
}

// ── FCM HTTP v1 client (ported from relay/src/comm-push.ts) ─────────────
// Mints an OAuth2 access token from a Google service-account key via RS256
// (Node crypto, no firebase-admin), then POSTs a content-free data+notification
// message to fcm.googleapis.com/v1/projects/<id>/messages:send.

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_TOKEN_URI = 'https://oauth2.googleapis.com/token';

interface FcmServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

export interface FcmConfig {
  serviceAccount: FcmServiceAccount;
  projectId: string;
}

/**
 * Load the FCM config from env. `FCM_SERVICE_ACCOUNT_JSON` is either a path to
 * the service-account .json or the JSON inline (same env name + semantics the
 * relay uses — see relay/src/comm-push.ts loadCommPushConfig). Returns null
 * (→ no-op dispatch) when unset, malformed, or unreadable.
 */
export function loadFcmConfig(env: NodeJS.ProcessEnv): FcmConfig | null {
  const raw = env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const text = raw.startsWith('{') ? raw : readFileSync(raw, 'utf8');
    const sa = JSON.parse(text) as FcmServiceAccount;
    if (!sa.client_email || !sa.private_key || !sa.project_id) {
      console.warn('[push] FCM_SERVICE_ACCOUNT_JSON missing client_email/private_key/project_id — FCM disabled');
      return null;
    }
    return { serviceAccount: sa, projectId: env.FCM_PROJECT_ID?.trim() || sa.project_id };
  } catch (err) {
    console.warn('[push] FCM_SERVICE_ACCOUNT_JSON unreadable — FCM disabled:', err instanceof Error ? err.message : err);
    return null;
  }
}

function base64url(input: Buffer | string): string {
  return (typeof input === 'string' ? Buffer.from(input) : input)
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Build the content-free FCM HTTP v1 message body. Per spec §8.7 the payload
 * NEVER carries confidential content — only an opaque event id + severity +
 * a localised title + optional deep link. Exported for unit testing.
 */
export function buildFcmMessage(token: string, payload: PushPayload, topic: string | null) {
  return {
    message: {
      token,
      notification: { title: payload.title },
      // Data is a string→string map per FCM v1. Opaque routing only.
      data: {
        event_id: payload.event_id,
        severity: payload.severity,
        ...(payload.category ? { category: payload.category } : {}),
        ...(payload.deep_link ? { deep_link: payload.deep_link } : {}),
      },
      android: {
        priority: (payload.severity === 'critical' || payload.severity === 'high'
          ? 'high'
          : 'normal') as 'high' | 'normal',
        ...(topic ? { collapse_key: topic } : {}),
      },
    },
  };
}

/** Mints + caches an OAuth access token and POSTs v1 messages. */
class FcmClient {
  private accessToken: string | null = null;
  private expiresAtMs = 0;

  constructor(private readonly cfg: FcmConfig) {}

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.expiresAtMs - 60_000) return this.accessToken;

    const sa = this.cfg.serviceAccount;
    const iat = Math.floor(now / 1000);
    const claims = {
      iss: sa.client_email,
      scope: FCM_SCOPE,
      aud: sa.token_uri || FCM_TOKEN_URI,
      iat,
      exp: iat + 3600,
    };
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify(claims));
    const signingInput = `${header}.${body}`;
    const sig = createSign('RSA-SHA256').update(signingInput).sign(sa.private_key);
    const assertion = `${signingInput}.${base64url(sig)}`;

    const res = await fetch(sa.token_uri || FCM_TOKEN_URI, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) {
      throw new Error(`oauth token exchange failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.accessToken = json.access_token;
    this.expiresAtMs = now + (json.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }

  /** Send a content-free wake message to one device token. Throws on a transport
   *  error so the dispatcher records it as a per-token failure; a stale token
   *  (404 UNREGISTERED / 400 invalid-argument) throws a tagged 'unregistered'
   *  error so the caller can disable it. */
  async send(token: string, payload: PushPayload, topic: string | null): Promise<void> {
    const accessToken = await this.getAccessToken();
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${this.cfg.projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(buildFcmMessage(token, payload, topic)),
      },
    );
    if (res.ok) return;
    const text = await res.text().catch(() => '');
    if (res.status === 404 || res.status === 400) {
      const e = new Error(`fcm token unregistered (${res.status})`);
      (e as Error & { unregistered?: boolean }).unregistered = true;
      throw e;
    }
    throw new Error(`fcm send failed: ${res.status} ${text}`);
  }
}

export type PushPlatform = 'apns' | 'fcm' | 'web-push';

export interface RegisterPushTokenInput {
  device_id: string;
  platform: PushPlatform;
  token: string;
  environment?: 'production' | 'development';
  topic?: string;
  endpoint?: string;
  p256dh_key?: string;
  auth_key?: string;
}

export interface PushPayload {
  title: string;
  /** Opaque event id; the client uses it to fetch the full detail */
  event_id: string;
  severity: 'low' | 'normal' | 'high' | 'critical';
  /** Optional category (approval / radar / mission / digest) */
  category?: string;
  /** Optional deep link path (e.g. /approvals/abc123) */
  deep_link?: string;
}

export interface DispatchResult {
  attempted: number;
  succeeded: number;
  failed: number;
  /** Per-token errors (token id → message) */
  errors: Record<string, string>;
}

export function createAppPushService(db: DatabaseAdapter) {
  const enabled = process.env.APP_GATEWAY_PUSH === 'true';

  // FCM is initialised lazily from env. Absent service-account → null → no-op
  // dispatch (one-time logged warning), mirroring the web-push + relay paths.
  let fcmClient: FcmClient | null | undefined; // undefined = not yet resolved
  let fcmWarned = false;
  let apnsWarned = false;
  function getFcm(): FcmClient | null {
    if (fcmClient === undefined) {
      const cfg = loadFcmConfig(process.env);
      fcmClient = cfg ? new FcmClient(cfg) : null;
    }
    return fcmClient;
  }

  // ── Token registration ──────────────────────────────────────────────

  async function registerToken(input: RegisterPushTokenInput): Promise<{ id: string }> {
    // Phase H fix H4 — ownership check on token rebinding.
    // If (platform, token) already exists, the existing row's owner must
    // equal the new device's owner. Otherwise reject — an attacker who
    // learned a victim's APNs/FCM token (e.g. from a stolen unlocked
    // device) can't silently capture future pushes.
    const existing = await db.get<{ owner: string }>(
      `SELECT d.connected_user_id AS owner
         FROM app_push_tokens pt
         JOIN app_devices d ON d.id = pt.device_id
        WHERE pt.platform = ? AND pt.token = ?`,
      input.platform, input.token,
    );
    if (existing) {
      const newOwner = await db.get<{ connected_user_id: string }>(
        `SELECT connected_user_id FROM app_devices WHERE id = ? AND revoked_at IS NULL`,
        input.device_id,
      );
      if (!newOwner || newOwner.connected_user_id !== existing.owner) {
        throw new Error('Token already registered to another account');
      }
    }
    const row = await db.get<{ id: string }>(
      `INSERT INTO app_push_tokens
         (device_id, platform, token, environment, topic, endpoint, p256dh_key, auth_key, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON CONFLICT (platform, token) DO UPDATE SET
         device_id = EXCLUDED.device_id,
         environment = EXCLUDED.environment,
         topic = EXCLUDED.topic,
         endpoint = EXCLUDED.endpoint,
         p256dh_key = EXCLUDED.p256dh_key,
         auth_key = EXCLUDED.auth_key,
         enabled = TRUE,
         last_used_at = NOW()
       RETURNING id`,
      input.device_id, input.platform, input.token,
      input.environment ?? 'production',
      input.topic ?? null, input.endpoint ?? null,
      input.p256dh_key ?? null, input.auth_key ?? null,
    );
    if (!row) throw new Error('Failed to register push token');
    return { id: row.id };
  }

  async function unregisterToken(deviceId: string, platform: PushPlatform, token: string): Promise<void> {
    await db.run(
      `UPDATE app_push_tokens SET enabled = FALSE
        WHERE device_id = ? AND platform = ? AND token = ?`,
      deviceId, platform, token,
    );
  }

  async function listTokensForUser(connectedUserId: string): Promise<Array<{
    id: string; device_id: string; platform: PushPlatform; token: string;
    environment: string; endpoint: string | null;
    p256dh_key: string | null; auth_key: string | null; topic: string | null;
  }>> {
    return db.all(
      `SELECT pt.id, pt.device_id, pt.platform, pt.token, pt.environment,
              pt.endpoint, pt.p256dh_key, pt.auth_key, pt.topic
         FROM app_push_tokens pt
         JOIN app_devices d ON d.id = pt.device_id
        WHERE d.connected_user_id = ?
          AND pt.enabled = TRUE
          AND d.revoked_at IS NULL`,
      connectedUserId,
    );
  }

  // ── Dispatch ────────────────────────────────────────────────────────

  /**
   * Dispatch a push payload to every enabled token belonging to a user.
   * Requires APP_GATEWAY_PUSH=true. Within enabled mode each transport is real
   * when its provider creds are present (FCM via FCM_SERVICE_ACCOUNT_JSON,
   * web-push via VAPID keys); an unconfigured transport degrades to a graceful
   * no-op (counted as a no-op success) rather than throwing, so a mixed token
   * set never fails the whole dispatch. APNs is an iOS fast-follow no-op.
   */
  async function dispatch(connectedUserId: string, payload: PushPayload): Promise<DispatchResult> {
    const tokens = await listTokensForUser(connectedUserId);
    const result: DispatchResult = { attempted: tokens.length, succeeded: 0, failed: 0, errors: {} };
    if (tokens.length === 0) return result;

    if (!enabled) {
      // Dev / no-key mode — log the intent and report success
      console.log(`[push] (disabled) Would dispatch to ${tokens.length} token(s):`, payload.event_id, payload.severity);
      result.succeeded = tokens.length;
      return result;
    }

    for (const tok of tokens) {
      try {
        switch (tok.platform) {
          case 'apns':
            await sendViaApns(tok.id, tok.token, payload, tok.environment);
            break;
          case 'fcm':
            await sendViaFcm(tok.id, tok.token, payload, tok.topic ?? null);
            break;
          case 'web-push':
            await sendViaWebPush(tok.endpoint!, tok.p256dh_key!, tok.auth_key!, payload);
            break;
        }
        result.succeeded++;
        db.run(`UPDATE app_push_tokens SET last_used_at = NOW() WHERE id = ?`, tok.id).catch(() => {});
      } catch (err) {
        result.failed++;
        result.errors[tok.id] = err instanceof Error ? err.message : String(err);
      }
    }
    return result;
  }

  // ── Per-platform shims (operator wires real providers via env) ──────

  // iOS fast-follow: APNs is deferred for launch. Keep it a documented no-op
  // (one-time logged warning, NOT a throw) so a mixed token set never crashes
  // the dispatcher. Wire @parse/node-apn (JWT-signed POST to api.push.apple.com
  // with aps { alert: { title }, "thread-id": event_id, mutable-content: 1 })
  // when the iOS project exists.
  async function sendViaApns(tokenId: string, _token: string, _payload: PushPayload, _env: string): Promise<void> {
    if (!apnsWarned) {
      console.warn('[push] APNs not implemented yet (iOS fast-follow) — skipping apns token(s)');
      apnsWarned = true;
    }
    // No-op: count as a (no-op) success so the dispatch result isn't a failure.
    void tokenId;
  }

  async function sendViaFcm(tokenId: string, token: string, payload: PushPayload, topic: string | null): Promise<void> {
    const fcm = getFcm();
    if (!fcm) {
      if (!fcmWarned) {
        console.warn('[push] FCM not configured (set FCM_SERVICE_ACCOUNT_JSON) — wake pushes are a no-op');
        fcmWarned = true;
      }
      return; // graceful no-op, not a throw
    }
    try {
      await fcm.send(token, payload, topic);
    } catch (err) {
      // A token FCM reports as gone (404 UNREGISTERED / 400) is auto-disabled
      // so we stop dispatching to it. Re-throw so the result records the failure.
      if ((err as Error & { unregistered?: boolean })?.unregistered) {
        db.run(`UPDATE app_push_tokens SET enabled = FALSE WHERE id = ?`, tokenId).catch(() => {});
      }
      throw err;
    }
  }

  async function sendViaWebPush(endpoint: string, p256dh: string, auth: string, payload: PushPayload): Promise<void> {
    if (!webpushReady) {
      throw new Error('Web Push not configured (set WEBPUSH_VAPID_PUBLIC_KEY / WEBPUSH_VAPID_PRIVATE_KEY)');
    }
    // Privacy-preserving body — no confidential content per spec §8.7.
    // The client uses event_id to fetch full details over the authenticated channel.
    const body = JSON.stringify({
      title: payload.title,
      event_id: payload.event_id,
      severity: payload.severity,
      category: payload.category,
      deep_link: payload.deep_link,
    });
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      body,
      {
        TTL: payload.severity === 'critical' ? 86400 : 3600,
        urgency: payload.severity === 'critical' || payload.severity === 'high' ? 'high' : 'normal',
      },
    );
  }

  return { registerToken, unregisterToken, listTokensForUser, dispatch };
}

export type AppPushService = ReturnType<typeof createAppPushService>;
