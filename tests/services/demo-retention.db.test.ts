/**
 * demo-retention.db.test.ts — an expired demo account is deleted with
 * everything it wrote; nobody else's rows are touched (public showcase,
 * 2026-09-25).
 *
 * Three accounts get the same set of rows in every table a visitor's Work run
 * writes (sessions and their children, uploads and the files on disk,
 * workflow outputs, atoms with their refs and embeddings, feedback, quality
 * scores, audit / login / security rows, sign-in sessions, profile, module
 * defaults, a version row the generic owner pass must find, a spend-ledger
 * row): an expired demo account, a demo account that has not expired, and an
 * ordinary account. One pass must remove every row of the first — the ledger
 * row stays, without its ids — and leave the other two exactly as they were.
 * Old audit / login / security rows and old export files go too; recent ones
 * stay.
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const MIGRATION = path.resolve(__dirname, '../../server/db/migrations-pg/289_demo_accounts.sql');
const TAG = randomUUID().slice(0, 8);
/**
 * The pass's reference time. The expired account here expired an hour ago; a
 * reference half an hour back still finds it, and leaves alone a demo account
 * another test file expires a moment before (demo-signup.db.test.ts does).
 */
const HALF_HOUR_AGO = () => new Date(Date.now() - 30 * 60 * 1000);

interface Seeded {
  id: string;
  username: string;
  session: string;
  message: string;
  atom: string;
  upload: string;
  uploadFile: string;
  token: string;
}

/** The tables and the row each account gets, checked by a count keyed on the account. */
const CHECKS: Array<{ table: string; where: (s: Seeded) => [string, unknown[]] }> = [
  { table: 'users', where: (s) => ['id = ?', [s.id]] },
  { table: 'sessions', where: (s) => ['id = ?', [s.session]] },
  { table: 'messages', where: (s) => ['session_id = ?', [s.session]] },
  { table: 'run_artifacts', where: (s) => ['session_id = ?', [s.session]] },
  { table: 'session_snapshots', where: (s) => ['session_id = ?', [s.session]] },
  { table: 'output_versions', where: (s) => ['session_id = ?', [s.session]] },
  { table: 'quality_scores', where: (s) => ['session_id = ?', [s.session]] },
  { table: 'retrieval_feedback', where: (s) => ['session_id = ?', [s.session]] },
  { table: 'output_feedback', where: (s) => ['user_id = ?', [s.id]] },
  { table: 'workflow_outputs', where: (s) => ['created_by = ?', [s.id]] },
  { table: 'knowledge_atoms', where: (s) => ['id = ?', [s.atom]] },
  { table: 'knowledge_entity_refs', where: (s) => ['atom_id = ?', [s.atom]] },
  { table: 'embeddings', where: (s) => ['content_id IN (?, ?)', [s.atom, s.message]] },
  { table: 'file_uploads', where: (s) => ['id = ?', [s.upload]] },
  { table: 'audit_events', where: (s) => ['user_id = ?', [s.id]] },
  { table: 'security_events', where: (s) => ['user_id = ?', [s.id]] },
  { table: 'login_attempts', where: (s) => ['username = ?', [s.username]] },
  { table: 'user_sessions', where: (s) => ['token = ?', [s.token]] },
  { table: 'user_profiles', where: (s) => ['id = ?', [s.id]] },
  { table: 'user_module_defaults', where: (s) => ['user_id = ?', [s.id]] },
  { table: 'versions', where: (s) => ['user_id = ?', [s.id]] },
];

d('demo retention (services/demo-retention.ts)', () => {
  let db: DatabaseAdapter;
  let uploadDir: string;
  let outputDir: string;
  let hasLedger = false;
  const accounts: Record<'expired' | 'current' | 'ordinary', Seeded> = {} as Record<'expired' | 'current' | 'ordinary', Seeded>;
  const savedTtl = process.env.DEMO_ACCOUNT_TTL_DAYS;

  async function seed(kind: 'expired' | 'current' | 'ordinary'): Promise<Seeded> {
    const s: Seeded = {
      id: randomUUID(),
      username: `ret_${kind}_${TAG}`,
      session: `sess-ret-${kind}-${TAG}`,
      message: `msg-ret-${kind}-${TAG}`,
      atom: `atom-ret-${kind}-${TAG}`,
      upload: `${randomUUID()}-notes.txt`,
      uploadFile: '',
      token: `tok-ret-${kind}-${TAG}`,
    };
    s.uploadFile = path.join(uploadDir, s.upload);
    const expires = kind === 'expired' ? "NOW() - INTERVAL '1 hour'" : kind === 'current' ? "NOW() + INTERVAL '10 days'" : 'NULL';
    await db.run(`INSERT INTO users (id, username, password_hash, role, demo_expires_at) VALUES (?, ?, 'x', 'analyst', ${expires})`, s.id, s.username);
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, 'general', 'retention', '{}', ?)`, s.session, s.id);
    await db.run(`INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, 'assistant', 'an answer')`, s.message, s.session);
    await db.run(`INSERT INTO run_artifacts (id, session_id, message_id, prompt_sha256) VALUES (?, ?, ?, 'x')`, `ra-${s.session}`, s.session, s.message);
    await db.run(`INSERT INTO session_snapshots (session_id, summary, snapshot_type) VALUES (?, 'summary', 'auto')`, s.session);
    await db.run(`INSERT INTO output_versions (id, session_id, message_id, version_number, content, user_id) VALUES (?, ?, ?, 1, 'v1', ?)`, `ov-${s.session}`, s.session, s.message, s.id);
    await db.run(`INSERT INTO quality_scores (id, session_id, module_id, content_hash, score_overall) VALUES (?, ?, 'general', 'h', 7)`, `qs-${s.session}`, s.session);
    await db.run(`INSERT INTO retrieval_feedback (session_id, atom_id, message_id) VALUES (?, ?, ?)`, s.session, s.atom, s.message);
    await db.run(`INSERT INTO output_feedback (id, session_id, module_id, rating, user_id) VALUES (?, ?, 'general', 5, ?)`, `of-${s.session}`, s.session, s.id);
    await db.run(
      `INSERT INTO workflow_outputs (id, execution_id, workflow_id, step_index, step_type, output_data, created_by, workflow_name, step_name)
       VALUES (?, ?, 'module:general', 0, 'module', '"x"', ?, 'wf', 'step')`,
      `wo-${s.session}`, s.session, s.id,
    );
    await db.run(
      `INSERT INTO knowledge_atoms (id, source_workflow_id, source_execution_id, content, atom_type, category, owner_user_id)
       VALUES (?, 'module:general', ?, 'a fact', 'fact', 'general', ?)`,
      s.atom, s.session, s.id,
    );
    await db.run(`INSERT INTO knowledge_entity_refs (atom_id, entity_type, entity_id) VALUES (?, 'org', 'acme')`, s.atom);
    await db.run(
      `INSERT INTO embeddings (id, content_type, content_id, content_text, embedding, embedding_model, embedding_dimension)
       VALUES (?, 'knowledge_atom', ?, 't', '[]', 'm', 0), (?, 'session_output', ?, 't', '[]', 'm', 0)`,
      `emb-a-${s.session}`, s.atom, `emb-m-${s.session}`, s.message,
    );
    fs.writeFileSync(s.uploadFile, 'visitor document');
    await db.run(`INSERT INTO file_uploads (id, original_name, uploaded_by) VALUES (?, 'notes.txt', ?)`, s.upload, s.id);
    await db.run(
      `INSERT INTO audit_events (id, method, path, path_pattern, status_code, duration_ms, user_id, ip_address)
       VALUES (?, 'POST', '/api/claude/message', '/api/claude/message', 200, 5, ?, '203.0.113.9')`,
      `ae-${s.session}`, s.id,
    );
    await db.run(`INSERT INTO security_events (event_type, user_id, ip_address, details) VALUES ('failed_login', ?, '203.0.113.9', 'retention test')`, s.id);
    await db.run(`INSERT INTO login_attempts (username, ip_address, success) VALUES (?, '203.0.113.9', 1)`, s.username);
    await db.run(`INSERT INTO user_sessions (token, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL '1 day')`, s.token, s.id);
    await db.run(`INSERT INTO user_profiles (id, name) VALUES (?, 'Visitor')`, s.id);
    await db.run(`INSERT INTO user_module_defaults (user_id, module_id) VALUES (?, 'general')`, s.id);
    await db.run(`INSERT INTO versions (entity_type, entity_id, version_number, content, user_id) VALUES ('output', ?, 1, 'x', ?)`, s.session, s.id);
    if (hasLedger) {
      await db.run(
        `INSERT INTO llm_spend_ledger (user_id, model, cost_usd, cost_source, session_id) VALUES (?, 'compat:openrouter:z-ai/glm-5.3-flash', 0.0123, 'usage.cost', ?)`,
        s.id, s.session,
      );
    }
    return s;
  }

  async function countRows(s: Seeded): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const c of CHECKS) {
      const [where, params] = c.where(s);
      const row = await db.get<{ n: string | number }>(`SELECT COUNT(*) AS n FROM ${c.table} WHERE ${where}`, ...params);
      out[c.table] = Number(row?.n ?? 0);
    }
    return out;
  }

  beforeAll(async () => {
    process.env.DEMO_ACCOUNT_TTL_DAYS = '365';
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-demo-uploads-'));
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-demo-outputs-'));
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
    hasLedger = !!(await db.get("SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'llm_spend_ledger'"));
    accounts.expired = await seed('expired');
    accounts.current = await seed('current');
    accounts.ordinary = await seed('ordinary');
  });

  afterAll(async () => {
    if (savedTtl === undefined) delete process.env.DEMO_ACCOUNT_TTL_DAYS; else process.env.DEMO_ACCOUNT_TTL_DAYS = savedTtl;
    if (db) {
      for (const s of Object.values(accounts)) {
        if (!s) continue;
        await db.run('DELETE FROM embeddings WHERE content_id IN (?, ?)', s.atom, s.message).catch(() => {});
        await db.run('DELETE FROM knowledge_entity_refs WHERE atom_id = ?', s.atom).catch(() => {});
        await db.run('DELETE FROM retrieval_feedback WHERE session_id = ?', s.session).catch(() => {});
        await db.run('DELETE FROM knowledge_atoms WHERE id = ?', s.atom).catch(() => {});
        await db.run('DELETE FROM quality_scores WHERE session_id = ?', s.session).catch(() => {});
        await db.run('DELETE FROM output_feedback WHERE session_id = ?', s.session).catch(() => {});
        await db.run('DELETE FROM workflow_outputs WHERE created_by = ?', s.id).catch(() => {});
        await db.run('DELETE FROM file_uploads WHERE id = ?', s.upload).catch(() => {});
        await db.run('DELETE FROM audit_events WHERE user_id = ?', s.id).catch(() => {});
        await db.run('DELETE FROM security_events WHERE user_id = ?', s.id).catch(() => {});
        await db.run('DELETE FROM login_attempts WHERE username = ?', s.username).catch(() => {});
        await db.run('DELETE FROM user_profiles WHERE id = ?', s.id).catch(() => {});
        await db.run('DELETE FROM user_module_defaults WHERE user_id = ?', s.id).catch(() => {});
        await db.run('DELETE FROM versions WHERE user_id = ?', s.id).catch(() => {});
        if (hasLedger) await db.run('DELETE FROM llm_spend_ledger WHERE session_id = ? OR user_id = ?', s.session, s.id).catch(() => {});
        await db.run('DELETE FROM sessions WHERE id = ?', s.session).catch(() => {});
        await db.run('DELETE FROM users WHERE id = ?', s.id).catch(() => {});
      }
      if (hasLedger) await db.run("DELETE FROM llm_spend_ledger WHERE user_id IS NULL AND cost_usd = 0.0123 AND cost_source = 'usage.cost'").catch(() => {});
      await db.run("DELETE FROM audit_events WHERE id LIKE ?", `ae-old-${TAG}%`).catch(() => {});
      await db.close();
    }
    fs.rmSync(uploadDir, { recursive: true, force: true });
    fs.rmSync(outputDir, { recursive: true, force: true });
  });

  it('every table is seeded for every account (the test would prove nothing otherwise)', async () => {
    for (const s of Object.values(accounts)) {
      const counts = await countRows(s);
      for (const [table, n] of Object.entries(counts)) expect(n, `${s.username} ${table}`).toBeGreaterThan(0);
      expect(fs.existsSync(s.uploadFile)).toBe(true);
    }
  });

  it('deletes the expired demo account and every row it wrote, and leaves the others exactly as they were', async () => {
    const { runDemoRetention } = await import('../../server/services/demo-retention.js');
    const before = { current: await countRows(accounts.current), ordinary: await countRows(accounts.ordinary) };

    const result = await runDemoRetention(db, { uploadDir, outputDir, pruneTraces: false, now: HALF_HOUR_AGO() });
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    expect(result.filesRemoved).toBeGreaterThanOrEqual(1);

    const gone = await countRows(accounts.expired);
    for (const [table, n] of Object.entries(gone)) expect(n, `expired ${table}`).toBe(0);
    expect(fs.existsSync(accounts.expired.uploadFile)).toBe(false);

    expect(await countRows(accounts.current)).toEqual(before.current);
    expect(await countRows(accounts.ordinary)).toEqual(before.ordinary);
    expect(fs.existsSync(accounts.current.uploadFile)).toBe(true);
    expect(fs.existsSync(accounts.ordinary.uploadFile)).toBe(true);

    // Nothing in the tables this test seeded failed to delete.
    const seededTables = new Set(CHECKS.map((c) => c.table));
    expect(result.errors.filter((e) => seededTables.has(e.table))).toEqual([]);
  });

  it('keeps the spend on the ledger, without the person', async () => {
    if (!hasLedger) return;
    const expiredRows = await db.get<{ n: string | number }>('SELECT COUNT(*) AS n FROM llm_spend_ledger WHERE user_id = ? OR session_id = ?', accounts.expired.id, accounts.expired.session);
    expect(Number(expiredRows?.n)).toBe(0);
    const anonymous = await db.get<{ n: string | number }>("SELECT COUNT(*) AS n FROM llm_spend_ledger WHERE user_id IS NULL AND session_id IS NULL AND cost_usd = 0.0123 AND cost_source = 'usage.cost'");
    expect(Number(anonymous?.n)).toBeGreaterThanOrEqual(1);
    const current = await db.get<{ n: string | number }>('SELECT COUNT(*) AS n FROM llm_spend_ledger WHERE user_id = ?', accounts.current.id);
    expect(Number(current?.n)).toBe(1);
  });

  it('prunes audit / login / security rows and export files older than the retention period — not recent ones', async () => {
    const { runDemoRetention } = await import('../../server/services/demo-retention.js');
    await db.run(
      `INSERT INTO audit_events (id, occurred_at, method, path, path_pattern, status_code, duration_ms, ip_address)
       VALUES (?, NOW() - INTERVAL '400 days', 'GET', '/x', '/x', 200, 1, '203.0.113.10'),
              (?, NOW() - INTERVAL '10 days', 'GET', '/x', '/x', 200, 1, '203.0.113.10')`,
      `ae-old-${TAG}`, `ae-old-${TAG}-recent`,
    );
    const oldExport = path.join(outputDir, `old-${TAG}.docx`);
    const newExport = path.join(outputDir, `new-${TAG}.docx`);
    fs.writeFileSync(oldExport, 'x');
    fs.writeFileSync(newExport, 'x');
    const longAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldExport, longAgo, longAgo);

    await runDemoRetention(db, { uploadDir, outputDir, now: HALF_HOUR_AGO() });

    expect(await db.get('SELECT id FROM audit_events WHERE id = ?', `ae-old-${TAG}`)).toBeUndefined();
    expect(await db.get('SELECT id FROM audit_events WHERE id = ?', `ae-old-${TAG}-recent`)).toBeDefined();
    expect(fs.existsSync(oldExport)).toBe(false);
    expect(fs.existsSync(newExport)).toBe(true);
    // The two accounts that were not expired are still whole.
    expect((await countRows(accounts.current)).users).toBe(1);
    expect((await countRows(accounts.ordinary)).audit_events).toBe(1);
  });

  it('registers the daily pass only in demo mode', async () => {
    const { startDemoRetention } = await import('../../server/services/demo-retention.js');
    const saved = process.env.DEMO_MODE;
    try {
      delete process.env.DEMO_MODE;
      expect(startDemoRetention(db)).toBeNull();
      process.env.DEMO_MODE = 'true';
      const handle = startDemoRetention(db, { firstDelayMs: 60_000 });
      expect(handle).not.toBeNull();
      handle?.stop();
    } finally {
      if (saved === undefined) delete process.env.DEMO_MODE; else process.env.DEMO_MODE = saved;
    }
  });

  // ── Review findings C7, C8, L5, L6 (2026-09-25) ───────────────────────────
  //
  // Each case seeds its own accounts, expired hours ago so a pass half an hour
  // back finds them (and not the demo-signup file's accounts, expired a minute
  // before), and cleans up after itself.

  const extraUsers: string[] = [];
  const extraCleanup: Array<() => Promise<unknown>> = [];

  async function seedUser(name: string, opts: { role?: string; expiresAgo?: string | null; disabled?: boolean } = {}): Promise<string> {
    const id = randomUUID();
    const expires = opts.expiresAgo === null ? 'NULL' : `NOW() - INTERVAL '${opts.expiresAgo ?? '3 hours'}'`;
    await db.run(
      `INSERT INTO users (id, username, password_hash, role, demo_expires_at, disabled_at)
       VALUES (?, ?, 'x', ?, ${expires}, ${opts.disabled ? 'NOW()' : 'NULL'})`,
      id, `ret_${name}_${TAG}`, opts.role ?? 'analyst',
    );
    extraUsers.push(id);
    return id;
  }
  const userExists = async (id: string) => !!(await db.get('SELECT id FROM users WHERE id = ?', id));
  const pass = async (opts: { limit?: number; pruneTraces?: boolean } = {}) => {
    const { runDemoRetention } = await import('../../server/services/demo-retention.js');
    return runDemoRetention(db, { uploadDir, outputDir, pruneTraces: opts.pruneTraces ?? false, now: HALF_HOUR_AGO(), limit: opts.limit });
  };

  afterAll(async () => {
    if (!db) return;
    for (const fn of extraCleanup.reverse()) await fn().catch(() => {});
    for (const id of extraUsers) {
      await db.run('DELETE FROM model_allowed WHERE created_by = ? OR user_id = ?', id, id).catch(() => {});
      await db.run('DELETE FROM student_growth_profiles WHERE student_user_id = ?', id).catch(() => {});
      await db.run('DELETE FROM users WHERE id = ?', id).catch(() => {});
    }
  });

  it('C7: never deletes an administrator — a promoted demo account keeps its account and the rows it authored', async () => {
    const promoted = await seedUser('promoted', { role: 'admin' });
    const visitor = await seedUser('visitor_c7');
    const other = await seedUser('restricted', { expiresAgo: null });
    // Model restrictions each one set on another user (model_allowed.created_by = who set it).
    await db.run("INSERT INTO model_allowed (user_id, model_id, created_by) VALUES (?, 'compat:x:a', ?), (?, 'compat:x:b', ?)", other, promoted, other, visitor);

    await pass();

    expect(await userExists(promoted)).toBe(true);
    expect(await db.get('SELECT id FROM model_allowed WHERE created_by = ?', promoted)).toBeDefined();
    // Negative control: the analyst demo account in the same setup is deleted, with what it wrote.
    expect(await userExists(visitor)).toBe(false);
    expect(await db.get('SELECT id FROM model_allowed WHERE created_by = ?', visitor)).toBeUndefined();
    expect(await userExists(other)).toBe(true);
  });

  it('C8: rows held by a foreign key to users no longer keep the account — School and missions rows go, someone else\'s reference is cleared', async () => {
    const hasMissions = !!(await db.get("SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = 'missions' AND table_name = 'missions'"));
    const probe = `retention_probe_${TAG}`;
    // A table the name list cannot know: a nullable reference, in another person's row.
    await db.exec(`CREATE TABLE ${probe} (id TEXT PRIMARY KEY, owner_note TEXT, reviewed_by TEXT REFERENCES users(id))`);
    extraCleanup.push(() => db.exec(`DROP TABLE IF EXISTS ${probe}`));

    const visitor = await seedUser('school');
    const ordinary = await seedUser('school_ordinary', { expiresAgo: null });
    for (const id of [visitor, ordinary]) {
      await db.run('INSERT INTO student_growth_profiles (id, student_user_id) VALUES (?, ?)', `sgp-${id}`, id);
      await db.run(`INSERT INTO ${probe} (id, owner_note, reviewed_by) VALUES (?, 'kept', ?)`, `p-${id}`, id);
      if (hasMissions) {
        await db.run(
          "INSERT INTO missions.missions (id, title, objective, success_criteria, created_by) VALUES (?, 't', 'o', 's', ?)",
          `m-${id}`, id,
        );
        extraCleanup.push(() => db.run('DELETE FROM missions.missions WHERE id = ?', `m-${id}`));
      }
    }

    const r = await pass();

    expect(await userExists(visitor)).toBe(false);
    expect(r.errors.filter((e) => e.table === 'users')).toEqual([]);
    expect(await db.get('SELECT id FROM student_growth_profiles WHERE student_user_id = ?', visitor)).toBeUndefined();
    if (hasMissions) expect(await db.get('SELECT id FROM missions.missions WHERE created_by = ?', visitor)).toBeUndefined();
    const probeRow = await db.get<{ reviewed_by: string | null }>(`SELECT reviewed_by FROM ${probe} WHERE id = ?`, `p-${visitor}`);
    expect(probeRow).toEqual({ reviewed_by: null });

    // Negative control: the ordinary account's rows are exactly as they were.
    expect(await userExists(ordinary)).toBe(true);
    expect(await db.get('SELECT id FROM student_growth_profiles WHERE student_user_id = ?', ordinary)).toBeDefined();
    if (hasMissions) expect(await db.get('SELECT id FROM missions.missions WHERE created_by = ?', ordinary)).toBeDefined();
    expect(await db.get<{ reviewed_by: string | null }>(`SELECT reviewed_by FROM ${probe} WHERE id = ?`, `p-${ordinary}`)).toEqual({ reviewed_by: ordinary });
    await db.run(`DELETE FROM ${probe}`);
  });

  it('C8: an account that still cannot be deleted is switched off, and the log names the constraint that held it', async () => {
    const parent = `retention_hold_${TAG}`;
    const child = `retention_hold_child_${TAG}`;
    // A row the pass may not delete: another table still points at it.
    await db.exec(`CREATE TABLE ${parent} (id TEXT PRIMARY KEY, holder TEXT NOT NULL REFERENCES users(id))`);
    await db.exec(`CREATE TABLE ${child} (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES ${parent}(id))`);
    extraCleanup.push(() => db.exec(`DROP TABLE IF EXISTS ${child}; DROP TABLE IF EXISTS ${parent}`));
    const held = await seedUser('held');
    await db.run(`INSERT INTO ${parent} (id, holder) VALUES ('h1', ?)`, held);
    await db.run(`INSERT INTO ${child} (id, parent_id) VALUES ('c1', 'h1')`);

    const r = await pass();

    expect(r.failed).toBe(1);
    expect(r.errors).toContainEqual({ table: 'users', code: '23503', constraint: `${parent}_holder_fkey` });
    expect(await db.get<{ off: boolean }>('SELECT disabled_at IS NOT NULL AS off FROM users WHERE id = ?', held)).toEqual({ off: true });

    // Negative control: once nothing holds it, the next pass deletes it.
    await db.run(`DELETE FROM ${child}`);
    expect((await pass()).failed).toBe(0);
    expect(await userExists(held)).toBe(false);
  });

  it('C8: an account a pass failed on no longer takes the batch — newer expiries are deleted first', async () => {
    // Failed before: switched off by that pass, and expired longest ago.
    const stuck = await seedUser('stuck', { expiresAgo: '5 hours', disabled: true });
    const fresh = await seedUser('fresh', { expiresAgo: '3 hours' });

    const r = await pass({ limit: 1 });

    expect(r.expired).toBe(1);
    expect(await userExists(fresh)).toBe(false);
    expect(await userExists(stuck)).toBe(true);
    // Negative control: with room in the batch, the switched-off account is still deleted.
    await pass();
    expect(await userExists(stuck)).toBe(false);
  });

  it('L5: a custom module shared with the community outlives its author\'s demo account; a private one does not', async () => {
    const author = await seedUser('author');
    const shared = `cm-shared-${TAG}`;
    const own = `cm-own-${TAG}`;
    await db.run(
      "INSERT INTO custom_modules (id, name, short_name, user_id, is_shared_with_community) VALUES (?, 'Shared', 'S', ?, 1), (?, 'Own', 'O', ?, 0)",
      shared, author, own, author,
    );
    extraCleanup.push(() => db.run('DELETE FROM custom_modules WHERE id IN (?, ?)', shared, own));

    await pass();

    expect(await userExists(author)).toBe(false);
    expect(await db.get('SELECT user_id FROM custom_modules WHERE id = ?', shared)).toEqual({ user_id: null });
    // Negative control: the author's private module goes with the account.
    expect(await db.get('SELECT id FROM custom_modules WHERE id = ?', own)).toBeUndefined();
  });

  it('L6: the export prune keeps a deck the presentations table still lists', async () => {
    const deck = `presentation_${randomUUID()}.pptx`;
    const orphanDeck = `presentation_${randomUUID()}.pptx`;
    const oldExport = `aml-gap-analysis_20240101-${TAG}.docx`;
    const longAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    for (const name of [deck, orphanDeck, oldExport]) {
      fs.writeFileSync(path.join(outputDir, name), 'x');
      fs.utimesSync(path.join(outputDir, name), longAgo, longAgo);
    }
    const presentationId = `pres-${TAG}`;
    await db.run("INSERT INTO presentations (id, status, file_path, filename) VALUES (?, 'ready', ?, ?)", presentationId, path.join(outputDir, deck), deck);
    extraCleanup.push(() => db.run('DELETE FROM presentations WHERE id = ?', presentationId));

    await pass({ pruneTraces: true });

    expect(fs.existsSync(path.join(outputDir, deck))).toBe(true);
    // Negative controls: an old export and a deck no row lists are pruned as before.
    expect(fs.existsSync(path.join(outputDir, oldExport))).toBe(false);
    expect(fs.existsSync(path.join(outputDir, orphanDeck))).toBe(false);
  });
});
