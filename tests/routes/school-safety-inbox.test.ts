/**
 * school-safety-inbox.test.ts — the teacher inbox over school_safety_events.
 *
 * This is the page "Teacher Oversight" pretended to be. That one queried tables which did
 * not exist, wrapped the query in `catch { return [] }`, and had no error state — so a
 * teacher saw "no flags" whether that meant no incidents or a broken query. It was
 * deleted (#32) rather than filled in.
 *
 * These tests pin the specific properties that make this one different, because "it looks
 * like a safeguarding page" is exactly the thing that was wrong before:
 *
 *   - the table it reads exists AND something writes to it;
 *   - the scope is pupils the caller actually teaches, proven against a database by
 *     showing an unrelated teacher is REFUSED;
 *   - a failure surfaces as an error, and the empty state says it loaded successfully;
 *   - the page states its own limits where the person relying on it will read them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SCHOOL = readFileSync(join(process.cwd(), 'server/routes/school.ts'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'src/pages/school/SafetyInboxPage.tsx'), 'utf8');
const APP = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
const LAYOUT = readFileSync(join(process.cwd(), 'src/components/school/SchoolLayout.tsx'), 'utf8');
const SAFETY = readFileSync(join(process.cwd(), 'server/services/school-safety.ts'), 'utf8');

/**
 * Source with comments removed.
 *
 * Needed because the good code is explained by comments that QUOTE the bad code they
 * replaced — `// Explicitly NOT \`r.ok ? r.json() : []\`` is the whole reason that idiom
 * is absent, and a naive not-to-contain assertion trips on the explanation. This has now
 * caught me three times in this codebase; assert against code, explain in prose.
 */
function codeOnly(src: string): string {
  return src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function routeBody(registration: string): string {
  const start = SCHOOL.indexOf(registration);
  if (start < 0) throw new Error(`route not found: ${registration}`);
  const next = SCHOOL.indexOf('  router.', start + registration.length);
  return SCHOOL.slice(start, next < 0 ? undefined : next).replace(/^\s*\/\/.*$/gm, '');
}

describe('it reads a table that exists and is written to', () => {
  it('the migration that creates the table is present', () => {
    const mig = readFileSync(
      join(process.cwd(), 'server/db/migrations-pg/255_school_safety_events.sql'), 'utf8');
    expect(mig).toMatch(/CREATE TABLE IF NOT EXISTS school_safety_events/);
  });

  it('something actually WRITES an event', () => {
    // The failure of the old page was not the UI. It was a reader with no writer.
    expect(SCHOOL).toMatch(/INSERT INTO school_safety_events/);
    expect(SAFETY).toContain('export function screenStudentMessage');
  });
});

describe('scope is teachers-of-that-pupil, not any authenticated user', () => {
  it('rejects pupils outright', () => {
    const body = routeBody("router.get('/school/safety/events'");
    expect(body).toMatch(/school_role/);
    expect(body).toContain("status(403)");
  });

  it('resolves membership through enrolment as well as class_id', () => {
    // class_id is nullable — a pupil can chat outside a lesson, and those events matter
    // most. Scoping on class_id alone would silently hide exactly those.
    const body = routeBody("router.get('/school/safety/events'");
    expect(body).toContain('class_enrollments');
    expect(body).toMatch(/teacher_user_id = \?/);
  });

  it('re-checks ownership on acknowledge rather than trusting the list', () => {
    const body = routeBody("router.post('/school/safety/events/:id/acknowledge'");
    expect(body).toContain('class_enrollments');
    // Both codes belong, for different questions: 403 answers "are you a teacher at
    // all", 404 answers "is this yours". The ownership miss must be the 404 — a 403
    // there would confirm the event exists and tell a stranger a named pupil has a
    // safety record.
    const ownershipMiss = body.slice(body.indexOf('const owned ='));
    expect(ownershipMiss).toContain('status(404)');
    expect(ownershipMiss).not.toContain('status(403)');
  });

  it('does not return the matcher rule name to the client', () => {
    // rule_name is an implementation detail of the regex set. A teacher needs the
    // category and the pupil; leaking the rule invites gaming the matcher.
    const body = routeBody("router.get('/school/safety/events'");
    const select = body.slice(body.indexOf('SELECT'), body.indexOf('FROM school_safety_events'));
    expect(select).not.toContain('rule_name');
  });
});

describe('the page cannot show "nothing to see" over a failure', () => {
  it('has a real error state', () => {
    expect(PAGE).toMatch(/role="alert"/);
    expect(PAGE).toMatch(/could not be loaded/i);
  });

  it('does not use the r.ok ? r.json() : [] idiom that caused the original bug', () => {
    expect(codeOnly(PAGE)).not.toMatch(/\.ok\s*\?\s*[\w.]+\.json\(\)\s*:\s*\[\]/);
    // Scoped to the LOAD path specifically. A bare `toMatch(/if \(!res\.ok\)/)` over the
    // whole file is satisfied by the acknowledge handler's own check — verified by
    // disabling the load guard and watching the assertion still pass.
    // End anchor is the useEffect CALL, not the string 'useEffect' — that first occurs
    // in the import line above, which inverts the range and silently yields ''.
    const loadFn = PAGE.slice(PAGE.indexOf('const load = useCallback'), PAGE.indexOf('useEffect(()'));
    expect(loadFn.length, 'load() slice must not be empty').toBeGreaterThan(100);
    expect(loadFn).toMatch(/if \(!res\.ok\)/);
    expect(loadFn).toMatch(/throw new Error/);
  });

  it('says explicitly that an error is not an all-clear', () => {
    expect(PAGE).toMatch(/not read this as/i);
  });

  it('distinguishes a successful empty load from a failed one', () => {
    expect(PAGE).toMatch(/loaded correctly and is empty/i);
  });

  it('clears the list on error so stale rows cannot look current', () => {
    const c = PAGE.slice(PAGE.indexOf('catch (e)'), PAGE.indexOf('finally'));
    expect(c).toMatch(/setEvents\(\[\]\)/);
  });
});

describe('it does not overstate what it is', () => {
  it('says on the page that it misses things', () => {
    expect(PAGE).toMatch(/will miss/i);
    expect(PAGE).toMatch(/does not mean nobody needs help/i);
  });

  it('says ANTON has contacted nobody', () => {
    // The most dangerous possible misreading: that filing a signal discharged a duty.
    expect(PAGE).toMatch(/has\s*\{?'?\s*<?strong[^>]*>?\s*not\s*<\/strong>?\s*\}?\s*contacted anyone|not.*contacted anyone/is);
    expect(PAGE).toMatch(/tells nobody else/i);
  });

  it('says the pupil\'s words are not stored', () => {
    expect(PAGE).toMatch(/does not store what the pupil wrote/i);
  });
});

describe('it is reachable', () => {
  it('has a route and a lazy import', () => {
    expect(APP).toContain('SafetyInboxPage');
    expect(APP).toContain('/school/teacher/safety');
  });

  it('has a teacher-only nav entry', () => {
    // A page with no way in is the other half of shipping dead safeguarding UI.
    expect(LAYOUT).toContain("/school/teacher/safety");
    const entry = LAYOUT.slice(LAYOUT.indexOf("id: 'safety'"), LAYOUT.indexOf("id: 'safety'") + 260);
    expect(entry).toMatch(/roles: \['teacher', 'school_admin'\]/);
  });
});

// ── Does the scope actually refuse an unrelated teacher? ─────────────────────
const DATABASE_URL = (() => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const m = readFileSync(join(process.cwd(), '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
})();
const d = DATABASE_URL ? describe : describe.skip;

d('the scope discriminates', () => {
  let c: import('pg').Client;
  const MINE = 'inbox-teacher-a', THEIRS = 'inbox-teacher-b', PUPIL = 'inbox-pupil';
  const CLASS = 'inbox-class', EV_CLASS = 'inbox-ev-1', EV_NULL = 'inbox-ev-2';

  beforeAll(async () => {
    const { Client } = await import('pg');
    c = new Client({ connectionString: DATABASE_URL! }); await c.connect();
    for (const id of [MINE, THEIRS, PUPIL]) {
      await c.query(`INSERT INTO users (id, username, password_hash, role) VALUES ($1,$1,'x','analyst')
                     ON CONFLICT (id) DO NOTHING`, [id]);
    }
    await c.query(`INSERT INTO school_classes (id, teacher_user_id, name, subject_id, education_tier)
                   VALUES ($1,$2,'Inbox Test','mathematics','T3') ON CONFLICT (id) DO NOTHING`, [CLASS, MINE]);
    await c.query(`INSERT INTO class_enrollments (id, class_id, student_user_id) VALUES ($1,$2,$3)
                   ON CONFLICT (id) DO NOTHING`, ['inbox-enr', CLASS, PUPIL]);
    await c.query(`INSERT INTO school_safety_events (id, student_user_id, class_id, disposition, category, rule_name)
                   VALUES ($1,$2,$3,'support','self_harm','self-harm-intent') ON CONFLICT (id) DO NOTHING`, [EV_CLASS, PUPIL, CLASS]);
    // The important one: no class_id at all — a pupil chatting outside a lesson.
    await c.query(`INSERT INTO school_safety_events (id, student_user_id, class_id, disposition, category, rule_name)
                   VALUES ($1,$2,NULL,'support','abuse','abuse-disclosure') ON CONFLICT (id) DO NOTHING`, [EV_NULL, PUPIL]);
  });

  afterAll(async () => {
    await c?.query('DELETE FROM school_safety_events WHERE id = ANY($1)', [[EV_CLASS, EV_NULL]]).catch(() => {});
    await c?.query('DELETE FROM class_enrollments WHERE id = $1', ['inbox-enr']).catch(() => {});
    await c?.query('DELETE FROM school_classes WHERE id = $1', [CLASS]).catch(() => {});
    await c?.query('DELETE FROM users WHERE id = ANY($1)', [[MINE, THEIRS, PUPIL]]).catch(() => {});
    await c?.end();
  });

  /** The predicate the route builds. */
  async function visibleTo(teacher: string): Promise<string[]> {
    const r = await c.query(
      `SELECT e.id FROM school_safety_events e
        WHERE (e.class_id IN (SELECT id FROM school_classes WHERE teacher_user_id = $1)
            OR e.student_user_id IN (SELECT en.student_user_id FROM class_enrollments en
                                       JOIN school_classes cl ON cl.id = en.class_id
                                      WHERE cl.teacher_user_id = $1))
          AND e.id = ANY($2)
        ORDER BY e.id`, [teacher, [EV_CLASS, EV_NULL]]);
    return r.rows.map(x => x.id);
  }

  it('the pupil\'s own teacher sees both events', async () => {
    expect(await visibleTo(MINE)).toEqual([EV_CLASS, EV_NULL].sort());
  });

  it('an unrelated teacher sees NEITHER — the assertion that has to be able to fail', async () => {
    expect(await visibleTo(THEIRS)).toEqual([]);
  });

  it('the class-less event is visible via enrolment, not just class_id', async () => {
    // The one that would be silently hidden by a class_id-only scope, and the one most
    // likely to matter: a pupil talking outside a lesson.
    expect(await visibleTo(MINE)).toContain(EV_NULL);
  });
});
