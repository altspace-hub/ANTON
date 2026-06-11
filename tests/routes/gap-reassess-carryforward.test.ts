/**
 * gap-reassess-carryforward.test.ts — adversarial-review fixes #1 + #2
 * (Gap Assessor re-assessment integrity, 2026-06):
 *
 *  #1 Carry-forward must NOT launder an assessor override into the
 *     rubric-computed columns. The full loop is exercised against the real
 *     router + engine: save → facts-override → snapshot (real route) →
 *     baseline → findingFromBaseline → saveFindings. The laundering scenario
 *     (computed_* taking the overridden effective score) is reproduced and
 *     asserted FIXED, and the changed-article rule (override cleared on a
 *     genuine re-assessment) is asserted too.
 *
 *  #2 New iteration evidence must reach the model: the /run route rebuilds
 *     evidence from gap_assessments.context_config (extractEvidenceItems),
 *     so the wizard now PATCHes the merged evidenceItems at snapshot time.
 *     This test drives that exact persistence path through the route and
 *     asserts the stored config yields the new document for the next run.
 *
 * Requires DATABASE_URL (env or .env); skips otherwise — same convention as
 * gap-findings-override.test.ts.
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

describeOrSkip('re-assessment carry-forward + evidence persistence (#1, #2)', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let engine: Awaited<ReturnType<typeof import('../../server/services/gap-assessment-engine.js').createGapAssessmentEngine>>;
  let gapEngine: typeof import('../../server/services/gap-assessment-engine.js');
  let gapScoring: typeof import('../../server/services/gap-scoring.js');
  let server: Server;
  let base: string;

  const assessmentId = randomUUID();
  const framework = 'amlr-2024';
  const article = { id: 'Art.7', title: 'Internal policies', theme: 'Governance', requirement: 'Maintain internal AML/CFT policies' };

  // Original LLM-answered criteria → rubric 60 / yellow / medium
  const originalCriteria = { documented: 'yes', implemented: 'partial', tested: 'no', evidenced: 'yes', ownerAssigned: 'yes' } as const;
  // Assessor override criteria → rubric 100 / green / low
  const overrideCriteria = { documented: 'yes', implemented: 'yes', tested: 'yes', evidenced: 'yes', ownerAssigned: 'yes' } as const;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    const { createGapAssessmentsRoutes } = await import('../../server/routes/gap-assessments.js');
    gapEngine = await import('../../server/services/gap-assessment-engine.js');
    gapScoring = await import('../../server/services/gap-scoring.js');

    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    engine = await gapEngine.createGapAssessmentEngine(db);

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
    await db.run(
      `INSERT INTO gap_assessments (id, title, frameworks, scope_config, context_config, article_scores, user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      assessmentId, 'Carry-forward test', JSON.stringify([framework]), '{}',
      JSON.stringify({ entityType: 'Credit institution', evidenceItems: [] }),
      '{}', 'default', now, now
    );
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM gap_iterations WHERE assessment_id = ?', assessmentId);
      await db.run('DELETE FROM gap_assessments WHERE id = ?', assessmentId);
    } finally {
      await new Promise<void>((resolve, reject) => server?.close(err => (err ? reject(err) : resolve())));
      await db.close();
    }
  });

  async function getFindingRow(): Promise<Record<string, unknown>> {
    const row = await db.get<Record<string, unknown>>(
      'SELECT * FROM gap_findings WHERE assessment_id = ? AND article_id = ?', assessmentId, article.id);
    expect(row).toBeTruthy();
    return row!;
  }

  it('fresh save: computed_* come from computeScoring(criteria), overrides NULL', async () => {
    const computed = gapScoring.computeScoring(originalCriteria);
    expect(computed.numericScore).toBe(60); // sanity: rubric ground truth
    await engine.saveFindings(assessmentId, framework, [{
      articleId: article.id,
      articleTitle: article.title,
      requirement: article.requirement,
      currentState: 'Policies exist, partially operated, never tested.',
      score: computed.score,
      numericScore: computed.numericScore,
      priority: computed.priority,
      notes: 'Initial finding',
      criteria: { ...originalCriteria },
      evidenceRefs: [{ docId: 'doc-abc12345', quote: 'policies approved by the board' }],
      warnings: [],
      rubricVersion: computed.rubricVersion,
      carriedForward: false,
      changeReason: null,
    }]);
    const row = await getFindingRow();
    expect(row.numeric_score).toBe(60);
    expect(row.computed_numeric_score).toBe(60);
    expect(row.computed_score).toBe('yellow');
    expect(row.override_kind).toBeNull();
  });

  it('#1 setup: facts override raises the EFFECTIVE score, computed_* preserved', async () => {
    const row = await getFindingRow();
    const result = await engine.applyFindingOverride(assessmentId, Number(row.id), 'default', {
      criteria: { ...overrideCriteria },
      reason: 'On-site walkthrough confirmed implementation and testing',
    });
    expect(result.status).toBe(200);
    const updated = await getFindingRow();
    expect(updated.numeric_score).toBe(100);          // effective (overridden)
    expect(updated.computed_numeric_score).toBe(60);  // true computed preserved
    expect(updated.override_kind).toBe('facts');
  });

  it('#1: the snapshot carries override metadata + the TRUE computed values', async () => {
    const r = await fetch(`${base}/api/gap-assessments/${assessmentId}/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'iteration 1' }),
    });
    expect(r.status).toBe(200);

    const iter = await db.get<{ findings_snapshot: string }>(
      'SELECT findings_snapshot FROM gap_iterations WHERE assessment_id = ? ORDER BY iteration_number DESC LIMIT 1',
      assessmentId);
    const snapshot = JSON.parse(iter!.findings_snapshot) as Array<Record<string, unknown>>;
    const entry = snapshot.find(s => s.articleId === article.id)!;
    expect(entry.score).toBe('green');                 // effective
    expect(entry.numericScore).toBe(100);
    expect(entry.criteria).toEqual(originalCriteria);  // ORIGINAL criteria, not the override
    expect(entry.overrideKind).toBe('facts');
    expect(entry.overriddenBy).toBe('default');
    expect(entry.overrideCriteria).toEqual(overrideCriteria);
    expect(entry.computedScore).toBe('yellow');        // TRUE computed values travel
    expect(entry.computedNumericScore).toBe(60);
    expect(entry.computedPriority).toBe('medium');
  });

  it('#1 THE FIX: carry-forward preserves the override and computed_* = computeScoring(criteria) — never the effective score', async () => {
    const iter = await db.get<{ findings_snapshot: string }>(
      'SELECT findings_snapshot FROM gap_iterations WHERE assessment_id = ? ORDER BY iteration_number DESC LIMIT 1',
      assessmentId);
    const snapshot = JSON.parse(iter!.findings_snapshot) as Array<Record<string, unknown>>;
    const baseline = snapshot.find(s => s.articleId === article.id) as unknown as import('../../server/services/gap-assessment-engine.js').BaselineFinding;

    // What the re-assessment loop does for an unchanged article:
    const carried = gapEngine.findingFromBaseline(article, baseline);
    expect(carried.carriedForward).toBe(true);
    expect(carried.overrideKind).toBe('facts');        // override metadata re-emitted
    expect(carried.computedNumericScore).toBe(60);     // true computed re-emitted

    await engine.saveFindings(assessmentId, framework, [carried]);
    const row = await getFindingRow();
    // Laundering reproduced-then-caught: the OLD code wrote
    // computed_numeric_score = effective score (100) and NULLed the override.
    expect(row.numeric_score).toBe(100);               // effective stays overridden
    expect(row.computed_numeric_score).toBe(60);       // NOT 100 — no laundering
    expect(row.computed_score).toBe('yellow');
    expect(row.override_kind).toBe('facts');           // override NOT destroyed
    expect(row.override_reason).toContain('walkthrough');
    expect(row.overridden_by).toBe('default');
    expect(row.carried_forward).toBe(true);
    // overrideCriteria survives in the facts column for the audit trail
    const facts = typeof row.facts === 'string' ? JSON.parse(row.facts as string) : row.facts as Record<string, unknown>;
    expect(facts.overrideCriteria).toEqual(overrideCriteria);
    // Revert-to-computed now reverts to the RUBRIC value, not to the override
    const result = await engine.applyFindingOverride(assessmentId, Number(row.id), 'default', { revert: true });
    expect(result.status).toBe(200);
    expect((result.body.finding as Record<string, unknown>).numericScore).toBe(60);
    // Restore the override for the next test
    await engine.applyFindingOverride(assessmentId, Number(row.id), 'default', {
      criteria: { ...overrideCriteria }, reason: 'On-site walkthrough confirmed implementation and testing',
    });
  });

  it('#1 changed-article rule: a genuinely re-assessed article CLEARS the old override (it was about the old facts)', async () => {
    // The model re-answered with DIFFERENT facts → buildFinding path → fresh
    // finding without override metadata. saveFindings must clear the override.
    const newCriteria = { documented: 'yes', implemented: 'yes', tested: 'partial', evidenced: 'yes', ownerAssigned: 'yes' } as const;
    const computed = gapScoring.computeScoring(newCriteria);
    await engine.saveFindings(assessmentId, framework, [{
      articleId: article.id,
      articleTitle: article.title,
      requirement: article.requirement,
      currentState: 'New audit shows partial testing now operates.',
      score: computed.score,
      numericScore: computed.numericScore,
      priority: computed.priority,
      notes: 'Re-assessed with new evidence',
      criteria: { ...newCriteria },
      evidenceRefs: [],
      warnings: [],
      rubricVersion: computed.rubricVersion,
      carriedForward: false,
      changeReason: 'New 2026 audit report evidences periodic testing',
    }]);
    const row = await getFindingRow();
    expect(row.override_kind).toBeNull();
    expect(row.override_reason).toBeNull();
    expect(row.overridden_by).toBeNull();
    expect(row.numeric_score).toBe(computed.numericScore);
    expect(row.computed_numeric_score).toBe(computed.numericScore); // rubric over NEW criteria
    expect(row.change_reason).toContain('2026 audit');
    expect(row.carried_forward).toBe(false);
  });

  it('#2: snapshot-time PATCH persists merged evidenceItems — the next /run reads them from context_config', async () => {
    // The wizard now PATCHes the merged evidence after a snapshot; drive the
    // same route the wizard uses.
    const newDocText = 'The 2026 internal audit confirmed risk-based CDD refresh across all segments.';
    const patched = {
      entityType: 'Credit institution',
      evidenceItems: [
        { name: 'Audit 2026', kind: 'document', text: newDocText },
      ],
      documentFileIds: ['file-1'],
    };
    const r = await fetch(`${base}/api/gap-assessments/${assessmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context_config: patched }),
    });
    expect(r.status).toBe(200);

    // The /run route does exactly this with the stored row (routes: run →
    // JSON.parse(assessment.context_config) → extractEvidenceItems): the new
    // evidence must come back addressable, with a content-derived id.
    const row = await db.get<{ context_config: string }>(
      'SELECT context_config FROM gap_assessments WHERE id = ?', assessmentId);
    const storedConfig = JSON.parse(row!.context_config) as Record<string, unknown>;
    const items = gapEngine.extractEvidenceItems(storedConfig);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Audit 2026');
    expect(items[0].text).toBe(newDocText);
    expect(items[0].docId).toMatch(/^doc-[0-9a-f]{8}$/);

    // And the prompt context actually contains the new evidence text.
    const ctx = gapEngine.buildEvidencePromptContext(storedConfig, items);
    expect(ctx.text).toContain(newDocText);
    expect(ctx.shownTextByDocId.get(items[0].docId)).toBe(newDocText);
  });
});
