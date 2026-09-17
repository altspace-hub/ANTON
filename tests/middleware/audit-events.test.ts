/**
 * audit-events.test.ts — Wave 6 track E: every mutating /api request leaves a
 * row, and the trail can never cost the request anything.
 *
 * A real Express app on an ephemeral port, a fake adapter (no database):
 *   - POST / PUT / PATCH / DELETE are recorded with method, concrete path, the
 *     ROUTE pattern (/api/things/:id, not the id), status, duration, the caller's
 *     id and role, and the client's x-request-id; GET is not;
 *   - the request body is never recorded (a secret in the body appears nowhere);
 *   - /api/claude/message and /api/audit* are excluded;
 *   - an unmatched path still gets a normalised pattern (ids collapsed);
 *   - a database that throws or rejects never changes the response, and warns
 *     at most once per window, counting what it muted.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { DatabaseAdapter } from '../../server/db/database.js';
import {
  AUDIT_EVENTS_SQL,
  createAuditEventsMiddleware,
  isAuditedRequest,
  normalisePathPattern,
} from '../../server/middleware/audit-events.js';

type Mode = 'ok' | 'reject' | 'throw';
const writes: unknown[][] = [];
let mode: Mode = 'ok';
let clock = 1_000_000;

const db = {
  run: (sql: string, ...args: unknown[]) => {
    if (mode === 'throw') throw new Error('pool exhausted');
    if (mode === 'reject') return Promise.reject(new Error('relation "audit_events" does not exist'));
    expect(sql).toBe(AUDIT_EVENTS_SQL.insert);
    writes.push(args);
    return Promise.resolve({ changes: 1, lastInsertRowid: 0 });
  },
  get: async () => undefined,
  all: async () => [],
} as unknown as DatabaseAdapter;

/** Column order of AUDIT_EVENTS_SQL.insert. */
const COL = { id: 0, method: 1, path: 2, pattern: 3, status: 4, duration: 5, userId: 6, role: 7, requestId: 8, ip: 9 } as const;

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  // Stands in for authMiddleware, which runs before the audit middleware in index.ts.
  app.use('/api', (req, _res, next) => {
    req.user = { id: 'u-42', username: 'ana', role: 'analyst' };
    next();
  });
  app.use('/api', createAuditEventsMiddleware(db, { now: () => clock, warnEveryMs: 60_000 }));

  const router = express.Router();
  router.get('/things', (_req, res) => { res.json([]); });
  router.post('/things/:id', (_req, res) => { clock += 37; res.status(201).json({ ok: true }); });
  router.put('/things/:id', (_req, res) => { res.json({ ok: true }); });
  router.patch('/things/:id', (_req, res) => { res.status(400).json({ error: 'bad' }); });
  router.delete('/things/:id', (_req, res) => { res.status(204).end(); });
  router.post('/claude/message', (_req, res) => { res.json({ ok: true }); });
  router.post('/audit/security', (_req, res) => { res.json({ ok: true }); });
  router.post('/audit-trail/x', (_req, res) => { res.json({ ok: true }); });
  app.use('/api', router);

  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  writes.length = 0;
  mode = 'ok';
});

async function send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('what is recorded', () => {
  it('records a POST with the route pattern, status, duration, caller and request id', async () => {
    const res = await send('POST', '/api/things/8f14e45f-ceea-467a-9575-7a1d6c0b5f01?draft=1', { apiKey: 'sk-secret-in-body' }, { 'x-request-id': 'req-abc' });
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    const row = writes[0];
    expect(row[COL.method]).toBe('POST');
    expect(row[COL.path]).toBe('/api/things/8f14e45f-ceea-467a-9575-7a1d6c0b5f01');
    expect(row[COL.pattern]).toBe('/api/things/:id');
    expect(row[COL.status]).toBe(201);
    expect(row[COL.duration]).toBe(37);
    expect(row[COL.userId]).toBe('u-42');
    expect(row[COL.role]).toBe('analyst');
    expect(row[COL.requestId]).toBe('req-abc');
    expect(typeof row[COL.id]).toBe('string');
    // The body is never part of the row.
    expect(JSON.stringify(row)).not.toContain('sk-secret-in-body');
    expect(JSON.stringify(row)).not.toContain('draft');
  });

  it('records PUT, PATCH (including a 4xx) and DELETE; never GET', async () => {
    await send('GET', '/api/things');
    await send('PUT', '/api/things/1', {});
    await send('PATCH', '/api/things/2', {});
    await send('DELETE', '/api/things/3');
    await vi.waitFor(() => expect(writes).toHaveLength(3));
    expect(writes.map((w) => [w[COL.method], w[COL.status]])).toEqual([['PUT', 200], ['PATCH', 400], ['DELETE', 204]]);
    expect(writes.every((w) => w[COL.requestId] === null)).toBe(true);
  });

  it('excludes the streaming chat route and the audit routes', async () => {
    await send('POST', '/api/claude/message', {});
    await send('POST', '/api/audit/security', {});
    await send('POST', '/api/audit-trail/x', {});
    await send('PUT', '/api/things/9', {}); // sentinel: proves the middleware is live
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0][COL.path]).toBe('/api/things/9');
  });

  it('normalises an unmatched path', async () => {
    const res = await send('POST', '/api/nowhere/12345/sub/abcdef0123456789abcdef', {});
    expect(res.status).toBe(404);
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0][COL.pattern]).toBe('/api/nowhere/:id/sub/:id');
  });
});

describe('it never costs the request anything', () => {
  it('a rejecting or throwing write leaves the response intact, and warns once per window', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      mode = 'reject';
      expect((await send('PUT', '/api/things/1', {})).status).toBe(200);
      mode = 'throw';
      expect((await send('PUT', '/api/things/2', {})).status).toBe(200);
      expect((await send('DELETE', '/api/things/3')).status).toBe(204);
      await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 20));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toMatch(/\[audit-events\] write failed: relation "audit_events" does not exist/);

      clock += 60_001; // next window
      expect((await send('PUT', '/api/things/4', {})).status).toBe(200);
      await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
      expect(String(warn.mock.calls[1][0])).toMatch(/pool exhausted \(2 more failures since the last warning\)/);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('helpers', () => {
  it('isAuditedRequest', () => {
    expect(isAuditedRequest('post', '/api/sessions')).toBe(true);
    expect(isAuditedRequest('GET', '/api/sessions')).toBe(false);
    expect(isAuditedRequest('POST', '/app/enroll')).toBe(false);
    expect(isAuditedRequest('POST', '/api/claude/message')).toBe(false);
    expect(isAuditedRequest('POST', '/api/claude/messages-export')).toBe(true);
    expect(isAuditedRequest('DELETE', '/api/audit/events/1')).toBe(false);
    expect(isAuditedRequest('POST', '/api/auditors')).toBe(true);
    expect(isAuditedRequest('POST', '/api/x', ['/api/x'])).toBe(false);
  });

  it('normalisePathPattern collapses uuids, long hex, numbers and prefixed ids only', () => {
    expect(normalisePathPattern('/api/sessions/8f14e45f-ceea-467a-9575-7a1d6c0b5f01/messages')).toBe('/api/sessions/:id/messages');
    expect(normalisePathPattern('/api/rules/42')).toBe('/api/rules/:id');
    expect(normalisePathPattern('/api/outputs/out_a1b2c3d4e5')).toBe('/api/outputs/:id');
    expect(normalisePathPattern('/api/compliance/on-completion')).toBe('/api/compliance/on-completion');
  });
});
