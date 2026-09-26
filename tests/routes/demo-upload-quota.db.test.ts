/**
 * demo-upload-quota.db.test.ts — one demo visitor cannot fill the disk
 * (public showcase review, 2026-09-25, finding C6).
 *
 * POST /api/files/upload is on the demo allowlist, and nothing summed what an
 * account had stored: a visitor looping 10 MB uploads (1,200 requests a
 * minute passed the general limiter) filled the VM disk that uploads share
 * with PostgreSQL, and the showcase went down for everyone.
 *
 * In demo mode a non-admin now has a quota (DEMO_USER_UPLOAD_MB and
 * DEMO_USER_UPLOAD_FILES): refused with 413 before multer writes anything,
 * and checked again once the file is on record, so uploads racing past the
 * first check cannot keep more than the quota between them.
 *
 * Negative controls: uploads under the quota succeed; an admin and a server
 * that is not a demo are not limited.
 *
 * Against the real file_uploads table; skips without a test database.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const TAG = randomUUID().slice(0, 8);
const KB = 1024;
const ENV_KEYS = ['DEMO_MODE', 'DEMO_USER_UPLOAD_MB', 'DEMO_USER_UPLOAD_FILES'] as const;

d('the demo upload quota (routes/files.ts)', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';
  let uploadDir = '';
  const savedEnv: Record<string, string | undefined> = {};
  const savedUploadDir = process.env.UPLOAD_DIR;

  beforeAll(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-quota-uploads-'));
    // files.ts reads UPLOAD_DIR when it loads.
    process.env.UPLOAD_DIR = uploadDir;
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    const { createFilesRoutes } = await import('../../server/routes/files.js');
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const id = req.header('x-test-user');
      if (id) req.user = { id, username: id, role: (req.header('x-test-role') ?? 'analyst') as 'admin' | 'analyst' | 'viewer' };
      next();
    });
    app.use('/api', createFilesRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
    }
  });

  afterAll(async () => {
    if (savedUploadDir === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = savedUploadDir;
    if (db) {
      await db.run('DELETE FROM file_uploads WHERE uploaded_by LIKE ?', `%-${TAG}`).catch(() => {});
      await db.close();
    }
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  const user = (name: string) => `${name}-${TAG}`;

  async function upload(userId: string, bytes: number, role = 'analyst'): Promise<{ status: number; body: { id?: string; code?: string; error?: string } }> {
    const form = new FormData();
    form.append('file', new Blob([Buffer.alloc(bytes, 'a')], { type: 'text/plain' }), 'notes.txt');
    const res = await fetch(`${base}/api/files/upload`, {
      method: 'POST', body: form, headers: { 'x-test-user': userId, 'x-test-role': role },
    });
    return { status: res.status, body: await res.json() as { id?: string; code?: string; error?: string } };
  }

  async function stored(userId: string): Promise<{ bytes: number; files: number; onDisk: number }> {
    const row = await db.get<{ bytes: string | number; files: string | number }>(
      'SELECT COALESCE(SUM(size_bytes), 0) AS bytes, COUNT(*) AS files FROM file_uploads WHERE uploaded_by = ?', userId,
    );
    const ids = await db.all<{ id: string }>('SELECT id FROM file_uploads WHERE uploaded_by = ?', userId);
    const onDisk = ids.filter((r) => fs.existsSync(path.join(uploadDir, r.id))).length;
    return { bytes: Number(row?.bytes ?? 0), files: Number(row?.files ?? 0), onDisk };
  }

  const diskFiles = () => fs.readdirSync(uploadDir).length;

  it('refuses the upload that would take a visitor past the byte quota — before writing it', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_USER_UPLOAD_MB = '1';
    const visitor = user('bytes');
    expect((await upload(visitor, 400 * KB)).status).toBe(200);
    expect((await upload(visitor, 400 * KB)).status).toBe(200);
    const before = diskFiles();

    const third = await upload(visitor, 400 * KB);
    expect(third.status).toBe(413);
    expect(third.body.code).toBe('UPLOAD_QUOTA');
    expect(third.body.error).toMatch(/upload limit \(1 MB/);
    expect(diskFiles()).toBe(before);
    expect(await stored(visitor)).toEqual({ bytes: 800 * KB, files: 2, onDisk: 2 });

    // Refused before multer runs: a file multer itself would turn away for its
    // type gets the quota answer, so the upload never reached the disk.
    const form = new FormData();
    form.append('file', new Blob([Buffer.alloc(400 * KB, 'a')]), 'tool.exe');
    const early = await fetch(`${base}/api/files/upload`, { method: 'POST', body: form, headers: { 'x-test-user': visitor } });
    expect(early.status).toBe(413);
    expect(((await early.json()) as { code?: string }).code).toBe('UPLOAD_QUOTA');
  });

  it('refuses the file past the count quota', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_USER_UPLOAD_FILES = '3';
    const visitor = user('count');
    for (let i = 0; i < 3; i++) expect((await upload(visitor, 1 * KB)).status).toBe(200);
    const fourth = await upload(visitor, 1 * KB);
    expect(fourth.status).toBe(413);
    expect((await stored(visitor)).files).toBe(3);
  });

  it('uploads racing past the first check keep no more than the quota between them', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_USER_UPLOAD_MB = '1';
    const visitor = user('race');
    const results = await Promise.all([0, 1, 2, 3].map(() => upload(visitor, 450 * KB)));
    const ok = results.filter((r) => r.status === 200).length;
    expect(results.every((r) => r.status === 200 || r.status === 413)).toBe(true);
    const s = await stored(visitor);
    expect(s.bytes).toBeLessThanOrEqual(1024 * KB);
    expect(s.files).toBe(ok);
    // A refused upload leaves no file behind.
    expect(s.onDisk).toBe(ok);
  });

  it('negative control: an admin on the demo is not limited', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_USER_UPLOAD_MB = '1';
    const owner = user('admin');
    for (let i = 0; i < 3; i++) expect((await upload(owner, 400 * KB, 'admin')).status).toBe(200);
    expect((await stored(owner)).bytes).toBe(1200 * KB);
  });

  it('negative control: outside demo mode nobody is limited', async () => {
    delete process.env.DEMO_MODE;
    process.env.DEMO_USER_UPLOAD_MB = '1';
    const member = user('team');
    for (let i = 0; i < 3; i++) expect((await upload(member, 400 * KB)).status).toBe(200);
    expect((await stored(member)).files).toBe(3);
  });
});
