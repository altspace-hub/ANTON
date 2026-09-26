/**
 * demo-write-limiter.test.ts — the per-account throttle on the demo's
 * byte-storing routes, and the upload quota settings (public showcase
 * review, 2026-09-25, finding C6).
 *
 * The general per-user limiter allows 1,200 requests a minute: at 10 MB an
 * upload, that fills a disk. createDemoWriteLimiter() (mounted by index.ts on
 * uploads, exports and version saves) holds a demo visitor to
 * DEMO_USER_WRITES_PER_10_MIN. Negative controls: an admin, and every caller
 * on a server that is not a demo, pass untouched; one visitor's count is not
 * another's.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createDemoWriteLimiter, demoUserUploadQuota, demoUserWritesPer10Min } from '../../server/middleware/demo-mode.js';

const ENV_KEYS = ['DEMO_MODE', 'DEMO_USER_WRITES_PER_10_MIN'] as const;
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

describe('the quota and throttle settings', () => {
  it('default to 50 MB, 50 files and 30 writes per 10 minutes; 0 turns a quota off', () => {
    expect(demoUserUploadQuota({})).toEqual({ maxBytes: 50 * 1024 * 1024, maxFiles: 50 });
    expect(demoUserUploadQuota({ DEMO_USER_UPLOAD_MB: '5', DEMO_USER_UPLOAD_FILES: '0' })).toEqual({ maxBytes: 5 * 1024 * 1024, maxFiles: 0 });
    expect(demoUserUploadQuota({ DEMO_USER_UPLOAD_MB: 'lots' }).maxBytes).toBe(50 * 1024 * 1024);
    expect(demoUserWritesPer10Min({})).toBe(30);
    expect(demoUserWritesPer10Min({ DEMO_USER_WRITES_PER_10_MIN: '0' })).toBe(1);
  });
});

describe('createDemoWriteLimiter (mounted as index.ts would)', () => {
  let server: Server;
  let base = '';
  let seq = 0;

  beforeAll(async () => {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const id = req.header('x-test-user');
      if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    const limiter = createDemoWriteLimiter();
    app.post('/api/files/upload', limiter);
    app.post('/api/files/upload', (_req, res) => { res.json({ stored: true }); });
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server?.close(() => resolve())); });

  /** A fresh account name per test: the limiter's window outlives a test. */
  const fresh = (name: string) => `${name}-${++seq}`;
  const post = (user: string, role = 'analyst') =>
    fetch(`${base}/api/files/upload`, { method: 'POST', headers: { 'x-test-user': user, 'x-test-role': role } });

  it('holds a demo visitor to DEMO_USER_WRITES_PER_10_MIN', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_USER_WRITES_PER_10_MIN = '3';
    const visitor = fresh('visitor');
    for (let i = 0; i < 3; i++) expect((await post(visitor)).status).toBe(200);
    const fourth = await post(visitor);
    expect(fourth.status).toBe(429);
    expect(((await fourth.json()) as { error: string }).error).toMatch(/Too many uploads or exports/);
    // Another visitor has their own count.
    expect((await post(fresh('other'))).status).toBe(200);
  });

  it('negative control: an admin on the demo is not counted', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_USER_WRITES_PER_10_MIN = '2';
    const owner = fresh('owner');
    for (let i = 0; i < 5; i++) expect((await post(owner, 'admin')).status).toBe(200);
  });

  it('negative control: outside demo mode nobody is counted', async () => {
    delete process.env.DEMO_MODE;
    process.env.DEMO_USER_WRITES_PER_10_MIN = '2';
    const member = fresh('member');
    for (let i = 0; i < 5; i++) expect((await post(member)).status).toBe(200);
  });
});
