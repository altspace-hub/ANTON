/**
 * admin-login.ts — POST /v1/admin/login.
 *
 * Single shared password against RELAY_OPERATOR_PASSWORD env. Returns
 * a 1-hour JWT signed with RELAY_OPERATOR_JWT_SECRET. The submitted
 * operatorId is self-declared and ends up in the audit trail; v0.1
 * doesn't try to attest who actually has the password.
 *
 * Login is rate-limited at the route level (Step 6's HTTP rate limiter
 * — added in a separate cut) so brute-forcing the password is bounded.
 *
 * If RELAY_OPERATOR_PASSWORD or RELAY_OPERATOR_JWT_SECRET are unset,
 * the endpoint returns 503 — admin auth is opt-in like the rest of
 * the registry.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { Logger } from 'pino';
import { json } from '../routes.js';
import { signOperatorToken } from '../jwt.js';

const OPERATOR_ID_RE = /^[a-z][a-z0-9._-]{2,63}$/;

async function readJsonBody(req: IncomingMessage, maxBytes = 4 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;
    req.on('data', (c: Buffer) => {
      if (aborted) return;
      total += c.length;
      if (total > maxBytes) {
        aborted = true;
        req.destroy();
        reject(new Error('body exceeds 4096 bytes'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
      } catch {
        reject(new Error('body is not valid JSON'));
      }
    });
    req.on('error', () => { if (!aborted) reject(new Error('stream error')); });
  });
}

export async function handleAdminLogin(
  req: IncomingMessage,
  res: ServerResponse,
  log: Logger,
): Promise<void> {
  const password = process.env.RELAY_OPERATOR_PASSWORD;
  const secret = process.env.RELAY_OPERATOR_JWT_SECRET;
  if (!password || !secret) {
    json(res, 503, {
      error: 'admin_not_configured',
      message: 'Operator login requires RELAY_OPERATOR_PASSWORD and RELAY_OPERATOR_JWT_SECRET.',
    });
    return;
  }

  let body: unknown;
  try { body = await readJsonBody(req); }
  catch (err) { json(res, 400, { error: 'invalid_body', message: (err as Error).message }); return; }

  if (typeof body !== 'object' || body === null) {
    json(res, 400, { error: 'invalid_body' });
    return;
  }
  const b = body as Record<string, unknown>;
  if (typeof b.password !== 'string' || typeof b.operatorId !== 'string') {
    json(res, 400, { error: 'invalid_body', message: 'password + operatorId required' });
    return;
  }
  if (!OPERATOR_ID_RE.test(b.operatorId)) {
    json(res, 400, {
      error: 'invalid_operator_id',
      message: 'operatorId must match ^[a-z][a-z0-9._-]{2,63}$',
    });
    return;
  }

  // Constant-time password comparison so timing doesn't leak length /
  // prefix matches. Both sides padded to the longer length so the
  // comparison length itself doesn't leak.
  const provided = Buffer.from(b.password, 'utf-8');
  const expected = Buffer.from(password, 'utf-8');
  const maxLen = Math.max(provided.length, expected.length);
  const a = Buffer.alloc(maxLen, 0); provided.copy(a);
  const e = Buffer.alloc(maxLen, 0); expected.copy(e);
  const passwordOk = timingSafeEqual(a, e) && provided.length === expected.length;
  if (!passwordOk) {
    // Log auth-failure with operatorId (helpful for noticing patterns)
    // but no IP — the relay already audits HTTP connect events.
    log.warn({ operatorId: b.operatorId }, 'admin login: bad password');
    json(res, 401, { error: 'invalid_credentials' });
    return;
  }

  const { token, expiresAt } = signOperatorToken(b.operatorId, secret);
  log.info({ operatorId: b.operatorId, expiresAt }, 'admin login: token issued');
  json(res, 200, { token, expiresAt, operatorId: b.operatorId });
}
