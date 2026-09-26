/**
 * demo-account.db.test.ts — scripts/demo-account.ts, the administrator's tool
 * for visitors' rights requests on the public demo (privacy review
 * 2026-09-26, problem 3 / code change #29).
 *
 *   - export <username>: every row of that account as JSON on stdout, and no
 *     other account's rows (negative control: a second demo account with its
 *     own session). Password hash, MFA secret, sign-in and reset tokens are
 *     "[redacted]"; none of them appears anywhere in the output.
 *   - delete <username>: without --yes it deletes nothing; with --yes the demo
 *     account and its rows are gone and the other account's stay. An
 *     administrator, and an account that is not a demo account, are refused.
 *   - No DATABASE_URL: refused before any database is opened — also as a real
 *     process, which also shows that stdout carries the JSON and nothing else.
 *
 * Skips the database cases without a test database (tests/setup/db-guard.ts
 * decides which).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { runCli, parseArgs, isSecretKey, redactValue, type CliIO } from '../../scripts/demo-account';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;
const TAG = randomUUID().slice(0, 8);
const SCRIPT = path.resolve(__dirname, '../../scripts/demo-account.ts');
const TSX_CLI = path.resolve(__dirname, '../../node_modules/tsx/dist/cli.mjs');

/** A bcrypt-shaped password hash, a JWT-shaped string: values that must never reach the output. */
const BCRYPT = `$2b$12$${'A'.repeat(22)}${TAG.padEnd(31, 'x')}`;
const JWT = `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ${TAG}IifQ.c2lnbmF0dXJl${TAG}`;

function capture(): CliIO & { stdout: () => string; stderr: () => string } {
  let out = '';
  let err = '';
  return {
    out: (t: string) => { out += t; },
    err: (t: string) => { err += t; },
    stdout: () => out,
    stderr: () => err,
  };
}

/** Runs the real script as the administrator would, from a directory with no .env. */
function runProcess(args: string[], env: NodeJS.ProcessEnv, cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [TSX_CLI, SCRIPT, ...args], { cwd, env, maxBuffer: 64 * 1024 * 1024, timeout: 90_000 }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

describe('demo-account CLI without a database', () => {
  it('parses the commands and refuses anything else', () => {
    expect(parseArgs(['export', 'alice'])).toEqual({ kind: 'export', username: 'alice', yes: false });
    expect(parseArgs(['delete', 'alice', '--yes'])).toEqual({ kind: 'delete', username: 'alice', yes: true });
    expect(parseArgs(['export', 'alice', '--yes'])).toMatchObject({ kind: 'usage' });
    expect(parseArgs(['delete', 'alice', '--force'])).toMatchObject({ kind: 'usage' });
    expect(parseArgs(['drop', 'alice'])).toMatchObject({ kind: 'usage' });
    expect(parseArgs(['delete'])).toMatchObject({ kind: 'usage' });
    expect(parseArgs(['delete', 'alice', 'bob'])).toMatchObject({ kind: 'usage' });
  });

  it('refuses to run without DATABASE_URL, before opening any database', async () => {
    const openDb = vi.fn();
    for (const [env, reason] of [
      [{}, /Refused: DATABASE_URL is not set/],
      [{ DATABASE_URL: '  ' }, /Refused: DATABASE_URL is not set/],
      [{ DATABASE_URL: 'mysql://x@y/z' }, /Refused: DATABASE_URL is not a PostgreSQL/],
    ] as const) {
      const io = capture();
      expect(await runCli(['delete', 'alice', '--yes'], { env, io, openDb })).toBe(1);
      expect(io.stderr()).toMatch(reason);
      expect(io.stdout()).toBe('');
    }
    expect(openDb).not.toHaveBeenCalled();
    // A usage error is reported as one (exit 2), also without a database.
    const io = capture();
    expect(await runCli(['export'], { env: {}, io, openDb })).toBe(2);
  });

  it('redacts secrets by key (columns and JSON keys) and by shape, and keeps usage counts and content', () => {
    for (const k of ['password_hash', 'mfa_secret', 'token', 'access_token', 'shareToken', 'refresh_token', 'token_hash', 'jti',
      'api_key', 'apiKey', 'private_key_encrypted', 'privkey_iv', 'encrypted_data', 'guardian_invite_code', 'auth_config', 'embedding', 'secret']) {
      expect(isSecretKey(k), k).toBe(true);
    }
    for (const k of ['input_tokens', 'token_count', 'max_tokens', 'content', 'content_hash', 'public_key', 'username', 'key_decisions', 'secretary_name', 'title']) {
      expect(isSecretKey(k), k).toBe(false);
    }
    expect(redactValue({ content: `before ${JWT} after`, nested: { apiKey: 'sk-live', n: 3 }, list: [BCRYPT, 'plain'] })).toEqual({
      content: 'before [redacted] after',
      nested: { apiKey: '[redacted]', n: 3 },
      list: ['[redacted]', 'plain'],
    });
  });

  it('as a real process: no DATABASE_URL (and no .env in the directory) is refused with exit 1', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-account-'));
    try {
      const env = { ...process.env };
      delete env.DATABASE_URL;
      const r = await runProcess(['export', 'alice'], env, cwd);
      expect(r.code).toBe(1);
      expect(r.stderr).toMatch(/Refused: DATABASE_URL is not set/);
      expect(r.stdout).toBe('');
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }, 120_000);
});

d('demo-account CLI on the test database', () => {
  let db: DatabaseAdapter;
  let uploadDir: string;
  const env = (): NodeJS.ProcessEnv => ({ DATABASE_URL });
  const ids = {
    visitor: randomUUID(), other: randomUUID(), admin: randomUUID(), ordinary: randomUUID(),
  };
  const names = {
    visitor: `dacct_visitor_${TAG}`, other: `dacct_other_${TAG}`, admin: `dacct_admin_${TAG}`, ordinary: `dacct_ordinary_${TAG}`,
  };
  const rows = {
    visitorSession: randomUUID(), visitorMessage: randomUUID(), otherSession: randomUUID(), otherMessage: randomUUID(),
    visitorToken: `tok-dacct-visitor-${TAG}`, otherToken: `tok-dacct-other-${TAG}`, resetToken: `reset-dacct-${TAG}`,
    mfaSecret: `MFASECRET${TAG}`, pendingSecret: `PENDING${TAG}`,
  };

  const count = async (sql: string, ...params: unknown[]): Promise<number> =>
    Number((await db.get<{ n: string | number }>(sql, ...params))?.n ?? 0);

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 4 });
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-account-uploads-'));
    const add = async (kind: keyof typeof ids, role: string, expires: string) =>
      await db.run(
        `INSERT INTO users (id, username, password_hash, role, mfa_secret, demo_expires_at) VALUES (?, ?, ?, ?, ?, ${expires})`,
        ids[kind], names[kind], BCRYPT, role, kind === 'visitor' ? rows.mfaSecret : null,
      );
    await add('visitor', 'analyst', "NOW() + INTERVAL '10 days'");
    await add('other', 'analyst', "NOW() + INTERVAL '10 days'");
    // A demo account promoted to administrator: still never deleted.
    await add('admin', 'admin', "NOW() + INTERVAL '10 days'");
    await add('ordinary', 'analyst', 'NULL');

    for (const [who, session, message, token] of [
      ['visitor', rows.visitorSession, rows.visitorMessage, rows.visitorToken],
      ['other', rows.otherSession, rows.otherMessage, rows.otherToken],
    ] as const) {
      await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, 'competitive-analysis', ?, '{}', ?)`, session, `title-${who}-${TAG}`, ids[who]);
      await db.run(`INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, 'assistant', ?)`, message, session, `answer of ${who} ${TAG}; pasted ${JWT} here`);
      await db.run(`INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL '1 day')`, token, ids[who]);
    }
    await db.run(`INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, NOW() + INTERVAL '1 hour')`, ids.visitor, rows.resetToken);
    await db.run(`INSERT INTO mfa_pending (user_id, secret) VALUES (?, ?)`, ids.visitor, rows.pendingSecret);
  });

  afterAll(async () => {
    if (!db) return;
    for (const id of Object.values(ids)) {
      await db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', id).catch(() => {});
      await db.run('DELETE FROM mfa_pending WHERE user_id = ?', id).catch(() => {});
      await db.run('DELETE FROM user_sessions WHERE user_id = ?', id).catch(() => {});
      await db.run('DELETE FROM sessions WHERE user_id = ?', id).catch(() => {});
      await db.run('DELETE FROM users WHERE id = ?', id).catch(() => {});
    }
    await db.close();
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  it('every account is seeded (the test would prove nothing otherwise)', async () => {
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE id IN (?, ?, ?, ?)', ids.visitor, ids.other, ids.admin, ids.ordinary)).toBe(4);
    expect(await count('SELECT COUNT(*) AS n FROM messages WHERE id IN (?, ?)', rows.visitorMessage, rows.otherMessage)).toBe(2);
  });

  it('export writes the account\'s rows as JSON, secrets redacted, and nobody else\'s', async () => {
    const io = capture();
    expect(await runCli(['export', names.visitor], { env: env(), io })).toBe(0);
    const text = io.stdout();
    const doc = JSON.parse(text) as {
      format: string; account: { id: string; username: string };
      tables: Record<string, Array<Record<string, unknown>>>; rowCounts: Record<string, number>; unreadTables: unknown[];
    };
    expect(doc.format).toBe('anton-demo-account-export');
    expect(doc.account).toEqual({ id: ids.visitor, username: names.visitor });
    expect(doc.unreadTables).toEqual([]);
    expect(doc.tables.sessions.map((s) => s.id)).toEqual([rows.visitorSession]);
    expect(doc.tables.messages.map((m) => m.id)).toEqual([rows.visitorMessage]);
    expect(doc.tables.messages[0].content).toBe(`answer of visitor ${TAG}; pasted [redacted] here`);
    expect(doc.rowCounts.sessions).toBe(1);

    const user = doc.tables.users[0];
    expect(user.username).toBe(names.visitor);
    expect(user.password_hash).toBe('[redacted]');
    expect(user.mfa_secret).toBe('[redacted]');
    expect(doc.tables.user_sessions.map((s) => s.token)).toEqual(['[redacted]']);
    expect(doc.tables.password_reset_tokens.map((s) => s.token)).toEqual(['[redacted]']);
    expect(doc.tables.mfa_pending.map((s) => s.secret)).toEqual(['[redacted]']);
    for (const secret of [BCRYPT, JWT, rows.mfaSecret, rows.pendingSecret, rows.visitorToken, rows.resetToken]) {
      expect(text.includes(secret), 'a secret in the export').toBe(false);
    }

    // Negative control: the other account's rows are not in it...
    for (const theirs of [ids.other, names.other, rows.otherSession, rows.otherMessage, rows.otherToken]) {
      expect(text.includes(theirs), 'another account in the export').toBe(false);
    }
    // ...and its own export has them, not the visitor's.
    const io2 = capture();
    expect(await runCli(['export', names.other.toUpperCase()], { env: env(), io: io2 })).toBe(0);
    const theirs = JSON.parse(io2.stdout()) as { tables: Record<string, Array<Record<string, unknown>>> };
    expect(theirs.tables.sessions.map((s) => s.id)).toEqual([rows.otherSession]);
    expect(io2.stdout().includes(rows.visitorSession)).toBe(false);
  });

  it('export of an unknown username says so and writes nothing', async () => {
    const io = capture();
    expect(await runCli(['export', `nobody_${TAG}`], { env: env(), io })).toBe(1);
    expect(io.stdout()).toBe('');
    expect(io.stderr()).toMatch(/No account/);
  });

  it('as a real process, stdout is the export and nothing else', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-account-'));
    try {
      const r = await runProcess(['export', names.other], { ...process.env, DATABASE_URL }, cwd);
      expect(r.code, r.stderr).toBe(0);
      const doc = JSON.parse(r.stdout) as { account: { username: string }; tables: Record<string, Array<Record<string, unknown>>> };
      expect(doc.account.username).toBe(names.other);
      expect(doc.tables.sessions.map((s) => s.id)).toEqual([rows.otherSession]);
      expect(r.stdout.includes(rows.otherToken)).toBe(false);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  }, 120_000);

  it('delete refuses an administrator and an ordinary account, even with --yes', async () => {
    for (const [name, reason] of [[names.admin, /administrator/], [names.ordinary, /not a demo account/]] as const) {
      const io = capture();
      expect(await runCli(['delete', name, '--yes'], { env: env(), io, uploadDir })).toBe(1);
      expect(io.stderr()).toMatch(reason);
      expect(io.stdout()).toBe('');
    }
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE id IN (?, ?)', ids.admin, ids.ordinary)).toBe(2);
  });

  it('delete without --yes counts and deletes nothing', async () => {
    const io = capture();
    expect(await runCli(['delete', names.visitor], { env: env(), io, uploadDir })).toBe(1);
    const out = JSON.parse(io.stdout()) as { dryRun: boolean; deleted: boolean; rowCounts: Record<string, number> };
    expect(out).toMatchObject({ dryRun: true, deleted: false });
    expect(out.rowCounts.sessions).toBe(1);
    expect(io.stderr()).toMatch(/--yes/);
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE id = ?', ids.visitor)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM sessions WHERE id = ?', rows.visitorSession)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM user_sessions WHERE token = ?', rows.visitorToken)).toBe(1);
  });

  it('delete --yes deletes the demo account and its rows now, prints counts only, and leaves the other account alone', async () => {
    const io = capture();
    expect(await runCli(['delete', names.visitor, '--yes'], { env: env(), io, uploadDir })).toBe(0);
    const out = JSON.parse(io.stdout()) as { deleted: boolean; rowsByTable: Record<string, number>; failedStatements: unknown[] };
    expect(out.deleted).toBe(true);
    expect(out.rowsByTable.users).toBe(1);
    expect(out.rowsByTable.sessions).toBe(1);
    // Row counts only: no id, name or content of the account.
    for (const s of [ids.visitor, names.visitor, rows.visitorSession, rows.visitorMessage, TAG]) {
      expect(io.stdout().includes(s), 'an identifier in the delete output').toBe(false);
    }

    for (const [sql, id] of [
      ['SELECT COUNT(*) AS n FROM users WHERE id = ?', ids.visitor],
      ['SELECT COUNT(*) AS n FROM sessions WHERE id = ?', rows.visitorSession],
      ['SELECT COUNT(*) AS n FROM messages WHERE id = ?', rows.visitorMessage],
      ['SELECT COUNT(*) AS n FROM user_sessions WHERE token = ?', rows.visitorToken],
      ['SELECT COUNT(*) AS n FROM password_reset_tokens WHERE token = ?', rows.resetToken],
      ['SELECT COUNT(*) AS n FROM mfa_pending WHERE user_id = ?', ids.visitor],
    ] as const) {
      expect(await count(sql, id), sql).toBe(0);
    }
    // Negative control: the other demo account keeps every row.
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE id = ?', ids.other)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM sessions WHERE id = ?', rows.otherSession)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM messages WHERE id = ?', rows.otherMessage)).toBe(1);
    expect(await count('SELECT COUNT(*) AS n FROM user_sessions WHERE token = ?', rows.otherToken)).toBe(1);

    // Deleted means gone: the username is now unknown.
    const again = capture();
    expect(await runCli(['export', names.visitor], { env: env(), io: again })).toBe(1);
  });
});
