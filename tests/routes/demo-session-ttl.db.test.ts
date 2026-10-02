/**
 * demo-session-ttl.db.test.ts — a sign-in on a public demo (DEMO_MODE=true)
 * ends within 8 hours on the server, whatever JWT_EXPIRY says (privacy
 * verification 2026-09-26, problem 8; the notice says "8 hours at the
 * latest"). Drives POST /api/auth/login on the test database with
 * JWT_EXPIRY=7d and reads the user_sessions row and the token it issued.
 *
 * Negative control: the same sign-in outside demo mode keeps the 7 days.
 * The unit half is tests/middleware/demo-session-ttl.test.ts.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

const H = vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-demo-session-ttl-0123456789abcdef';
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let tag = '';
  for (let i = 0; i < 8; i++) tag += letters[Math.floor(Math.random() * letters.length)];
  return { tag };
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const TAG = H.tag;
const USERNAME = `ttl_${TAG}`;
const PASSWORD = 'a-long-enough-pass';
// users.demo_expires_at, which sign-in reads (idempotent).
const MIGRATION = path.resolve(__dirname, '../../server/db/migrations-pg/289_demo_accounts.sql');
const HOUR = 60 * 60 * 1000;
const ENV_KEYS = ['DEPLOYMENT_MODE', 'DEMO_MODE', 'JWT_EXPIRY'] as const;
const savedEnv: Record<string, string | undefined> = {};

// TEST-NET-1 addresses, one per sign-in (the other sign-in tests use TEST-NET-2 and -3).
let ipSeq = 0;
const nextIp = () => `192.0.2.${200 + (++ipSeq % 50)}`;

d('the sign-in lifetime on a demo (routes/auth.ts issueSession)', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';

  beforeAll(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.DEPLOYMENT_MODE = 'team';
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 2 });
    await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
    await db.run(
      `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'analyst')`,
      `u-${USERNAME}`, USERNAME, await bcrypt.hash(PASSWORD, 4),
    );
    const { createAuthRoutes } = await import('../../server/routes/auth.js');
    const app = express();
    app.set('trust proxy', true);
    app.use(cookieParser());
    app.use(express.json());
    app.use('/api', await createAuthRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    for (const k of ['DEMO_MODE', 'JWT_EXPIRY'] as const) {
      if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
    }
  });

  afterAll(async () => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
    }
    if (db) {
      await db.run('DELETE FROM login_attempts WHERE username = ?', USERNAME).catch(() => {});
      await db.run('DELETE FROM security_events WHERE user_id = ?', `u-${USERNAME}`).catch(() => {});
      await db.run('DELETE FROM user_sessions WHERE user_id = ?', `u-${USERNAME}`).catch(() => {});
      await db.run('DELETE FROM users WHERE id = ?', `u-${USERNAME}`).catch(() => {});
      await db.close();
    }
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
  });

  /** Signs in; returns how long the session row and the token live, in ms from now. */
  async function signIn(): Promise<{ rowMs: number; tokenMs: number }> {
    const before = Date.now();
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    const { token } = await res.json() as { token: string };
    const row = await db.get<{ expires_at: Date | string }>('SELECT expires_at FROM user_sessions WHERE token = ?', token);
    expect(row).toBeDefined();
    const claims = jwt.decode(token) as { exp: number };
    return { rowMs: new Date(row!.expires_at).getTime() - before, tokenMs: claims.exp * 1000 - before };
  }

  it('on a demo, with JWT_EXPIRY=7d, the session row and the token end within 8 hours', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.JWT_EXPIRY = '7d';
    const { rowMs, tokenMs } = await signIn();
    expect(rowMs).toBeLessThanOrEqual(8 * HOUR + 60_000);
    expect(rowMs).toBeGreaterThan(7 * HOUR);
    expect(tokenMs).toBeLessThanOrEqual(8 * HOUR + 60_000);
  });

  it('outside demo mode the same sign-in lasts JWT_EXPIRY, 7 days (negative control)', async () => {
    delete process.env.DEMO_MODE;
    process.env.JWT_EXPIRY = '7d';
    const { rowMs, tokenMs } = await signIn();
    expect(rowMs).toBeGreaterThan(6 * 24 * HOUR);
    expect(tokenMs).toBeGreaterThan(6 * 24 * HOUR);
  });
});
