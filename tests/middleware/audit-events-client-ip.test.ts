/**
 * audit-events-client-ip.test.ts — the address an audit_events row carries
 * (privacy review H5/F9, 2026-09-26).
 *
 * The middleware read the first X-Forwarded-For entry, which the client
 * writes itself: any visitor could put any address into the trail. It now
 * takes req.ip, which Express resolves under TRUST_PROXY (index.ts sets
 * 'trust proxy' from it, loopback by default).
 *
 * Two real Express apps on ephemeral ports, a fake adapter:
 *   - behind the trusted proxy (loopback), the address the proxy appended is
 *     recorded, not the one the client put first;
 *   - with no trusted proxy, the header is ignored and the socket address is
 *     recorded;
 *   - a request with no header records the socket address in both (control).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { createAuditEventsMiddleware } from '../../server/middleware/audit-events.js';

const IP_COLUMN = 9; // last column of AUDIT_EVENTS_SQL.insert
const writes: unknown[][] = [];
const db = {
  run: (_sql: string, ...args: unknown[]) => { writes.push(args); return Promise.resolve({ changes: 1, lastInsertRowid: 0 }); },
  get: async () => undefined,
  all: async () => [],
} as unknown as DatabaseAdapter;

async function startApp(trustProxy: string | boolean): Promise<{ server: Server; base: string }> {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.use('/api', createAuditEventsMiddleware(db));
  app.post('/api/things', (_req, res) => { res.status(201).json({ ok: true }); });
  const server = await new Promise<Server>((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

let behindProxy: { server: Server; base: string };
let direct: { server: Server; base: string };

beforeAll(async () => {
  behindProxy = await startApp('loopback');
  direct = await startApp(false);
});

afterAll(async () => {
  for (const s of [behindProxy?.server, direct?.server]) await new Promise<void>((resolve) => s?.close(() => resolve()));
});

beforeEach(() => { writes.length = 0; });

async function recordedIp(base: string, forwardedFor?: string): Promise<unknown> {
  const res = await fetch(`${base}/api/things`, {
    method: 'POST',
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  });
  expect(res.status).toBe(201);
  await vi.waitFor(() => expect(writes).toHaveLength(1));
  return writes[0][IP_COLUMN];
}

describe('the address in audit_events', () => {
  it('behind the trusted proxy, records the address the proxy saw — not the one the client wrote first', async () => {
    // nginx's proxy_add_x_forwarded_for appends the real peer to whatever the client sent.
    expect(await recordedIp(behindProxy.base, '6.6.6.6, 203.0.113.9')).toBe('203.0.113.9');
  });

  it('with no trusted proxy, ignores the header and records the socket address', async () => {
    expect(await recordedIp(direct.base, '6.6.6.6')).toBe('127.0.0.1');
  });

  it('records the socket address when no header is sent (control)', async () => {
    expect(await recordedIp(behindProxy.base)).toBe('127.0.0.1');
    writes.length = 0;
    expect(await recordedIp(direct.base)).toBe('127.0.0.1');
  });
});
