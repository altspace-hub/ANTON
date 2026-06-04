/*
 * comm-push.ts — FCM wake-push for Comm offline message delivery.
 *
 * Push-notifications plan, Phase 3. When comm-registry.routeSend() mailboxes a
 * message for an OFFLINE recipient, the server emits a { kind: 'push' } action
 * carrying the recipient's routing_id; executeActions calls CommPush.dispatch(),
 * which sends a CONTENT-FREE wake notification to every token registered for
 * that routing_id. The woken app reconnects, drains the mailbox over the E2E
 * channel, and decrypts locally — the relay never sees plaintext.
 *
 * Everything is GATED: with no FCM service account configured the dispatcher
 * is a logged no-op, and with no registry DB the token store is unavailable
 * (registration 503s). The relay builds + runs either way.
 *
 * FCM is called via the HTTP v1 API with an OAuth2 access token minted from the
 * service-account key using Node's built-in crypto (RS256) — no firebase-admin
 * dependency, keeping the mesh relay lean.
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ed25519Verify, sha256, bytesToHex, hexToBytes } from './primitives.js';
import type { RegistryDb } from './registry/db.js';

/** The client signs utf8(`${DOMAIN}|${platform}|${token}`) with its Ed25519 key. */
const COMM_PUSH_DOMAIN = 'anton-comm-push/v1';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

export interface CommPushConfig {
  serviceAccount: ServiceAccount;
  projectId: string;
}

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/**
 * Load the FCM config from env. `FCM_SERVICE_ACCOUNT_JSON` is either a path to
 * the service-account .json or the JSON inline. Returns null (→ no-op dispatch)
 * when unset or unreadable.
 */
export function loadCommPushConfig(env: NodeJS.ProcessEnv, logger: Logger): CommPushConfig | null {
  const raw = env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const text = raw.startsWith('{') ? raw : readFileSync(raw, 'utf8');
    const sa = JSON.parse(text) as ServiceAccount;
    if (!sa.client_email || !sa.private_key || !sa.project_id) {
      logger.warn({}, 'FCM_SERVICE_ACCOUNT_JSON missing client_email/private_key/project_id — push disabled');
      return null;
    }
    return { serviceAccount: sa, projectId: env.FCM_PROJECT_ID?.trim() || sa.project_id };
  } catch (err) {
    logger.warn({ err: (err as Error)?.message }, 'FCM_SERVICE_ACCOUNT_JSON unreadable — push disabled');
    return null;
  }
}

function base64url(input: Buffer | string): string {
  return (typeof input === 'string' ? Buffer.from(input) : input)
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The FCM dispatcher: caches an OAuth access token and POSTs v1 messages. */
class FcmClient {
  private accessToken: string | null = null;
  private expiresAtMs = 0;

  constructor(private readonly cfg: CommPushConfig, private readonly logger: Logger) {}

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.expiresAtMs - 60_000) return this.accessToken;

    const sa = this.cfg.serviceAccount;
    const iat = Math.floor(now / 1000);
    const claims = {
      iss: sa.client_email,
      scope: FCM_SCOPE,
      aud: sa.token_uri || TOKEN_URI,
      iat,
      exp: iat + 3600,
    };
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify(claims));
    const signingInput = `${header}.${body}`;
    const sig = createSign('RSA-SHA256').update(signingInput).sign(sa.private_key);
    const assertion = `${signingInput}.${base64url(sig)}`;

    const res = await fetch(sa.token_uri || TOKEN_URI, {
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

  /** Send a content-free wake message to one device token.
   *  Returns 'ok' | 'invalid' (token gone — caller should disable it) | 'error'. */
  async send(token: string): Promise<'ok' | 'invalid' | 'error'> {
    try {
      const accessToken = await this.getAccessToken();
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.cfg.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              // Content-FREE: only a generic title so a KILLED app still shows
              // something (data-only is cached, not displayed, when killed).
              // No sender, no recipient, no message text — ever.
              notification: { title: 'New message', body: 'Open ANTON to read it' },
              // Wake signal for when the app IS alive — it pulls + decrypts and
              // re-fires a rich local notification (Phase 1 notifyIncomingMessage).
              data: { kind: 'comm-wake' },
              android: {
                priority: 'high',
                notification: { channel_id: 'fc-comm-messages' },
              },
            },
          }),
        },
      );
      if (res.ok) return 'ok';
      // 404 UNREGISTERED / 400 invalid-argument on a stale token.
      if (res.status === 404 || res.status === 400) return 'invalid';
      this.logger.warn({ status: res.status }, 'fcm send non-ok');
      return 'error';
    } catch (err) {
      this.logger.warn({ err: (err as Error)?.message }, 'fcm send threw');
      return 'error';
    }
  }
}

// ── Token store (registry DB) ───────────────────────────────────────────────

export interface PushToken { platform: string; token: string; }

async function tokensFor(db: RegistryDb, routingIdHex: string): Promise<PushToken[]> {
  const r = await db.query<{ platform: string; token: string }>(
    'SELECT platform, token FROM comm_push_tokens WHERE routing_id_hex = $1 AND enabled',
    [routingIdHex],
  );
  return r.rows;
}

async function upsertToken(
  db: RegistryDb, routingIdHex: string, platform: string, token: string,
): Promise<void> {
  // A device token is globally unique; re-registering it (e.g. a new identity on
  // the same phone) re-points it at the new routing_id and re-enables it.
  await db.query(
    `INSERT INTO comm_push_tokens (routing_id_hex, platform, token, enabled, last_used_at)
       VALUES ($1, $2, $3, TRUE, now())
     ON CONFLICT (platform, token)
       DO UPDATE SET routing_id_hex = EXCLUDED.routing_id_hex, enabled = TRUE, last_used_at = now()`,
    [routingIdHex, platform, token],
  );
}

async function disableToken(db: RegistryDb, platform: string, token: string): Promise<void> {
  await db.query(
    'UPDATE comm_push_tokens SET enabled = FALSE WHERE platform = $1 AND token = $2',
    [platform, token],
  );
}

// ── Signed registration verify ──────────────────────────────────────────────

/**
 * Verify a registration: the client proves it holds the private key behind the
 * routing_id by signing `${DOMAIN}|${platform}|${token}`. Returns the derived
 * routing_id hex, or null if the signature/inputs don't check out.
 */
function verifyRegistration(
  pubkeyHex: string, platform: string, token: string, sigHex: string,
): string | null {
  try {
    const pubkey = hexToBytes(pubkeyHex);
    if (pubkey.length !== 32) return null;
    const sig = hexToBytes(sigHex);
    const msg = new TextEncoder().encode(`${COMM_PUSH_DOMAIN}|${platform}|${token}`);
    if (!ed25519Verify(sig, msg, pubkey)) return null;
    return bytesToHex(sha256(pubkey).slice(0, 16));
  } catch {
    return null;
  }
}

// ── HTTP body helper ────────────────────────────────────────────────────────

function readJsonBody(req: IncomingMessage, maxBytes = 8192): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, obj: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// ── Public surface ──────────────────────────────────────────────────────────

const VALID_PLATFORMS = new Set(['fcm', 'apns', 'web']);

export class CommPush {
  private readonly fcm: FcmClient | null;

  constructor(
    private readonly db: RegistryDb | null,
    config: CommPushConfig | null,
    private readonly logger: Logger,
  ) {
    this.fcm = config ? new FcmClient(config, logger) : null;
    if (!config) logger.info({}, 'comm-push: FCM not configured — wake pushes are a no-op');
    if (!db) logger.info({}, 'comm-push: no registry DB — token registration disabled');
  }

  /** Fire a content-free wake push to every token for this routing_id. Best-effort. */
  async dispatch(routingIdHex: string): Promise<void> {
    if (!this.db || !this.fcm) return;
    let tokens: PushToken[];
    try {
      tokens = await tokensFor(this.db, routingIdHex);
    } catch (err) {
      this.logger.warn({ err: (err as Error)?.message }, 'comm-push: tokensFor failed');
      return;
    }
    for (const t of tokens) {
      if (t.platform !== 'fcm') continue; // apns/web: future transports
      const r = await this.fcm.send(t.token);
      if (r === 'invalid') {
        try { await disableToken(this.db, t.platform, t.token); } catch { /* best-effort */ }
      }
    }
  }

  /**
   * HTTP handler for /comm/push/register and /comm/push/unregister.
   * Returns true if it handled the request (caller should not fall through).
   */
  async handleHttp(req: IncomingMessage, res: ServerResponse, url: string): Promise<boolean> {
    if (!url.startsWith('/comm/push/')) return false;
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'method_not_allowed' }); return true; }
    if (!this.db) { sendJson(res, 503, { error: 'registry_not_configured' }); return true; }

    let body: { pubkey?: string; platform?: string; token?: string; sig?: string };
    try {
      body = (await readJsonBody(req)) as typeof body;
    } catch {
      sendJson(res, 400, { error: 'bad_body' });
      return true;
    }
    const { pubkey, platform, token, sig } = body;
    if (!pubkey || !platform || !token || !sig || !VALID_PLATFORMS.has(platform)) {
      sendJson(res, 400, { error: 'missing_fields' });
      return true;
    }
    const routingIdHex = verifyRegistration(pubkey, platform, token, sig);
    if (!routingIdHex) { sendJson(res, 401, { error: 'bad_signature' }); return true; }

    try {
      if (url.startsWith('/comm/push/unregister')) {
        await disableToken(this.db, platform, token);
      } else {
        await upsertToken(this.db, routingIdHex, platform, token);
      }
      sendJson(res, 200, { ok: true });
    } catch (err) {
      this.logger.error({ err: (err as Error)?.message }, 'comm-push: registration write failed');
      sendJson(res, 500, { error: 'internal_error' });
    }
    return true;
  }
}

// Exposed for unit tests.
export const __test = { verifyRegistration, COMM_PUSH_DOMAIN };
