/**
 * rerun.test.ts — route tests for "Rerun with…" (Wave 2.3,
 * CORE_EXPERIENCE_REVIEW 2026-06):
 *
 *   POST /api/rerun                       { sessionId, messageId?, newModelId }
 *   GET  /api/rerun/quality/:messageId
 *
 * The LLM pipeline is mocked at the route's own seam: createRerunRoutes takes
 * the claude Router instance and dispatches a synthetic request into it, so the
 * tests pass a FAKE claude router that emulates /api/claude/message's
 * observable contract (saves a user message, streams SSE, persists an assistant
 * message + run_artifacts row). This exercises the real rerun logic end to end:
 * config rehydration, new-message flagging (rerun_of), duplicate-user-message
 * cleanup, and source-drift detection — without any model call.
 *
 * Requires DATABASE_URL (env or .env) + migrations 223/224; skips otherwise.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import express, { Router } from 'express';
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

// Manifest the ORIGINAL run pinned (seeded into run_artifacts in beforeAll).
const ORIGINAL_MANIFEST = [
  { type: 'url', name: 'https://eur-lex.example/amlr', sha256: 'aaa111', charCount: 1000, contentHashed: true },
  { type: 'local_file', name: 'policy.md', sha256: 'bbb222', charCount: 500, contentHashed: true },
  { type: 'uploaded', name: 'upload.pdf', sha256: 'ccc333', charCount: 900, contentHashed: true },
  { type: 'builtin', name: 'Claude built-in knowledge', contentHashed: false },
];

// Manifest the FAKE pipeline writes for the rerun: url changed, policy.md
// unchanged, upload.pdf gone (uploads are not rehydratable), one source added.
const RERUN_MANIFEST = [
  { type: 'url', name: 'https://eur-lex.example/amlr', sha256: 'aaa999', charCount: 1100, contentHashed: true },
  { type: 'local_file', name: 'policy.md', sha256: 'bbb222', charCount: 500, contentHashed: true },
  { type: 'rag_chunk', name: 'kb chunk 1', sha256: 'ddd444', charCount: 300, contentHashed: true },
  { type: 'builtin', name: 'Claude built-in knowledge', contentHashed: false },
];

describeOrSkip('POST /api/rerun (Rerun with… — Wave 2.3)', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;

  const sessionId = randomUUID();
  const originalUserId = randomUUID();
  const originalAssistantId = randomUUID();
  const snapshotlessAssistantId = randomUUID();
  const userContent = 'Assess our AMLR Article 16 readiness please.';

  const configSnapshot = {
    model: 'claude-opus-4-8',
    thinking: 'think_hard',
    creativity: 'balanced',
    transparencyLevel: 1,
    selectedOutputFormats: ['executive-summary'],
    selectedPersonas: ['aml-expert'],
    selectedSkills: [],
    knowledgeSources: { modes: { claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' } } },
    plainTextMode: false,
    writingTone: 'professional',
    audience: null,
    outputLanguage: null,
    systemPrompt: null,
    metaCognitiveEnabled: false,
    multiPerspective: false,
    emojiEnabled: false,
    nativeReasoningEnabled: false,
    structureReference: null,
    multiAgentEnabled: false,
    multiAgentTeam: null,
    multiAgentStyle: null,
    precision: null,
    channel: null,
  };

  /** Bodies the fake claude router received — config-rehydration assertions read these. */
  const captured: Array<Record<string, unknown>> = [];

  function createFakeClaudeRouter(): Router {
    const router = Router();
    router.post('/claude/message', async (req, res) => {
      const body = req.body as Record<string, unknown>;
      captured.push(body);
      // Mimic the live route: save the user message before streaming.
      await db.run(
        `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`,
        randomUUID(), body.sessionId, body.userMessage, new Date().toISOString());

      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ type: 'stream_start', messageId: randomUUID() })}\n\n`);

      // Mimic onComplete: persist the assistant message + its run artifact.
      const assistantId = randomUUID();
      await db.run(
        `INSERT INTO messages (id, session_id, role, content, thinking_content, token_count, cost, model_id, config_snapshot, created_at)
         VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?)`,
        assistantId, body.sessionId, `RERUN OUTPUT from ${String(body.model)}`, null,
        321, 0.0123, body.model, JSON.stringify({ ...configSnapshot, model: body.model }),
        new Date().toISOString());
      await db.run(
        `INSERT INTO run_artifacts (id, message_id, session_id, composed_prompt, prompt_sha256, prompt_chars, truncated, layer_summary, source_manifest, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(), assistantId, body.sessionId, 'PROMPT', 'deadbeef', 6, false,
        '[]', JSON.stringify(RERUN_MANIFEST), new Date().toISOString());

      res.write(`data: ${JSON.stringify({ type: 'stream_end', contentBlocks: [{ type: 'text', content: 'RERUN OUTPUT' }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });
    return router;
  }

  async function postRerun(body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const r = await fetch(`${base}/api/rerun`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createRerunRoutes } = await import('../../server/routes/rerun.js');

    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    const app = express();
    app.use(express.json());
    app.use('/api', createRerunRoutes(db, createFakeClaudeRouter()));
    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;

    // Seed: session + one user→assistant turn + the original's run artifact.
    const t = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString();
    await db.run(
      `INSERT INTO sessions (id, module_id, title, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      sessionId, 'gap-analysis', 'Rerun route test', JSON.stringify({ moduleInputs: { scope: 'EU-wide' } }), t(60_000), t(60_000));
    await db.run(
      `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`,
      originalUserId, sessionId, userContent, t(50_000));
    await db.run(
      `INSERT INTO messages (id, session_id, role, content, token_count, cost, model_id, config_snapshot, created_at)
       VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)`,
      originalAssistantId, sessionId, 'ORIGINAL OUTPUT from claude-opus-4-8', 1234, 0.42,
      'claude-opus-4-8', JSON.stringify(configSnapshot), t(40_000));
    await db.run(
      `INSERT INTO run_artifacts (id, message_id, session_id, composed_prompt, prompt_sha256, prompt_chars, truncated, layer_summary, source_manifest, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(), originalAssistantId, sessionId, 'ORIGINAL PROMPT', 'cafebabe', 15, false,
      '[]', JSON.stringify(ORIGINAL_MANIFEST), t(40_000));
    // A snapshot-less assistant message (pre-config-capture era) in the same session.
    await db.run(
      `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)`,
      snapshotlessAssistantId, sessionId, 'LEGACY OUTPUT', t(55_000));
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM sessions WHERE id = ?', sessionId);
    } finally {
      await new Promise<void>((resolve, reject) => server?.close(err => (err ? reject(err) : resolve())));
      await db.close();
    }
  });

  it('400s without sessionId / newModelId', async () => {
    expect((await postRerun({ newModelId: 'claude-sonnet-4-6' })).status).toBe(400);
    expect((await postRerun({ sessionId })).status).toBe(400);
  });

  it('404s for an unknown session', async () => {
    const { status } = await postRerun({ sessionId: randomUUID(), newModelId: 'claude-sonnet-4-6' });
    expect(status).toBe(404);
  });

  it('400s when the new model equals the original model', async () => {
    const { status, json } = await postRerun({ sessionId, messageId: originalAssistantId, newModelId: 'claude-opus-4-8' });
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/different model/i);
  });

  it('400s for a message without a config snapshot', async () => {
    const { status, json } = await postRerun({ sessionId, messageId: snapshotlessAssistantId, newModelId: 'claude-sonnet-4-6' });
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/snapshot/i);
  });

  it('reruns through the pipeline: rehydrated config, rerun_of flag, drift report', async () => {
    captured.length = 0;
    const { status, json } = await postRerun({ sessionId, messageId: originalAssistantId, newModelId: 'mistral-large-latest', areaId: 'fcp' });
    expect(status).toBe(200);

    // ── Config rehydration: the dispatched body carries the snapshot with the model swapped
    expect(captured.length).toBe(1);
    const body = captured[0];
    expect(body.model).toBe('mistral-large-latest');
    expect(body.userMessage).toBe(userContent);
    expect(body.sessionId).toBe(sessionId);
    expect(body.moduleId).toBe('gap-analysis');
    expect(body.areaId).toBe('fcp');
    expect(body.thinking).toBe('think_hard');
    expect(body.creativity).toBe('balanced');
    expect(body.transparencyLevel).toBe(1);
    expect(body.outputFormats).toEqual(['executive-summary']);
    expect(body.selectedPersonas).toEqual(['aml-expert']);
    expect(body.knowledgeSources).toEqual(configSnapshot.knowledgeSources);
    expect(body.plainTextMode).toBe(false);
    expect(body.writingTone).toBe('professional');
    expect(body.multiAgentEnabled).toBe(false);          // forced off for reruns
    expect(body.atomCollectionEnabled).toBe(false);      // no double-teaching
    expect(body.moduleInputs).toEqual({ scope: 'EU-wide' }); // recovered from session config
    // The output-format prompt instruction is rebuilt server-side
    expect(String(body.outputInstruction)).toMatch(/EXECUTIVE SUMMARY/);
    // History: the legacy assistant message precedes the user turn
    expect(Array.isArray(body.history)).toBe(true);
    expect((body.history as Array<{ content: string }>).some(h => h.content === 'LEGACY OUTPUT')).toBe(true);
    // The rehydrated body must satisfy the REAL /api/claude/message schema
    const { ClaudeMessageSchema } = await import('../../server/lib/schemas.js');
    expect(ClaudeMessageSchema.safeParse(body).success).toBe(true);

    // ── New-message flagging
    const rerun = json.rerun as Record<string, unknown>;
    const original = json.original as Record<string, unknown>;
    expect(original.messageId).toBe(originalAssistantId);
    expect(rerun.modelId).toBe('mistral-large-latest');
    expect(rerun.rerunOf).toBe(originalAssistantId);
    const row = await db.get<{ rerun_of: string | null; content: string }>(
      'SELECT rerun_of, content FROM messages WHERE id = ?', String(rerun.messageId));
    expect(row?.rerun_of).toBe(originalAssistantId);
    expect(row?.content).toBe('RERUN OUTPUT from mistral-large-latest');

    // ── Duplicate user message cleaned up (the pipeline saved one; rerun removes it)
    const dupes = await db.all(
      `SELECT id FROM messages WHERE session_id = ? AND role = 'user' AND content = ?`,
      sessionId, userContent);
    expect(dupes.length).toBe(1);

    // ── Drift detection
    expect(json.sourceDriftAvailable).toBe(true);
    expect(json.sourceDriftDetected).toBe(true);
    const drift = json.sourceDrift as Array<{ name: string; status: string; changed: boolean }>;
    const byName = new Map(drift.map(d => [d.name, d]));
    expect(byName.get('https://eur-lex.example/amlr')).toMatchObject({ changed: true, status: 'changed' });
    expect(byName.get('policy.md')).toMatchObject({ changed: false, status: 'unchanged' });
    expect(byName.get('upload.pdf')).toMatchObject({ changed: true, status: 'removed' });
    expect(byName.get('kb chunk 1')).toMatchObject({ changed: true, status: 'added' });
    expect(byName.get('Claude built-in knowledge')).toMatchObject({ changed: false, status: 'unhashed' });
  }, 30_000);

  it('resolves the latest NON-rerun assistant message when messageId is omitted', async () => {
    captured.length = 0;
    const { status, json } = await postRerun({ sessionId, newModelId: 'claude-sonnet-4-6' });
    expect(status).toBe(200);
    // The previous test created a rerun message AFTER the original; it must be
    // skipped (rerun_of IS NULL filter) and the original targeted again.
    expect((json.original as Record<string, unknown>).messageId).toBe(originalAssistantId);
    expect(captured[0].model).toBe('claude-sonnet-4-6');
  }, 30_000);

  it('GET /api/rerun/quality/:messageId returns the content-hash-matched score', async () => {
    const { createHash } = await import('crypto');
    const content = 'ORIGINAL OUTPUT from claude-opus-4-8';
    const hash = createHash('sha256').update(content.slice(0, 5000)).digest('hex').slice(0, 16);
    await db.run(
      `INSERT INTO quality_scores (id, session_id, module_id, content_hash, score_overall, score_completeness)
       VALUES (?, ?, ?, ?, ?, ?)`,
      randomUUID().slice(0, 16), sessionId, 'gap-analysis', hash, 8.4, 9.0);

    const r = await fetch(`${base}/api/rerun/quality/${originalAssistantId}`);
    expect(r.status).toBe(200);
    const data = (await r.json()) as { score: { overall: number; completeness: number | null } | null };
    expect(data.score?.overall).toBeCloseTo(8.4);
    expect(data.score?.completeness).toBeCloseTo(9.0);
  });

  it('GET quality 404s for an unknown message', async () => {
    const r = await fetch(`${base}/api/rerun/quality/${randomUUID()}`);
    expect(r.status).toBe(404);
  });
});

// ── Pure helpers (no DB needed) ───────────────────────────────────────────────

describe('computeSourceDrift (pure)', () => {
  it('reports empty drift for identical manifests', async () => {
    const { computeSourceDrift } = await import('../../server/routes/rerun.js');
    const m = [{ type: 'url', name: 'a', sha256: 'x', contentHashed: true }];
    const drift = computeSourceDrift(m, m);
    expect(drift).toEqual([{ name: 'a', type: 'url', changed: false, status: 'unchanged' }]);
  });

  it('handles string-encoded JSONB and malformed input gracefully', async () => {
    const { computeSourceDrift } = await import('../../server/routes/rerun.js');
    const drift = computeSourceDrift(
      JSON.stringify([{ type: 'url', name: 'a', sha256: 'x', contentHashed: true }]),
      'not-json',
    );
    expect(drift).toEqual([{ name: 'a', type: 'url', changed: true, status: 'removed' }]);
  });
});

describe('rehydrateClaudeBody (pure)', () => {
  it('drops invalid structureReference and undefined keys', async () => {
    const { rehydrateClaudeBody } = await import('../../server/routes/rerun.js');
    const body = rehydrateClaudeBody({
      snapshot: { model: 'claude-opus-4-8', creativity: 'wild-invalid', structureReference: { bogus: true } },
      newModelId: 'claude-sonnet-4-6',
      sessionId: 's1',
      moduleId: null,
      areaId: null,
      userMessage: 'hi',
      history: [],
    });
    expect(body.model).toBe('claude-sonnet-4-6');
    expect('creativity' in body).toBe(false);
    expect('structureReference' in body).toBe(false);
    expect('moduleId' in body).toBe(false);
    expect(body.multiAgentEnabled).toBe(false);
  });
});
