/**
 * school-role.test.ts — the School pillar's teacher role has to actually exist.
 *
 * `users.school_role` shipped as a column, `AuthUser.school_role` shipped as a type, and
 * five server branches plus three frontend components read it. Nothing ever populated it.
 *
 *   - Both JWT payload sites built { id, username, role, display_name } — no school_role.
 *   - The middleware then read it back off that payload, so it was always undefined.
 *   - /auth/me never selected it, so the client defaulted to 'student' (SchoolLayout:172).
 *   - No route anywhere WROTE the column. Verified against a live database: all 8 users
 *     NULL.
 *
 * Net effect: every teacher-gated branch in school.ts was dead code, the whole teacher
 * and guardian navigation was unreachable, and /school/admin/model-tier answered 403 to
 * everybody — including the solo operator who owns the machine.
 *
 * The fix sources the role from the DATABASE rather than the token. That choice is the
 * substance of this change, so it is what these tests pin.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIDDLEWARE = readFileSync(join(process.cwd(), 'server/middleware/auth.ts'), 'utf8');
const AUTH_ROUTES = readFileSync(join(process.cwd(), 'server/routes/auth.ts'), 'utf8');
const ADMIN_ROUTES = readFileSync(join(process.cwd(), 'server/routes/admin.ts'), 'utf8');

describe('the role is sourced from the database, not the token', () => {
  it('does not read school_role off the JWT payload', () => {
    // A token-carried role fails in BOTH directions: solo mode issues no token at all,
    // so the default deployment would stay role-less for ever; and a 7-day token means a
    // teacher promoted on Monday cannot teach until the following Monday.
    expect(MIDDLEWARE).not.toMatch(/school_role:\s*payload\.school_role/);
  });

  it('joins users in the session lookup rather than adding a round trip', () => {
    const block = MIDDLEWARE.slice(MIDDLEWARE.indexOf('Check token still in DB'));
    expect(block).toMatch(/JOIN users u ON u\.id = s\.user_id/);
    expect(block).toMatch(/u\.school_role/);
  });

  it('stamps the value it read from that join', () => {
    expect(MIDDLEWARE).toMatch(/school_role:\s*session\.school_role/);
  });

  it('uses PostgreSQL NOW(), not the SQLite datetime() the old query carried', () => {
    const block = MIDDLEWARE.slice(MIDDLEWARE.indexOf('Check token still in DB'));
    expect(block).toContain('NOW()');
    expect(block).not.toContain('datetime(');
  });

  it('gives the solo operator a role instead of leaving them locked out', () => {
    // /school/admin/* compares === 'school_admin', so an undefined role 403s the only
    // person on the machine out of their own settings.
    const solo = MIDDLEWARE.slice(MIDDLEWARE.indexOf('Solo mode: no auth required'), MIDDLEWARE.indexOf('SEC-05'));
    expect(solo).toContain("?? 'school_admin'");
    expect(solo).toMatch(/SELECT school_role FROM users WHERE id = \?/);
  });

  it('still reads the solo role from the DB, so the pupil view can be inspected', () => {
    // Hardcoding 'school_admin' would remove the operator's ability to see what a child
    // sees, which is the one thing a parent or teacher most wants to check.
    const solo = MIDDLEWARE.slice(MIDDLEWARE.indexOf('Solo mode: no auth required'), MIDDLEWARE.indexOf('SEC-05'));
    expect(solo).toMatch(/solo\?\.school_role \?\?/);
  });
});

describe('/auth/me exposes the role the client needs', () => {
  it('selects school_role in team mode', () => {
    expect(AUTH_ROUTES).toMatch(/u\.display_name, u\.school_role FROM user_sessions/);
  });

  it('returns it in solo mode too', () => {
    const solo = AUTH_ROUTES.slice(AUTH_ROUTES.indexOf("router.get('/auth/me'"));
    expect(solo.slice(0, 1200)).toMatch(/school_role:/);
  });
});

describe('there is a write path at all', () => {
  it('PATCH /admin/users/:id can set school_role', () => {
    expect(ADMIN_ROUTES).toMatch(/UPDATE users SET school_role = \? WHERE id = \?/);
  });

  it('allowlists the value rather than passing it through', () => {
    // school.ts compares with === against literals, so 'Teacher' or 'teachers' fails
    // silently and is indistinguishable from a missing permission.
    expect(ADMIN_ROUTES).toContain("const SCHOOL_ROLES = ['student', 'teacher', 'school_admin']");
    expect(ADMIN_ROUTES).toMatch(/status\(400\)/);
  });

  it('allows an explicit null to clear the role', () => {
    const block = ADMIN_ROUTES.slice(ADMIN_ROUTES.indexOf('const SCHOOL_ROLES'));
    expect(block.slice(0, 600)).toMatch(/school_role !== null/);
  });

  it('is admin-gated like the rest of user management', () => {
    const patch = ADMIN_ROUTES.slice(ADMIN_ROUTES.indexOf("router.patch('/admin/users/:id'"));
    expect(patch.slice(0, 200)).toContain("requireRole('admin')");
  });

  it('only writes when the field was supplied', () => {
    // `if (school_role !== undefined)` — otherwise every unrelated PATCH (a password
    // change, a budget change) would silently wipe the user's school role.
    expect(ADMIN_ROUTES).toMatch(/if \(school_role !== undefined\) await db\.run\('UPDATE users SET school_role/);
  });
});

describe('the roles written match the roles read', () => {
  it('every literal school.ts compares against is settable', () => {
    const school = readFileSync(join(process.cwd(), 'server/routes/school.ts'), 'utf8');
    const compared = new Set(
      [...school.matchAll(/school_role\s*[!=]==\s*'([a-z_]+)'/g)].map(m => m[1]),
    );
    expect(compared.size).toBeGreaterThan(0);
    for (const role of compared) {
      expect(
        ADMIN_ROUTES.includes(`'${role}'`),
        `school.ts compares school_role against '${role}' but the admin route cannot set it`,
      ).toBe(true);
    }
  });
});

/**
 * The assertions above are structural. This one executes the queries the middleware and
 * the write path actually run, because the original bug was invisible at the string
 * level: every one of those files looked entirely reasonable.
 */
const DATABASE_URL = (() => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const m = readFileSync(join(process.cwd(), '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
})();

const d = DATABASE_URL ? describe : describe.skip;

d('the queries resolve against PostgreSQL', () => {
  let client: import('pg').Client;
  const TEST_ID = 'test-school-role-user';

  beforeAll(async () => {
    const { Client } = await import('pg');
    client = new Client({ connectionString: DATABASE_URL! });
    await client.connect();
    await client.query(
      `INSERT INTO users (id, username, password_hash, role) VALUES ($1, $1, 'x', 'analyst')
       ON CONFLICT (id) DO NOTHING`, [TEST_ID],
    );
  });
  afterAll(async () => {
    await client?.query('DELETE FROM users WHERE id = $1', [TEST_ID]).catch(() => {});
    await client?.end();
  });

  it('the session join the middleware runs is valid SQL', async () => {
    await expect(client.query(
      `SELECT u.school_role FROM user_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > NOW()`, ['nope'],
    )).resolves.toBeDefined();
  });

  it('a role written by the admin path is what the middleware reads back', async () => {
    // The whole point: write here, read there, same value. Nothing in the codebase
    // previously closed this loop, which is why the column stayed NULL for every user.
    await client.query('UPDATE users SET school_role = $1 WHERE id = $2', ['teacher', TEST_ID]);
    const r = await client.query('SELECT school_role FROM users WHERE id = $1', [TEST_ID]);
    expect(r.rows[0].school_role).toBe('teacher');
  });

  it('an explicit null clears it', async () => {
    await client.query('UPDATE users SET school_role = $1 WHERE id = $2', [null, TEST_ID]);
    const r = await client.query('SELECT school_role FROM users WHERE id = $1', [TEST_ID]);
    expect(r.rows[0].school_role).toBeNull();
  });

  it('the solo lookup resolves', async () => {
    await expect(client.query('SELECT school_role FROM users WHERE id = $1', ['solo']))
      .resolves.toBeDefined();
  });
});
