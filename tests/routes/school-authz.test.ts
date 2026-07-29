/**
 * school-authz.test.ts — the team-mode authorization gaps in the School pillar.
 *
 * School had zero route tests, and it shows: eight routes either checked nothing, or
 * checked something that could not fail. On a single-user laptop none of it matters. On a
 * `DEPLOYMENT_MODE=team` install — a school — these are children's records.
 *
 * These became reachable rather than theoretical when #33 made `school_role` actually
 * populate: before that no user could hold a teacher role, so the teacher-scoped surface
 * was dead code.
 *
 * Structural assertions below; the DB-backed block at the end proves the SQL discriminates
 * rather than merely existing, because "a guard is present" and "a guard works" came apart
 * here in the most instructive case (see the db.all one).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SCHOOL = readFileSync(join(process.cwd(), 'server/routes/school.ts'), 'utf8');
const EVIDENCE = readFileSync(join(process.cwd(), 'server/routes/school-evidence.ts'), 'utf8');

/** The body of one route handler, from its registration to the next one. */
function routeBody(src: string, registration: string): string {
  const start = src.indexOf(registration);
  if (start < 0) throw new Error(`route not found: ${registration}`);
  const next = src.indexOf('  router.', start + registration.length);
  const body = src.slice(start, next < 0 ? undefined : next);
  // Comments stripped. The fixes here are explained by comments that QUOTE the old
  // broken code (`body.student_user_id || 'default'`), which is exactly what a
  // not-to-contain assertion would trip over — the same way an earlier test in this
  // codebase failed on its own removal note. Assert against code, explain in prose.
  return body.replace(/^\s*\/\/.*$/gm, '');
}

describe('the guard that could never fail', () => {
  it('the SEN-override check uses db.get, not db.all', () => {
    // `db.all` returns an ARRAY. `if (!cls)` on an empty array is false, so the guard
    // never fired and any authenticated user could set a Special Educational Needs
    // designation on any pupil in any class. The check LOOKED present — only the return
    // type gave it away, which is exactly why it survived review.
    const body = routeBody(SCHOOL, "router.patch('/school/classes/:classId/students/:studentId/settings'");
    expect(body).toMatch(/db\.get\(\s*\n?\s*`SELECT id FROM school_classes WHERE id = \? AND teacher_user_id = \?`/);
    expect(body).not.toMatch(/db\.all\(`SELECT id FROM school_classes/);
  });

  it('answers 404 rather than 403, so an id is not an oracle', () => {
    const body = routeBody(SCHOOL, "router.patch('/school/classes/:classId/students/:studentId/settings'");
    expect(body).toContain("status(404)");
  });
});

describe('the school_lessons lesson routes are gone, not merely guarded', () => {
  /**
   * These once asserted that PATCH / DELETE /school/lessons/:id and
   * /school/lessons/:id/progress were owner-gated. They were — that guard was real and
   * necessary while the routes existed.
   *
   * The whole school_lessons layer has since been removed (2026-07-29): it was a second
   * lesson implementation, dead at both ends, with only its mutating routes reachable.
   * teacher_lessons is canonical.
   *
   * The assertions are INVERTED rather than deleted. "This route is guarded" and "this
   * route does not exist" are both meaningful; silently dropping the block would leave
   * nothing to notice if someone reintroduced an unguarded copy.
   */
  it('no school_lessons route is registered any more', () => {
    const code = SCHOOL.replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/router\.(patch|delete)\('\/school\/lessons\/:id'/);
    expect(code).not.toMatch(/router\.post\('\/school\/lessons\/:id\/progress'/);
    expect(code).not.toMatch(/FROM school_lessons|INTO school_lessons/);
  });

  it('the canonical teacher_lessons routes survive', () => {
    // The deletion must not have taken the working implementation with it.
    expect(SCHOOL).toMatch(/FROM teacher_lessons/);
    expect(SCHOOL).toMatch(/router\.get\('\/school\/lessons'/);
  });

  it('the still-used curricula upload route survives', () => {
    // Different route, called by TeacherClassConfigPage, deliberately kept.
    expect(SCHOOL).toMatch(/router\.post\('\/school\/curricula\/upload'/);
  });
});

describe('assistant messages cannot be planted in another pupil transcript', () => {
  it('both insert sites verify session ownership first', () => {
    // Stored with role 'assistant', so injected text reads to the pupil, a teacher or a
    // guardian as something ANTON said. The UPDATE on the next line was already scoped
    // by user_id, which is what made the omission visible.
    const checks = SCHOOL.match(/SELECT 1 AS ok FROM sessions WHERE id = \? AND user_id = \?/g) ?? [];
    expect(checks.length).toBe(2);
  });

  it('each check precedes its insert', () => {
    for (const m of SCHOOL.matchAll(/INSERT INTO messages/g)) {
      const before = SCHOOL.slice(Math.max(0, m.index! - 900), m.index!);
      expect(before, 'ownership check within 900 chars before the insert').toMatch(/FROM sessions WHERE id = \? AND user_id = \?/);
    }
  });
});

describe('class rosters and codes are not public', () => {
  it('the leaderboard requires teacher-of-class or enrolled-student', () => {
    const body = routeBody(SCHOOL, "router.get('/school/classes/:id/leaderboard'");
    expect(body).toContain('class_enrollments');
    expect(body).toMatch(/teacher_user_id = \?/);
  });

  it('a study room does not hand its join code to non-hosts', () => {
    const body = routeBody(SCHOOL, "router.get('/school/study-rooms/:id'");
    expect(body).toMatch(/delete room\.join_code/);
  });

  it('only a teacher or school admin can create a class', () => {
    const body = routeBody(SCHOOL, "router.post('/school/classes'");
    expect(body).toMatch(/schoolRole !== 'teacher' && schoolRole !== 'school_admin'/);
    expect(body).toContain('status(403)');
  });
});

describe('teacher-private notes stay adult-facing', () => {
  it('strips teacher_notes and ai_assessment_summary from the pupil read', () => {
    // A teacher writing "struggling, suspect dyslexia — raising with SENCO" is writing
    // ABOUT the child, not to them.
    expect(EVIDENCE).toMatch(/teacher_notes: _tn/);
    expect(EVIDENCE).toMatch(/ai_assessment_summary: _ai/);
  });

  it('only strips for the scoped (pupil) read, so admins keep the full row', () => {
    expect(EVIDENCE).toMatch(/const entries = scoped/);
  });
});

// ── Does the SQL actually discriminate? ──────────────────────────────────────
const DATABASE_URL = (() => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const m = readFileSync(join(process.cwd(), '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
})();

const d = DATABASE_URL ? describe : describe.skip;

d('the guards discriminate, not merely exist', () => {
  let c: import('pg').Client;
  const TEACHER = 'authz-teacher', PUPIL = 'authz-pupil', OUTSIDER = 'authz-outsider';
  const CLASS = 'authz-class';

  beforeAll(async () => {
    const { Client } = await import('pg');
    c = new Client({ connectionString: DATABASE_URL! });
    await c.connect();
    for (const id of [TEACHER, PUPIL, OUTSIDER]) {
      await c.query(
        `INSERT INTO users (id, username, password_hash, role) VALUES ($1,$1,'x','analyst')
         ON CONFLICT (id) DO NOTHING`, [id]);
    }
    await c.query(
      `INSERT INTO school_classes (id, teacher_user_id, name, subject_id, education_tier, leaderboard_enabled)
       VALUES ($1,$2,'Authz Test','mathematics','T3',1) ON CONFLICT (id) DO NOTHING`, [CLASS, TEACHER]);
    await c.query(
      `INSERT INTO class_enrollments (id, class_id, student_user_id)
       VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING`, ['authz-enr', CLASS, PUPIL]);
  });

  afterAll(async () => {
    await c?.query('DELETE FROM class_enrollments WHERE id = $1', ['authz-enr']).catch(() => {});
    await c?.query('DELETE FROM school_classes WHERE id = $1', [CLASS]).catch(() => {});
    await c?.query('DELETE FROM users WHERE id = ANY($1)', [[TEACHER, PUPIL, OUTSIDER]]).catch(() => {});
    await c?.end();
  });

  /** The membership predicate the leaderboard route runs. */
  async function isMember(userId: string): Promise<boolean> {
    const r = await c.query(
      `SELECT 1 FROM school_classes c
        WHERE c.id = $1 AND (c.teacher_user_id = $2
              OR EXISTS (SELECT 1 FROM class_enrollments e
                          WHERE e.class_id = c.id AND e.student_user_id = $2))`,
      [CLASS, userId]);
    return r.rowCount! > 0;
  }

  it('admits the class teacher', async () => {
    expect(await isMember(TEACHER)).toBe(true);
  });

  it('admits an enrolled pupil', async () => {
    expect(await isMember(PUPIL)).toBe(true);
  });

  it('REFUSES an outsider — the assertion that has to be able to fail', async () => {
    expect(await isMember(OUTSIDER)).toBe(false);
  });

  it('the SEN teacher-owns-class query returns no row for a non-teacher', async () => {
    // db.get on this returns undefined -> guard fires. Under the old db.all it returned
    // [] -> truthy -> guard skipped.
    const mine = await c.query(
      'SELECT id FROM school_classes WHERE id = $1 AND teacher_user_id = $2', [CLASS, TEACHER]);
    const theirs = await c.query(
      'SELECT id FROM school_classes WHERE id = $1 AND teacher_user_id = $2', [CLASS, OUTSIDER]);
    expect(mine.rowCount).toBe(1);
    expect(theirs.rowCount).toBe(0);
    // The bug, demonstrated: an empty ARRAY is truthy in JS.
    expect(Boolean(theirs.rows)).toBe(true);
    expect(theirs.rows.length).toBe(0);
  });
});
