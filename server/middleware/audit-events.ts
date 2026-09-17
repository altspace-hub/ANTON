/**
 * audit-events.ts — a request audit trail wider than the LLM ledger.
 *
 * audit_log records LLM calls (the chat route and the Companion gateway write
 * it). Nothing recorded the other ~170 route files: a rule edited, a session
 * deleted, a policy changed, an export taken. This middleware writes one
 * `audit_events` row per mutating /api request — POST / PUT / PATCH / DELETE —
 * with method, concrete path, path pattern, status, duration, the caller's id
 * and role, the request id when the client sent one, and the origin address.
 * Never the body: bodies carry documents, prompts and credentials.
 *
 * Excluded: the streaming chat endpoint (/api/claude/message — audited by the
 * route itself into audit_log) and the audit routes (/api/audit*), which would
 * otherwise record their own reads of the trail.
 *
 * It never blocks a request. The row is written on 'finish' (after the
 * response has gone out) and a failed write is swallowed with at most one
 * warning a minute, so a missing table or a database blip cannot turn into a
 * log storm or a 500.
 *
 * Table (migration 278):
 *   CREATE TABLE audit_events (
 *     id TEXT PRIMARY KEY, occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     method TEXT NOT NULL, path TEXT NOT NULL, path_pattern TEXT NOT NULL,
 *     status_code INTEGER NOT NULL, duration_ms INTEGER NOT NULL,
 *     user_id TEXT, user_role TEXT, request_id TEXT, ip_address TEXT
 *   );
 */
import type { Request, RequestHandler, Response } from 'express';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

export const AUDITED_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Full-path prefixes (query stripped) that are never recorded. */
export const AUDIT_EVENTS_EXCLUDED_PREFIXES: readonly string[] = [
  '/api/claude/message',
  '/api/audit',
  '/api/health',
];

export const AUDIT_EVENTS_SQL = {
  insert: `INSERT INTO audit_events (id, method, path, path_pattern, status_code, duration_ms, user_id, user_role, request_id, ip_address)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
} as const;

const DEFAULT_WARN_EVERY_MS = 60_000;
const MAX_PATH_CHARS = 512;

export interface AuditEventRecord {
  id: string;
  method: string;
  path: string;
  pathPattern: string;
  statusCode: number;
  durationMs: number;
  userId: string | null;
  userRole: string | null;
  requestId: string | null;
  ipAddress: string | null;
}

export interface AuditEventsOptions {
  /** Clock, for tests. */
  now?: () => number;
  /** Minimum gap between two failure warnings (default 60 s). */
  warnEveryMs?: number;
  /** Extra excluded prefixes on top of the defaults. */
  excludePrefixes?: readonly string[];
}

/** Should this request be recorded at all? `path` is the full path, query stripped. */
export function isAuditedRequest(method: string, path: string, extraExcluded: readonly string[] = []): boolean {
  if (!AUDITED_METHODS.has(method.toUpperCase())) return false;
  if (!path.startsWith('/api/')) return false;
  for (const prefix of [...AUDIT_EVENTS_EXCLUDED_PREFIXES, ...extraExcluded]) {
    if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}-`)) return false;
  }
  return true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ID_RE = /^[0-9a-f]{16,}$/i;
const NUMERIC_RE = /^\d+$/;
const PREFIXED_ID_RE = /^[a-z]{1,12}_[A-Za-z0-9]{8,}$/;

/**
 * Collapse id-like segments to ':id' so a path without a matched route still
 * groups. Used when Express has no `req.route` for the request (404s, handlers
 * that called next() after responding).
 */
export function normalisePathPattern(path: string): string {
  return path
    .split('/')
    .map((seg) => (UUID_RE.test(seg) || HEX_ID_RE.test(seg) || NUMERIC_RE.test(seg) || PREFIXED_ID_RE.test(seg) ? ':id' : seg))
    .join('/');
}

function joinPaths(base: string, route: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const r = route.startsWith('/') ? route : `/${route}`;
  return `${b}${r}`;
}

function fullPath(req: Request): string {
  const raw = req.originalUrl || req.url || '';
  const q = raw.indexOf('?');
  return (q === -1 ? raw : raw.slice(0, q)).slice(0, MAX_PATH_CHARS);
}

function requestPattern(req: Request, path: string): string {
  const routePath: unknown = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof routePath === 'string' && routePath.length > 0) {
    return joinPaths(req.baseUrl ?? '', routePath).slice(0, MAX_PATH_CHARS);
  }
  return normalisePathPattern(path);
}

function headerString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function requestId(req: Request, res: Response): string | null {
  const fromReq = headerString(req.headers['x-request-id']);
  if (fromReq) return fromReq.slice(0, 128);
  const own = (req as { id?: unknown }).id;
  if (typeof own === 'string' && own.length > 0) return own.slice(0, 128);
  const fromRes = res.getHeader('x-request-id');
  return typeof fromRes === 'string' && fromRes.length > 0 ? fromRes.slice(0, 128) : null;
}

function clientIp(req: Request): string | null {
  const forwarded = headerString(req.headers['x-forwarded-for']);
  if (forwarded) return forwarded.split(',')[0].trim().slice(0, 64);
  const ip = req.ip || req.socket?.remoteAddress;
  return ip ? String(ip).slice(0, 64) : null;
}

/** Build the row for a finished request. Exported for tests; pure. */
export function buildAuditEventRecord(req: Request, res: Response, durationMs: number): AuditEventRecord {
  const path = fullPath(req);
  const user = req.user as { id?: unknown; role?: unknown } | undefined;
  return {
    id: randomUUID(),
    method: req.method.toUpperCase(),
    path,
    pathPattern: requestPattern(req, path),
    statusCode: res.statusCode,
    durationMs: Math.max(0, Math.round(durationMs)),
    userId: typeof user?.id === 'string' ? user.id : null,
    userRole: typeof user?.role === 'string' ? user.role : null,
    requestId: requestId(req, res),
    ipAddress: clientIp(req),
  };
}

/**
 * Express middleware. Mount once, after authMiddleware so req.user is stamped
 * by the time the response finishes:
 *
 *   app.use('/api', createAuditEventsMiddleware(db));
 */
export function createAuditEventsMiddleware(db: DatabaseAdapter, options: AuditEventsOptions = {}): RequestHandler {
  const now = options.now ?? (() => Date.now());
  const warnEveryMs = options.warnEveryMs ?? DEFAULT_WARN_EVERY_MS;
  const extraExcluded = options.excludePrefixes ?? [];
  let lastWarnAt = -Infinity;
  let mutedSinceLastWarn = 0;

  const warnThrottled = (err: unknown): void => {
    const t = now();
    if (t - lastWarnAt < warnEveryMs) { mutedSinceLastWarn += 1; return; }
    const muted = mutedSinceLastWarn > 0 ? ` (${mutedSinceLastWarn} more failures since the last warning)` : '';
    lastWarnAt = t;
    mutedSinceLastWarn = 0;
    console.warn(`[audit-events] write failed: ${err instanceof Error ? err.message : String(err)}${muted}`);
  };

  const write = (record: AuditEventRecord): void => {
    let pending: Promise<unknown>;
    try {
      pending = db.run(
        AUDIT_EVENTS_SQL.insert,
        record.id, record.method, record.path, record.pathPattern, record.statusCode, record.durationMs,
        record.userId, record.userRole, record.requestId, record.ipAddress,
      );
    } catch (err) {
      warnThrottled(err);
      return;
    }
    pending.catch(warnThrottled);
  };

  return function auditEventsMiddleware(req, res, next) {
    if (!isAuditedRequest(req.method, fullPath(req), extraExcluded)) { next(); return; }
    const startedAt = now();
    res.once('finish', () => {
      try {
        write(buildAuditEventRecord(req, res, now() - startedAt));
      } catch (err) {
        warnThrottled(err);
      }
    });
    next();
  };
}
