/**
 * demo-retention-features.db.test.ts — an expired demo account is deleted with
 * what it kept in the features opened to visitors on 2026-10-02, files on disk
 * included, and nobody else's rows or files are touched (public showcase).
 *
 * Three accounts get the same rows and files in Engagement Tasks (an engagement
 * with an uploaded document, its file_uploads row and an iteration), the Task
 * Agent, Discover (an interview with its report and a follow-up), Projects (a
 * project with a file in its workspace, a note and the knowledge-source
 * folder entry), the Knowledge Base (a collection with a document file, a
 * chunk and its vector row), and Orchestration (a continuity profile and a
 * proactive insight):
 *
 *   - a leaving demo visitor, deleted the way the retention pass deletes an
 *     expired account (deleteDemoAccountNow: the same per-account deletion,
 *     for this account only — see the test for why);
 *   - a demo visitor that has not expired (negative control), who also filed
 *     one of their sessions under the leaving visitor's project — the session
 *     must stay, unlinked;
 *   - an administrator that began as a demo account and is past its expiry
 *     (negative control: an administrator is never deleted).
 *
 * The directories come from the deletion's options (uploadDir, workspacesDir), so
 * the files are found where the routes put them: UPLOAD_DIR for engagement
 * documents, UPLOAD_DIR/rag-documents for Knowledge Base documents and
 * WORKSPACES_DIR/<project id> for a project.
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

type Kind = 'leaver' | 'stayer' | 'admin';

interface Seeded {
  kind: Kind;
  id: string;
  username: string;
  session: string;
  engagement: string;
  engagementUpload: string;
  task: string;
  discovery: string;
  project: string;
  projectFile: string;
  collection: string;
  ragDocument: string;
  ragFile: string;
  ragChunk: string;
  folderPath: string;
}

/** Every row each account gets, counted by a key of that account. */
const CHECKS: Array<{ table: string; where: (s: Seeded) => [string, unknown[]] }> = [
  { table: 'users', where: (s) => ['id = ?', [s.id]] },
  { table: 'engagements', where: (s) => ['id = ?', [s.engagement]] },
  { table: 'engagement_documents', where: (s) => ['engagement_id = ?', [s.engagement]] },
  { table: 'engagement_iterations', where: (s) => ['engagement_id = ?', [s.engagement]] },
  { table: 'file_uploads', where: (s) => ['id = ?', [s.engagementUpload]] },
  { table: 'anton_tasks', where: (s) => ['id = ?', [s.task]] },
  { table: 'discovery_sessions', where: (s) => ['id = ?', [s.discovery]] },
  { table: 'discovery_outputs', where: (s) => ['session_id = ?', [s.discovery]] },
  { table: 'discovery_followups', where: (s) => ['session_id = ?', [s.discovery]] },
  { table: 'projects', where: (s) => ['id = ?', [s.project]] },
  { table: 'project_files', where: (s) => ['project_id = ?', [s.project]] },
  { table: 'project_notes', where: (s) => ['project_id = ?', [s.project]] },
  { table: 'registered_folders', where: (s) => ['path = ?', [s.folderPath]] },
  { table: 'knowledge_collections', where: (s) => ['id = ?', [s.collection]] },
  { table: 'rag_documents', where: (s) => ['id = ?', [s.ragDocument]] },
  { table: 'rag_chunks', where: (s) => ['id = ?', [s.ragChunk]] },
  { table: 'embeddings', where: (s) => ["content_type = 'rag_chunk' AND content_id = ?", [s.ragChunk]] },
  { table: 'continuity_profiles', where: (s) => ['user_id = ?', [s.id]] },
  { table: 'proactive_insights', where: (s) => ['user_id = ?', [s.id]] },
];

d('demo retention: the features opened on 2026-10-02', () => {
  let db: DatabaseAdapter;
  let uploadDir: string;
  let outputDir: string;
  let workspacesDir: string;
  const accounts = {} as Record<Kind, Seeded>;

  /** The account's files on disk, by where the routes keep them. */
  const files = (s: Seeded) => ({
    engagementDocument: path.join(uploadDir, s.engagementUpload),
    ragDocument: s.ragFile,
    projectFile: s.projectFile,
    workspace: path.join(workspacesDir, s.project),
  });

  async function seed(kind: Kind): Promise<Seeded> {
    const k = `${kind}-${TAG}`;
    const s: Seeded = {
      kind,
      id: randomUUID(),
      username: `retf_${kind}_${TAG}`,
      session: `sess-retf-${k}`,
      engagement: `eng-retf-${k}`,
      engagementUpload: `${randomUUID()}-letter.txt`,
      task: `task-retf-${k}`,
      discovery: `disc-retf-${k}`,
      project: `proj-retf-${k}`,
      projectFile: '',
      collection: `coll-retf-${k}`,
      ragDocument: `doc-retf-${k}`,
      ragFile: path.join(uploadDir, 'rag-documents', `${randomUUID()}-notes.txt`),
      ragChunk: `chunk-retf-${k}`,
      folderPath: path.join(workspacesDir, `proj-retf-${k}`, 'uploads'),
    };
    s.projectFile = path.join(workspacesDir, s.project, 'uploads', 'plan.txt');
    // Seeded as current (the leaver too: see the deletion test). The admin is past
    // its expiry, which no pass acts on: an administrator is never deleted.
    const role = kind === 'admin' ? 'admin' : 'analyst';
    const expires = kind === 'admin' ? "TIMESTAMPTZ '2000-01-01T00:00:00Z'" : "NOW() + INTERVAL '10 days'";
    await db.run(`INSERT INTO users (id, username, password_hash, role, demo_expires_at) VALUES (?, ?, 'x', ?, ${expires})`, [s.id, s.username, role]);
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id) VALUES (?, 'general', 'retention', '{}', ?)`, [s.session, s.id]);

    // Engagement Tasks: an engagement, its uploaded letter (stored as a run upload is) and an iteration.
    await db.run('INSERT INTO engagements (id, title, user_id) VALUES (?, ?, ?)', [s.engagement, 'Retention engagement', s.id]);
    fs.writeFileSync(path.join(uploadDir, s.engagementUpload), 'engagement letter');
    await db.run("INSERT INTO file_uploads (id, original_name, uploaded_by) VALUES (?, 'letter.txt', ?)", [s.engagementUpload, s.id]);
    await db.run(
      "INSERT INTO engagement_documents (id, engagement_id, document_type, file_path, file_name) VALUES (?, ?, 'engagement_letter', ?, 'letter.txt')",
      [`edoc-${k}`, s.engagement, path.join(uploadDir, s.engagementUpload)],
    );
    await db.run('INSERT INTO engagement_iterations (id, engagement_id, iteration_number, session_id) VALUES (?, ?, 1, ?)', [`eit-${k}`, s.engagement, s.session]);

    // The Task Agent and Discover.
    await db.run('INSERT INTO anton_tasks (id, title, description, user_id) VALUES (?, ?, ?, ?)', [s.task, 'A task', 'Describe the task', s.id]);
    await db.run("INSERT INTO discovery_sessions (id, tier, user_id) VALUES (?, 'lite', ?)", [s.discovery, s.id]);
    await db.run("INSERT INTO discovery_outputs (id, session_id, tier) VALUES (?, ?, 'lite')", [`dout-${k}`, s.discovery]);
    await db.run('INSERT INTO discovery_followups (id, session_id) VALUES (?, ?)', [`dfu-${k}`, s.discovery]);

    // Projects: a project with a file in its workspace, a note and the folder entry the upload registers.
    await db.run('INSERT INTO projects (id, name, user_id) VALUES (?, ?, ?)', [s.project, 'Retention project', s.id]);
    fs.mkdirSync(path.dirname(s.projectFile), { recursive: true });
    fs.writeFileSync(s.projectFile, 'project plan');
    await db.run(
      "INSERT INTO project_files (id, project_id, filename, original_name, file_path, file_size, uploaded_by) VALUES (?, ?, 'plan.txt', 'plan.txt', ?, 12, ?)",
      [`pf-${k}`, s.project, s.projectFile, s.id],
    );
    await db.run('INSERT INTO project_notes (id, project_id, content, user_id) VALUES (?, ?, ?, ?)', [`pn-${k}`, s.project, 'a note', s.id]);
    await db.run("INSERT INTO registered_folders (path, label, project_id, user_id) VALUES (?, 'Project files', ?, ?)", [s.folderPath, s.project, s.id]);

    // The Knowledge Base: a collection, a document file, a chunk and its vector row.
    await db.run('INSERT INTO knowledge_collections (id, name, display_name, created_by) VALUES (?, ?, ?, ?)', [s.collection, s.collection, 'Retention collection', s.id]);
    fs.mkdirSync(path.dirname(s.ragFile), { recursive: true });
    fs.writeFileSync(s.ragFile, 'knowledge base document');
    await db.run(
      "INSERT INTO rag_documents (id, collection_id, filename, file_path, file_type, uploaded_by) VALUES (?, ?, 'notes.txt', ?, 'txt', ?)",
      [s.ragDocument, s.collection, s.ragFile, s.id],
    );
    await db.run('INSERT INTO rag_chunks (id, document_id, chunk_index, content, chroma_id) VALUES (?, ?, 0, ?, ?)', [s.ragChunk, s.ragDocument, 'chunk text', s.ragChunk]);
    await db.run(
      "INSERT INTO embeddings (id, content_type, content_id, content_text, embedding, embedding_model, embedding_dimension) VALUES (?, 'rag_chunk', ?, 't', '[]', 'm', 0)",
      [`emb-${k}`, s.ragChunk],
    );

    // Orchestration's own rows.
    await db.run("INSERT INTO continuity_profiles (id, profile_name, role, user_id) VALUES (?, 'Profile', 'Analyst', ?)", [`cp-${k}`, s.id]);
    await db.run("INSERT INTO proactive_insights (id, insight_type, title, body, user_id) VALUES (?, 'pattern', 'Insight', 'Body', ?)", [`pi-${k}`, s.id]);
    return s;
  }

  async function countRows(s: Seeded): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const c of CHECKS) {
      const [where, params] = c.where(s);
      const row = await db.get<{ n: string | number }>(`SELECT COUNT(*) AS n FROM ${c.table} WHERE ${where}`, params);
      out[c.table] = Number(row?.n ?? 0);
    }
    return out;
  }

  const onDisk = (s: Seeded): Record<string, boolean> =>
    Object.fromEntries(Object.entries(files(s)).map(([name, p]) => [name, fs.existsSync(p)]));

  beforeAll(async () => {
    uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-retf-uploads-'));
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-retf-outputs-'));
    workspacesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anton-retf-workspaces-'));
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    await db.exec(fs.readFileSync(MIGRATION, 'utf8'));
    accounts.leaver = await seed('leaver');
    accounts.stayer = await seed('stayer');
    accounts.admin = await seed('admin');
    // The staying visitor filed a session under the leaver's project.
    await db.run('UPDATE sessions SET project_id = ? WHERE id = ?', [accounts.leaver.project, accounts.stayer.session]);
  });

  afterAll(async () => {
    if (db) {
      for (const s of Object.values(accounts)) {
        if (!s) continue;
        await db.run("DELETE FROM embeddings WHERE content_type = 'rag_chunk' AND content_id = ?", [s.ragChunk]).catch(() => {});
        await db.run('DELETE FROM knowledge_collections WHERE id = ?', [s.collection]).catch(() => {});
        await db.run('DELETE FROM registered_folders WHERE path = ?', [s.folderPath]).catch(() => {});
        await db.run('UPDATE sessions SET project_id = NULL WHERE project_id = ?', [s.project]).catch(() => {});
        await db.run('DELETE FROM projects WHERE id = ?', [s.project]).catch(() => {});
        await db.run('DELETE FROM discovery_sessions WHERE id = ?', [s.discovery]).catch(() => {});
        await db.run('DELETE FROM anton_tasks WHERE id = ?', [s.task]).catch(() => {});
        await db.run('DELETE FROM engagements WHERE id = ?', [s.engagement]).catch(() => {});
        await db.run('DELETE FROM file_uploads WHERE id = ?', [s.engagementUpload]).catch(() => {});
        await db.run('DELETE FROM continuity_profiles WHERE user_id = ?', [s.id]).catch(() => {});
        await db.run('DELETE FROM proactive_insights WHERE user_id = ?', [s.id]).catch(() => {});
        await db.run('DELETE FROM sessions WHERE id = ?', [s.session]).catch(() => {});
        await db.run('DELETE FROM users WHERE id = ?', [s.id]).catch(() => {});
      }
      await db.close();
    }
    for (const dir of [uploadDir, outputDir, workspacesDir]) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('every row and file is seeded for every account (the test would prove nothing otherwise)', async () => {
    for (const s of Object.values(accounts)) {
      for (const [table, n] of Object.entries(await countRows(s))) expect(n, `${s.kind} ${table}`).toBeGreaterThan(0);
      for (const [name, exists] of Object.entries(onDisk(s))) expect(exists, `${s.kind} ${name}`).toBe(true);
    }
    const filed = await db.get<{ project_id: string | null }>('SELECT project_id FROM sessions WHERE id = ?', [accounts.stayer.session]);
    expect(filed?.project_id).toBe(accounts.leaver.project);
  });

  it("deletes the leaving visitor's engagements, tasks, interviews, projects and collections with their files, and leaves everyone else's", async () => {
    const { deleteDemoAccountNow } = await import('../../server/services/demo-retention.js');
    const before = { stayer: await countRows(accounts.stayer), admin: await countRows(accounts.admin) };

    // deleteDemoAccountNow runs the per-account deletion the daily pass runs
    // (deleteDemoAccount, with these directories), for this account only.
    // The leaver is never expired before it runs: a retention pass in another
    // test file (demo-retention.db.test.ts, in parallel, with its own
    // directories) deletes any account expired more than half an hour ago,
    // and took this one first — its files then stayed on disk and the count
    // here was 0 (flaky, 2026-10-02). The pass's own query is that file's.
    const result = await deleteDemoAccountNow(db, accounts.leaver.id, { uploadDir, outputDir, workspacesDir });
    expect(result.refused).toBeUndefined();
    expect(result.deleted).toBe(1);
    expect(result.failed).toBe(0);
    // The engagement upload, the Knowledge Base document and the project file.
    expect(result.filesRemoved).toBeGreaterThanOrEqual(2);
    expect(result.rowsByTable['project workspaces']).toBe(1);

    for (const [table, n] of Object.entries(await countRows(accounts.leaver))) expect(n, `leaver ${table}`).toBe(0);
    for (const [name, exists] of Object.entries(onDisk(accounts.leaver))) expect(exists, `leaver ${name}`).toBe(false);

    // Negative controls: the other visitor and the administrator keep everything.
    expect(await countRows(accounts.stayer)).toEqual(before.stayer);
    expect(await countRows(accounts.admin)).toEqual(before.admin);
    for (const s of [accounts.stayer, accounts.admin]) {
      for (const [name, exists] of Object.entries(onDisk(s))) expect(exists, `${s.kind} ${name}`).toBe(true);
    }

    // The staying visitor's session filed under the leaver's project stays, unlinked.
    const filed = await db.get<{ project_id: string | null }>('SELECT project_id FROM sessions WHERE id = ?', [accounts.stayer.session]);
    expect(filed).toBeTruthy();
    expect(filed?.project_id).toBeNull();

    // Nothing in these tables failed to delete.
    const seeded = new Set(CHECKS.map((c) => c.table));
    expect(result.errors.filter((e) => seeded.has(e.table) || e.table === 'files')).toEqual([]);
  });
});
