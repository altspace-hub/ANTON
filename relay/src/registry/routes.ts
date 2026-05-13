/**
 * routes.ts — HTTP dispatcher for /v1/* portal registry endpoints.
 *
 * Called from RelayServer's existing `httpServer.on('request', ...)`
 * handler. Returns true if the request was handled (response written),
 * false if the path doesn't match a registry route (so the relay's
 * default 404 handler runs).
 *
 * Routes:
 *   GET  /v1/healthz                                  — registry-DB ping
 *   POST /v1/portals/submit                           — submit for review
 *   GET  /v1/portals/submissions/:id/status           — owner status poll
 *   GET  /v1/portals/search                           — full-text search
 *   GET  /v1/portals/resolve/:address                 — exact-name lookup
 *   /v1/admin/*                                       — Step 9 (operator API)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RegistryDb } from './db.js';
import type { Logger } from 'pino';
import { handleSubmit } from './handlers/submit.js';
import { handleSubmissionStatus } from './handlers/submissions.js';
import { handleSearch } from './handlers/search.js';
import { handleResolve } from './handlers/resolve.js';

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

function registryDisabled(res: ServerResponse): void {
  json(res, 503, {
    error: 'registry_not_configured',
    message:
      'This relay has no portal registry configured. ' +
      'Set RELAY_REGISTRY_DATABASE_URL to enable /v1/portals/*.',
  });
}

function methodNotAllowed(res: ServerResponse, allowed: string): void {
  res.setHeader('allow', allowed);
  json(res, 405, { error: 'method_not_allowed', message: `Allowed: ${allowed}` });
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
  const qIndex = rawUrl.indexOf('?');
  const path = qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl;

  if (!path.startsWith('/v1/')) return false;
  const method = req.method ?? 'GET';

  // ── /v1/healthz: works even without DB ────────────────────────────────
  if (path === '/v1/healthz' || path === '/v1/healthz/') {
    if (method !== 'GET') { methodNotAllowed(res, 'GET'); return true; }
    if (!deps.db) {
      json(res, 200, { ok: false, reason: 'registry_disabled' });
      return true;
    }
    const dbOk = await deps.db.ping();
    json(res, dbOk ? 200 : 503, { ok: dbOk, reason: dbOk ? null : 'db_unreachable' });
    return true;
  }

  // Everything below needs a DB.
  if (!deps.db) {
    registryDisabled(res);
    return true;
  }

  // ── /v1/portals/submit ────────────────────────────────────────────────
  if (path === '/v1/portals/submit') {
    if (method !== 'POST') { methodNotAllowed(res, 'POST'); return true; }
    await handleSubmit(req, res, deps.db, deps.logger);
    return true;
  }

  // ── /v1/portals/submissions/:id/status ───────────────────────────────
  const statusMatch = path.match(/^\/v1\/portals\/submissions\/([^/]+)\/status\/?$/);
  if (statusMatch && statusMatch[1]) {
    if (method !== 'GET') { methodNotAllowed(res, 'GET'); return true; }
    await handleSubmissionStatus(req, res, deps.db, deps.logger, statusMatch[1]);
    return true;
  }

  // ── /v1/portals/search ────────────────────────────────────────────────
  if (path === '/v1/portals/search' || path === '/v1/portals/search/') {
    if (method !== 'GET') { methodNotAllowed(res, 'GET'); return true; }
    await handleSearch(req, res, deps.db, deps.logger);
    return true;
  }

  // ── /v1/portals/resolve/:address ─────────────────────────────────────
  const resolveMatch = path.match(/^\/v1\/portals\/resolve\/([^/]+)\/?$/);
  if (resolveMatch && resolveMatch[1]) {
    if (method !== 'GET') { methodNotAllowed(res, 'GET'); return true; }
    await handleResolve(req, res, deps.db, deps.logger, resolveMatch[1]);
    return true;
  }

  // Future: /v1/admin/* in Step 9. Fall through to 501.
  json(res, 501, {
    error: 'not_implemented',
    message: `Route ${method} ${path} is not yet implemented at this relay.`,
  });
  return true;
}
