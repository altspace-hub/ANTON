/**
 * work-timeline.test.ts — Wave 4.3 (Core Experience Review 2026-06).
 *
 * GET /api/work-timeline — one UNION round trip over sessions ∪
 * engagements ∪ workflow_runs ∪ workflow_executions ∪ discovery_sessions,
 * type-tagged, ordered by updated_at DESC, ?before= cursor, ?types= filter,
 * per-type resume links.
 *
 * Live-PG test (council-dissent.test.ts pattern): ephemeral express app +
 * PostgresAdapter, stub auth. Rows are seeded under a throwaway NON-admin
 * user so the per-user scoping isolates the assertions from real data.
 * Requires DATABASE_URL (env or .env); skips otherwise.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'http';

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const DATABASE_URL = resolveDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

interface TimelineItem {
  type: string;
  id: string;
  title: string | null;
  subtitle: string | null;
  status: string | null;
  cost: number | null;
  updated_at: string;
  resumeUrl: string;
}

describeOrSkip('GET /api/work-timeline (4.3)', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;

  const userId = `tl-test-${randomUUID().slice(0, 8)}`;

  // Five timeline citizens + one bridged engagement session (must dedup) —
  // spaced one minute apart so ordering and the ?before= cursor are exact.
  const t = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const sessionId = randomUUID();           // open-chat session   (50 min ago)
  const moduleSessionId = randomUUID();     // module session      (49 min ago)
  const bridgedSessionId = randomUUID();    // module_id 'engagement' — EXCLUDED from session arm
  const engagementId = randomUUID();        // engagement          (timestamp = latest iteration, 47 min ago)
  const workflowRunId = randomUUID();       // workflow_run        (46 min ago)
  const workflowExecId = randomUUID();      // workflow_execution  (45 min ago)
  const discoveryId = randomUUID();         // discovery           (44 min ago)
  const systemRunId = randomUUID();         // market-orchestrator noise (admin-excluded too)

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createWorkTimelineRoutes } = await import('../../server/routes/work-timeline.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      // NON-admin so each UNION arm applies the user filter — assertions
      // see only our seeded rows. Admin path is the same SQL minus filters.
      req.user = { id: userId, username: userId, role: 'analyst' };
      next();
    });
    app.use('/api', createWorkTimelineRoutes(db));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;

    await db.run(`INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'x', 'analyst')`, userId, userId);

    // sessions (need >= 1 message to count as work)
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id, created_at, updated_at)
                  VALUES (?, 'open-chat', 'Open chat about DORA', '{}', ?, ?, ?)`,
      sessionId, userId, t(60), t(50));
    await db.run(`INSERT INTO messages (id, session_id, role, content, cost, created_at)
                  VALUES (?, ?, 'assistant', 'DORA answer.', 0.25, ?)`,
      randomUUID(), sessionId, t(50));
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id, created_at, updated_at)
                  VALUES (?, 'policy-review', 'Policy review run', '{}', ?, ?, ?)`,
      moduleSessionId, userId, t(60), t(49));
    await db.run(`INSERT INTO messages (id, session_id, role, content, created_at)
                  VALUES (?, ?, 'assistant', 'Policy output.', ?)`,
      randomUUID(), moduleSessionId, t(49));

    // bridged engagement session — excluded from the session arm (dedup with engagement)
    await db.run(`INSERT INTO sessions (id, module_id, title, config, user_id, created_at, updated_at)
                  VALUES (?, 'engagement', 'Bridged iteration session', '{}', ?, ?, ?)`,
      bridgedSessionId, userId, t(48), t(48));
    await db.run(`INSERT INTO messages (id, session_id, role, content, created_at)
                  VALUES (?, ?, 'assistant', 'Iteration output.', ?)`,
      randomUUID(), bridgedSessionId, t(48));

    // engagement whose latest iteration (47 min ago) is NEWER than its own
    // updated_at (55 min ago) — proves the latest-iteration timestamp rule
    await db.run(`INSERT INTO engagements (id, title, engagement_type, status, client_name, user_id, created_at, updated_at)
                  VALUES (?, 'AML Remediation', 'full', 'review', 'Nordic Bank', ?, ?, ?)`,
      engagementId, userId, t(120), t(55));
    await db.run(`INSERT INTO engagement_iterations (id, engagement_id, iteration_number, output_content, status, created_at)
                  VALUES (?, ?, 1, 'Draft.', 'draft', ?)`,
      randomUUID(), engagementId, t(47));

    // workflow_run (headless engine) — running
    await db.run(`INSERT INTO workflow_runs (id, workflow_id, trigger_source, status, user_id, started_at)
                  VALUES (?, 'wf-tl-test', 'manual', 'running', ?, ?)`,
      workflowRunId, userId, t(46));
    // market-orchestrator noise — must never surface
    await db.run(`INSERT INTO workflow_runs (id, workflow_id, trigger_source, status, user_id, started_at)
                  VALUES (?, 'wf_markets_daily_intelligence', 'market-orchestrator', 'completed', 'system', ?)`,
      systemRunId, t(1));

    // workflow_execution (interactive engine) — paused, surfaced clearly
    await db.run(`INSERT INTO workflow_executions (id, workflow_id, workflow_name, status, user_id, started_at)
                  VALUES (?, 'wf-tl-test', 'Quarterly report workflow', 'paused', ?, ?)`,
      workflowExecId, userId, t(45));

    // discovery — active = resumable
    await db.run(`INSERT INTO discovery_sessions (id, user_id, tier, state, status, started_at, last_active_at)
                  VALUES (?, ?, 'lite', '{}', 'active', ?, ?)`,
      discoveryId, userId, t(90), t(44));
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM sessions WHERE id IN (?, ?, ?)', sessionId, moduleSessionId, bridgedSessionId);
      await db.run('DELETE FROM engagements WHERE id = ?', engagementId);
      await db.run('DELETE FROM workflow_runs WHERE id IN (?, ?)', workflowRunId, systemRunId);
      await db.run('DELETE FROM workflow_executions WHERE id = ?', workflowExecId);
      await db.run('DELETE FROM discovery_sessions WHERE id = ?', discoveryId);
      await db.run('DELETE FROM users WHERE id = ?', userId);
    } finally {
      await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
      await db.close();
    }
  });

  async function getTimeline(qs = ''): Promise<{ status: number; items: TimelineItem[]; nextBefore: string | null }> {
    const r = await fetch(`${base}/api/work-timeline${qs}`);
    const json = (await r.json()) as { items: TimelineItem[]; nextBefore: string | null };
    return { status: r.status, items: json.items ?? [], nextBefore: json.nextBefore ?? null };
  }

  it('returns all five work types in one feed, newest first', async () => {
    const { status, items } = await getTimeline('?limit=50');
    expect(status).toBe(200);

    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get(sessionId)?.type).toBe('session');
    expect(byId.get(moduleSessionId)?.type).toBe('session');
    expect(byId.get(engagementId)?.type).toBe('engagement');
    expect(byId.get(workflowRunId)?.type).toBe('workflow_run');
    expect(byId.get(workflowExecId)?.type).toBe('workflow_execution');
    expect(byId.get(discoveryId)?.type).toBe('discovery');

    // newest first: discovery (44) > exec (45) > run (46) > engagement (47) > module session (49) > chat (50)
    const order = items.map((i) => i.id).filter((id) => byId.has(id));
    expect(order.indexOf(discoveryId)).toBeLessThan(order.indexOf(workflowExecId));
    expect(order.indexOf(workflowExecId)).toBeLessThan(order.indexOf(workflowRunId));
    expect(order.indexOf(workflowRunId)).toBeLessThan(order.indexOf(engagementId));
    expect(order.indexOf(engagementId)).toBeLessThan(order.indexOf(moduleSessionId));
    expect(order.indexOf(moduleSessionId)).toBeLessThan(order.indexOf(sessionId));
  });

  it('maps resume links per type', async () => {
    const { items } = await getTimeline('?limit=50');
    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get(sessionId)?.resumeUrl).toBe(`/prompt?session=${sessionId}`);
    expect(byId.get(moduleSessionId)?.resumeUrl).toBe(`/module/policy-review?session=${moduleSessionId}`);
    expect(byId.get(engagementId)?.resumeUrl).toBe(`/engagements/${engagementId}`);
    expect(byId.get(workflowRunId)?.resumeUrl).toBe(`/workflows?run=${workflowRunId}`);
    expect(byId.get(workflowExecId)?.resumeUrl).toBe(`/workflows?execution=${workflowExecId}`);
    expect(byId.get(discoveryId)?.resumeUrl).toBe(`/discover?session=${discoveryId}`);
  });

  it('uses the latest iteration as the engagement timestamp and carries status/cost/subtitle', async () => {
    const { items } = await getTimeline('?limit=50');
    const byId = new Map(items.map((i) => [i.id, i]));

    const eng = byId.get(engagementId)!;
    // 47 min ago (iteration), NOT 55 min ago (engagement.updated_at)
    const ageMin = (Date.now() - new Date(eng.updated_at).getTime()) / 60_000;
    expect(ageMin).toBeGreaterThan(46);
    expect(ageMin).toBeLessThan(48);
    expect(eng.subtitle).toBe('Nordic Bank');
    expect(eng.status).toBe('review');

    expect(byId.get(sessionId)?.cost).toBeCloseTo(0.25, 5);
    expect(byId.get(workflowExecId)?.status).toBe('paused');
    expect(byId.get(workflowRunId)?.status).toBe('running');
  });

  it('excludes bridged engagement sessions (dedup) and market-orchestrator noise', async () => {
    const { items } = await getTimeline('?limit=100');
    const ids = new Set(items.map((i) => i.id));
    expect(ids.has(bridgedSessionId)).toBe(false);
    expect(ids.has(systemRunId)).toBe(false);
  });

  it('filters with ?types=', async () => {
    const { items } = await getTimeline('?limit=50&types=engagement');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.type === 'engagement')).toBe(true);
    expect(items.some((i) => i.id === engagementId)).toBe(true);

    const multi = await getTimeline('?limit=50&types=workflow_run,workflow_execution');
    expect(multi.items.every((i) => i.type === 'workflow_run' || i.type === 'workflow_execution')).toBe(true);
    expect(multi.items.some((i) => i.id === workflowRunId)).toBe(true);
    expect(multi.items.some((i) => i.id === workflowExecId)).toBe(true);
  });

  it('paginates with ?before= (exclusive cursor)', async () => {
    const { items } = await getTimeline('?limit=50');
    const exec = items.find((i) => i.id === workflowExecId)!;
    // Everything strictly older than the workflow_execution (45 min ago)
    const older = await getTimeline(`?limit=50&before=${encodeURIComponent(exec.updated_at)}`);
    const olderIds = new Set(older.items.map((i) => i.id));
    expect(olderIds.has(workflowExecId)).toBe(false);
    expect(olderIds.has(discoveryId)).toBe(false);
    expect(olderIds.has(workflowRunId)).toBe(true);
    expect(olderIds.has(engagementId)).toBe(true);
    expect(olderIds.has(sessionId)).toBe(true);
  });

  it('reports an honest nextBefore cursor only when the page is full', async () => {
    const page = await getTimeline('?limit=2');
    expect(page.items.length).toBe(2);
    expect(page.nextBefore).toBe(page.items[1].updated_at);

    const all = await getTimeline('?limit=100');
    expect(all.nextBefore).toBeNull();
  });
});
