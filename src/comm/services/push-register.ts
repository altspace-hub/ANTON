/**
 * push-register.ts — register this device's FCM token with the relay so it can
 * wake the app when a message is mailboxed while offline (push-notifications
 * plan, Phase 3).
 *
 * Security: the relay binds a token to a routing_id only on proof of the
 * identity key — we sign `${DOMAIN}|fcm|${token}` with our Ed25519 key and the
 * relay verifies it, deriving routing_id = sha256(pubkey)[0..16]. So a caller
 * can only register tokens for an id they own.
 *
 * GATED end-to-end: PushNotifications.register() yields no token until the
 * operator ships google-services.json (FCM needs a Firebase project), and the
 * relay drops the registration unless FCM_SERVICE_ACCOUNT_JSON is configured.
 * Until then this is a quiet no-op. No-op on web.
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getIdentity, signMessage } from './identity';
import { httpFetch } from './native-http';

const COMM_PUSH_DOMAIN = 'anton-comm-push/v1';
const LAST_TOKEN_KEY = 'fc.comm.push.last';

/** wss://host[/x] → https://host (the relay serves WS + HTTP on one port). */
function relayHttpBase(relayWsUrl: string): string {
  return relayWsUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://').replace(/\/+$/, '');
}

async function postRegistration(relayWsUrl: string, token: string, unregister = false): Promise<void> {
  const me = getIdentity();
  if (!me) return;
  const sig = await signMessage(`${COMM_PUSH_DOMAIN}|fcm|${token}`);
  const path = unregister ? '/comm/push/unregister' : '/comm/push/register';
  try {
    await httpFetch(`${relayHttpBase(relayWsUrl)}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pubkey: me.publicKeyHex, platform: 'fcm', token, sig }),
    });
    if (!unregister) {
      try { localStorage.setItem(LAST_TOKEN_KEY, token); } catch { /* ignore */ }
    }
  } catch { /* relay unreachable / push not configured — best-effort */ }
}

let receiveBound = false;

/**
 * Request notification permission, obtain the FCM token, and register it with
 * the relay (signed). Idempotent — re-registers only when the token changed.
 * Call once per app start after the identity + relay client are up.
 */
export async function registerCommPush(relayWsUrl: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (!getIdentity()) return;
  try {
    const perm = await PushNotifications.checkPermissions();
    let display = perm.receive;
    if (display === 'prompt' || display === 'prompt-with-rationale') {
      display = (await PushNotifications.requestPermissions()).receive;
    }
    if (display !== 'granted') return;

    // The token arrives asynchronously via the 'registration' event.
    await PushNotifications.addListener('registration', (t) => {
      const token = t?.value;
      if (!token) return;
      // Skip the network round-trip if the relay already has this exact token.
      let last: string | null = null;
      try { last = localStorage.getItem(LAST_TOKEN_KEY); } catch { /* ignore */ }
      if (token === last) return;
      void postRegistration(relayWsUrl, token);
    });
    await PushNotifications.addListener('registrationError', () => { /* FCM not configured — silent */ });
    await PushNotifications.register();
  } catch { /* plugin/permission failure — silent, push just stays off */ }
}

/**
 * Wire the wake handlers. A received push (data wake) or a tapped notification
 * means the relay has a mailboxed message for us — `onWake` should nudge the
 * relay client to (re)connect so it drains the mailbox over the E2E channel,
 * at which point Phase 1's notifyIncomingMessage fires the rich local banner.
 * (A KILLED app shows the relay's generic "New message" until then.)
 */
export async function initCommPushReceive(onWake: () => void): Promise<void> {
  if (!Capacitor.isNativePlatform() || receiveBound) return;
  receiveBound = true;
  try {
    await PushNotifications.addListener('pushNotificationReceived', () => onWake());
    await PushNotifications.addListener('pushNotificationActionPerformed', () => onWake());
  } catch { /* plugin unavailable — silent */ }
}
