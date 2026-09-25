/**
 * request-origin-behind-proxy.test.ts — two questions the server answered from
 * the raw request (public-demo readiness, 2026-09-25):
 *
 * 1. "Is the caller on this machine?" /metrics compared
 *    req.socket.remoteAddress with 127.0.0.1. Behind a same-host nginx every
 *    visitor's socket is 127.0.0.1, so the endpoint was public. It now reads
 *    req.ip, which honours TRUST_PROXY (loopback by default): the forwarded
 *    client address is what counts.
 *
 * 2. "Where should a link we send point?" A project invitation email carried
 *    a link built from the request's Host header, which the sender controls —
 *    the owner's mail server would send a link to any host. It now uses
 *    APP_PUBLIC_URL (then BASE_URL), like password-reset links. So does the
 *    webhook URL a new trigger reports.
 *
 * Negative controls: a direct loopback request (no proxy) still reads the
 * metrics, METRICS_ENABLED=true still opens them, and with no public URL
 * configured a dev machine still gets a link to the host it was called on.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { Server } from 'node:http';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

const mail = vi.hoisted(() => ({ sendProjectInvitationEmail: vi.fn(async () => undefined) }));
vi.mock('../../server/services/email.js', () => ({ sendProjectInvitationEmail: mail.sendProjectInvitationEmail }));

const trig = vi.hoisted(() => ({
  createTrigger: vi.fn(async () => ({
    id: 'trg_1', endpoint_path: '/webhooks/inbound/trg_1', auth_config: { method: 'hmac_sha256', secret: 's' },
  })),
}));
vi.mock('../../server/services/webhook-listener.js', () => ({ createWebhookListener: async () => trig }));

import { isLoopbackAddress, publicBaseUrl } from '../../server/lib/request-origin.js';
import { createMetricsRouter } from '../../server/routes/metrics.js';
import { createProjectCollaborationRoutes } from '../../server/routes/project-collaboration.js';
import { createTriggersRoutes } from '../../server/routes/triggers.js';

const fakeDb = {
  dialect: 'postgresql',
  async get(sql: string) {
    if (/SELECT role FROM project_members/.test(sql)) return { role: 'owner' };
    if (/SELECT name FROM projects/.test(sql)) return { name: 'Alpha' };
    if (/COUNT/.test(sql)) return { c: 0 };
    return undefined;
  },
  async all() { return []; },
  async run(): Promise<RunResult> { return { changes: 1, lastInsertRowid: 0 }; },
  async exec() { /* noop */ },
  async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(fakeDb as unknown as DatabaseAdapter); },
  async close() { /* noop */ },
};
const db = fakeDb as unknown as DatabaseAdapter;

const saved = {
  mode: process.env.DEPLOYMENT_MODE,
  appUrl: process.env.APP_PUBLIC_URL,
  baseUrl: process.env.BASE_URL,
  metrics: process.env.METRICS_ENABLED,
};
let server: Server;
let port = 0;

beforeAll(async () => {
  // project-collaboration reads the mode when its router is built.
  process.env.DEPLOYMENT_MODE = 'team';
  delete process.env.METRICS_ENABLED;
  const app = express();
  // The index.ts default: trust a proxy on this machine.
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  app.use((req, _res, next) => {
    const id = req.header('x-test-user');
    if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
    next();
  });
  app.use('/', await createMetricsRouter(db));
  app.use('/api', await createProjectCollaborationRoutes(db));
  app.use('/api', await createTriggersRoutes(db));
  await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no server address');
  port = addr.port;
});

afterAll(async () => {
  for (const [k, v] of [['DEPLOYMENT_MODE', saved.mode], ['APP_PUBLIC_URL', saved.appUrl], ['BASE_URL', saved.baseUrl], ['METRICS_ENABLED', saved.metrics]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  await new Promise<void>((resolve) => { server?.close(() => resolve()); });
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.APP_PUBLIC_URL;
  delete process.env.BASE_URL;
  delete process.env.METRICS_ENABLED;
});

/** node:http, because fetch will not let a caller choose the Host header. */
function request(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1', port, method, path,
      headers: { ...headers, ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(payload)) } : {}) },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('/metrics: loopback means the client, not the proxy', () => {
  it('a visitor forwarded by a same-host proxy is refused', async () => {
    const r = await request('GET', '/metrics', { 'X-Forwarded-For': '203.0.113.7' });
    expect(r.status).toBe(403);
    expect(r.body).not.toMatch(/openexpert_/);
  });

  it('negative control: a direct request on this machine still reads them', async () => {
    const r = await request('GET', '/metrics', {});
    expect(r.status).toBe(200);
    expect(r.body).toMatch(/openexpert_http_requests_total/);
  });

  it('negative control: METRICS_ENABLED=true opens them to a forwarded client', async () => {
    process.env.METRICS_ENABLED = 'true';
    expect((await request('GET', '/metrics', { 'X-Forwarded-For': '203.0.113.7' })).status).toBe(200);
  });

  it('isLoopbackAddress: 127/8, ::1 and the mapped form; nothing else', () => {
    for (const ip of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1']) expect(isLoopbackAddress(ip), ip).toBe(true);
    for (const ip of ['203.0.113.7', '::ffff:203.0.113.7', '10.0.0.1', '', undefined, 'localhost']) expect(isLoopbackAddress(ip), String(ip)).toBe(false);
  });
});

const OWNER = { 'x-test-user': 'olive', 'x-test-role': 'analyst' };
const ADMIN = { 'x-test-user': 'root', 'x-test-role': 'admin' };

describe('links we send point at the configured public URL, not the Host header', () => {
  it('a project invitation links to APP_PUBLIC_URL even when the request names another host', async () => {
    process.env.APP_PUBLIC_URL = 'https://anton.example.com/';
    const r = await request('POST', '/api/projects/p1/invitations', { ...OWNER, Host: 'evil.example' }, { email: 'x@example.test' });
    expect(r.status).toBe(200);
    expect(mail.sendProjectInvitationEmail).toHaveBeenCalledTimes(1);
    const acceptUrl = String((mail.sendProjectInvitationEmail.mock.calls[0] as unknown[])[4]);
    expect(acceptUrl).toMatch(/^https:\/\/anton\.example\.com\/api\/projects\/invitations\/accept\/[0-9a-f]+$/);
    expect(acceptUrl).not.toContain('evil.example');
  });

  it('BASE_URL is the fallback when APP_PUBLIC_URL is unset', async () => {
    process.env.BASE_URL = 'https://base.example.com';
    await request('POST', '/api/projects/p1/invitations', { ...OWNER, Host: 'evil.example' }, { email: 'x@example.test' });
    expect(String((mail.sendProjectInvitationEmail.mock.calls[0] as unknown[])[4])).toMatch(/^https:\/\/base\.example\.com\//);
  });

  it('negative control: with no public URL configured, a dev machine links to the host it was called on', async () => {
    await request('POST', '/api/projects/p1/invitations', { ...OWNER, Host: 'localhost:5183' }, { email: 'x@example.test' });
    expect(String((mail.sendProjectInvitationEmail.mock.calls[0] as unknown[])[4])).toMatch(/^http:\/\/localhost:5183\//);
  });

  it('a new trigger reports its webhook URL on APP_PUBLIC_URL', async () => {
    process.env.APP_PUBLIC_URL = 'https://anton.example.com';
    const r = await request('POST', '/api/triggers', { ...ADMIN, Host: 'evil.example' }, {
      name: 'T', trigger_type: 'webhook', workflow_id: 'wf', auth_config: { method: 'hmac_sha256', secret: 'x' },
    });
    expect(r.status).toBe(201);
    expect((JSON.parse(r.body) as { webhook_url: string }).webhook_url).toBe('https://anton.example.com/webhooks/inbound/trg_1');
  });

  it('publicBaseUrl trims trailing slashes', () => {
    process.env.APP_PUBLIC_URL = 'https://a.example//';
    expect(publicBaseUrl({ protocol: 'http', get: () => 'x' })).toBe('https://a.example');
  });
});
