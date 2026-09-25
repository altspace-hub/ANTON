/**
 * project-context-removed-member.db.test.ts — after removal, a person's rows
 * filed in a project stop feeding the remaining members' prompts (round-2 gap
 * "verify2:projects-2").
 *
 * Before: PROJECT_CONTEXT_SQL read the matter, the engagement and the sibling
 * sessions by project_id alone. A removed member's rows stay filed there, and
 * she keeps writing them — a session title, a continued chat that rewrites
 * sessions.summary, the brief of an engagement or matter she owns — so all of
 * it landed in every remaining member's project layer.
 *
 * Now, in team mode, a row counts only while its owner could open the project
 * (a current member, or the recorded owner of a project with no members); rows
 * with no owner and the caller's own rows always count. Removal rewrites
 * nothing: the rows stay filed, and count again if she is re-added.
 *
 * Negative controls: a current member's sessions, engagement and matter still
 * appear; an unowned session still appears; an admin's own session appears
 * though they are not a member; the recorded owner of a memberless project
 * still sees their own; solo mode reads everything as before.
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const tag = randomUUID().slice(0, 8);
const ALICE = `u-pcx-alice-${tag}`;   // removed
const BOB = `u-pcx-bob-${tag}`;       // stays
const ROOT = `u-pcx-root-${tag}`;     // instance admin, not a member
const CAROL = `u-pcx-carol-${tag}`;   // never a member
const USERS = [ALICE, BOB, ROOT, CAROL];

const ALICE_TEXT = `ALICE-AFTER-REMOVAL-${tag}`;
const ALICE_BRIEF = `ALICE-ENGAGEMENT-${tag}`;
const ALICE_MATTER = `ALICE-MATTER-${tag}`;
const BOB_TEXT = `BOB-CONCLUSION-${tag}`;
const BOB_BRIEF = `BOB-ENGAGEMENT-${tag}`;
const BOB_MATTER = `BOB-MATTER-${tag}`;
const UNOWNED_TEXT = `UNOWNED-CONCLUSION-${tag}`;
const ROOT_TEXT = `ADMIN-OWN-CONCLUSION-${tag}`;

let db: DatabaseAdapter;
let buildProjectContext: (db: DatabaseAdapter, input: { projectId: string; userId: string; userRole?: string | null; teamMode: boolean; currentSessionId?: string | null }) => Promise<{ denied: boolean; text: string; hasEngagement: boolean; hasMatter: boolean }>;
const projects: string[] = [];
const sessions: string[] = [];
const engagements: string[] = [];
const matters: string[] = [];

async function newProject(recordedOwner: string, members: Array<[string, string]>): Promise<string> {
  const id = randomUUID();
  projects.push(id);
  await db.run('INSERT INTO projects (id, name, user_id) VALUES (?, ?, ?)', id, `PCX ${id.slice(0, 6)}`, recordedOwner);
  for (const [user, role] of members) {
    await db.run('INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, ?)', randomUUID(), id, user, role);
  }
  return id;
}

/** A session filed in the project with a written conclusion; `ageMinutes` orders them. */
async function session(projectId: string, owner: string | null, summary: string, ageMinutes: number): Promise<string> {
  const id = `s-pcx-${randomUUID().slice(0, 12)}`;
  sessions.push(id);
  await db.run(
    `INSERT INTO sessions (id, module_id, title, user_id, project_id, summary, updated_at)
     VALUES (?, 'open-chat', 'pcx', ?, ?, ?, NOW() - (? * interval '1 minute'))`,
    id, owner, projectId, summary, ageMinutes,
  );
  return id;
}

async function engagement(projectId: string, owner: string, title: string, ageMinutes: number): Promise<void> {
  const id = `e-pcx-${randomUUID().slice(0, 12)}`;
  engagements.push(id);
  await db.run(
    `INSERT INTO engagements (id, title, user_id, project_id, updated_at)
     VALUES (?, ?, ?, ?, NOW() - (? * interval '1 minute'))`,
    id, title, owner, projectId, ageMinutes,
  );
}

async function matter(projectId: string, owner: string, question: string, ageMinutes: number): Promise<void> {
  const id = `l-pcx-${randomUUID().slice(0, 12)}`;
  matters.push(id);
  await db.run(
    `INSERT INTO legal_research_sessions (id, title, user_id, project_id, matter_brief, updated_at)
     VALUES (?, 'pcx matter', ?, ?, ?, NOW() - (? * interval '1 minute'))`,
    id, owner, projectId, JSON.stringify({ question }), ageMinutes,
  );
}

const ctx = (projectId: string, userId: string, userRole: string, teamMode = true) =>
  buildProjectContext(db, { projectId, userId, userRole, teamMode });

d("a removed member's rows stop feeding the project layer (team mode)", () => {
  let p = '';

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    for (const u of USERS) {
      await db.run('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)', u, u, 'x', u === ROOT ? 'admin' : 'analyst');
    }
    ({ buildProjectContext } = await import('../../server/services/project-context.js'));

    p = await newProject(BOB, [[BOB, 'owner'], [ALICE, 'member']]);
    // Alice's rows are the newest, so each LIMIT 1 section would pick hers.
    await session(p, ALICE, ALICE_TEXT, 1);
    await engagement(p, ALICE, ALICE_BRIEF, 1);
    await matter(p, ALICE, ALICE_MATTER, 1);
    await session(p, BOB, BOB_TEXT, 10);
    await engagement(p, BOB, BOB_BRIEF, 10);
    await matter(p, BOB, BOB_MATTER, 10);
    await session(p, null, UNOWNED_TEXT, 20);
  });

  afterAll(async () => {
    if (!db) return;
    for (const id of sessions) await db.run('DELETE FROM sessions WHERE id = ?', id).catch(() => {});
    for (const id of engagements) await db.run('DELETE FROM engagements WHERE id = ?', id).catch(() => {});
    for (const id of matters) await db.run('DELETE FROM legal_research_sessions WHERE id = ?', id).catch(() => {});
    for (const id of projects) await db.run('DELETE FROM projects WHERE id = ?', id).catch(() => {});
    for (const u of USERS) await db.run('DELETE FROM users WHERE id = ?', u).catch(() => {});
    await db.close();
  });

  it('while she is a member, her session, engagement and matter are in the layer', async () => {
    const out = await ctx(p, BOB, 'analyst');
    expect(out.denied).toBe(false);
    for (const t of [ALICE_TEXT, ALICE_BRIEF, ALICE_MATTER, BOB_TEXT, UNOWNED_TEXT]) expect(out.text).toContain(t);
  });

  it('after removal, nothing of hers reaches a remaining member — the current member\'s rows and unowned rows still do', async () => {
    await db.run('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', p, ALICE);
    // She keeps writing her own rows after removal.
    await db.run("UPDATE sessions SET summary = ?, updated_at = NOW() WHERE project_id = ? AND user_id = ?", `${ALICE_TEXT} rewritten`, p, ALICE);

    const out = await ctx(p, BOB, 'analyst');
    expect(out.denied).toBe(false);
    for (const t of [ALICE_TEXT, ALICE_BRIEF, ALICE_MATTER]) expect(out.text).not.toContain(t);
    // Negative control: the section falls back to the remaining member's row, it does not vanish.
    for (const t of [BOB_TEXT, BOB_BRIEF, BOB_MATTER, UNOWNED_TEXT]) expect(out.text).toContain(t);
    expect(out.hasEngagement).toBe(true);
    expect(out.hasMatter).toBe(true);

    // Her rows are still filed in the project — removal rewrote nothing.
    const filed = await db.get<{ n: number }>('SELECT COUNT(*)::int AS n FROM sessions WHERE project_id = ? AND user_id = ?', p, ALICE);
    expect(Number(filed?.n)).toBe(1);
  });

  it('an admin run gets the same project, plus the admin\'s own session although not a member', async () => {
    await session(p, ROOT, ROOT_TEXT, 30);
    const out = await ctx(p, ROOT, 'admin');
    expect(out.denied).toBe(false);
    expect(out.text).not.toContain(ALICE_TEXT);
    expect(out.text).toContain(BOB_TEXT);
    expect(out.text).toContain(ROOT_TEXT);
    // …which is not a member's, so Bob's layer leaves it out.
    expect((await ctx(p, BOB, 'analyst')).text).not.toContain(ROOT_TEXT);
  });

  it('re-adding her makes her rows count again', async () => {
    await db.run("INSERT INTO project_members (id, project_id, user_id, role) VALUES (?, ?, ?, 'member')", randomUUID(), p, ALICE);
    const out = await ctx(p, BOB, 'analyst');
    expect(out.text).toContain(ALICE_TEXT);
    expect(out.text).toContain(ALICE_BRIEF);
    await db.run('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', p, ALICE);
  });

  it('a project with no member list: its recorded owner\'s rows count, a stranger\'s do not', async () => {
    const q = await newProject(BOB, []);
    const own = `MEMBERLESS-OWNER-${tag}`;
    const planted = `MEMBERLESS-STRANGER-${tag}`;
    await session(q, BOB, own, 1);
    await session(q, CAROL, planted, 2);
    const out = await ctx(q, BOB, 'analyst');
    expect(out.denied).toBe(false);
    expect(out.text).toContain(own);
    expect(out.text).not.toContain(planted);
  });

  it('solo mode reads every row filed in the project, as before', async () => {
    const out = await ctx(p, 'solo', 'admin', false);
    for (const t of [ALICE_TEXT, BOB_TEXT, UNOWNED_TEXT]) expect(out.text).toContain(t);
    expect(out.text).toContain(ALICE_BRIEF);
    expect(out.text).toContain(ALICE_MATTER);
  });
});
