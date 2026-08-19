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
 *   4. The NAV stale-session guard compared String(published_at).slice(0,10)
 *      against a 'YYYY-MM-DD' nav_date. published_at is TIMESTAMPTZ, which pg
 *      returns as a JS Date, so the slice was "Mon Aug 17" — and
 *      "Mon Aug 17" >= "2026-08-18" is TRUE ('M' > '2'). Every holding counted
 *      as fresh, the guard never fired, and the unit suite passed throughout
 *      because its double returned strings (2026-08-18).
 *   5. syncPricesToHistorical INSERT..SELECT..ON CONFLICT drew duplicate
 *      (symbol, price_date) rows from two feeds while omitting `source`, so
 *      they collapsed onto one conflict key mid-statement → "ON CONFLICT DO
 *      UPDATE command cannot affect row a second time". The catch swallowed
 *      it and market_historical_prices froze at 2026-04-02 for four months.
 *   6. Binary predictions routed to the LLM by TYPE rather than by whether
 *      evidence existed. On 2026-08-19 "NVDA posts a daily move exceeding
 *      2.5% within three sessions" was graded CORRECT from base rates while
 *      NVDA's largest actual move was -1.94% — settled by prices sitting in
 *      this very table.
 *   7. The attribution sweep called .slice(0, 10) on r.executed_at and
 *      p.validated_at — both TIMESTAMPTZ, both handed back as Date. Every
 *      04:00 run since 2026-04-27 threw "row.rebalance_executed_at.slice is
 *      not a function" on 39 of 45 rows, so attribution_pnl was never
 *      computed for a single prediction and the ledger that answers "did our
 *      signals help the portfolio" stayed empty.
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
import { createMarketNavEngine } from '../../server/services/market-nav-engine';
import { createMarketDataService } from '../../server/services/market-data-service';
import { createMarketPredictionAttributionService } from '../../server/services/market-prediction-attribution-service';
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

  // ── 5. NAV engine (market-nav-engine) ─────────────────────────────────────

  describe('NAV engine (market-nav-engine)', () => {
    /** An index with one holding: 10 shares carried at 100. */
    async function seedIndex() {
      await db.run(
        `INSERT INTO market_indexes (id, name, status, current_nav, total_return)
         VALUES ('idx_t', 'Test Index', 'active', 1000, 0)`);
      await db.run(
        `INSERT INTO market_index_holdings (index_id, symbol, weight, shares, entry_price, current_price)
         VALUES ('idx_t', 'AAPL', 1, 10, 100, 100)`);
    }

    /** A daily bar stamped with a real TIMESTAMPTZ trading date. */
    async function seedBar(id: string, barDate: string, close: number) {
      await db.run(
        `INSERT INTO market_data_raw (id, source_id, data_type, symbol, content, published_at, fetched_at)
         VALUES (?, 'src_test', 'price', 'AAPL', ?, ?::date, NOW())`,
        id, JSON.stringify({ symbol: 'AAPL', date: barDate, close }), barDate);
    }

    async function seedNav(rows: Array<[string, number]>) {
      for (const [date, value] of rows) {
        await db.run(
          `INSERT INTO market_index_nav_history (index_id, nav_date, nav_value, daily_return)
           VALUES ('idx_t', ?, ?, 0)`, date, value);
      }
    }

    const navDates = async () => (await db.all<{ nav_date: string }>(
      `SELECT nav_date FROM market_index_nav_history WHERE index_id = 'idx_t' ORDER BY nav_date`
    )).map(r => r.nav_date);

    it('skips the write when the newest bar predates the session', async () => {
      await seedIndex();
      await seedNav([['2026-08-14', 1000]]);
      await seedBar('bar_fri', '2026-08-14', 100);

      const engine = await createMarketNavEngine(db);
      const r = await engine.calculateDailyNav('idx_t', '2026-08-17');

      // Every price is carried forward from Friday → the Monday row would be a
      // guaranteed 0.000%, and would then baseline the real Monday move.
      expect(r.written).toBe(false);
      expect(await navDates()).toEqual(['2026-08-14']);
    });

    it('writes the session once a bar dated that session exists', async () => {
      await seedIndex();
      await seedNav([['2026-08-14', 1000]]);
      await seedBar('bar_fri', '2026-08-14', 100);
      await seedBar('bar_mon', '2026-08-17', 110);

      const engine = await createMarketNavEngine(db);
      const r = await engine.calculateDailyNav('idx_t', '2026-08-17');

      expect(r.written).toBe(true);
      expect(Number(r.nav)).toBeCloseTo(1100, 6);
      expect(r.dailyReturn).toBeCloseTo(0.10, 6);
    });

    it('measures a repair against the previous session, not the row it replaces', async () => {
      await seedIndex();
      await seedNav([['2026-08-14', 1000], ['2026-08-17', 1000]]); // phantom flat Monday
      await seedBar('bar_fri', '2026-08-14', 100);
      await seedBar('bar_mon', '2026-08-17', 110);

      const engine = await createMarketNavEngine(db);
      const r = await engine.calculateDailyNav('idx_t', '2026-08-17');

      // The write is an upsert: without the nav_date < ? bound the same-day row
      // is its own baseline and the repair reports 0%, erasing the move.
      expect(r.dailyReturn).toBeCloseTo(0.10, 6);
      expect(await navDates()).toEqual(['2026-08-14', '2026-08-17']);
    });

    it('does not price a session from a later session bar', async () => {
      await seedIndex();
      await seedNav([['2026-08-13', 1000]]);
      await seedBar('bar_mon', '2026-08-17', 110); // only Monday on hand

      const engine = await createMarketNavEngine(db);
      const r = await engine.calculateDailyNav('idx_t', '2026-08-14');

      expect(r.written).toBe(false);
      expect(await navDates()).toEqual(['2026-08-13']);
    });

    it('repairing an older session leaves current price and current_nav alone', async () => {
      await seedIndex();
      await seedNav([['2026-08-13', 1000], ['2026-08-17', 1200]]);
      await seedBar('bar_fri', '2026-08-14', 105);

      const engine = await createMarketNavEngine(db);
      await engine.calculateDailyNav('idx_t', '2026-08-14');

      const h = await db.get<{ current_price: string }>(
        `SELECT current_price FROM market_index_holdings WHERE index_id = 'idx_t'`);
      expect(Number(h?.current_price)).toBe(100); // seeded, not Friday's 105
      const idx = await db.get<{ current_nav: string }>(
        `SELECT current_nav FROM market_indexes WHERE id = 'idx_t'`);
      expect(Number(idx?.current_nav)).toBe(1000);
    });
  });

  // ── 6. Weekend / non-trading deadlines ───────────────────────────────────

  describe('verify leg — deadlines on non-trading days', () => {
    /**
     * A deadline can land on a day the market never traded. getPriceAtDate
     * resolves backwards, so a Sunday deadline returns Friday's close — and
     * when the prediction was made on that same Friday, start and end are the
     * SAME bar. Every directional call then scores a ~0.0% move and fails
     * automatically, no matter what the market did. The tactical band puts
     * deadlines on weekends routinely: on 2026-08-14 three of twelve graded
     * predictions (SPY, TLT, VIXY, all due Sunday 08-16) went down this way.
     */
    it('rolls a weekend deadline forward to the next session instead of grading a zero-length window', async () => {
      // Friday 2026-08-14 close, no weekend bars, Monday 2026-08-17 close +3%.
      await seedPrice(db, 'SPY', '2026-08-14', 100);
      await seedPrice(db, 'SPY', '2026-08-17', 103);
      await seedPrediction(db, {
        id: 'p_weekend', symbol: 'SPY', direction: 'up', confidence: 0.6,
        createdAt: '2026-08-14T17:00:00Z',
        deadline: '2026-08-16T00:00:00Z',   // Sunday
      });

      const verifier = await createPredictionVerifier(db);
      const r = await verifier.verifyPrediction({
        id: 'p_weekend', title: 't', prediction_type: 'directional',
        target_symbol: 'SPY', predicted_direction: 'up', predicted_value: null,
        confidence: 0.6, created_at: '2026-08-14T17:00:00Z',
        deadline: '2026-08-16', verification_attempts: 0,
      } as never);

      expect(r.method).toBe('auto_price');
      expect(r.wasCorrect).toBe(true);              // +3% up, as predicted
      expect(r.actualOutcome).toContain('up');
      expect(r.explanation).toContain('2026-08-14→2026-08-17');
    });

    it('leaves a prediction retriable when no session has traded since it was made', async () => {
      // Only the Friday bar exists — the market has not answered yet.
      await seedPrice(db, 'QQQ', '2026-08-14', 100);
      await seedPrediction(db, {
        id: 'p_pending', symbol: 'QQQ', direction: 'up', confidence: 0.6,
        createdAt: '2026-08-14T17:00:00Z',
        deadline: '2026-08-16T00:00:00Z',
      });

      const verifier = await createPredictionVerifier(db);
      const r = await verifier.verifyPrediction({
        id: 'p_pending', title: 't', prediction_type: 'directional',
        target_symbol: 'QQQ', predicted_direction: 'up', predicted_value: null,
        confidence: 0.6, created_at: '2026-08-14T17:00:00Z',
        deadline: '2026-08-16', verification_attempts: 0,
      } as never);

      // Unverifiable → runAutoVerification keeps it 'expired' and retriable,
      // rather than stamping a fabricated 0.0% onto the accuracy record.
      expect(r.method).toBe('unverifiable');
      expect(r.actualOutcome).toMatch(/no trading session/i);
    });

    it('still grades an ordinary weekday window from the deadline bar', async () => {
      await seedPrice(db, 'IWM', '2026-08-17', 100);
      await seedPrice(db, 'IWM', '2026-08-19', 96);
      await seedPrice(db, 'IWM', '2026-08-21', 90);  // AFTER the deadline — must not be used
      await seedPrediction(db, {
        id: 'p_weekday', symbol: 'IWM', direction: 'down', confidence: 0.6,
        createdAt: '2026-08-17T17:00:00Z', deadline: '2026-08-19T00:00:00Z',
      });

      const verifier = await createPredictionVerifier(db);
      const r = await verifier.verifyPrediction({
        id: 'p_weekday', title: 't', prediction_type: 'directional',
        target_symbol: 'IWM', predicted_direction: 'down', predicted_value: null,
        confidence: 0.6, created_at: '2026-08-17T17:00:00Z',
        deadline: '2026-08-19', verification_attempts: 0,
      } as never);

      expect(r.method).toBe('auto_price');
      expect(r.explanation).toContain('2026-08-17→2026-08-19');
      expect(Number(r.actualValue)).toBe(96);       // not 90
    });
  });

  // ── 7. Historical price sync ─────────────────────────────────────────────

  describe('price sync (market-data-service.syncPricesToHistorical)', () => {
    /**
     * The same symbol/day legitimately arrives from more than one source —
     * mds_fmp_prices and mds_fmp_sp100_b1 both carry AAPL (2668 such pairs in
     * the dev DB on 2026-08-18). The sync INSERT omits `source`, so every
     * duplicate takes the column default and lands on the SAME conflict key
     * within one statement, which PostgreSQL rejects outright. Only real pg
     * enforces that, which is why this test lives here.
     */
    it('syncs when the same symbol/day exists under two sources', async () => {
      await seedPrice(db, 'AAPL', '2026-08-17', 300);
      await db.run(
        `INSERT INTO market_price_normalized (id, symbol, price_date, close, source_id)
         VALUES ('AAPL_2026-08-17_b', 'AAPL', '2026-08-17', 301, 'other_feed')`);

      const svc = await createMarketDataService(db);
      const synced = await svc.syncPricesToHistorical();

      // Pre-fix this threw, was swallowed, and returned 0 with nothing written.
      expect(synced).toBeGreaterThan(0);
      const rows = await db.all<{ symbol: string; close: number }>(
        `SELECT symbol, close FROM market_historical_prices WHERE symbol = 'AAPL'`);
      expect(rows).toHaveLength(1);          // one row, not a duplicate-key crash
    });

    it('reports the number of rows it wrote', async () => {
      await seedPrice(db, 'MSFT', '2026-08-17', 480);

      const svc = await createMarketDataService(db);
      const synced = await svc.syncPricesToHistorical();

      // Read via RunResult.changes; pg's raw rowCount is not exposed there, and
      // reading it returned 0 even on a successful multi-thousand-row sync.
      expect(synced).toBe(1);
    });
  });

  // ── 8. Quantified binary claims settle from prices, not the LLM ──────────

  describe('verify leg — quantified move claims', () => {
    /**
     * "posts a daily move exceeding 2.5% within three sessions" is arithmetic.
     * Routing it to an LLM produced a confident wrong answer derived from
     * NVDA's typical volatility, with the model itself noting that "no direct
     * price data was supplied for confirmation". These run the real SQL so a
     * regression cannot quietly hand the claim back to the model.
     */
    const nvdaPred = (deadline: string) => ({
      id: 'p_move', title: 'NVDA posts a daily move exceeding 2.5% within three sessions',
      prediction_type: 'binary', target_symbol: 'NVDA', predicted_direction: null,
      predicted_outcome: 'a daily move exceeding 2.5%', predicted_value: null,
      confidence: 0.6, created_at: '2026-08-14T00:00:00Z', deadline,
      verification_attempts: 0,
    });

    it('grades the claim FALSE when no session exceeded the threshold', async () => {
      // The real 2026-08-14..18 NVDA closes: largest move is -1.94%.
      await seedPrice(db, 'NVDA', '2026-08-14', 225.82);
      await seedPrice(db, 'NVDA', '2026-08-17', 225.33);
      await seedPrice(db, 'NVDA', '2026-08-18', 220.95);

      const verifier = await createPredictionVerifier(db);
      const r = await verifier.verifyPrediction(nvdaPred('2026-08-18') as never);

      expect(r.method).toBe('auto_price');       // never reached the LLM
      expect(r.wasCorrect).toBe(false);
      expect(r.explanation).toContain('1.94');
      expect(r.explanation).toContain('no LLM');
    });

    it('grades the claim TRUE when a session did exceed it', async () => {
      await seedPrice(db, 'NVDA', '2026-08-14', 225.82);
      await seedPrice(db, 'NVDA', '2026-08-17', 225.33);
      await seedPrice(db, 'NVDA', '2026-08-18', 210.00);   // -6.8%

      const verifier = await createPredictionVerifier(db);
      const r = await verifier.verifyPrediction(nvdaPred('2026-08-18') as never);

      expect(r.method).toBe('auto_price');
      expect(r.wasCorrect).toBe(true);
    });

    it('is not fooled by duplicate rows for the same session', async () => {
      // Two feeds carry the same day; a duplicate would inject a fake 0% move
      // between the real ones and could mask a threshold breach.
      await seedPrice(db, 'NVDA', '2026-08-14', 225.82);
      await db.run(
        `INSERT INTO market_price_normalized (id, symbol, price_date, close, source_id)
         VALUES ('NVDA_dup', 'NVDA', '2026-08-14', 225.82, 'second_feed')`);
      await seedPrice(db, 'NVDA', '2026-08-17', 210.00);   // -7.0%

      const verifier = await createPredictionVerifier(db);
      const r = await verifier.verifyPrediction(nvdaPred('2026-08-17') as never);

      expect(r.method).toBe('auto_price');
      expect(r.wasCorrect).toBe(true);
      expect(r.explanation).toContain('2 closes');   // deduplicated
    });

    it('grades a quantified claim even when the LLM tier is paused', async () => {
      // requiresLLMVerification gates BEFORE dispatch. Without an exemption a
      // quantified binary claim is deferred as "needs LLM" and never reaches
      // the arithmetic route — making that route unreachable in the free tier,
      // which is exactly where it matters most.
      await seedPrice(db, 'NVDA', '2026-08-14', 225.82);
      await seedPrice(db, 'NVDA', '2026-08-17', 225.33);
      await seedPrice(db, 'NVDA', '2026-08-18', 220.95);
      await seedPrediction(db, {
        id: 'p_move_paused', predictionType: 'binary', symbol: 'NVDA',
        direction: null, confidence: 0.6,
        createdAt: '2026-08-14T00:00:00Z', deadline: '2026-08-18T00:00:00Z',
      });
      await db.run(
        `UPDATE market_predictions SET title = ?, predicted_outcome = ? WHERE id = 'p_move_paused'`,
        'NVDA posts a daily move exceeding 2.5% within three sessions',
        'a daily move exceeding 2.5%');

      const verifier = await createPredictionVerifier(db);
      const r = await verifier.runAutoVerification({ allowLLM: false });

      expect(r.deferred_llm).toBe(0);       // not parked as an LLM job
      expect(r.verified).toBe(1);
      expect(r.incorrect).toBe(1);          // largest move was -1.94%
    });

    it('defers a non-quantified binary claim to the LLM path', async () => {
      // No parseable threshold → must NOT be settled arithmetically.
      await seedPrice(db, 'TSLA', '2026-08-14', 100);
      await seedPrice(db, 'TSLA', '2026-08-18', 101);

      const verifier = await createPredictionVerifier(db);
      const r = await verifier.verifyPrediction({
        id: 'p_event', title: 'Tesla FSD European approval by August 18',
        prediction_type: 'binary', target_symbol: 'TSLA', predicted_direction: null,
        predicted_outcome: 'regulatory approval granted', predicted_value: null,
        confidence: 0.6, created_at: '2026-08-14T00:00:00Z', deadline: '2026-08-18',
        verification_attempts: 0,
      } as never);

      // No atoms seeded → the LLM path bails before calling a model.
      expect(r.method).toBe('unverifiable');
    });
  });

  // ── 9. Prediction -> portfolio attribution ───────────────────────────────

  describe('attribution (market-prediction-attribution-service)', () => {
    /**
     * Attribution prices come from market_historical_prices, NOT
     * market_price_normalized — the table syncPricesToHistorical fills. That
     * sync was itself broken until 2026-08-18, so attribution had no prices to
     * read even once its own date bug was out of the way.
     */
    async function seedHistoricalPrice(symbol: string, priceDate: string, close: number) {
      await db.run(
        `INSERT INTO market_historical_prices (symbol, price_date, close, source)
         VALUES (?, ?, ?, 'test')`, symbol, priceDate, close);
    }

    async function seedRebalanceAndAttribution(opts: {
      weightChange: number; horizonDays: number; symbol: string;
    }) {
      await db.run(
        `INSERT INTO market_index_rebalances (id, index_id, rebalance_type, trigger_type, executed_at)
         VALUES ('reb_t', 'idx_t', 'manual', 'scheduled', NOW() - INTERVAL '40 days')`);
      await seedPrediction(db, {
        id: 'p_attr', symbol: opts.symbol, direction: 'up', confidence: 0.6,
        horizonDays: opts.horizonDays, createdAt: daysAgoIso(41), status: 'active',
      });
      await db.run(
        `INSERT INTO market_prediction_attribution (prediction_id, rebalance_id, signal_score, weight_change)
         VALUES ('p_attr', 'reb_t', 0.5, ?)`, opts.weightChange);
    }

    it('computes attribution PnL across TIMESTAMPTZ columns', async () => {
      await seedRebalanceAndAttribution({ weightChange: 0.03, horizonDays: 10, symbol: 'AAPL' });
      // Prices bracketing the rebalance and the maturity date.
      await seedHistoricalPrice('AAPL', utcDateStr(daysAgoIso(40)), 100);
      await seedHistoricalPrice('AAPL', utcDateStr(daysAgoIso(31)), 110);

      const svc = await createMarketPredictionAttributionService(db);
      const r = await svc.computeMaturedAttributionPnL();

      // Pre-fix this threw on every row and computed nothing.
      expect(r.errors).toEqual([]);
      expect(r.pnl_computed).toBe(1);

      const row = await db.get<{ subsequent_return: string; attribution_pnl: string }>(
        `SELECT subsequent_return, attribution_pnl FROM market_prediction_attribution WHERE prediction_id = 'p_attr'`);
      expect(Number(row?.subsequent_return)).toBeCloseTo(0.10, 4);   // 100 -> 110
      expect(Number(row?.attribution_pnl)).toBeCloseTo(0.03 * 0.10, 6);
    });

    it('rolls up to one row per position instead of once per prediction', async () => {
      await seedRebalanceAndAttribution({ weightChange: 0.03, horizonDays: 10, symbol: 'AAPL' });
      await seedHistoricalPrice('AAPL', utcDateStr(daysAgoIso(40)), 100);
      await seedHistoricalPrice('AAPL', utcDateStr(daysAgoIso(31)), 110);
      // A second prediction informing the SAME weight change.
      await seedPrediction(db, {
        id: 'p_attr2', symbol: 'AAPL', direction: 'up', confidence: 0.6,
        horizonDays: 10, createdAt: daysAgoIso(41), status: 'active',
      });
      await db.run(
        `INSERT INTO market_prediction_attribution (prediction_id, rebalance_id, signal_score, weight_change)
         VALUES ('p_attr2', 'reb_t', 0.5, 0.03)`);

      const svc = await createMarketPredictionAttributionService(db);
      await svc.computeMaturedAttributionPnL();
      const summary = await svc.getAttributionSummary();

      // One position, not two — the naive sum would double it.
      expect(summary.totals.distinctPositions).toBe(1);
      expect(summary.totals.attributedPredictions).toBe(2);
      expect(summary.totals.totalPnlPct).toBeCloseTo(0.03 * 0.10 * 100, 6);
      expect(summary.totals.rawSumPnlPct).toBeCloseTo(0.03 * 0.10 * 100 * 2, 6);
      expect(summary.positions[0].predictionsCredited).toBe(2);
    });

    it('keeps each rolled-up row internally consistent across differing horizons', async () => {
      // Two predictions on ONE position with different horizons, so their
      // measurement windows end on different days and their subsequent_returns
      // disagree in SIGN. Independent MAX()es then splice the largest weight,
      // the largest return and the largest pnl out of different rows and report
      // a triple where weight x return does not equal pnl. Real data does this:
      // CVX on 2026-04-27 spans -5.76% to +4.06% across six predictions.
      await seedRebalanceAndAttribution({ weightChange: -0.03, horizonDays: 10, symbol: 'AAPL' });
      await seedPrediction(db, {
        id: 'p_attr_long', symbol: 'AAPL', direction: 'up', confidence: 0.6,
        horizonDays: 20, createdAt: daysAgoIso(41), status: 'active',
      });
      await db.run(
        `INSERT INTO market_prediction_attribution (prediction_id, rebalance_id, signal_score, weight_change)
         VALUES ('p_attr_long', 'reb_t', 0.5, -0.03)`);

      await seedHistoricalPrice('AAPL', utcDateStr(daysAgoIso(40)), 100);
      await seedHistoricalPrice('AAPL', utcDateStr(daysAgoIso(31)), 110);  // +10% at the 10d maturity
      await seedHistoricalPrice('AAPL', utcDateStr(daysAgoIso(21)), 90);   // -10% at the 20d maturity

      const svc = await createMarketPredictionAttributionService(db);
      await svc.computeMaturedAttributionPnL();
      const { positions } = await svc.getAttributionSummary();

      expect(positions).toHaveLength(1);
      expect(positions[0].predictionsCredited).toBe(2);
      // The spread must be surfaced, not averaged away silently.
      expect(positions[0].returnLowPct).toBeCloseTo(-10, 4);
      expect(positions[0].returnHighPct).toBeCloseTo(10, 4);

      for (const p of positions) {
        const implied = (p.weightChangePct / 100) * (p.subsequentReturnPct / 100) * 10_000;
        expect(p.pnlBps).toBeCloseTo(implied, 6);
      }
    });
  });
});
