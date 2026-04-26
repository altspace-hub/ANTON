// ── App Push Service — Companion App push notifications per spec §8.7 ───
//
// Three transports:
//   • APNs        — iOS native build       (TODO — wire @parse/node-apn)
//   • FCM         — Android native build   (TODO — wire firebase-admin)
//   • web-push    — PWA fallback           (real, via `web-push` package)
//
// End-to-end privacy: payload to the platform NEVER carries confidential
// content — only an opaque event id + severity + a localised title.
// The app fetches details via the authenticated channel.
//
// Dispatch is gated by APP_GATEWAY_PUSH=true. Within enabled mode each
// platform additionally requires its provider keys; if a platform is
// unconfigured, its tokens fail with a clear "not configured" error and
// the dispatch continues for the other platforms.

import webpush from 'web-push';
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
   * Per-platform real implementations are stubbed unless APP_GATEWAY_PUSH=true
   * AND the relevant provider keys are present. We still walk the token list
   * and produce a result object so callers can react identically.
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
            await sendViaApns(tok.token, payload, tok.environment);
            break;
          case 'fcm':
            await sendViaFcm(tok.token, payload, tok.topic ?? null);
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

  async function sendViaApns(_token: string, _payload: PushPayload, _env: string): Promise<void> {
    if (!process.env.APNS_KEY_ID || !process.env.APNS_TEAM_ID || !process.env.APNS_BUNDLE_ID) {
      throw new Error('APNs not configured (set APNS_KEY_ID / APNS_TEAM_ID / APNS_BUNDLE_ID)');
    }
    // TODO: wire @parse/node-apn or apn2 — JWT-signed POST to api.push.apple.com
    // with aps payload { alert: { title }, "thread-id": event_id, sound: ..., mutable-content: 1 }.
    throw new Error('APNs dispatch not implemented — wire @parse/node-apn');
  }

  async function sendViaFcm(_token: string, _payload: PushPayload, _topic: string | null): Promise<void> {
    if (!process.env.FCM_SERVICE_ACCOUNT_JSON && !process.env.FCM_SERVER_KEY) {
      throw new Error('FCM not configured (set FCM_SERVICE_ACCOUNT_JSON or FCM_SERVER_KEY)');
    }
    // TODO: wire firebase-admin — POST to fcm.googleapis.com/v1/projects/<id>/messages:send
    throw new Error('FCM dispatch not implemented — wire firebase-admin');
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
