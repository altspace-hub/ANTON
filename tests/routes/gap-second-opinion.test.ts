/**
 * gap-second-opinion.test.ts — route tests for the second-opinion lane
 * (Wave 2.7, CORE_EXPERIENCE_REVIEW 2026-06):
 *
 *   POST /api/gap-assessments/:id/second-opinion   (guards only — no LLM here)
 *   GET  /api/gap-assessments/:id/second-opinion   (storage → agreement view)
 *
 * Mounts the real router with the project's PostgresAdapter (same pattern as
 * gap-findings-override.test.ts). Opinions are seeded directly into the
 * gap_finding_opinions comparison slot (migration 224) — verifying that the
 * GET endpoint computes the deterministic agreement view from storage and that
 * gap_findings is never required to change.
 * Requires DATABASE_URL + migrations 222/224; skips otherwise.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
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

describeOrSkip('Gap Assessor second-opinion lane (Wave 2.7)', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;

  const assessmentId = randomUUID();
  const emptyAssessmentId = randomUUID();
  const framework = 'amlr-2024';
  const opinionModel = 'claude-opus-4-8';

  const strongFacts = { documented: 'yes', implemented: 'yes', tested: 'yes', evidenced: 'yes', ownerAssigned: 'yes' };
  const weakFacts = { documented: 'partial', implemented: 'no', tested: 'unknown', evidenced: 'no', ownerAssigned: 'unknown' };

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createGapAssessmentsRoutes } = await import('../../server/routes/gap-assessments.js');

    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    const app = express();
    app.use(express.json());
    // A dummy anthropic instance — the POST guards return before any model use.
    app.use('/api', await createGapAssessmentsRoutes(db, {} as never));
    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;

    const now = new Date().toISOString();
    // Primary assessment (user 'default' — no auth middleware mounted), scored by sonnet.
    await db.run(
      `INSERT INTO gap_assessments (id, title, frameworks, scope_config, context_config, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      assessmentId, 'Second-opinion route test', JSON.stringify([framework]), '{}',
      JSON.stringify({ modelTier: 'sonnet' }), 'default', now, now);
    await db.run(
      `INSERT INTO gap_assessments (id, title, frameworks, scope_config, context_config, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      emptyAssessmentId, 'No findings yet', JSON.stringify([framework]), '{}',
      JSON.stringify({ modelTier: 'sonnet' }), 'default', now, now);

    // Two primary findings (rubric-scored): Art.1 strong (100/green), Art.2 weak.
    await db.run(
      `INSERT INTO gap_findings
       (assessment_id, framework, article_id, article_title, requirement, current_state, score, numeric_score, priority, notes,
        facts, rubric_version, computed_score, computed_numeric_score, computed_priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      assessmentId, framework, 'Art.1', 'Customer due diligence', 'Req', 'Mature CDD programme',
      'green', 100, 'low', 'primary: fully evidenced',
      JSON.stringify({ criteria: strongFacts, evidenceRefs: [], warnings: [] }), 1, 'green', 100, 'low');
    await db.run(
      `INSERT INTO gap_findings
       (assessment_id, framework, article_id, article_title, requirement, current_state, score, numeric_score, priority, notes,
        facts, rubric_version, computed_score, computed_numeric_score, computed_priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      assessmentId, framework, 'Art.2', 'Internal policies', 'Req', 'Draft policies only',
      'amber', 30, 'high', 'primary: largely undocumented',
      JSON.stringify({ criteria: weakFacts, evidenceRefs: [], warnings: [] }), 1, 'amber', 30, 'high');

    // Seed the comparison slot: Art.1 agrees (same facts → same score),
    // Art.2 diverges (opinion model saw it as stronger).
    const seedOpinion = async (articleId: string, facts: Record<string, string>, score: string, numeric: number, priority: string, rationale: string) => {
      await db.run(
        `INSERT INTO gap_finding_opinions
         (assessment_id, framework, article_id, article_title, model_id, facts,
          computed_score, computed_numeric_score, computed_priority, rubric_version, rationale, current_state, evidence_refs, warnings, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        assessmentId, framework, articleId, `Title ${articleId}`, opinionModel, JSON.stringify(facts),
        score, numeric, priority, 1, rationale, 'opinion current state', '[]', '[]', new Date().toISOString());
    };
    await seedOpinion('Art.1', strongFacts, 'green', 100, 'low', 'opinion: agrees — fully compliant');
    await seedOpinion('Art.2', { ...weakFacts, documented: 'yes', implemented: 'partial' }, 'yellow', 50, 'medium', 'opinion: policies exist and are partially live');
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM gap_assessments WHERE id = ?', assessmentId);
      await db.run('DELETE FROM gap_assessments WHERE id = ?', emptyAssessmentId);
    } finally {
      await new Promise<void>((resolve, reject) => server?.close(err => (err ? reject(err) : resolve())));
      await db.close();
    }
  });

  it('GET returns the stored slot with the deterministic agreement view', async () => {
    const r = await fetch(`${base}/api/gap-assessments/${assessmentId}/second-opinion`);
    expect(r.status).toBe(200);
    const data = (await r.json()) as {
      models: Array<{ modelId: string; articleCount: number }>;
      primaryModelTier: string;
      agreement: {
        modelId: string; comparedCount: number; agreeCount: number; agreementPct: number | null;
        divergent: Array<{ articleId: string; agree: boolean; criteria: Array<{ key: string; primary: string | null; opinion: string | null; match: boolean }>; primary: { rationale: string | null; numericScore: number | null }; opinion: { rationale: string | null; numericScore: number | null; modelId: string } }>;
        articles: Array<{ articleId: string; agree: boolean }>;
      } | null;
    };

    expect(data.models).toHaveLength(1);
    expect(data.models[0]).toMatchObject({ modelId: opinionModel, articleCount: 2 });
    expect(data.primaryModelTier).toBe('claude-sonnet-4-6');

    const ag = data.agreement!;
    expect(ag.modelId).toBe(opinionModel);
    expect(ag.comparedCount).toBe(2);
    expect(ag.agreeCount).toBe(1);
    expect(ag.agreementPct).toBe(50);
    expect(ag.divergent).toHaveLength(1);

    const div = ag.divergent[0];
    expect(div.articleId).toBe('Art.2');
    expect(div.agree).toBe(false);
    expect(div.primary.numericScore).toBe(30);
    expect(div.opinion.numericScore).toBe(50);
    expect(div.opinion.modelId).toBe(opinionModel);
    // Facts agreement matrix: documented yes-vs-partial mismatch is visible
    const documented = div.criteria.find(c => c.key === 'documented')!;
    expect(documented).toMatchObject({ primary: 'partial', opinion: 'yes', match: false });
    // Both rationales carried for human review
    expect(div.primary.rationale).toContain('primary');
    expect(div.opinion.rationale).toContain('opinion');
    // Divergent-first ordering in the full list
    expect(ag.articles[0].articleId).toBe('Art.2');
  });

  it('GET returns empty when no opinions exist', async () => {
    const r = await fetch(`${base}/api/gap-assessments/${emptyAssessmentId}/second-opinion`);
    expect(r.status).toBe(200);
    const data = (await r.json()) as { models: unknown[]; agreement: unknown };
    expect(data.models).toEqual([]);
    expect(data.agreement).toBeNull();
  });

  it('POST rejects the same model as the primary run (400)', async () => {
    const r = await fetch(`${base}/api/gap-assessments/${assessmentId}/second-opinion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelTier: 'sonnet' }),
    });
    expect(r.status).toBe(400);
    const data = (await r.json()) as { error: string };
    expect(data.error).toMatch(/different model/i);
  });

  it('POST rejects when the assessment has no findings yet (400)', async () => {
    const r = await fetch(`${base}/api/gap-assessments/${emptyAssessmentId}/second-opinion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelTier: 'opus' }),
    });
    expect(r.status).toBe(400);
    const data = (await r.json()) as { error: string };
    expect(data.error).toMatch(/run the assessment first/i);
  });

  it('POST rejects a missing modelTier (400) and an unknown assessment (404)', async () => {
    const r1 = await fetch(`${base}/api/gap-assessments/${assessmentId}/second-opinion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    expect(r1.status).toBe(400);
    const r2 = await fetch(`${base}/api/gap-assessments/${randomUUID()}/second-opinion`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelTier: 'opus' }),
    });
    expect(r2.status).toBe(404);
  });

  it('the comparison slot never touches gap_findings', async () => {
    const rows = await db.all<{ article_id: string; numeric_score: number; notes: string }>(
      'SELECT article_id, numeric_score, notes FROM gap_findings WHERE assessment_id = ? ORDER BY article_id',
      assessmentId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ article_id: 'Art.1', numeric_score: 100 });
    expect(rows[1]).toMatchObject({ article_id: 'Art.2', numeric_score: 30 });
  });
});
