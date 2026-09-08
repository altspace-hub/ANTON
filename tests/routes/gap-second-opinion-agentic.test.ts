/**
 * gap-second-opinion-agentic.test.ts — the second-opinion lane reads evidence
 * the same way the primary run does.
 *
 * Wave 3 (2026-09-08): the primary run passes the batch its `agentic` option
 * (evidence on demand on the subscription engine). The second-opinion lane
 * called the batch without it, so a second opinion still got the evidence as
 * a paste cut at 120,000 characters.
 *
 * Database-backed like gap-second-opinion.test.ts; the batch itself is
 * stubbed to capture what the lane hands it.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import type { Server } from 'http';

const batchCalls: unknown[][] = [];
vi.mock('../../server/services/gap-assessment-engine.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../server/services/gap-assessment-engine.js')>();
  return {
    ...original,
    runAssessmentBatch: async (...args: unknown[]) => {
      batchCalls.push(args);
      const frameworkId = args[1] as string;
      const batchIndex = args[4] as number;
      const totalBatches = args[5] as number;
      return { framework: frameworkId, findings: [], batchIndex, totalBatches, thinking: '' };
    },
  };
});

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch { return undefined; }
}

const DATABASE_URL = resolveDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

describeOrSkip('Gap Assessor second-opinion lane — agentic evidence', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;
  const assessmentId = randomUUID();
  const framework = 'amlr-2024';

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createGapAssessmentsRoutes } = await import('../../server/routes/gap-assessments.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    const app = express();
    app.use(express.json());
    app.use('/api', await createGapAssessmentsRoutes(db, {} as never));
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;

    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO gap_assessments (id, title, frameworks, scope_config, context_config, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      assessmentId, 'Second-opinion agentic test', JSON.stringify([framework]), '{}',
      JSON.stringify({ modelTier: 'sonnet', evidenceItems: [{ name: 'Policy.pdf', kind: 'document', text: 'Policy text.' }] }), 'default', now, now);
    await db.run(
      `INSERT INTO gap_findings
       (assessment_id, framework, article_id, article_title, requirement, current_state, score, numeric_score, priority, notes,
        facts, rubric_version, computed_score, computed_numeric_score, computed_priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      assessmentId, framework, 'Art.9', 'Internal policies', 'Req', 'Draft only', 'amber', 30, 'high', 'primary',
      JSON.stringify({ criteria: { documented: 'partial', implemented: 'no', tested: 'unknown', evidenced: 'no', ownerAssigned: 'unknown' }, evidenceRefs: [], warnings: [] }), 1, 'amber', 30, 'high');
  }, 60_000);

  afterAll(async () => {
    try { await db.run('DELETE FROM gap_assessments WHERE id = ?', assessmentId); }
    finally {
      await new Promise<void>((resolve, reject) => server?.close((err) => (err ? reject(err) : resolve())));
      await db.close();
    }
  });

  it('hands the batch the agentic option scoped to the framework, and its tool activity reaches the feed', async () => {
    const res = await fetch(`${base}/api/gap-assessments/${assessmentId}/second-opinion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelTier: 'sdk:claude-opus-5' }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();

    expect(batchCalls.length).toBeGreaterThan(0);
    const opts = batchCalls[0][9] as { agentic?: { packIds?: string[]; onEvent?: (e: { type: string; message: string }) => void } } | undefined;
    expect(opts?.agentic).toBeDefined();
    expect(opts?.agentic?.packIds).toEqual([framework]);
    expect(typeof opts?.agentic?.onEvent).toBe('function');
    // The stream carried the run to completion.
    expect(text).toMatch(/"type":"(complete|framework_complete)"/);
  }, 60_000);
});
