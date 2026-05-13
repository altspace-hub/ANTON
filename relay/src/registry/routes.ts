/**
 * routes.ts — HTTP dispatcher for /v1/* portal registry endpoints.
 *
 * Called from RelayServer's existing `httpServer.on('request', ...)`
 * handler. Returns true if the request was handled (response written),
 * false if the path doesn't match a registry route (so the relay's
 * default 404 handler runs).
 *
 * Routes (each lives in its own file):
 *   GET  /v1/healthz              — registry-DB ping, separate from relay /healthz
 *   POST /v1/portals/submit       — Step 8
 *   GET  /v1/portals/submissions/:id/status
 *   GET  /v1/portals/search       — Step 8
 *   GET  /v1/portals/resolve/:name.:namespace
 *   GET  /v1/admin/submissions    — Step 9, JWT-auth
 *   POST /v1/admin/submissions/:id/approve
 *   POST /v1/admin/submissions/:id/reject
 *
 * This file is the routing skeleton. Step 6 lands the dispatcher and a
 * single /v1/healthz endpoint to prove the wiring works. Steps 8 + 9
 * fill in the rest.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RegistryDb } from './db.js';
import type { Logger } from 'pino';

export interface RegistryRouterDeps {
  db: RegistryDb | null;
  logger: Logger;
}

/** Tiny JSON response helper — every registry route uses this. */
export function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    // Don't let intermediaries cache identity-bearing responses.
    'cache-control': 'no-store',
  });
  res.end(payload);
}

/** 503 helper — used when the registry is disabled (no DB) but a /v1/* route was hit. */
function registryDisabled(res: ServerResponse): void {
  json(res, 503, {
    error: 'registry_not_configured',
    message:
      'This relay has no portal registry configured. ' +
      'Set RELAY_REGISTRY_DATABASE_URL to enable /v1/portals/*.',
  });
}

/**
 * Route a single incoming HTTP request through the registry dispatcher.
 * Returns true if handled, false if the path is not under /v1/*.
 */
export async function dispatch(
  req: IncomingMessage,
  res: ServerResponse,
  deps: RegistryRouterDeps,
): Promise<boolean> {
  const rawUrl = req.url ?? '/';
  // Strip query string for path matching; URL parsing happens per-route.
  const qIndex = rawUrl.indexOf('?');
  const path = qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl;

  if (!path.startsWith('/v1/')) return false;
  const method = req.method ?? 'GET';

  // /v1/healthz is the only route enabled in Step 6. It works even
  // when no DB is configured (returns ok:false with a clear reason).
  if (method === 'GET' && (path === '/v1/healthz' || path === '/v1/healthz/')) {
    if (!deps.db) {
      json(res, 200, { ok: false, reason: 'registry_disabled' });
      return true;
    }
    const dbOk = await deps.db.ping();
    json(res, dbOk ? 200 : 503, {
      ok: dbOk,
      reason: dbOk ? null : 'db_unreachable',
    });
    return true;
  }

  // Everything else under /v1/* lands here until Steps 8 + 9 wire in
  // the real handlers. Refuse with a structured 503 if the registry
  // is disabled, otherwise 501 (route exists, not implemented yet).
  if (!deps.db) {
    registryDisabled(res);
    return true;
  }
  json(res, 501, {
    error: 'not_implemented',
    message: `Route ${method} ${path} is not yet implemented at this relay.`,
  });
  return true;
}
