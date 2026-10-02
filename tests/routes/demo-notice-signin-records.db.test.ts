/**
 * demo-notice-signin-records.db.test.ts — what sign-in and sign-up leave in
 * the database on a public demo, held to what the privacy notice says about
 * it (src/pages/PrivacyNoticePage.tsx, section 3, "Security and technical
 * data"; privacy verification 2026-09-26, problem 7):
 *
 *   - "A failed sign-up records no username": a refused sign-up (wrong code,
 *     taken name, missing tick) writes no login_attempts row and no security
 *     event naming the name;
 *   - "If the invite code was wrong, a security event records the IP address
 *     and the time";
 *   - "a successful sign-up is recorded like a successful sign-in": one
 *     login_attempts row with the username, marked a success;
 *   - "Sign-in attempts: the username typed, the IP address, the time and
 *     whether it succeeded" — for a name no account has too;
 *   - "If it belongs to no account, the event holds a short keyed code (an
 *     HMAC) made from the typed name, not the name itself";
 *   - "If the username belongs to an account, the event is linked to that
 *     account".
 *
 * The successful sign-up is the negative control: the same queries that find
 * nothing for a refused sign-up find its row. If routes/auth.ts changes what
 * it records, this fails, and the notice has to change with it.
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { DEMO_TERMS_VERSION } from '../../server/middleware/demo-mode.js';

const H = vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-demo-notice-0123456789abcdef';
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let tag = '';
  for (let i = 0; i < 8; i++) tag += letters[Math.floor(Math.random() * letters.length)];
  let hex = '';
  for (let i = 0; i < 4; i++) hex += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  return { tag, hex };
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const TAG = H.tag;
const CODE = `invite-${TAG}`;
const PASSWORD = 'a-long-enough-pass';
const ACCOUNT = `acct_${TAG}`;
const MIGRATIONS = ['289_demo_accounts.sql', '291_demo_terms_acceptance.sql']
  .map((f) => path.resolve(__dirname, '../../server/db/migrations-pg', f));

/** Client addresses from the IPv6 documentation range, unique to this run. */
let ipSeq = 0;
const nextIp = () => `2001:db8:${H.hex}::${(++ipSeq).toString(16)}`;

const ENV_KEYS = ['DEMO_MODE', 'DEMO_SIGNUP_CODE', 'DEMO_SIGNUP_OPEN', 'DEPLOYMENT_MODE', 'DEMO_SIGNUPS_PER_IP_PER_HOUR', 'DEMO_MAX_SIGNUPS_PER_DAY'];
const savedEnv: Record<string, string | undefined> = {};

d('what sign-in and sign-up record on a demo (notice section 3)', () => {
  let db: DatabaseAdapter;
  let server: Server;
  let base = '';

  beforeAll(async () => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.DEPLOYMENT_MODE = 'team';
    process.env.DEMO_MODE = 'true';
    process.env.DEMO_SIGNUP_CODE = CODE;
    process.env.DEMO_SIGNUPS_PER_IP_PER_HOUR = '50';
    process.env.DEMO_MAX_SIGNUPS_PER_DAY = '0';

    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    for (const file of MIGRATIONS) await db.exec(fs.readFileSync(file, 'utf8'));
    await db.run(
      `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'analyst')`,
      `u-${ACCOUNT}`, ACCOUNT, await bcrypt.hash(PASSWORD, 4),
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

  afterAll(async () => {
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k];
    }
    if (db) {
      const like = `%${TAG}%`;
      await db.run('DELETE FROM login_attempts WHERE username LIKE ?', like).catch(() => {});
      await db.run('DELETE FROM security_events WHERE ip_address LIKE ?', `2001:db8:${H.hex}::%`).catch(() => {});
      await db.run('DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE username LIKE ?)', like).catch(() => {});
      await db.run('DELETE FROM users WHERE username LIKE ?', like).catch(() => {});
      await db.close();
    }
    await new Promise<void>((resolve) => { server?.close(() => resolve()); });
  });

  const signup = (body: Record<string, unknown>, ip: string) =>
    fetch(`${base}/api/auth/demo-signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ code: CODE, password: PASSWORD, over18: true, acceptTerms: true, termsVersion: DEMO_TERMS_VERSION, ...body }),
    });
  const login = (username: string, password: string, ip: string) =>
    fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ username, password }),
    });
  const attemptsFor = (username: string) =>
    db.all<{ ip_address: string; success: number }>('SELECT ip_address, success FROM login_attempts WHERE username = ?', username);
  /** Security events are written without waiting for them (logSecurityEvent); give them a moment. */
  async function eventsFrom(ip: string, atLeast: number): Promise<Array<{ user_id: string | null; details: string; created_at: Date }>> {
    for (let i = 0; i < 40; i++) {
      const rows = await db.all<{ user_id: string | null; details: string; created_at: Date }>(
        'SELECT user_id, details, created_at FROM security_events WHERE ip_address = ?', ip,
      );
      if (rows.length >= atLeast) return rows;
      await new Promise((r) => setTimeout(r, 25));
    }
    return db.all('SELECT user_id, details, created_at FROM security_events WHERE ip_address = ?', ip);
  }
  const mentionsAnywhere = async (text: string) => {
    const row = await db.get<{ n: number | string }>('SELECT COUNT(*) AS n FROM security_events WHERE details LIKE ?', `%${text}%`);
    return Number(row?.n ?? 0);
  };

  it('a refused sign-up records no username: wrong code, taken name, missing tick', async () => {
    const wrongCode = `wrongcode_${TAG}`;
    const ipCode = nextIp();
    expect((await signup({ username: wrongCode, code: 'not-the-code' }, ipCode)).status).toBe(403);

    const taken = ACCOUNT.toUpperCase();
    expect((await signup({ username: taken }, nextIp())).status).toBe(409);

    const noTick = `notick_${TAG}`;
    expect((await signup({ username: noTick, over18: false }, nextIp())).status).toBe(400);

    for (const name of [wrongCode, taken, noTick]) {
      expect(await attemptsFor(name), name).toEqual([]);
      expect(await mentionsAnywhere(name), name).toBe(0);
    }

    // "If the invite code was wrong, a security event records the IP address and the time."
    const events = await eventsFrom(ipCode, 1);
    expect(events).toHaveLength(1);
    expect(events[0].user_id).toBeNull();
    expect(events[0].created_at).toBeTruthy();
    expect(events[0].details).not.toContain(wrongCode);
  });

  it('negative control: a successful sign-up is recorded like a successful sign-in', async () => {
    const name = `newvisitor_${TAG}`;
    const ip = nextIp();
    expect((await signup({ username: name }, ip)).status).toBe(201);
    const rows = await attemptsFor(name);
    expect(rows).toHaveLength(1);
    expect(rows[0].ip_address).toBe(ip);
    expect(Number(rows[0].success)).toBe(1);
  });

  it('a failed sign-in for a name no account has: the typed name in the attempt, only a keyed code in the event', async () => {
    const ghost = `ghost_${TAG}`;
    const ip = nextIp();
    expect((await login(ghost, 'whatever-password', ip)).status).toBe(401);

    const rows = await attemptsFor(ghost);
    expect(rows).toHaveLength(1);
    expect(rows[0].ip_address).toBe(ip);
    expect(Number(rows[0].success)).toBe(0);

    const events = await eventsFrom(ip, 1);
    expect(events).toHaveLength(1);
    expect(events[0].user_id).toBeNull();
    expect(events[0].details).toMatch(/name tag [0-9a-f]{12}\b/);
    expect(events[0].details).not.toContain(ghost);
    expect(await mentionsAnywhere(ghost)).toBe(0);
  });

  it('a failed sign-in for an existing account: the event is linked to that account', async () => {
    const ip = nextIp();
    expect((await login(ACCOUNT, 'not-the-password', ip)).status).toBe(401);
    const rows = await attemptsFor(ACCOUNT);
    expect(rows.some((r) => r.ip_address === ip && Number(r.success) === 0)).toBe(true);
    const events = await eventsFrom(ip, 1);
    expect(events).toHaveLength(1);
    expect(events[0].user_id).toBe(`u-${ACCOUNT}`);
  });
});
