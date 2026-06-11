/**
 * engagement-session-bridge.test.ts — Wave 4.4 part 2 (Core Experience
 * Review 2026-06).
 *
 * bridgeIterationToSession persists an engagement iteration into the
 * session world: one sessions row (module_id 'engagement', project-linked)
 * + a user/assistant message pair (model_id, token_count, cost,
 * config_snapshot) + back-link on engagement_iterations.session_id.
 *
 * Live-PG test (same pattern as council-dissent.test.ts): requires
 * DATABASE_URL (env or .env); skips otherwise. No LLM call.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

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

describeOrSkip('bridgeIterationToSession (4.4)', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;

  const userId = `bridge-test-${randomUUID().slice(0, 8)}`;
  const projectId = randomUUID();
  const engagementId = randomUUID();
  const workstreamId = randomUUID();
  const iterationId = randomUUID();
  let bridgedSessionId: string | null = null;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    await db.run(
      `INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'x', 'analyst')`,
      userId, userId);
    await db.run(
      `INSERT INTO projects (id, name) VALUES (?, 'Bridge test project')`,
      projectId);
    await db.run(
      `INSERT INTO engagements (id, title, engagement_type, status, project_id, user_id)
       VALUES (?, 'AML Remediation', 'full', 'execution', ?, ?)`,
      engagementId, projectId, userId);
    await db.run(
      `INSERT INTO engagement_workstreams (id, engagement_id, title) VALUES (?, ?, 'Transaction Monitoring')`,
      workstreamId, engagementId);
    await db.run(
      `INSERT INTO engagement_iterations (id, engagement_id, workstream_id, iteration_number, output_content, status)
       VALUES (?, ?, ?, 1, 'Draft deliverable body.', 'draft')`,
      iterationId, engagementId, workstreamId);
  }, 60_000);

  afterAll(async () => {
    try {
      // engagement cascade deletes iterations/workstreams; session separately.
      await db.run('DELETE FROM engagements WHERE id = ?', engagementId);
      if (bridgedSessionId) await db.run('DELETE FROM sessions WHERE id = ?', bridgedSessionId);
      await db.run('DELETE FROM projects WHERE id = ?', projectId);
      await db.run('DELETE FROM users WHERE id = ?', userId);
    } finally {
      await db.close();
    }
  });

  it('creates a project-linked session + message pair and back-links the iteration', async () => {
    const { bridgeIterationToSession } = await import('../../server/services/engagement-session-bridge.js');
    const { sessionId } = await bridgeIterationToSession(db, {
      engagementId,
      engagementTitle: 'AML Remediation',
      workstreamId,
      workstreamTitle: 'Transaction Monitoring',
      iterationId,
      iterationNumber: 1,
      projectId,
      userId,
      model: 'claude-opus-4-8',
      thinkingLevel: 'think_hard',
      userContent: 'Execute the Transaction Monitoring workstream analysis.',
      outputContent: 'Draft deliverable body.',
      thinkingContent: 'reasoning trail',
      inputTokens: 1_000,
      outputTokens: 2_000,
    });
    bridgedSessionId = sessionId;

    const session = await db.get<{ module_id: string; title: string; project_id: string; user_id: string; config: string }>(
      'SELECT module_id, title, project_id, user_id, config FROM sessions WHERE id = ?', sessionId);
    expect(session).toBeTruthy();
    expect(session!.module_id).toBe('engagement');
    expect(session!.title).toBe('AML Remediation — Transaction Monitoring (iteration 1)');
    expect(session!.project_id).toBe(projectId);
    expect(session!.user_id).toBe(userId);
    const cfg = JSON.parse(session!.config) as Record<string, unknown>;
    expect(cfg.engagementId).toBe(engagementId);
    expect(cfg.iterationId).toBe(iterationId);
    expect(cfg.model).toBe('claude-opus-4-8');

    const messages = await db.all<{ role: string; content: string; model_id: string | null; token_count: number | null; cost: number | null; thinking_content: string | null }>(
      'SELECT role, content, model_id, token_count, cost, thinking_content FROM messages WHERE session_id = ? ORDER BY role DESC', sessionId);
    expect(messages.length).toBe(2);
    const userMsg = messages.find((m) => m.role === 'user');
    const assistantMsg = messages.find((m) => m.role === 'assistant');
    expect(userMsg?.content).toContain('Transaction Monitoring');
    expect(assistantMsg?.content).toBe('Draft deliverable body.');
    expect(assistantMsg?.model_id).toBe('claude-opus-4-8');
    expect(assistantMsg?.token_count).toBe(2_000);
    expect(assistantMsg?.thinking_content).toBe('reasoning trail');
    // Registry model → real cost from MODEL_CAPABILITIES pricing
    expect(Number(assistantMsg?.cost)).toBeGreaterThan(0);

    const iteration = await db.get<{ session_id: string | null }>(
      'SELECT session_id FROM engagement_iterations WHERE id = ?', iterationId);
    expect(iteration?.session_id).toBe(sessionId);
  });

  it('leaves cost NULL for a model unknown to the registry (honest, not guessed)', async () => {
    const { bridgeIterationToSession } = await import('../../server/services/engagement-session-bridge.js');
    const iterId2 = randomUUID();
    await db.run(
      `INSERT INTO engagement_iterations (id, engagement_id, iteration_number, output_content, status)
       VALUES (?, ?, 2, 'Second draft.', 'draft')`,
      iterId2, engagementId);
    const { sessionId } = await bridgeIterationToSession(db, {
      engagementId,
      engagementTitle: 'AML Remediation',
      workstreamId: null,
      workstreamTitle: null,
      iterationId: iterId2,
      iterationNumber: 2,
      projectId: null,
      userId,
      model: 'totally-unknown-model',
      thinkingLevel: 'quick',
      userContent: 'Execute the engagement analysis.',
      outputContent: 'Second draft.',
      thinkingContent: null,
      inputTokens: 10,
      outputTokens: 20,
    });
    try {
      const assistantMsg = await db.get<{ cost: number | null }>(
        `SELECT cost FROM messages WHERE session_id = ? AND role = 'assistant'`, sessionId);
      expect(assistantMsg?.cost).toBeNull();
      const session = await db.get<{ title: string }>('SELECT title FROM sessions WHERE id = ?', sessionId);
      expect(session?.title).toBe('AML Remediation (iteration 2)');
    } finally {
      await db.run('DELETE FROM sessions WHERE id = ?', sessionId);
    }
  });
});
