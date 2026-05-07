/**
 * push.ts — push notification registration per spec §8.7.
 *
 * Native (iOS / Android): @capacitor/push-notifications → APNs / FCM token
 *   → POST to /api/app/push/register with platform + token + device_id.
 *
 * Web (PWA): navigator.serviceWorker.pushManager.subscribe() → web-push
 *   subscription → POST to /api/app/push/register with platform=web-push
 *   + endpoint + p256dh + auth.
 *
 * The instance dispatches push payloads that contain ONLY an opaque
 * event id + severity + a localised title; the app fetches details via
 * the authenticated channel.
 */

import { Capacitor } from '@capacitor/core';
import { activeServerBase, activeAuthHeaders, getActiveInstance } from './instances';

export type RegisterOutcome =
  | { ok: true; platform: 'apns' | 'fcm' | 'web-push'; token: string }
  | { ok: false; reason: 'unsupported' | 'permission-denied' | 'server-error' | 'no-instance' | 'no-device-id'; detail?: string };

/**
 * Ask the user for notification permission only.
 *
 * Decoupled from token registration so legacy-pair users (no device_id)
 * still see the prompt — required because POST_NOTIFICATIONS is declared
 * in AndroidManifest.xml and Play Store Data Safety policy expects a
 * runtime prompt for every declared permission.
 */
export async function requestPushPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios' || platform === 'android') {
    try {
      const mod = await import('@capacitor/push-notifications');
      const PushNotifications = mod.PushNotifications;
      const perm = await PushNotifications.checkPermissions();
      let status = perm.receive;
      if (status === 'prompt' || status === 'prompt-with-rationale') {
        const r = await PushNotifications.requestPermissions();
        status = r.receive;
      }
      return status === 'granted' ? 'granted' : 'denied';
    } catch { return 'unsupported'; }
  }
  // Web
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    const r = await Notification.requestPermission();
    return r === 'granted' ? 'granted' : 'denied';
  } catch { return 'unsupported'; }
}

/** Ask for permission + register. Idempotent. */
// AN2: de-dup cache. The App.tsx push effect re-fires on every instance
// switch — without this cache the OS prompt + token POST run again every
// time the user toggles between paired ANTONs. Key by device_id so cache
// invalidates correctly when re-pairing the same instance.
let lastRegistered: { deviceId: string; token: string; at: number } | null = null;
const REGISTER_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function registerPush(): Promise<RegisterOutcome> {
  const platform = Capacitor.getPlatform();
  const instance = getActiveInstance();
  if (!instance) return { ok: false, reason: 'no-instance' };
  if (!instance.device_id) return { ok: false, reason: 'no-device-id', detail: 'Pair via the Ed25519 enrollment flow first' };

  // De-dup: same device + recent successful registration → skip the round-trip.
  if (lastRegistered
      && lastRegistered.deviceId === instance.device_id
      && Date.now() - lastRegistered.at < REGISTER_TTL_MS) {
    return { ok: true, platform: platform === 'ios' ? 'apns' : platform === 'android' ? 'fcm' : 'web-push', token: lastRegistered.token };
  }

  const result = platform === 'ios' || platform === 'android'
    ? await registerNative(platform, instance.device_id)
    : await registerWebPush(instance.device_id);
  if (result.ok) {
    lastRegistered = { deviceId: instance.device_id, token: result.token, at: Date.now() };
  }
  return result;
}

async function registerNative(platform: 'ios' | 'android', deviceId: string): Promise<RegisterOutcome> {
  // Android: PushNotifications.register() calls FirebaseMessaging.getInstance()
  // natively. If google-services.json isn't bundled, that throws
  // IllegalStateException ON the CapacitorPlugins handler thread — uncaught,
  // which crashes the entire process before our JS try/catch sees it.
  // We don't have Firebase configured in this build (per the v0.7.5 release
  // readiness audit, push dispatch is stubbed), so skip Android registration
  // entirely until VITE_FIREBASE_ENABLED is wired.
  if (platform === 'android' && !import.meta.env.VITE_FIREBASE_ENABLED) {
    return { ok: false, reason: 'unsupported', detail: 'Firebase not configured in this build' };
  }
  try {
    const mod = await import('@capacitor/push-notifications');
    const PushNotifications = mod.PushNotifications;
    // 1. Permission
    const perm = await PushNotifications.checkPermissions();
    let status = perm.receive;
    if (status === 'prompt' || status === 'prompt-with-rationale') {
      const r = await PushNotifications.requestPermissions();
      status = r.receive;
    }
    if (status !== 'granted') return { ok: false, reason: 'permission-denied' };

    // 2. Token registration — wait for the registration event.
    //
    // Capacitor's addListener returns a Promise<PluginListenerHandle>; the
    // listener callback can fire BEFORE that Promise resolves. The previous
    // implementation called `succHandler.then(h => h.remove())` from inside
    // the callback, which (a) resolved the handle later, (b) wasn't awaited,
    // and (c) left the listener attached for any duplicate event mid-tick.
    // Now we await both handles up-front, then call .remove() synchronously
    // on the resolved values.
    type Handle = { remove: () => Promise<void> };
    let succHandle: Handle | null = null;
    let errHandle: Handle | null = null;
    const token = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Registration timed out')), 15_000);
      const cleanup = () => {
        clearTimeout(timeout);
        succHandle?.remove().catch(() => {});
        errHandle?.remove().catch(() => {});
      };
      void (async () => {
        try {
          succHandle = await PushNotifications.addListener('registration', (t: { value: string }) => {
            cleanup();
            resolve(t.value);
          }) as unknown as Handle;
          errHandle = await PushNotifications.addListener('registrationError', (e: { error?: string } | string) => {
            cleanup();
            reject(new Error(typeof e === 'string' ? e : (e.error || 'Registration error')));
          }) as unknown as Handle;
          await PushNotifications.register();
        } catch (e) {
          cleanup();
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      })();
    });

    // 3. Send to instance
    const transport: 'apns' | 'fcm' = platform === 'ios' ? 'apns' : 'fcm';
    await postRegister({ device_id: deviceId, platform: transport, token });
    return { ok: true, platform: transport, token };
  } catch (err) {
    return { ok: false, reason: 'unsupported', detail: err instanceof Error ? err.message : String(err) };
  }
}

async function registerWebPush(deviceId: string): Promise<RegisterOutcome> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'permission-denied' };

    const vapidPublic = await fetchVapidPublicKey();
    if (!vapidPublic) return { ok: false, reason: 'unsupported', detail: 'Server has no VAPID key configured' };

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // PushManager accepts BufferSource — cast to keep TS happy across DOM lib variants
      applicationServerKey: vapidPublic.buffer as ArrayBuffer,
    });
    const json = sub.toJSON();
    await postRegister({
      device_id: deviceId,
      platform: 'web-push',
      token: sub.endpoint,
      endpoint: sub.endpoint,
      p256dh_key: json.keys?.p256dh,
      auth_key: json.keys?.auth,
    });
    return { ok: true, platform: 'web-push', token: sub.endpoint };
  } catch (err) {
    return { ok: false, reason: 'unsupported', detail: err instanceof Error ? err.message : String(err) };
  }
}

async function fetchVapidPublicKey(): Promise<Uint8Array | null> {
  const base = activeServerBase();
  try {
    const headers = await activeAuthHeaders();
    const res = await fetch(`${base}/api/app/instance-info`, { headers });
    if (!res.ok) return null;
    const info = await res.json();
    if (!info.vapid_public_key) return null;
    return urlBase64ToUint8Array(String(info.vapid_public_key));
  } catch {
    return null;
  }
}

async function postRegister(body: {
  device_id: string;
  platform: 'apns' | 'fcm' | 'web-push';
  token: string;
  endpoint?: string;
  p256dh_key?: string;
  auth_key?: string;
  topic?: string;
}): Promise<void> {
  const base = activeServerBase();
  const headers = await activeAuthHeaders();
  const res = await fetch(`${base}/api/app/push/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Push registration failed (${res.status})`);
  }
}

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ── Notification handling — deep-link router ─────────────────────────────

export type NotificationRouter = (deepLink: string, raw: { event_id?: string; severity?: string; category?: string }) => void;

let router: NotificationRouter | null = null;
export function setNotificationRouter(fn: NotificationRouter): void {
  router = fn;
}

/** Subscribe to native notification taps. Returns an unsubscribe function. */
export async function startNativeNotificationListener(): Promise<() => void> {
  const platform = Capacitor.getPlatform();
  if (platform !== 'ios' && platform !== 'android') return () => {};
  try {
    const mod = await import('@capacitor/push-notifications');
    const handler = await mod.PushNotifications.addListener('pushNotificationActionPerformed', (action: { notification: { data?: Record<string, string> } }) => {
      const data = action?.notification?.data ?? {};
      const deepLink = data.deep_link || data.deepLink || `/approvals/${data.event_id ?? ''}`;
      router?.(deepLink, { event_id: data.event_id, severity: data.severity, category: data.category });
    });
    return () => handler.remove().catch(() => {});
  } catch {
    return () => {};
  }
}
