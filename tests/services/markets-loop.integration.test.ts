/**
 * markets-loop.integration.test.ts — Markets closed-loop integration suite
 * against a REAL PostgreSQL database (Wave-3 item 3.7,
 * docs/ANTON_LOCAL_UPDATE_PLAN_2026-06.md).
 *
 * Why this exists: the closed loop has now broken TWICE through SQL/type
 * drift that unit tests with mocked DBs cannot see —
 *   1. findExpired() COALESCE'd a TIMESTAMPTZ deadline with a TO_CHAR(...)
 *      TEXT branch → PostgreSQL type error → the entire verify leg crashed
 *      silently from 2026-04-18 (fixed in Wave-1C, plan 1.10a).
 *   2. The pattern→weight derivers checked `typeof meta.total === 'number'`,
 *      but pg returns COUNT()/SUM() as JSON STRINGS in stored metadata →
 *      182 patterns consumed with ZERO weight adjustments written (1.10b).
 *   3. The loop watchdog filtered workflow_runs on status='success', a value
 *      the table's CHECK constraint forbids → permanently stale (1.10c).
 * Every leg here runs the real service SQL against real PG column types, so
 * a third drift of this class fails the suite instead of freezing the loop.
 *
 * Isolation: the suite provisions its own database (anton_markets_test) via
 * tests/helpers/markets-test-db.ts using the creds in DATABASE_URL / .env —
 * the dev 'anton' database is NEVER written to (write connections assert
 * current_database() first). If an isolated DB cannot be provisioned, the
 * whole suite SKIPS with a reason; it never falls back to the dev DB.
 * Override: set MARKETS_TEST_DATABASE_URL to a dedicated test database to
 * run against that instead (tables are created IF NOT EXISTS + truncated;
 * the DB itself is preserved).
 *
 * No LLM calls: only the free price-grading verifier path runs
 * (runAutoVerification({ allowLLM: false }) defers binary/event predictions),
 * pattern feedback and calibration are pure SQL/arithmetic.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgresAdapter } from '../../server/db/adapters/postgresql-adapter';
import type { DatabaseAdapter } from '../../server/db/database';
import { createPredictionVerifier, MAX_VERIFICATION_ATTEMPTS } from '../../server/services/market-prediction-verifier';
import { createMarketPatternWeightFeedbackService } from '../../server/services/market-pattern-weight-feedback-service';
import { checkMarketsLoopHealth } from '../../server/services/market-loop-health';
import { createMarketIntelligenceService } from '../../server/services/market-intelligence-service';
import {
  provisionMarketsTestDb,
  teardownMarketsTestDb,
  truncateMarketsTables,
  type ProvisionResult,
} from '../helpers/markets-test-db';

// Provision at module load so describe.skipIf can gate collection.
const provision: ProvisionResult = await provisionMarketsTestDb();
if (!provision.ok) {
  // Loud, but not a failure — CI boxes without PG skip cleanly.
  console.warn(`[markets-loop.integration] suite skipped: ${provision.reason}`);
}

// ── Seed helpers ────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const daysAgoIso = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();
const utcDateStr = (iso: string) => iso.split('T')[0];

interface PredictionSeed {
  id: string;
  predictionType?: string;
  symbol?: string | null;
  direction?: string | null;
  predictedValue?: number | null;
  confidence?: number;
  horizonDays?: number | null;
  /** ISO string or null (null exercises the created_at + horizon COALESCE branch). */
  deadline?: string | null;
  createdAt?: string;
  status?: string;
  thesisId?: string | null;
  wasCorrect?: number | null;
  validatedAt?: string | null;
  attempts?: number;
  lastAttemptAt?: string | null;
}

async function seedPrediction(db: DatabaseAdapter, p: PredictionSeed): Promise<void> {
  await db.run(
    `INSERT INTO market_predictions
       (id, thesis_id, title, description, prediction_type, target_symbol,
        predicted_outcome, predicted_value, predicted_direction, confidence,
        time_horizon_days, deadline, status, was_correct, validated_at,
        verification_attempts, last_verification_attempt_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.id,
    p.thesisId ?? null,
    `Test prediction ${p.id}`,
    'integration-suite seed',
    p.predictionType ?? 'directional',
    p.symbol ?? null,
    'test outcome',
    p.predictedValue ?? null,
    p.direction === undefined ? 'up' : p.direction,
    p.confidence ?? 0.5,
    p.horizonDays ?? null,
    p.deadline ?? null,
    p.status ?? 'active',
    p.wasCorrect ?? null,
    p.validatedAt ?? null,
    p.attempts ?? 0,
    p.lastAttemptAt ?? null,
    p.createdAt ?? daysAgoIso(30),
  );
}

async function seedPrice(db: DatabaseAdapter, symbol: string, priceDate: string, close: number): Promise<void> {
  await db.run(
    `INSERT INTO market_price_normalized (id, symbol, price_date, close, source_id)
     VALUES (?, ?, ?, ?, 'test')`,
    `${symbol}_${priceDate}`, symbol, priceDate, close,
  );
}

interface PatternSeed {
  id: string;
  patternType: string;
  /** Stored as TEXT JSON, exactly like the detectors write it. */
  metadata: Record<string, unknown>;
  status?: string;
  detectedAt?: string;
  appliedAt?: string | null;
}

async function seedPattern(db: DatabaseAdapter, p: PatternSeed): Promise<void> {
  await db.run(
    `INSERT INTO market_pattern_detections
       (id, pattern_type, title, description, severity, confidence, metadata, status, detected_at, applied_to_weights_at)
     VALUES (?, ?, ?, ?, 'medium', 0.8, ?, ?, ?, ?)`,
    p.id, p.patternType, `Test pattern ${p.id}`, 'integration-suite seed',
    JSON.stringify(p.metadata), p.status ?? 'new', p.detectedAt ?? daysAgoIso(2),
    p.appliedAt ?? null,
  );
}

async function seedWorkflowRun(
  db: DatabaseAdapter,
  p: { id: string; status: string; startedAt?: string; workflowId?: string },
): Promise<void> {
  await db.run(
    `INSERT INTO workflow_runs (id, workflow_id, status, started_at)
     VALUES (?, ?, ?, ?)`,
    p.id, p.workflowId ?? 'wf_markets_daily_intelligence', p.status, p.startedAt ?? daysAgoIso(1),
  );
}

// ── The suite ───────────────────────────────────────────────────────────────

describe.skipIf(!provision.ok)('Markets closed-loop integration (real PostgreSQL)', () => {
  let db: PostgresAdapter;

  beforeAll(() => {
    db = new PostgresAdapter({ connectionString: provision.url!, maxConnections: 4 });
  });

  afterAll(async () => {
    await db?.close();
    await teardownMarketsTestDb(provision);
  });

  beforeEach(async () => {
    await truncateMarketsTables(provision.url!);
  });

  // ── 1. Verify leg ─────────────────────────────────────────────────────────

  describe('verify leg (market-prediction-verifier)', () => {
    it('findExpired runs against the real TIMESTAMPTZ deadline column and selects both COALESCE branches (the 1.10a crash regression)', async () => {
      const verifier = await createPredictionVerifier(db);

      // Included:
      await seedPrediction(db, { id: 'pA', deadline: daysAgoIso(5), createdAt: daysAgoIso(30), symbol: 'TSTA' });
      await seedPrediction(db, { id: 'pB', deadline: null, horizonDays: 10, createdAt: daysAgoIso(20), symbol: 'TSTB' }); // COALESCE: created_at + horizon
      await seedPrediction(db, { id: 'pC', deadline: null, horizonDays: null, createdAt: daysAgoIso(40), symbol: 'TSTC' }); // COALESCE: default 30d horizon
      await seedPrediction(db, { id: 'pG', status: 'expired', deadline: daysAgoIso(60), createdAt: daysAgoIso(90), attempts: 1, lastAttemptAt: daysAgoIso(10), symbol: 'TSTG' }); // retry-eligible
      // Excluded:
      await seedPrediction(db, { id: 'pD', deadline: new Date(Date.now() + 10 * DAY_MS).toISOString(), createdAt: daysAgoIso(5), symbol: 'TSTD' }); // future deadline
      await seedPrediction(db, { id: 'pE', deadline: null, horizonDays: 10, createdAt: daysAgoIso(5), symbol: 'TSTE' }); // horizon not yet elapsed
      await seedPrediction(db, { id: 'pF', status: 'expired', deadline: daysAgoIso(60), createdAt: daysAgoIso(90), attempts: 3, lastAttemptAt: daysAgoIso(30), symbol: 'TSTF' }); // max attempts
      await seedPrediction(db, { id: 'pH', status: 'expired', deadline: daysAgoIso(60), createdAt: daysAgoIso(90), attempts: 1, lastAttemptAt: daysAgoIso(1), symbol: 'TSTH' }); // inside backoff
      await seedPrediction(db, { id: 'pI', status: 'validated', deadline: daysAgoIso(60), createdAt: daysAgoIso(90), wasCorrect: 1, validatedAt: daysAgoIso(50), symbol: 'TSTI' }); // already done

      // Before Wave-1C this query THREW ("COALESCE types timestamptz and text
      // cannot be matched") — merely completing is the headline assertion.
      const expired = await verifier.findExpired();
      const ids = expired.map((e) => e.id).sort();
      expect(ids).toEqual(['pA', 'pB', 'pC', 'pG']);

      // Deadline must be rendered as a 'YYYY-MM-DD' TEXT date — downstream
      // price lookups compare it against market_price_normalized.price_date.
      for (const e of expired) {
        expect(e.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('runAutoVerification({allowLLM:false}) grades free price paths, defers LLM paths, and records retry attempts', async () => {
      const verifier = await createPredictionVerifier(db);

      await db.run(
        `INSERT INTO market_theses (id, title, description, status, confidence)
         VALUES ('th1', 'Test thesis', 'seed', 'active', 0.5)`,
      );

      // v1: explicit past deadline, correct 'up' call (100 → 110, +10%).
      const v1Created = daysAgoIso(30);
      await seedPrediction(db, {
        id: 'v1', symbol: 'TSTA', direction: 'up', confidence: 0.7,
        deadline: daysAgoIso(5), createdAt: v1Created, thesisId: 'th1',
      });
      await seedPrice(db, 'TSTA', utcDateStr(v1Created), 100);
      // 2 days before the deadline date so TZ rendering can never miss it.
      await seedPrice(db, 'TSTA', utcDateStr(daysAgoIso(7)), 110);

      // v2: NULL deadline → created_at + 10d COALESCE branch; wrong 'down'
      // call (100 → 105, +5%).
      const v2Created = daysAgoIso(20);
      await seedPrediction(db, {
        id: 'v2', symbol: 'TSTB', direction: 'down', confidence: 0.6,
        deadline: null, horizonDays: 10, createdAt: v2Created,
      });
      await seedPrice(db, 'TSTB', utcDateStr(v2Created), 100);
      await seedPrice(db, 'TSTB', utcDateStr(daysAgoIso(12)), 105);

      // v3: no price data at all → unverifiable → retry bookkeeping.
      await seedPrediction(db, {
        id: 'v3', symbol: 'TSTX', direction: 'up', confidence: 0.5,
        deadline: daysAgoIso(5), createdAt: daysAgoIso(30),
      });

      // v4: binary prediction past deadline → must be DEFERRED (not failed)
      // because allowLLM is false. No LLM call may happen in this suite.
      await seedPrediction(db, {
        id: 'v4', predictionType: 'binary', symbol: 'TSTA', direction: null,
        confidence: 0.5, deadline: daysAgoIso(3), createdAt: daysAgoIso(30),
      });

      const summary = await verifier.runAutoVerification({ allowLLM: false });
      expect(summary).toMatchObject({
        verified: 2, unverifiable: 1, correct: 1, incorrect: 1, deferred_llm: 1,
      });

      // v1 — validated, correct, Brier = (0.7 - 1.0)^2 = 0.09, feedback row.
      const r1 = await db.get<{
        status: string; was_correct: number; brier_score: string;
        actual_value: string; validated_at: string | null;
      }>(`SELECT status, was_correct, brier_score, actual_value, validated_at
          FROM market_predictions WHERE id = 'v1'`);
      expect(r1?.status).toBe('validated');
      expect(r1?.was_correct).toBe(1);
      expect(Number(r1?.brier_score)).toBeCloseTo(0.09, 4);
      expect(Number(r1?.actual_value)).toBeCloseTo(110, 2);
      expect(r1?.validated_at).not.toBeNull();

      // v2 — validated via the COALESCE branch, wrong, Brier = 0.6^2 = 0.36.
      const r2 = await db.get<{ status: string; was_correct: number; brier_score: string }>(
        `SELECT status, was_correct, brier_score FROM market_predictions WHERE id = 'v2'`,
      );
      expect(r2?.status).toBe('validated');
      expect(r2?.was_correct).toBe(0);
      expect(Number(r2?.brier_score)).toBeCloseTo(0.36, 4);

      // Feedback rows written for both graded predictions.
      const feedback = await db.all<{ prediction_id: string; accuracy_score: string; explanation: string }>(
        `SELECT prediction_id, accuracy_score, explanation
         FROM market_prediction_feedback ORDER BY prediction_id`,
      );
      expect(feedback.map((f) => f.prediction_id)).toEqual(['v1', 'v2']);
      expect(Number(feedback[0].accuracy_score)).toBeCloseTo(0.91, 4);
      expect(feedback[0].explanation).toContain('[auto_price]');

      // Thesis confidence nudged up by the correct v1 (0.5 × 1.1).
      const th = await db.get<{ confidence: number }>(`SELECT confidence FROM market_theses WHERE id = 'th1'`);
      expect(Number(th?.confidence)).toBeCloseTo(0.55, 6);

      // v3 — unverifiable: attempt counted, status 'expired', failure recorded.
      const r3 = await db.get<{
        status: string; verification_attempts: number;
        last_verification_attempt_at: string | null; last_verification_failure: string | null;
      }>(`SELECT status, verification_attempts, last_verification_attempt_at, last_verification_failure
          FROM market_predictions WHERE id = 'v3'`);
      expect(r3?.status).toBe('expired');
      expect(r3?.verification_attempts).toBe(1);
      expect(r3?.last_verification_attempt_at).not.toBeNull();
      expect(r3?.last_verification_failure).toContain('No price data');

      // v4 — untouched (deferred, still retriable on a future LLM-enabled run).
      const r4 = await db.get<{ status: string; verification_attempts: number }>(
        `SELECT status, verification_attempts FROM market_predictions WHERE id = 'v4'`,
      );
      expect(r4?.status).toBe('active');
      expect(r4?.verification_attempts).toBe(0);
    }, 25_000); // the verifier sleeps 1s between items when >3 are expired

    it('findNearExpiry only reports future-deadline actives (timestamptz comparison)', async () => {
      const verifier = await createPredictionVerifier(db);
      await seedPrediction(db, { id: 'n1', deadline: new Date(Date.now() + 1 * DAY_MS).toISOString(), createdAt: daysAgoIso(5), symbol: 'TSTA' });
      await seedPrediction(db, { id: 'n2', deadline: new Date(Date.now() + 10 * DAY_MS).toISOString(), createdAt: daysAgoIso(5), symbol: 'TSTB' });
      await seedPrediction(db, { id: 'n3', deadline: daysAgoIso(1), createdAt: daysAgoIso(5), symbol: 'TSTC' });
      const near = await verifier.findNearExpiry(2);
      expect(near.map((n) => n.id)).toEqual(['n1']);
    });
  });

  // ── 2. Apply leg ──────────────────────────────────────────────────────────

  describe('apply leg (market-pattern-weight-feedback-service)', () => {
    it('applyPatternFeedback converts STRING-numeric pg metadata into real weight adjustments (the 1.10b regression)', async () => {
      // Metadata numerics as JSON STRINGS — the exact artifact pg produces
      // when detectors serialize COUNT()/SUM() results. Pre-Wave-1C every
      // deriver read these as 0 and silently no-opped.
      await seedPattern(db, {
        id: 'd1', patternType: 'directional_bias', detectedAt: daysAgoIso(5),
        metadata: { accuracy: '0', total: '9', direction: 'up' },
      });
      await seedPattern(db, {
        id: 'd3', patternType: 'confidence_miscalibration', detectedAt: daysAgoIso(4),
        metadata: { gap: '0.3', total: '12', bucket: '0.7-0.8' },
      });
      await seedPattern(db, {
        id: 'd2', patternType: 'symbol_failure_cluster', detectedAt: daysAgoIso(3),
        metadata: { symbol: 'TSTC', accuracy: '0.2', total: '7' },
      });
      // Plain-number metadata must keep working too.
      await seedPattern(db, {
        id: 'd5', patternType: 'symbol_failure_cluster', detectedAt: daysAgoIso(2),
        metadata: { symbol: 'TSTD', accuracy: 0.4, total: 5 },
      });
      // total below the <3 guard → legitimately skipped but still stamped.
      await seedPattern(db, {
        id: 'd4', patternType: 'directional_bias', detectedAt: daysAgoIso(1.5),
        metadata: { accuracy: '0', total: '2', direction: 'down' },
      });
      // Second directional bias to drive weights into the 0.3 floor.
      await seedPattern(db, {
        id: 'd6', patternType: 'directional_bias', detectedAt: daysAgoIso(1),
        metadata: { accuracy: '0', total: '6', direction: 'up' },
      });

      const svc = await createMarketPatternWeightFeedbackService(db);
      const res = await svc.applyPatternFeedback();

      expect(res.patternsConsidered).toBe(6);
      expect(res.patternsApplied).toBe(5);
      expect(res.patternsSkipped).toEqual([{ pattern_id: 'd4', reason: 'no-applicable-weight-delta' }]);
      // d1: 2, d3: 2, d2: 1, d5: 1, d6: 2 → 8 adjustment rows.
      expect(res.adjustments).toBe(8);

      // Signal weights, applied in detected_at order with geometric
      // compounding and the 0.3 floor:
      //   prediction: 1.0 ×0.5 (d1) → 0.5; ×0.5 (d6) → floor 0.3
      //   signal:     1.0 ×0.5 (d1) → 0.5; ×0.85 (d3) → 0.425; ×0.5 (d6) → floor 0.3
      //   insight:    1.0 ×0.85 (d3) → 0.85
      const weights = await db.all<{ signal_type: string; weight: number }>(
        `SELECT signal_type, weight FROM market_signal_weights WHERE category = 'general' ORDER BY signal_type`,
      );
      const wmap = Object.fromEntries(weights.map((w) => [w.signal_type, Number(w.weight)]));
      expect(wmap.prediction).toBeCloseTo(0.3, 6);
      expect(wmap.signal).toBeCloseTo(0.3, 6);
      expect(wmap.insight).toBeCloseTo(0.85, 6);

      // Symbol-grain overrides: 0.5 + accuracy × 0.5.
      const overrides = await db.all<{ symbol: string; weight_multiplier: string }>(
        `SELECT symbol, weight_multiplier FROM market_symbol_weight_overrides ORDER BY symbol`,
      );
      expect(overrides.map((o) => [o.symbol, Number(o.weight_multiplier)])).toEqual([
        ['TSTC', 0.6],
        ['TSTD', 0.7],
      ]);

      // THE audit-trail assertion that was missing for 182 patterns: every
      // applied pattern produced market_signal_weight_adjustments rows.
      const adjRows = await db.all<{ pattern_id: string; signal_type: string; category: string; weight_after: string }>(
        `SELECT pattern_id, signal_type, category, weight_after FROM market_signal_weight_adjustments ORDER BY id`,
      );
      expect(adjRows).toHaveLength(8);
      const symbolAdj = adjRows.find((a) => a.signal_type === 'symbol_override' && a.category === 'TSTC');
      expect(symbolAdj).toBeDefined();
      expect(Number(symbolAdj!.weight_after)).toBeCloseTo(0.6, 6);

      // Idempotency marker set on ALL considered patterns (incl. the skip).
      const unstamped = await db.get<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM market_pattern_detections WHERE applied_to_weights_at IS NULL`,
      );
      expect(unstamped?.n).toBe(0);

      // Re-run is a no-op.
      const again = await svc.applyPatternFeedback();
      expect(again.patternsConsidered).toBe(0);
      expect(again.adjustments).toBe(0);
    });
  });

  // ── 3. Watchdog ───────────────────────────────────────────────────────────

  describe('watchdog (market-loop-health)', () => {
    const byLoop = (findings: Awaited<ReturnType<typeof checkMarketsLoopHealth>>, loop: string) => {
      const f = findings.find((x) => x.loop === loop);
      expect(f, `finding for loop ${loop}`).toBeDefined();
      return f!;
    };

    it('does not false-positive on a healthy system using the REAL status vocabulary', async () => {
      await seedWorkflowRun(db, { id: 'wr1', status: 'completed', startedAt: daysAgoIso(1) });
      // A recent validation and no past-deadline backlog.
      await seedPrediction(db, {
        id: 'hp1', status: 'validated', deadline: daysAgoIso(2), createdAt: daysAgoIso(10),
        wasCorrect: 1, validatedAt: daysAgoIso(1), symbol: 'TSTA',
      });

      const findings = await checkMarketsLoopHealth(db, { windowDays: 7 });
      expect(findings).toHaveLength(4);
      for (const f of findings) {
        expect(f.stale, `${f.loop}: ${f.detail}`).toBe(false);
      }
    });

    it('rejects the legacy status value at the schema level — the vocabulary the old watchdog filtered on cannot exist', async () => {
      // Pins WHY Wave-1C switched the filter to 'completed': the CHECK
      // constraint forbids 'success', so status='success' matches zero rows
      // by construction. If this insert ever starts succeeding, the schema
      // vocabulary changed and market-loop-health.ts must be revisited.
      await expect(
        seedWorkflowRun(db, { id: 'wr_bad', status: 'success' }),
      ).rejects.toThrow(/workflow_runs_status_check/);
    });

    it('flags a stale daily-intelligence heartbeat (old completed run + recent failures only)', async () => {
      await seedWorkflowRun(db, { id: 'wr_old', status: 'completed', startedAt: daysAgoIso(10) });
      await seedWorkflowRun(db, { id: 'wr_fail', status: 'failed', startedAt: daysAgoIso(1) });

      const f = byLoop(await checkMarketsLoopHealth(db, { windowDays: 7 }), 'daily_intelligence_workflow');
      expect(f.stale).toBe(true);
      expect(f.detail).toContain('no successful daily run');
    });

    it('flags the frozen pattern→weight loop, then clears once applyPatternFeedback runs', async () => {
      await seedPattern(db, {
        id: 'wd1', patternType: 'directional_bias', detectedAt: daysAgoIso(3),
        metadata: { accuracy: '0.1', total: '8', direction: 'up' },
      });

      let f = byLoop(await checkMarketsLoopHealth(db, { windowDays: 7 }), 'pattern_to_weight');
      expect(f.stale).toBe(true);
      expect(f.pending).toBe(1);

      const svc = await createMarketPatternWeightFeedbackService(db);
      await svc.applyPatternFeedback();

      const findings = await checkMarketsLoopHealth(db, { windowDays: 7 });
      f = byLoop(findings, 'pattern_to_weight');
      expect(f.stale).toBe(false);
      expect(f.recentTransitions).toBe(1);
      // And the Wave-1C consumed-vs-written integrity check sees adjustments.
      const integ = byLoop(findings, 'pattern_adjustments_written');
      expect(integ.stale).toBe(false);
      expect(integ.pending).toBe(1); // 1 actionable pattern consumed
      expect(integ.recentTransitions).toBe(2); // 2 adjustments written
    });

    it('flags consumed-but-zero-adjustments (the silent no-op deriver class, Wave-1C check 4)', async () => {
      // Simulate exactly the 1.10b failure: an actionable pattern stamped as
      // applied while NO adjustment row was ever written.
      await seedPattern(db, {
        id: 'wd2', patternType: 'symbol_failure_cluster', detectedAt: daysAgoIso(2),
        metadata: { symbol: 'TSTA', accuracy: '0', total: '9' },
        appliedAt: daysAgoIso(1),
      });

      let f = byLoop(await checkMarketsLoopHealth(db, { windowDays: 7 }), 'pattern_adjustments_written');
      expect(f.stale).toBe(true);
      expect(f.detail).toContain('silently no-opping');

      // Once an adjustment exists in the window, the alarm clears.
      await db.run(
        `INSERT INTO market_signal_weight_adjustments
           (pattern_id, pattern_type, signal_type, category, multiplier, weight_before, weight_after, rationale)
         VALUES ('wd2', 'symbol_failure_cluster', 'symbol_override', 'TSTA', 0.5, 1.0, 0.5, 'test')`,
      );
      f = byLoop(await checkMarketsLoopHealth(db, { windowDays: 7 }), 'pattern_adjustments_written');
      expect(f.stale).toBe(false);
    });

    it('does not count retry-exhausted expired predictions as pending (permanently unverifiable ≠ stale)', async () => {
      // Attempts at the verifier's MAX: findExpired will never retry this
      // row (it requires attempts < MAX), so it must not hold the
      // prediction_validation loop "stale" through quiet windows.
      await seedPrediction(db, {
        id: 'wx1', status: 'expired', deadline: daysAgoIso(40), createdAt: daysAgoIso(90),
        attempts: MAX_VERIFICATION_ATTEMPTS, lastAttemptAt: daysAgoIso(20), symbol: 'TSTF',
      });

      let f = byLoop(await checkMarketsLoopHealth(db, { windowDays: 7 }), 'prediction_validation');
      expect(f.pending).toBe(0);
      expect(f.stale).toBe(false);

      // A still-retriable expired prediction (attempts < MAX) IS real backlog.
      await seedPrediction(db, {
        id: 'wx2', status: 'expired', deadline: daysAgoIso(40), createdAt: daysAgoIso(90),
        attempts: MAX_VERIFICATION_ATTEMPTS - 1, lastAttemptAt: daysAgoIso(20), symbol: 'TSTG',
      });
      f = byLoop(await checkMarketsLoopHealth(db, { windowDays: 7 }), 'prediction_validation');
      expect(f.pending).toBe(1);
      expect(f.stale).toBe(true);
    });

    it('flags stalled prediction validation and clears on a recent validation', async () => {
      await seedPrediction(db, {
        id: 'wp1', status: 'active', deadline: daysAgoIso(3), createdAt: daysAgoIso(20), symbol: 'TSTA',
      });

      let f = byLoop(await checkMarketsLoopHealth(db, { windowDays: 7 }), 'prediction_validation');
      expect(f.stale).toBe(true);

      await seedPrediction(db, {
        id: 'wp2', status: 'validated', deadline: daysAgoIso(5), createdAt: daysAgoIso(20),
        wasCorrect: 1, validatedAt: daysAgoIso(1), symbol: 'TSTB',
      });
      f = byLoop(await checkMarketsLoopHealth(db, { windowDays: 7 }), 'prediction_validation');
      expect(f.stale).toBe(false);
    });
  });

  // ── 4. Calibration ────────────────────────────────────────────────────────

  describe('calibration (market-intelligence-service.runCalibrationCheck)', () => {
    it('writes calibration rows from validated predictions — pure SQL, pg-typed end to end', async () => {
      // Bucket [0.6, 0.8): six validated predictions at confidence 0.7,
      // four correct → accuracy 0.6667 vs stated 0.7 → slightly overconfident.
      for (let i = 0; i < 6; i++) {
        await seedPrediction(db, {
          id: `cal${i}`, status: 'validated', confidence: 0.7,
          deadline: daysAgoIso(10), createdAt: daysAgoIso(30),
          wasCorrect: i < 4 ? 1 : 0, validatedAt: daysAgoIso(2), symbol: 'TSTA',
        });
      }
      // Bucket [0.2, 0.4): only three samples → below the ≥5 floor, no row.
      for (let i = 0; i < 3; i++) {
        await seedPrediction(db, {
          id: `low${i}`, status: 'validated', confidence: 0.3,
          deadline: daysAgoIso(10), createdAt: daysAgoIso(30),
          wasCorrect: 1, validatedAt: daysAgoIso(2), symbol: 'TSTB',
        });
      }

      const intelligence = await createMarketIntelligenceService(db);
      const result = await intelligence.runCalibrationCheck();
      expect(result).toEqual({ computed: true });

      const rows = await db.all<{
        bucket_low: number; bucket_high: number; sample_size: number;
        actual_accuracy: number; stated_confidence_avg: number;
        calibration_error: number; is_overconfident: number;
        period_start: string | null; period_end: string | null;
      }>(`SELECT * FROM market_confidence_calibration ORDER BY bucket_low`);

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(Number(row.bucket_low)).toBeCloseTo(0.6, 6);
      expect(row.sample_size).toBe(6);
      expect(Number(row.actual_accuracy)).toBeCloseTo(4 / 6, 4);
      expect(Number(row.stated_confidence_avg)).toBeCloseTo(0.7, 4);
      expect(Number(row.calibration_error)).toBeCloseTo(0.7 - 4 / 6, 4);
      expect(row.is_overconfident).toBe(1);
      // period bounds land in the TEXT columns via PG assignment cast.
      expect(row.period_start).toBeTruthy();
      expect(row.period_end).toBeTruthy();
    });

    it('verify leg → calibration end to end: rows graded by the verifier feed the calibration table', async () => {
      const verifier = await createPredictionVerifier(db);

      // Five predictions in the [0.6, 0.8) bucket, all past deadline with
      // price data: three correct 'up' calls, two wrong 'down' calls.
      const created = daysAgoIso(30);
      await seedPrice(db, 'TSTE', utcDateStr(created), 100);
      await seedPrice(db, 'TSTE', utcDateStr(daysAgoIso(7)), 110); // +10% → up
      for (let i = 0; i < 5; i++) {
        await seedPrediction(db, {
          id: `e2e${i}`, symbol: 'TSTE', direction: i < 3 ? 'up' : 'down',
          confidence: 0.7, deadline: daysAgoIso(5), createdAt: created,
        });
      }

      const summary = await verifier.runAutoVerification({ allowLLM: false });
      expect(summary.verified).toBe(5);
      expect(summary.correct).toBe(3);
      expect(summary.incorrect).toBe(2);

      const intelligence = await createMarketIntelligenceService(db);
      await intelligence.runCalibrationCheck();

      const row = await db.get<{ sample_size: number; actual_accuracy: number; is_overconfident: number }>(
        `SELECT sample_size, actual_accuracy, is_overconfident
         FROM market_confidence_calibration WHERE bucket_low = 0.6`,
      );
      expect(row?.sample_size).toBe(5);
      expect(Number(row?.actual_accuracy)).toBeCloseTo(0.6, 4);
      expect(row?.is_overconfident).toBe(1); // stated 0.7 > actual 0.6
    }, 25_000); // verifier sleeps 1s/item when >3 expired
  });
});
