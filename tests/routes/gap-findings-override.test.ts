/**
 * gap-findings-override.test.ts — route test for the assessor override
 * endpoint (Wave 1.2, CORE_EXPERIENCE_REVIEW 2026-06):
 *
 *   PATCH /api/gap-assessments/:id/findings/:findingId
 *
 * Mounts the real router in-process on an ephemeral port with the project's
 * own PostgresAdapter, so it does not depend on the dev server being
 * restarted with the new code. Requires DATABASE_URL (env or .env) and the
 * 222_gap_deterministic_scoring.sql migration; skips otherwise.
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

describeOrSkip('PATCH /api/gap-assessments/:id/findings/:findingId (assessor override)', () => {
  // Lazy imports so a skipped suite never touches the server modules
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let server: Server;
  let base: string;

  const assessmentId = randomUUID();
  const foreignAssessmentId = randomUUID();
  const framework = 'amlr-2024';
  let findingId: number;
  let legacyFindingId: number;
  let foreignFindingId: number;

  const rubricFacts = {
    criteria: { documented: 'yes', implemented: 'partial', tested: 'no', evidenced: 'yes', ownerAssigned: 'yes' },
    evidenceRefs: [{ docId: 'doc-1', quote: 'KYC refresh is risk-based' }],
    warnings: [],
  };

  async function patchFinding(aId: string, fId: number | string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const r = await fetch(`${base}/api/gap-assessments/${aId}/findings/${fId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createGapAssessmentsRoutes } = await import('../../server/routes/gap-assessments.js');

    db = new PostgresAdapter({ connectionString: DATABASE_URL! });

    const app = express();
    app.use(express.json());
    app.use('/api', await createGapAssessmentsRoutes(db));
    await new Promise<void>(resolve => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (addr === null || typeof addr === 'string') throw new Error('No server address');
    base = `http://127.0.0.1:${addr.port}`;

    const now = new Date().toISOString();
    // The route resolves the user as 'default' when no auth middleware is mounted.
    await db.run(
      `INSERT INTO gap_assessments (id, title, frameworks, scope_config, context_config, article_scores, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      assessmentId, 'Override route test', JSON.stringify([framework]), '{}', '{}',
      JSON.stringify({ [framework]: [{ articleId: 'Art.1', score: 'yellow', numericScore: 55, priority: 'medium' }] }),
      'default', now, now
    );
    await db.run(
      `INSERT INTO gap_assessments (id, title, frameworks, scope_config, context_config, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      foreignAssessmentId, 'Foreign user assessment', '[]', '{}', '{}', 'someone-else', now, now
    );

    // Rubric-scored finding (computed_* populated, facts present)
    const r1 = await db.run(
      `INSERT INTO gap_findings
       (assessment_id, framework, article_id, article_title, requirement, current_state, score, numeric_score, priority, notes,
        facts, rubric_version, computed_score, computed_numeric_score, computed_priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      assessmentId, framework, 'Art.1', 'Subject matter', 'Requirement text', 'Current state text',
      'yellow', 55, 'medium', 'Notes',
      JSON.stringify(rubricFacts), 1, 'yellow', 55, 'medium'
    );
    findingId = Number(r1.lastInsertRowid);

    // Legacy finding (no facts, no computed_*, rubric_version NULL)
    const r2 = await db.run(
      `INSERT INTO gap_findings
       (assessment_id, framework, article_id, article_title, requirement, current_state, score, numeric_score, priority, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      assessmentId, framework, 'Art.2', 'Definitions', 'Requirement text', 'Current state text',
      'red', 10, 'critical', 'Legacy notes'
    );
    legacyFindingId = Number(r2.lastInsertRowid);

    const r3 = await db.run(
      `INSERT INTO gap_findings
       (assessment_id, framework, article_id, score, numeric_score, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      foreignAssessmentId, framework, 'Art.1', 'green', 90, 'low'
    );
    foreignFindingId = Number(r3.lastInsertRowid);
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM gap_assessments WHERE id = ?', assessmentId);
      await db.run('DELETE FROM gap_assessments WHERE id = ?', foreignAssessmentId);
    } finally {
      await new Promise<void>((resolve, reject) => server?.close(err => (err ? reject(err) : resolve())));
      await db.close();
    }
  });

  it('rejects an override without a reason (400)', async () => {
    const { status, json } = await patchFinding(assessmentId, findingId, {
      criteria: rubricFacts.criteria,
    });
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/reason/i);
  });

  it('rejects invalid criteria values (400)', async () => {
    const { status } = await patchFinding(assessmentId, findingId, {
      criteria: { documented: 'definitely', implemented: 'yes', tested: 'yes', evidenced: 'yes', ownerAssigned: 'yes' },
      reason: 'trying invalid facts',
    });
    expect(status).toBe(400);
  });

  it('facts override: recomputes via the rubric and preserves computed values', async () => {
    // All-yes facts (evidenced yes, tested yes) → rubric 100/green/low
    const { status, json } = await patchFinding(assessmentId, findingId, {
      criteria: { documented: 'yes', implemented: 'yes', tested: 'yes', evidenced: 'yes', ownerAssigned: 'yes' },
      reason: 'On-site walkthrough 2026-06-02 evidenced the full control set',
    });
    expect(status).toBe(200);
    const finding = json.finding as Record<string, unknown>;
    expect(finding.numericScore).toBe(100);
    expect(finding.score).toBe('green');
    expect(finding.priority).toBe('low');
    expect(finding.overrideKind).toBe('facts');
    expect(finding.overrideReason).toContain('walkthrough');
    expect(finding.overriddenBy).toBe('default');
    expect(finding.overriddenAt).toBeTruthy();
    // Computed values preserved alongside — never destroyed
    expect(finding.computedScore).toBe('yellow');
    expect(finding.computedNumericScore).toBe(55);
    expect(finding.computedPriority).toBe('medium');
    // The LLM's original criteria stay; the assessor's edit is separate
    expect((finding.criteria as Record<string, unknown>).implemented).toBe('partial');
    expect((finding.overrideCriteria as Record<string, unknown>).implemented).toBe('yes');
  });

  it('keeps the article_scores blob in sync (synthesis reads effective values)', async () => {
    const row = await db.get<{ article_scores: string }>(
      'SELECT article_scores FROM gap_assessments WHERE id = ?', assessmentId);
    const blob = JSON.parse(row!.article_scores) as Record<string, Array<Record<string, unknown>>>;
    const entry = blob[framework].find(e => e.articleId === 'Art.1');
    expect(entry?.numericScore).toBe(100);
    expect(entry?.score).toBe('green');
    expect(entry?.overrideKind).toBe('facts');
  });

  it('revert restores the computed values and clears the override', async () => {
    const { status, json } = await patchFinding(assessmentId, findingId, { revert: true });
    expect(status).toBe(200);
    const finding = (json.finding as Record<string, unknown>);
    expect(finding.score).toBe('yellow');
    expect(finding.numericScore).toBe(55);
    expect(finding.priority).toBe('medium');
    expect(finding.overrideKind).toBeNull();
    expect(finding.overriddenBy).toBeNull();
    expect(finding.overrideCriteria).toBeNull();
  });

  it('manual override on a LEGACY finding: labels manual + copies effective values into computed_*', async () => {
    const { status, json } = await patchFinding(assessmentId, legacyFindingId, {
      manualScore: { numericScore: 80 },
      reason: 'Assessor judgement: definitional article, no control gap possible',
    });
    expect(status).toBe(200);
    const finding = json.finding as Record<string, unknown>;
    expect(finding.numericScore).toBe(80);
    expect(finding.score).toBe('green'); // band derived from rubric thresholds
    expect(finding.priority).toBe('low');
    expect(finding.overrideKind).toBe('manual');
    // Pre-override legacy values preserved as computed_*
    expect(finding.computedScore).toBe('red');
    expect(finding.computedNumericScore).toBe(10);
    expect(finding.computedPriority).toBe('critical');
  });

  it('rejects a revert when there is nothing to revert to (legacy, never overridden)', async () => {
    // Fresh legacy finding with no computed_* and no override
    const r = await db.run(
      `INSERT INTO gap_findings (assessment_id, framework, article_id, score, numeric_score, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      assessmentId, framework, 'Art.3', 'amber', 30, 'high'
    );
    const { status } = await patchFinding(assessmentId, Number(r.lastInsertRowid), { revert: true });
    expect(status).toBe(400);
  });

  it('404s for a finding id that does not belong to the assessment', async () => {
    const { status } = await patchFinding(assessmentId, foreignFindingId, {
      manualScore: { numericScore: 5 }, reason: 'cross-assessment attack',
    });
    expect(status).toBe(404);
  });

  it("404s for another user's assessment (auth scoping)", async () => {
    const { status } = await patchFinding(foreignAssessmentId, foreignFindingId, {
      manualScore: { numericScore: 5 }, reason: 'not my assessment',
    });
    expect(status).toBe(404);
  });

  it('400s for a non-numeric finding id', async () => {
    const { status } = await patchFinding(assessmentId, 'abc', { revert: true });
    expect(status).toBe(400);
  });

  it('400s when neither criteria, manualScore nor revert is provided', async () => {
    const { status } = await patchFinding(assessmentId, findingId, { reason: 'no payload' });
    expect(status).toBe(400);
  });
});
