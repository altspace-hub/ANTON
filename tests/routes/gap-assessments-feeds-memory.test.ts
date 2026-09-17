/**
 * gap-assessments-feeds-memory.test.ts — Wave 4b: the Gap Assessor feeds
 * memory through the ledger.
 *
 * Until now only the chat route stored a workflow output, so a completed
 * assessment — the most structured thing ANTON produces — never learned.
 * Against a fake adapter and a mocked output-store (no database, no engine):
 *
 *   - POST /:id/roadmap (the step that marks the assessment 'complete')
 *     stores exactly one output: workflowId gap-assessment:<id>, stepType
 *     'gap_assessment', moduleId 'gap-analysis', the area from the
 *     frameworks' domain, stepName 'Roadmap', and a text that carries the
 *     findings and the roadmap's headline items;
 *   - POST /:id/snapshot (an iteration recorded 'complete') stores one
 *     output at stepIndex = iteration number, stepName 'Iteration <n>';
 *   - a store that fails never touches the response (fire-and-forget);
 *   - the rendering is deterministic, worst-first and capped at 12,000
 *     chars at a line boundary; an unreadable roadmap is left out.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import type { DatabaseAdapter } from '../../server/db/database.js';
import type { StoreOutputParams } from '../../server/services/output-store.js';

const storeOutputMock = vi.fn(async (_params: StoreOutputParams) => 'out_test');
vi.mock('../../server/services/output-store.js', () => ({
  createOutputStore: async () => ({ storeOutput: (p: StoreOutputParams) => storeOutputMock(p) }),
}));
vi.mock('../../server/services/claude-engine-availability.js', () => ({
  hasClaudeEngine: () => true,
  NO_CLAUDE_ENGINE_MESSAGE: 'no engine',
}));
const generateRoadmapMock = vi.fn();
vi.mock('../../server/services/gap-assessment-engine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/gap-assessment-engine.js')>();
  return { ...actual, generateRoadmap: (...args: unknown[]) => generateRoadmapMock(...args) };
});

import {
  createGapAssessmentsRoutes,
  renderGapAssessmentMemoryText,
  buildGapAssessmentOutputParams,
  gapAssessmentAreaId,
  parseAssessmentFrameworks,
  GAP_MEMORY_TEXT_MAX_CHARS,
  type GapMemoryFinding,
} from '../../server/routes/gap-assessments.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

const ASSESSMENT_ID = 'gap-feeds-memory-1';

const ROADMAP = {
  phases: [{
    id: 'phase-1', name: 'Quick Wins', timeframe: '0-3 months', objective: 'Close the critical gaps',
    items: [{ id: 'item-001', title: 'Appoint a deputy MLRO', priority: 'critical', effort: 'S', articleIds: ['Art.7'] }],
  }],
  criticalPath: ['item-001'],
  keyRisks: ['Supervisory action if the December deadline slips'],
};

const ARTICLE_SCORES = {
  'amlr-2024': [
    { articleId: 'Art.7', articleTitle: 'Internal policies', requirement: 'Maintain policies', currentState: 'Policies exist but are not board-approved', score: 'red', numericScore: 20, priority: 'critical', notes: 'Policies not board-approved' },
    { articleId: 'Art.9', articleTitle: 'Compliance function', requirement: 'Appoint a compliance officer', currentState: 'MLRO appointed', score: 'green', numericScore: 100, priority: 'low', notes: 'Fully compliant' },
  ],
};

function assessmentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ASSESSMENT_ID,
    title: 'AML readiness',
    frameworks: JSON.stringify(['amlr-2024']),
    scope_config: '{}',
    context_config: '{}',
    article_scores: JSON.stringify(ARTICLE_SCORES),
    capability_view: 'Capability themes: governance weak, screening adequate.',
    board_summary: null,
    roadmap: null,
    status: 'synthesising',
    user_id: 'default',
    ...overrides,
  };
}

const FINDING_ROWS = [
  {
    id: 1, assessment_id: ASSESSMENT_ID, framework: 'amlr-2024', article_id: 'Art.9', article_title: 'Compliance function',
    requirement: 'Appoint a compliance officer', current_state: 'MLRO appointed', score: 'green', numeric_score: 100, priority: 'low',
    notes: 'Fully compliant', facts: null, rubric_version: null, computed_score: null, computed_numeric_score: null, computed_priority: null,
    overridden_by: null, override_reason: null, overridden_at: null, override_kind: null, carried_forward: null, change_reason: null,
  },
  {
    id: 2, assessment_id: ASSESSMENT_ID, framework: 'amlr-2024', article_id: 'Art.7', article_title: 'Internal policies',
    requirement: 'Maintain policies', current_state: 'Policies exist but are not board-approved', score: 'red', numeric_score: 20, priority: 'critical',
    notes: 'Policies not board-approved', facts: null, rubric_version: null, computed_score: null, computed_numeric_score: null, computed_priority: null,
    overridden_by: null, override_reason: null, overridden_at: null, override_kind: null, carried_forward: null, change_reason: null,
  },
];

interface FakeState {
  assessment: Record<string, unknown> | undefined;
  lastIteration: number | null;
  runs: Array<{ sql: string; args: unknown[] }>;
}

function makeDb(state: FakeState): DatabaseAdapter {
  const db = {
    get: async (sql: string) => {
      if (sql.includes('FROM gap_assessments')) return state.assessment;
      if (sql.includes('MAX(iteration_number)')) return { n: state.lastIteration };
      return undefined;
    },
    all: async (sql: string) => (sql.includes('FROM gap_findings') ? FINDING_ROWS : []),
    run: async (sql: string, ...args: unknown[]) => {
      state.runs.push({ sql, args });
      return { changes: 1, lastInsertRowid: 0 };
    },
    exec: async () => undefined,
    transaction: async <T>(fn: (tx: DatabaseAdapter) => Promise<T>) => fn(db as unknown as DatabaseAdapter),
    close: async () => undefined,
  };
  return db as unknown as DatabaseAdapter;
}

const state: FakeState = { assessment: assessmentRow(), lastIteration: null, runs: [] };
let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', await createGapAssessmentsRoutes(makeDb(state)));
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', () => resolve()); });
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('No server address');
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server?.close(err => (err ? reject(err) : resolve())));
});

beforeEach(() => {
  storeOutputMock.mockClear();
  storeOutputMock.mockResolvedValue('out_test');
  generateRoadmapMock.mockReset();
  generateRoadmapMock.mockResolvedValue({ json: JSON.stringify(ROADMAP), reasoning: '' });
  state.assessment = assessmentRow();
  state.lastIteration = null;
  state.runs = [];
});

async function storedOnce(): Promise<StoreOutputParams> {
  await vi.waitFor(() => expect(storeOutputMock).toHaveBeenCalledTimes(1));
  return storeOutputMock.mock.calls[0][0];
}

// ── The routes ──────────────────────────────────────────────────────────────

describe('POST /gap-assessments/:id/roadmap (assessment reaches complete)', () => {
  it('marks the assessment complete and stores one output for memory', async () => {
    const res = await fetch(`${base}/api/gap-assessments/${ASSESSMENT_ID}/roadmap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(200);
    const body = await res.json() as { roadmap: { phases: unknown[] } };
    expect(body.roadmap.phases).toHaveLength(1);

    // The status write happened, and it says 'complete'.
    const update = state.runs.find(r => r.sql.startsWith('UPDATE gap_assessments SET roadmap'));
    expect(update?.args).toContain('complete');

    const params = await storedOnce();
    expect(params).toMatchObject({
      executionId: ASSESSMENT_ID,
      workflowId: `gap-assessment:${ASSESSMENT_ID}`,
      stepIndex: 0,
      stepType: 'gap_assessment',
      areaId: 'fcp',
      moduleId: 'gap-analysis',
      workflowName: 'Gap assessment: AML readiness',
      stepName: 'Roadmap',
      userId: 'default',
    });
    const text = (params.outputData as { text: string }).text;
    expect(text).toContain('Gap assessment: AML readiness');
    expect(text).toContain('Frameworks: amlr-2024');
    expect(text).toContain('Findings (2): 1 red, 0 amber, 0 yellow, 1 green');
    expect(text).toContain('- amlr-2024 Art.7 (Internal policies) [red/critical]: Policies not board-approved');
    expect(text).toContain('Quick Wins (0-3 months): Close the critical gaps');
    expect(text).toContain('  - Appoint a deputy MLRO [critical/S] — Art.7');
    expect(text).toContain('Critical path: item-001');
    expect(text).toContain('Key risks: Supervisory action if the December deadline slips');
    expect(text.length).toBeLessThanOrEqual(GAP_MEMORY_TEXT_MAX_CHARS);
  });

  it('takes the area from the frameworks (DORA → cyber)', async () => {
    state.assessment = assessmentRow({ frameworks: JSON.stringify(['dora-2022']), article_scores: JSON.stringify({ 'dora-2022': ARTICLE_SCORES['amlr-2024'] }) });
    const res = await fetch(`${base}/api/gap-assessments/${ASSESSMENT_ID}/roadmap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(200);
    const params = await storedOnce();
    expect(params.areaId).toBe('cyber');
  });

  it('stores nothing when the roadmap itself fails (nothing was completed)', async () => {
    generateRoadmapMock.mockRejectedValueOnce(new Error('engine refused'));
    const res = await fetch(`${base}/api/gap-assessments/${ASSESSMENT_ID}/roadmap`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(500);
    await new Promise(r => setTimeout(r, 20));
    expect(storeOutputMock).not.toHaveBeenCalled();
  });
});

describe('POST /gap-assessments/:id/snapshot (iteration recorded complete)', () => {
  it('stores one output at the iteration number with the current findings and stored roadmap', async () => {
    state.lastIteration = 2;
    state.assessment = assessmentRow({ roadmap: JSON.stringify(ROADMAP), status: 'complete' });
    const res = await fetch(`${base}/api/gap-assessments/${ASSESSMENT_ID}/snapshot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ notes: 'Q3 re-run' }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { iterationNumber: number };
    expect(body.iterationNumber).toBe(3);

    const params = await storedOnce();
    expect(params).toMatchObject({
      executionId: ASSESSMENT_ID,
      workflowId: `gap-assessment:${ASSESSMENT_ID}`,
      stepIndex: 3,
      stepType: 'gap_assessment',
      moduleId: 'gap-analysis',
      areaId: 'fcp',
      stepName: 'Iteration 3',
      userId: 'default',
    });
    const text = (params.outputData as { text: string }).text;
    // Worst first: the red Art.7 line precedes the green Art.9 line even
    // though the findings table returned them the other way round.
    expect(text.indexOf('Art.7 (Internal policies) [red/critical]')).toBeLessThan(text.indexOf('Art.9 (Compliance function) [green/low]'));
    expect(text).toContain('  - Appoint a deputy MLRO [critical/S] — Art.7');
  });

  it('a failing store never reaches the response', async () => {
    storeOutputMock.mockRejectedValueOnce(new Error('ledger unavailable'));
    const res = await fetch(`${base}/api/gap-assessments/${ASSESSMENT_ID}/snapshot`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(storeOutputMock).toHaveBeenCalledTimes(1));
  });
});

// ── The rendering ───────────────────────────────────────────────────────────

describe('renderGapAssessmentMemoryText', () => {
  const red: GapMemoryFinding = { framework: 'amlr-2024', articleId: 'Art.7', articleTitle: 'Internal policies', score: 'red', priority: 'critical', notes: 'Not approved' };
  const green: GapMemoryFinding = { framework: 'amlr-2024', articleId: 'Art.9', articleTitle: 'Compliance function', score: 'green', priority: 'low', notes: 'Fine' };

  it('orders findings worst first and falls back to the current state when there are no notes', () => {
    const text = renderGapAssessmentMemoryText({
      title: 'T', frameworks: ['amlr-2024'],
      findings: [green, { ...red, notes: null, currentState: 'Policies   exist\nbut unsigned' }],
      roadmap: null,
    });
    const lines = text.split('\n');
    expect(lines[0]).toBe('Gap assessment: T');
    expect(lines[2]).toBe('Findings (2): 1 red, 0 amber, 0 yellow, 1 green');
    expect(lines[3]).toBe('- amlr-2024 Art.7 (Internal policies) [red/critical]: Policies exist but unsigned');
    expect(lines[4]).toBe('- amlr-2024 Art.9 (Compliance function) [green/low]: Fine');
    expect(text).not.toContain('Roadmap:');
  });

  it('leaves out a roadmap it cannot read and one without phases', () => {
    expect(renderGapAssessmentMemoryText({ title: 'T', frameworks: [], findings: [red], roadmap: 'not json' })).not.toContain('Roadmap:');
    expect(renderGapAssessmentMemoryText({ title: 'T', frameworks: [], findings: [red], roadmap: { totalItems: 3 } })).not.toContain('Roadmap:');
    expect(renderGapAssessmentMemoryText({ title: 'T', frameworks: [], findings: [red], roadmap: ROADMAP })).toContain('Roadmap:');
  });

  it('caps at 12,000 chars on a line boundary, keeping the red findings and dropping the green tail', () => {
    const findings: GapMemoryFinding[] = [];
    for (let i = 0; i < 400; i++) findings.push({ ...green, articleId: `Art.G${i}`, notes: 'x'.repeat(200) });
    for (let i = 0; i < 20; i++) findings.push({ ...red, articleId: `Art.R${i}`, notes: 'y'.repeat(200) });
    const text = renderGapAssessmentMemoryText({ title: 'Big', frameworks: ['amlr-2024'], findings, roadmap: ROADMAP });
    expect(text.length).toBeLessThanOrEqual(GAP_MEMORY_TEXT_MAX_CHARS);
    expect(text.endsWith('\n…(truncated)')).toBe(true);
    expect(text).toContain('Art.R19');
    expect(text).not.toContain('Art.G399');
    // The cut fell on a line boundary: the last kept line is whole.
    const kept = text.slice(0, text.length - '\n…(truncated)'.length).split('\n');
    expect(kept[kept.length - 1]).toMatch(/^- amlr-2024 Art\.G\d+ \(Compliance function\) \[green\/low\]: x+$/);
  });
});

describe('buildGapAssessmentOutputParams / helpers', () => {
  it('builds the ledger row the routes store', () => {
    const params = buildGapAssessmentOutputParams({
      assessmentId: 'a1', title: '  DORA   readiness ', frameworks: ['dora-2022'], findings: [], roadmap: null,
      stepIndex: 2, stepName: 'Iteration 2', userId: 'u1',
    });
    expect(params).toEqual({
      executionId: 'a1',
      workflowId: 'gap-assessment:a1',
      stepIndex: 2,
      stepType: 'gap_assessment',
      areaId: 'cyber',
      moduleId: 'gap-analysis',
      outputData: { text: 'Gap assessment: DORA readiness\nFrameworks: dora-2022\nFindings (0): 0 red, 0 amber, 0 yellow, 0 green' },
      workflowName: 'Gap assessment: DORA readiness',
      stepName: 'Iteration 2',
      userId: 'u1',
    });
  });

  it('maps the frameworks\' shared domain onto an ANTON area, fcp by default', () => {
    expect(gapAssessmentAreaId(['amlr-2024'])).toBe('fcp');
    expect(gapAssessmentAreaId(['dora-2022'])).toBe('cyber');
    expect(gapAssessmentAreaId(['amlr-2024', 'dora-2022'])).toBe('fcp'); // mixed → generic
    expect(gapAssessmentAreaId([])).toBe('fcp');
  });

  it('reads gap_assessments.frameworks tolerantly', () => {
    expect(parseAssessmentFrameworks('["amlr-2024","dora-2022"]')).toEqual(['amlr-2024', 'dora-2022']);
    expect(parseAssessmentFrameworks(['x', 3, null])).toEqual(['x']);
    expect(parseAssessmentFrameworks('garbage')).toEqual([]);
    expect(parseAssessmentFrameworks(null)).toEqual([]);
  });
});
