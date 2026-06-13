/**
 * coding-atom-loop.test.ts — ANTON Studio Phase 4 (project-scoped coding atoms).
 *
 * NO live LLM, NO live DB. Everything runs against an in-memory mock adapter.
 * Covers the full Phase-4 surface:
 *   - mintCodingAtom writes a SCOPED (coding_project_id) + ORIGIN'd atom row
 *     and tolerates a missing embedding backend.
 *   - the capture hooks fire on a FAILED / PASSED test, a CVE, and a panel flag
 *     — fire-and-forget, never throwing into the caller.
 *   - buildAtomLayer with codingProjectId injects the "## LESSONS FROM THIS
 *     PROJECT" header and surfaces only the SAME project's atoms.
 *   - the 2.0x project-match boost in atom-boost.
 *   - getCodingAtomAbStats: deterministic holdout + revise-rounds aggregation +
 *     the honest insufficient-data state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createCodingIntegration,
  CODING_ATOM_TYPES,
  CODING_ATOM_ORIGINS,
} from '../../../server/services/coding-integration.js';
import { applyAntonBoosts } from '../../../server/services/atom-boost.js';
import { buildAtomLayer } from '../../../server/services/prompt-builder.js';
import {
  assignTaskAtomArm,
  getCodingAtomAbStats,
} from '../../../server/services/coding-atom-stats.js';
import { MIN_SCORED_PER_ARM } from '../../../server/services/atom-ab.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';
import type { HybridSearchResult } from '../../../server/services/hybrid-search.js';

// ── A tiny knowledge_atoms-aware mock DB ────────────────────────────────────

interface AtomRow {
  id: string;
  content: string;
  atom_type: string;
  category: string;
  confidence: number;
  source_area_id: string | null;
  atom_origin: string | null;
  coding_project_id: string | null;
  is_active: number;
}

interface SqlCall { sql: string; args: unknown[]; }

function makeMockDb(opts?: {
  atoms?: AtomRow[];
  // revise-rounds aggregation: one row per task → { coding_task_id, revisions }
  appRows?: Array<{ coding_task_id: string; revisions: number }>;
  // make INSERT throw to exercise the non-fatal path
  failInsert?: boolean;
}): DatabaseAdapter & { calls: SqlCall[]; atoms: AtomRow[] } {
  const calls: SqlCall[] = [];
  const atoms: AtomRow[] = [...(opts?.atoms ?? [])];

  const db = {
    dialect: 'sqlite' as const,
    get: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      return undefined;
    },
    all: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      // getCodingAtomAbStats GROUP BY coding_task_id
      if (sql.includes('FROM coding_workspace_applications') && sql.includes('GROUP BY coding_task_id')) {
        return (opts?.appRows ?? []).map(r => ({ coding_task_id: r.coding_task_id, revisions: r.revisions }));
      }
      // buildProjectLessonsBlock: same-project lesson query.
      // Mirror the production ORDER BY (test.failed / review.flag first).
      if (sql.includes('FROM knowledge_atoms') && sql.includes('coding_project_id = ?') && sql.includes('LIMIT 15')) {
        const pid = args[0];
        const rank = (t: string) => (t === 'test.failed' || t === 'review.flag' ? 0 : 1);
        return atoms
          .filter(a => a.coding_project_id === pid && a.is_active === 1)
          .sort((x, y) => rank(x.atom_type) - rank(y.atom_type))
          .map(a => ({ content: a.content, atom_type: a.atom_type, atom_origin: a.atom_origin, confidence: a.confidence }));
      }
      // buildAtomLayer enrichment: SELECT ... FROM knowledge_atoms WHERE id IN (...)
      if (sql.includes('FROM knowledge_atoms WHERE id IN')) {
        const ids = new Set(args.map(String));
        return atoms.filter(a => ids.has(a.id)).map(a => ({
          id: a.id, content: a.content, atom_type: a.atom_type, category: a.category,
          confidence: a.confidence, source_area_id: a.source_area_id, source_module_id: null,
          created_at: new Date().toISOString(), superseded_by: null, coding_project_id: a.coding_project_id,
        }));
      }
      // buildAtomLayerFallback
      if (sql.includes('FROM knowledge_atoms ka')) return [];
      return [];
    },
    run: async (sql: string, ...args: unknown[]) => {
      calls.push({ sql, args });
      if (opts?.failInsert && sql.includes('INSERT INTO knowledge_atoms')) {
        throw new Error('insert boom');
      }
      // Record minted atoms so we can assert on them.
      if (sql.includes('INSERT INTO knowledge_atoms')) {
        // Only the `?` placeholders are in args (NULL / 'coding' / NOW() are
        // SQL literals, not binds). Placeholder order:
        //   0 id, 1 workflow, 2 exec, 3 content, 4 atom_type, 5 confidence,
        //   6 category, 7 tags, 8 coding_project_id, 9 atom_origin
        atoms.push({
          id: String(args[0]),
          content: String(args[3]),
          atom_type: String(args[4]),
          category: String(args[6]),
          confidence: Number(args[5]),
          source_area_id: 'coding',
          atom_origin: args[9] == null ? null : String(args[9]),
          coding_project_id: args[8] == null ? null : String(args[8]),
          is_active: 1,
        });
      }
      return { changes: 1, lastInsertRowid: 0 } as never;
    },
    exec: async () => { /* noop */ },
    transaction: async <T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> => fn(db),
    close: async () => { /* noop */ },
    calls,
    atoms,
  } as unknown as DatabaseAdapter & { calls: SqlCall[]; atoms: AtomRow[] };
  return db;
}

/** Let the fire-and-forget hooks' async IIFEs settle. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// ── mintCodingAtom ──────────────────────────────────────────────────────────

describe('mintCodingAtom — scoped + origin-tagged deterministic write', () => {
  let db: ReturnType<typeof makeMockDb>;
  beforeEach(() => { db = makeMockDb(); });

  it('writes one knowledge_atoms row with coding_project_id + atom_origin set', async () => {
    const svc = await createCodingIntegration(db);
    const id = await svc.mintCodingAtom({
      projectId: 'proj-1',
      type: CODING_ATOM_TYPES.RISK_IDENTIFIED,
      origin: CODING_ATOM_ORIGINS.CVE,
      text: 'lodash@1.0.0 has a known CVE',
    });
    expect(id).toBeTruthy();
    expect(db.atoms).toHaveLength(1);
    const a = db.atoms[0];
    expect(a.coding_project_id).toBe('proj-1');
    expect(a.atom_origin).toBe('cve');
    expect(a.atom_type).toBe('risk.identified');
    expect(a.category).toBe('risk');        // derived from the atom_type root
    expect(a.content).toContain('lodash');
  });

  it('derives category "observation" for test.* / review.* roots', async () => {
    const svc = await createCodingIntegration(db);
    await svc.mintCodingAtom({
      projectId: 'proj-1', type: CODING_ATOM_TYPES.TEST_FAILED,
      origin: CODING_ATOM_ORIGINS.TEST_FAILURE, text: 'x',
    });
    expect(db.atoms[0].category).toBe('observation');
  });

  it('returns null and does not throw when the INSERT fails', async () => {
    const failing = makeMockDb({ failInsert: true });
    const svc = await createCodingIntegration(failing);
    const id = await svc.mintCodingAtom({
      projectId: 'proj-1', type: CODING_ATOM_TYPES.TEST_FAILED,
      origin: CODING_ATOM_ORIGINS.TEST_FAILURE, text: 'x',
    });
    expect(id).toBeNull();
  });

  it('returns null for an empty project id or empty text (no write)', async () => {
    const svc = await createCodingIntegration(db);
    expect(await svc.mintCodingAtom({ projectId: '', type: CODING_ATOM_TYPES.TEST_FAILED, origin: 'x', text: 'y' })).toBeNull();
    expect(await svc.mintCodingAtom({ projectId: 'p', type: CODING_ATOM_TYPES.TEST_FAILED, origin: 'x', text: '   ' })).toBeNull();
    expect(db.atoms).toHaveLength(0);
  });
});

// ── Capture hooks (fire-and-forget, never throw) ────────────────────────────

describe('capture hooks — deterministic, no-LLM, never throw into the caller', () => {
  let db: ReturnType<typeof makeMockDb>;
  beforeEach(() => { db = makeMockDb(); });

  it('a FAILED test mints a test.failed atom (origin test_failure) with the argv + tail', async () => {
    const svc = await createCodingIntegration(db);
    svc.captureTestResult({
      projectId: 'p', taskId: 't1', passed: false, afterRevision: false,
      argv: ['pytest', '-q'], outputTail: 'AssertionError: 1 != 2',
    });
    await flush();
    expect(db.atoms).toHaveLength(1);
    expect(db.atoms[0].atom_type).toBe('test.failed');
    expect(db.atoms[0].atom_origin).toBe('test_failure');
    expect(db.atoms[0].content).toContain('pytest -q');
    expect(db.atoms[0].content).toContain('AssertionError');
  });

  it('a PASSED test AFTER a revision mints a pattern.works atom', async () => {
    const svc = await createCodingIntegration(db);
    svc.captureTestResult({
      projectId: 'p', taskId: 't1', passed: true, afterRevision: true, argv: ['cargo', 'test'],
    });
    await flush();
    expect(db.atoms).toHaveLength(1);
    expect(db.atoms[0].atom_type).toBe('pattern.works');
    expect(db.atoms[0].atom_origin).toBe('pattern_works');
  });

  it('a PASSED test with NO prior revision mints nothing (not a learning signal)', async () => {
    const svc = await createCodingIntegration(db);
    svc.captureTestResult({ projectId: 'p', taskId: 't1', passed: true, afterRevision: false, argv: ['npm', 'test'] });
    await flush();
    expect(db.atoms).toHaveLength(0);
  });

  it('a CVE (vulnerability_count > 0) mints a risk.identified atom (origin cve)', async () => {
    const svc = await createCodingIntegration(db);
    svc.captureDependencyCve({ projectId: 'p', packageName: 'left-pad', currentVersion: '1.0.0', vulnerabilityCount: 3 });
    await flush();
    expect(db.atoms).toHaveLength(1);
    expect(db.atoms[0].atom_type).toBe('risk.identified');
    expect(db.atoms[0].atom_origin).toBe('cve');
    expect(db.atoms[0].content).toContain('left-pad');
    expect(db.atoms[0].content).toContain('3 known');
  });

  it('a clean dependency (vulnerability_count = 0) mints nothing', async () => {
    const svc = await createCodingIntegration(db);
    svc.captureDependencyCve({ projectId: 'p', packageName: 'safe-pkg', vulnerabilityCount: 0 });
    await flush();
    expect(db.atoms).toHaveLength(0);
  });

  it('a panel FLAG mints a review.flag atom (origin review_flag) with role + gate + required change', async () => {
    const svc = await createCodingIntegration(db);
    svc.captureReviewFlag({ projectId: 'p', gate: 'build', role: 'DevSecOps Expert', verdict: 'flag', requiredChange: 'add input validation' });
    await flush();
    expect(db.atoms).toHaveLength(1);
    expect(db.atoms[0].atom_type).toBe('review.flag');
    expect(db.atoms[0].atom_origin).toBe('review_flag');
    expect(db.atoms[0].content).toContain('DevSecOps Expert');
    expect(db.atoms[0].content).toContain('build gate');
    expect(db.atoms[0].content).toContain('add input validation');
  });

  it('only HIGH/CRITICAL tech-debt is captured; low/medium is noise', async () => {
    const svc = await createCodingIntegration(db);
    svc.captureTechDebt({ projectId: 'p', title: 'minor TODO', severity: 'low' });
    svc.captureTechDebt({ projectId: 'p', title: 'unbounded recursion', severity: 'high' });
    await flush();
    expect(db.atoms).toHaveLength(1);
    expect(db.atoms[0].atom_type).toBe('risk.identified');
    expect(db.atoms[0].atom_origin).toBe('bug');
    expect(db.atoms[0].content).toContain('unbounded recursion');
  });

  it('an approved arch change mints a decision.approval atom (origin arch_decision)', async () => {
    const svc = await createCodingIntegration(db);
    svc.captureArchDecision({ projectId: 'p', title: 'switch to event sourcing', changeLevel: 'architecture', rationale: 'auditability' });
    await flush();
    expect(db.atoms).toHaveLength(1);
    expect(db.atoms[0].atom_type).toBe('decision.approval');
    expect(db.atoms[0].atom_origin).toBe('arch_decision');
    expect(db.atoms[0].content).toContain('event sourcing');
  });

  it('a hook whose write throws does NOT reject the caller (fire-and-forget)', async () => {
    const failing = makeMockDb({ failInsert: true });
    const svc = await createCodingIntegration(failing);
    // None of these should throw synchronously or reject.
    expect(() => svc.captureTestResult({ projectId: 'p', taskId: 't', passed: false, afterRevision: false, argv: ['x'] })).not.toThrow();
    expect(() => svc.captureDependencyCve({ projectId: 'p', packageName: 'x', vulnerabilityCount: 1 })).not.toThrow();
    expect(() => svc.captureReviewFlag({ projectId: 'p', role: 'r', verdict: 'dissent' })).not.toThrow();
    await flush();
    expect(failing.atoms).toHaveLength(0); // insert failed → nothing recorded, but no throw
  });
});

// ── buildAtomLayer injection ────────────────────────────────────────────────

describe('buildAtomLayer(codingProjectId) — project lessons injection', () => {
  it('prepends "## LESSONS FROM THIS PROJECT" and includes ONLY same-project atoms', async () => {
    const db = makeMockDb({
      atoms: [
        { id: 'a1', content: 'running `pytest` fails: boom', atom_type: 'test.failed', category: 'observation', confidence: 0.9, source_area_id: 'coding', atom_origin: 'test_failure', coding_project_id: 'projX', is_active: 1 },
        { id: 'a2', content: 'a lesson from a DIFFERENT project', atom_type: 'test.failed', category: 'observation', confidence: 0.9, source_area_id: 'coding', atom_origin: 'test_failure', coding_project_id: 'projY', is_active: 1 },
      ],
    });
    // No userMessage → skips hybrid, goes straight to fallback, but lessons still prepend.
    const layer = await buildAtomLayer(db, 'coding', null, null, null, 'projX');
    expect(layer).toContain('## LESSONS FROM THIS PROJECT');
    expect(layer).toContain('running `pytest` fails');
    expect(layer).not.toContain('DIFFERENT project'); // other project's lesson excluded
  });

  it('orders test.failed / review.flag lessons before others', async () => {
    const db = makeMockDb({
      atoms: [
        { id: 'd1', content: 'approved change: use redis', atom_type: 'decision.approval', category: 'decision', confidence: 0.9, source_area_id: 'coding', atom_origin: 'arch_decision', coding_project_id: 'projX', is_active: 1 },
        { id: 'f1', content: 'reviewer flagged missing auth', atom_type: 'review.flag', category: 'observation', confidence: 0.9, source_area_id: 'coding', atom_origin: 'review_flag', coding_project_id: 'projX', is_active: 1 },
      ],
    });
    const layer = await buildAtomLayer(db, 'coding', null, null, null, 'projX');
    expect(layer.indexOf('reviewer flagged')).toBeLessThan(layer.indexOf('approved change'));
  });

  it('is backward-compatible: WITHOUT codingProjectId there is no lessons header', async () => {
    const db = makeMockDb({
      atoms: [{ id: 'a1', content: 'x', atom_type: 'test.failed', category: 'observation', confidence: 0.9, source_area_id: 'coding', atom_origin: 'test_failure', coding_project_id: 'projX', is_active: 1 }],
    });
    const layer = await buildAtomLayer(db, 'coding', null, null, null);
    expect(layer).not.toContain('## LESSONS FROM THIS PROJECT');
  });
});

// ── atom-boost 2.0x project match ───────────────────────────────────────────

describe('atom-boost — 2.0x same-project boost', () => {
  function result(id: string, codingProjectId: string | null): HybridSearchResult {
    return {
      content_id: id, content_type: 'knowledge_atom', content_text: id, score: 1,
      metadata: { confidence: 0.7, coding_project_id: codingProjectId },
    } as unknown as HybridSearchResult;
  }

  it('ranks the SAME-project atom above an off-project atom of equal base score', async () => {
    const ranked = await applyAntonBoosts(
      [result('off', 'other'), result('mine', 'projX')],
      { codingProjectId: 'projX' },
    );
    expect(ranked[0].content_id).toBe('mine');
    // The on-project atom got ~2x the off-project atom's score.
    const mine = ranked.find(r => r.content_id === 'mine')!;
    const off = ranked.find(r => r.content_id === 'off')!;
    expect(mine.score / off.score).toBeCloseTo(2.0, 5);
  });

  it('applies NO project boost when codingProjectId is absent', async () => {
    const ranked = await applyAntonBoosts(
      [result('a', 'projX'), result('b', 'projY')],
      {},
    );
    // equal base + equal confidence → equal score (order stable)
    expect(ranked[0].score).toBeCloseTo(ranked[1].score, 5);
  });
});

// ── getCodingAtomAbStats ────────────────────────────────────────────────────

describe('coding-atom A/B — deterministic holdout + revise-rounds + honesty', () => {
  it('assignTaskAtomArm is deterministic and yields ~20% holdout', () => {
    for (let i = 0; i < 30; i++) {
      const id = `task-${i}`;
      expect(assignTaskAtomArm(id)).toBe(assignTaskAtomArm(id));
    }
    let holdout = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) if (assignTaskAtomArm(`t-${i}`) === 'holdout') holdout++;
    const f = holdout / N;
    expect(f).toBeGreaterThan(0.14);
    expect(f).toBeLessThan(0.26);
  });

  it('aggregates mean revise-rounds per arm and reports insufficient data below the floor', async () => {
    // A few tasks each side — well below MIN_SCORED_PER_ARM.
    const appRows = [
      { coding_task_id: 'ta', revisions: 0 },
      { coding_task_id: 'tb', revisions: 3 },
      { coding_task_id: 'tc', revisions: 1 },
    ];
    const db = makeMockDb({ appRows });
    const stats = await getCodingAtomAbStats(db);
    expect(stats.minPerArm).toBe(MIN_SCORED_PER_ARM);
    expect(stats.sufficient).toBe(false);               // below the floor
    expect(stats.worksClaimSupported).toBe(false);      // never claim on thin data
    // Each task's revisions count toward its deterministic arm.
    const total = stats.arms.injected.revisions + stats.arms.holdout.revisions;
    expect(total).toBe(4);
    const tasks = stats.arms.injected.tasks + stats.arms.holdout.tasks;
    expect(tasks).toBe(3);
  });

  it('means equal revisions/tasks per arm; a 0-revision task contributes a real 0', async () => {
    // Find two tasks that land in the SAME arm so we can check the mean math.
    const inInjected = ['z0', 'z1', 'z2', 'z3', 'z4', 'z5'].filter(t => assignTaskAtomArm(t) === 'injected');
    expect(inInjected.length).toBeGreaterThanOrEqual(2);
    const appRows = [
      { coding_task_id: inInjected[0], revisions: 0 },
      { coding_task_id: inInjected[1], revisions: 2 },
    ];
    const db = makeMockDb({ appRows });
    const stats = await getCodingAtomAbStats(db);
    expect(stats.arms.injected.tasks).toBe(2);
    expect(stats.arms.injected.meanReviseRounds).toBeCloseTo(1.0, 5); // (0 + 2) / 2
  });

  it('returns an honest empty/insufficient result when the table is missing', async () => {
    const db = {
      dialect: 'sqlite' as const,
      get: async () => undefined,
      all: async () => { throw new Error('relation "coding_workspace_applications" does not exist'); },
      run: async () => ({ changes: 0, lastInsertRowid: 0 } as never),
      exec: async () => {},
      transaction: async <T>(fn: (d: DatabaseAdapter) => Promise<T>) => fn(db),
      close: async () => {},
    } as unknown as DatabaseAdapter;
    const stats = await getCodingAtomAbStats(db);
    expect(stats.sufficient).toBe(false);
    expect(stats.delta).toBeNull();
    expect(stats.worksClaimSupported).toBe(false);
  });
});
