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
import { createMarketInvestigationService } from '../../server/services/market-investigation-service';
import { createWhyChainExecutor } from '../../server/services/market-why-chain-executor';
import { createMarketWorkflowOrchestrator } from '../../server/services/market-workflow-orchestrator';
import { createMarketIndexRebalanceService } from '../../server/services/market-index-rebalance-service';
import { createConditionalAccuracyService } from '../../server/services/market-conditional-accuracy-service';
import { createSchedulePhaseRecorder } from '../../server/services/market-schedule-recorder';
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
  /** Override the generated title — the deterministic claim parsers read it. */
  title?: string;
  /** Override the generated outcome — the parsers read this first. */
  predictedOutcome?: string;
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
    p.title ?? `Test prediction ${p.id}`,
    'integration-suite seed',
    p.predictionType ?? 'directional',
    p.symbol ?? null,
    p.predictedOutcome ?? 'test outcome',
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

    /**
     * 8. Brier was scored against gradedScore — the partial-credit curve
     * (1.0 / 0.7 / 0.3 / 0.0) — instead of the binary outcome. Every
     * forecast-to-outcome distance shrank, so a wrong call at 0.60 stored
     * (0.60-0.30)^2 = 0.09 rather than 0.36. Across the first 28 validated
     * predictions the reported average was 0.101 against a true 0.253, which
     * flipped "fractionally worse than a coin flip" into "2.5x better".
     *
     * The pre-existing v1/v2 cases could not catch it: both moved far enough
     * (+10%, +5%) to earn a FULL-credit 1.0/0.0, where graded and binary
     * scoring agree. The bug only shows on a sub-threshold move, which is
     * what these two cases seed.
     */
    it('scores Brier against the binary outcome, not the partial-credit grade', async () => {
      const verifier = await createPredictionVerifier(db);
      const created = daysAgoIso(6);

      // b1 — predicted UP, actual +0.8%: inside the ±1.5% flat band, so
      // wasCorrect stays true on direction but gradedScore is 0.7.
      // Brier must be (0.8 - 1)^2 = 0.04, NOT (0.8 - 0.7)^2 = 0.01.
      await seedPrediction(db, {
        id: 'b1', symbol: 'TSTP', direction: 'up', confidence: 0.8,
        deadline: daysAgoIso(1), createdAt: created,
      });
      await seedPrice(db, 'TSTP', utcDateStr(created), 100);
      await seedPrice(db, 'TSTP', utcDateStr(daysAgoIso(1)), 100.8);

      // b2 — predicted UP, actual -0.9%: wrong direction but a negligible
      // move, so gradedScore is 0.3. Brier must be (0.6 - 0)^2 = 0.36,
      // NOT (0.6 - 0.3)^2 = 0.09.
      await seedPrediction(db, {
        id: 'b2', symbol: 'TSTQ', direction: 'up', confidence: 0.6,
        deadline: daysAgoIso(1), createdAt: created,
      });
      await seedPrice(db, 'TSTQ', utcDateStr(created), 100);
      await seedPrice(db, 'TSTQ', utcDateStr(daysAgoIso(1)), 99.1);

      await verifier.runAutoVerification({ allowLLM: false });

      const b1 = await db.get<{ was_correct: number; brier_score: string; actual_outcome: string }>(
        `SELECT was_correct, brier_score, actual_outcome FROM market_predictions WHERE id = 'b1'`,
      );
      const b2 = await db.get<{ was_correct: number; brier_score: string }>(
        `SELECT was_correct, brier_score FROM market_predictions WHERE id = 'b2'`,
      );

      // Guard the guard: if these ever stop landing on partial credit the
      // assertions below pass vacuously against the old code too.
      expect(b1?.actual_outcome).toContain('0.8%');
      expect(b1?.was_correct).toBe(1);
      expect(b2?.was_correct).toBe(0);

      expect(Number(b1?.brier_score)).toBeCloseTo(0.04, 6);
      expect(Number(b2?.brier_score)).toBeCloseTo(0.36, 6);
    }, 25_000);

    /**
     * 14. On 2026-08-26 markets LLM work was found dead for 33 hours: atom
     * extraction, daily intelligence and the pulse had stopped after Monday's
     * 23:00 phase while grading and price fetching carried on, so nothing
     * looked broken from outside. The scheduler's only output was the
     * terminal, that scrollback had been cleared, and the restart that fixed
     * it destroyed the evidence. market_schedule_runs had existed since
     * migration 074 with exactly the right columns and had never been written
     * to.
     *
     * The distinction that was missing is 'hung' versus 'never fired' — a
     * stuck await and a dead cron are different bugs, and from the database
     * they looked identical. These cases pin all four states apart.
     */
    it('records each scheduler phase so a hang, a throw and a no-show look different', async () => {
      const { recordPhase } = createSchedulePhaseRecorder(db);

      // 1. A phase that completes.
      await recordPhase('ok-phase', async () => { /* did its work */ });

      // 2. A phase that throws. recordPhase must NOT rethrow — a throwing cron
      //    callback is an unhandled rejection, and the row already says what
      //    happened.
      await expect(
        recordPhase('throwing-phase', async () => { throw new Error('boom from the phase'); }),
      ).resolves.toBeUndefined();

      // 3. A phase still running: started, never closed. Left in flight
      //    deliberately — this is the signature Monday's outage would have had.
      let release: (() => void) | undefined;
      const hung = recordPhase('hung-phase', () => new Promise<void>((resolve) => { release = resolve; }));

      const rows = await db.all<{
        phase: string; status: string; completed_at: string | null; error: string | null;
      }>(`SELECT phase, status, completed_at, error FROM market_schedule_runs ORDER BY phase`);

      expect(rows.map((r) => r.phase)).toEqual(['hung-phase', 'ok-phase', 'throwing-phase']);

      const byPhase = Object.fromEntries(rows.map((r) => [r.phase, r]));
      expect(byPhase['ok-phase'].status).toBe('completed');
      expect(byPhase['ok-phase'].completed_at).not.toBeNull();
      expect(byPhase['ok-phase'].error).toBeNull();

      expect(byPhase['throwing-phase'].status).toBe('failed');
      expect(byPhase['throwing-phase'].completed_at).not.toBeNull();
      expect(byPhase['throwing-phase'].error).toContain('boom from the phase');

      // The whole point: a hang is visible as 'running' with no completion.
      expect(byPhase['hung-phase'].status).toBe('running');
      expect(byPhase['hung-phase'].completed_at).toBeNull();

      // 4. A phase that never fired leaves no row at all — distinguishable
      //    from the hung one, which was the missing signal.
      expect(rows.some((r) => r.phase === 'never-scheduled')).toBe(false);

      release?.();
      await hung;
      const after = await db.get<{ status: string }>(
        `SELECT status FROM market_schedule_runs WHERE phase = 'hung-phase'`,
      );
      expect(after?.status).toBe('completed');
    });

    it('never lets bookkeeping failure stop the phase it is observing', async () => {
      // A db double whose INSERT always fails: the phase must still run.
      const brokenDb = {
        get: async () => { throw new Error('table is gone'); },
        run: async () => { throw new Error('table is gone'); },
        all: async () => [],
      } as unknown as DatabaseAdapter;

      let ran = false;
      const { recordPhase } = createSchedulePhaseRecorder(brokenDb);
      await expect(recordPhase('resilient', async () => { ran = true; })).resolves.toBeUndefined();
      expect(ran).toBe(true);
    });

    /**
     * 13. findExpired selected on `deadline < NOW()`, so a prediction whose
     * deadline is TODAY became eligible at 00:01 — before that session had
     * closed and before its bar existed. The window it graded on therefore
     * ended short of the window the claim names: a band claim with a
     * 2026-08-24 deadline settled "held" from two closes ending 2026-08-21.
     * 15 rows had been graded that way.
     */
    it('does not grade a prediction whose deadline day is still in progress', async () => {
      const verifier = await createPredictionVerifier(db);
      const todayIso = new Date().toISOString();

      // Deadline TODAY: the session has not closed, so this must wait.
      await seedPrediction(db, {
        id: 'e_today', symbol: 'TSTY', direction: 'up', confidence: 0.6,
        deadline: todayIso, createdAt: daysAgoIso(5),
      });
      // Deadline YESTERDAY: that day is over, so this must be picked up.
      await seedPrediction(db, {
        id: 'e_yday', symbol: 'TSTZ', direction: 'up', confidence: 0.6,
        deadline: daysAgoIso(1), createdAt: daysAgoIso(5),
      });
      for (const sym of ['TSTY', 'TSTZ']) {
        await seedPrice(db, sym, utcDateStr(daysAgoIso(5)), 100);
        await seedPrice(db, sym, utcDateStr(daysAgoIso(1)), 110);
      }

      const expired = await verifier.findExpired();
      const ids = expired.map((e) => e.id);
      expect(ids).toContain('e_yday');
      expect(ids).not.toContain('e_today');
    });

    /**
     * 12. A band claim sat ungraded on 2026-08-24: "All SPY closes through
     * 2026-08-24 are between 745 and 790". It carried predicted_direction
     * 'flat', so a directional fallback would have graded "did SPY go
     * sideways" — a different question. One close outside the corridor breaks
     * the claim however the window ends, which is what these two cases pin.
     */
    it('settles a close-band claim on the whole window, not just its endpoints', async () => {
      const verifier = await createPredictionVerifier(db);
      const created = daysAgoIso(4);
      const end = daysAgoIso(1);

      // d1 — every close after creation stays inside 745-790: claim holds.
      await seedPrediction(db, {
        id: 'd1', predictionType: 'price_target', symbol: 'TSTV', direction: 'flat',
        predictedValue: null, confidence: 0.6, deadline: end, createdAt: created,
        title: 'TSTV has no daily close outside 745-790 through the window',
        predictedOutcome: 'All TSTV closes through the window are between 745 and 790',
      });
      await seedPrice(db, 'TSTV', utcDateStr(created), 700);   // creation day: ignored
      await seedPrice(db, 'TSTV', utcDateStr(daysAgoIso(2)), 760);
      await seedPrice(db, 'TSTV', utcDateStr(end), 785);

      // d2 — same band, but one session pokes above it and the window still
      // ENDS inside. Endpoint-only grading would call this correct.
      await seedPrediction(db, {
        id: 'd2', predictionType: 'price_target', symbol: 'TSTW', direction: 'flat',
        predictedValue: null, confidence: 0.6, deadline: end, createdAt: created,
        title: 'TSTW has no daily close outside 745-790 through the window',
        predictedOutcome: 'All TSTW closes through the window are between 745 and 790',
      });
      await seedPrice(db, 'TSTW', utcDateStr(created), 760);
      await seedPrice(db, 'TSTW', utcDateStr(daysAgoIso(2)), 812);  // the breach
      await seedPrice(db, 'TSTW', utcDateStr(end), 770);            // back inside

      const summary = await verifier.runAutoVerification({ allowLLM: false });
      expect(summary.deferred_llm).toBe(0);

      const rows = await db.all<{
        id: string; status: string; was_correct: number; actual_outcome: string; brier_score: string;
      }>(`SELECT id, status, was_correct, actual_outcome, brier_score
            FROM market_predictions WHERE id IN ('d1','d2') ORDER BY id`);
      expect(rows.map((r) => r.status)).toEqual(['validated', 'validated']);

      const [d1, d2] = rows;
      expect(d1.was_correct).toBe(1);
      expect(d1.actual_outcome).toContain('760.00-785.00');   // and NOT the 700 creation close
      expect(Number(d1.brier_score)).toBeCloseTo(0.16, 6);    // (0.6 - 1)^2

      expect(d2.was_correct).toBe(0);                          // the 812 breach decides it
      expect(d2.actual_outcome).toContain('812.00');
      expect(Number(d2.brier_score)).toBeCloseTo(0.36, 6);     // (0.6 - 0)^2
    }, 25_000);

    /**
     * 9. Three claim shapes that carry their threshold only in the text sat
     * ungraded for days, retried to the attempt cap:
     *   • price_target rows with predicted_value NULL ("SPY prints at least
     *     one daily close >= 663.00") failed as "Missing symbol or target
     *     value" — SPY price targets were never graded at all;
     *   • binary rows quantifying a cumulative return or a two-symbol spread
     *     went to the LLM, which correctly refused for lack of evidence,
     *     while the prices that settle them sat in this table.
     * None is a directional call: SPY can rise without printing 663, so a
     * directional fallback would record a confident wrong answer.
     */
    it('settles close-level, cumulative-return and spread claims from prices alone', async () => {
      const verifier = await createPredictionVerifier(db);
      const created = daysAgoIso(4);
      const end = daysAgoIso(1);

      // c1 — close-level claim on a price_target row with NO predicted_value.
      // Highest close after creation is 664 → never reaches 665 → not met.
      await seedPrediction(db, {
        id: 'c1', predictionType: 'price_target', symbol: 'TSTR', direction: 'up',
        predictedValue: null, confidence: 0.7, deadline: end, createdAt: created,
        title: 'TSTR closes above 665 within three sessions',
        predictedOutcome: 'TSTR prints at least one daily close >= 665.00',
      });
      await seedPrice(db, 'TSTR', utcDateStr(created), 700);   // creation day: ignored
      await seedPrice(db, 'TSTR', utcDateStr(daysAgoIso(2)), 660);
      await seedPrice(db, 'TSTR', utcDateStr(end), 664);

      // c2 — cumulative-return claim on a binary row: 100 → 100.9 is +0.9%,
      // which IS less than +1.5% → claim met.
      await seedPrediction(db, {
        id: 'c2', predictionType: 'binary', symbol: 'TSTS', direction: 'flat',
        confidence: 0.65, deadline: end, createdAt: created,
        title: 'TSTS does not rally more than 1.5% within three sessions',
        predictedOutcome: 'TSTS cumulative return is less than +1.5%',
      });
      await seedPrice(db, 'TSTS', utcDateStr(created), 100);
      await seedPrice(db, 'TSTS', utcDateStr(end), 100.9);

      // c3 — spread claim: TSTT +4% minus TSTU +1% = +3.0pp, which is NOT
      // < +2.0pp → claim not met.
      await seedPrediction(db, {
        id: 'c3', predictionType: 'binary', symbol: 'TSTT', direction: 'flat',
        confidence: 0.55, deadline: end, createdAt: created,
        title: 'TSTT does not outperform TSTU by more than 2% over three days',
        predictedOutcome: 'TSTT minus TSTU 3-day cumulative return < +2.0 percentage points',
      });
      await seedPrice(db, 'TSTT', utcDateStr(created), 100);
      await seedPrice(db, 'TSTT', utcDateStr(end), 104);
      await seedPrice(db, 'TSTU', utcDateStr(created), 200);
      await seedPrice(db, 'TSTU', utcDateStr(end), 202);

      // allowLLM:false is the point — every one of these must settle on the
      // free deterministic path. Anything deferred here proves it did not.
      const summary = await verifier.runAutoVerification({ allowLLM: false });
      expect(summary.deferred_llm).toBe(0);

      const rows = await db.all<{
        id: string; status: string; was_correct: number;
        brier_score: string; actual_outcome: string;
      }>(`SELECT id, status, was_correct, brier_score, actual_outcome
            FROM market_predictions WHERE id IN ('c1','c2','c3') ORDER BY id`);
      expect(rows.map((r) => r.status)).toEqual(['validated', 'validated', 'validated']);

      const [c1, c2, c3] = rows;
      expect(c1.was_correct).toBe(0);                    // 664 never reached 665
      expect(c1.actual_outcome).toContain('664.00');     // and NOT the 700 creation-day close
      expect(Number(c1.brier_score)).toBeCloseTo(0.49, 6);

      expect(c2.was_correct).toBe(1);                    // +0.9% < +1.5%
      expect(c2.actual_outcome).toContain('+0.90%');

      expect(c3.was_correct).toBe(0);                    // +3.0pp is not < +2.0pp
      expect(c3.actual_outcome).toContain('+3.00pp');
    }, 25_000);
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

    /**
     * 10. The pending count treated every past-deadline non-'validated' row as
     * outstanding work, including 145 'expired_legacy' and 49 'archived' rows
     * the verifier can never pick up again (findExpired selects only 'active'
     * and 'expired'). That reported 287 pending against a system with nothing
     * actually stuck — enough permanent noise to bury the one row that is.
     */
    it('counts only genuinely retriable predictions as pending, not closed legacy rows', async () => {
      await seedWorkflowRun(db, { id: 'wr_t', status: 'completed', startedAt: daysAgoIso(1) });
      await seedPrediction(db, {
        id: 't_val', status: 'validated', deadline: daysAgoIso(2), createdAt: daysAgoIso(10),
        wasCorrect: 1, validatedAt: daysAgoIso(1), symbol: 'TSTA',
      });
      // Closed for good — past deadline, ungraded, never retriable.
      for (const [id, status] of [
        ['t_leg', 'expired_legacy'], ['t_arch', 'archived'],
        ['t_vleg', 'validated_legacy'], ['t_can', 'cancelled'],
      ] as const) {
        await seedPrediction(db, {
          id, status, deadline: daysAgoIso(30), createdAt: daysAgoIso(60), symbol: 'TSTA',
        });
      }

      const quiet = byLoop(await checkMarketsLoopHealth(db, { windowDays: 7 }), 'prediction_validation');
      expect(quiet.pending).toBe(0);
      expect(quiet.stale).toBe(false);

      // A real stuck row — 'expired', under the attempt cap — must still count,
      // otherwise the exclusion has silenced the alarm rather than cleaned it.
      await seedPrediction(db, {
        id: 't_stuck', status: 'expired', deadline: daysAgoIso(3), createdAt: daysAgoIso(10),
        symbol: 'TSTA', attempts: 1,
      });
      const loud = byLoop(await checkMarketsLoopHealth(db, { windowDays: 7 }), 'prediction_validation');
      expect(loud.pending).toBe(1);
    });

    /**
     * 11. The conditional-accuracy roll-up re-scans "validated in the last 7
     * days" on every run and incremented `total` each time, with nothing
     * recording that a prediction had already been counted. A daily workflow
     * would therefore count the same outcome up to seven times, inflating the
     * sample and dragging accuracy toward whatever the most-rescanned rows
     * said — silently, since the table is only read through a >= 3
     * observation filter that the inflation itself would satisfy.
     */
    it('counts each validated prediction into conditional accuracy exactly once', async () => {
      const cond = await createConditionalAccuracyService(db);
      await seedPrediction(db, {
        id: 'ca1', status: 'validated', deadline: daysAgoIso(2), createdAt: daysAgoIso(9),
        symbol: 'TSTA', wasCorrect: 1, validatedAt: daysAgoIso(1), confidence: 0.6,
      });
      await cond.capturePredictionFeatures(
        'ca1', { signal_type: 'weekly_pulse', direction: 'up' } as never, false,
      );

      // The roll-up loop, run three times over the same window.
      for (let i = 0; i < 3; i++) {
        await cond.updateConditionalAccuracy('ca1', true, 0.16, false);
      }

      const rows = await db.all<{ feature_key: string; total: string; correct: string }>(
        `SELECT feature_key, total, correct FROM market_conditional_accuracy
          WHERE scope = 'live' ORDER BY feature_key`,
      );
      expect(rows.map((r) => r.feature_key)).toEqual(['direction', 'signal_type']);
      for (const r of rows) {
        expect(Number(r.total), `${r.feature_key} total`).toBe(1);
        expect(Number(r.correct), `${r.feature_key} correct`).toBe(1);
      }

      // A DIFFERENT prediction must still be counted — the guard is per-row,
      // not a latch that stops the loop after the first ever prediction.
      await seedPrediction(db, {
        id: 'ca2', status: 'validated', deadline: daysAgoIso(2), createdAt: daysAgoIso(9),
        symbol: 'TSTB', wasCorrect: 0, validatedAt: daysAgoIso(1), confidence: 0.6,
      });
      await cond.capturePredictionFeatures(
        'ca2', { signal_type: 'weekly_pulse', direction: 'down' } as never, false,
      );
      await cond.updateConditionalAccuracy('ca2', false, 0.36, false);

      const after = await db.get<{ total: string; correct: string }>(
        `SELECT total, correct FROM market_conditional_accuracy
          WHERE scope = 'live' AND feature_key = 'signal_type' AND feature_value = 'weekly_pulse'`,
      );
      expect(Number(after?.total)).toBe(2);
      expect(Number(after?.correct)).toBe(1);
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

  // ── 10. Investigations + why-chains ──────────────────────────────────────

  describe('auto-dispatch (investigations + why-chains)', () => {
    /**
     * The dispatch step scans EVERY validated prediction on every run, not just
     * the ones validated in that run. Creation therefore has to be idempotent
     * or the queue refills faster than it drains: by 2026-05-02, 21 anomalous
     * predictions had produced 1,419 investigations — 67.6 copies each, one
     * prediction re-investigated 84 times — and 1,051 why-chains, each of which
     * is a paid LLM job. createChain already guarded against this; investigation
     * creation did not.
     */
    it('returns the existing investigation instead of creating a duplicate', async () => {
      const svc = await createMarketInvestigationService(db);
      const args = {
        triggerType: 'unexpected_failure', triggerReference: 'mpred_x',
        title: 'Auto-investigation', question: 'Why did it fail?',
      };

      const first = await svc.createInvestigation(args);
      const second = await svc.createInvestigation(args);
      const third = await svc.createInvestigation({ ...args, title: 'Different title' });

      expect(second).toBe(first);
      expect(third).toBe(first);   // keyed on trigger, not on wording
      const rows = await db.all(`SELECT id FROM market_investigation_tasks WHERE trigger_reference = 'mpred_x'`);
      expect(rows).toHaveLength(1);
    });

    it('still creates unkeyed investigations every time', async () => {
      const svc = await createMarketInvestigationService(db);
      const a = await svc.createInvestigation({ triggerType: 'manual', title: 't', question: 'q' });
      const b = await svc.createInvestigation({ triggerType: 'manual', title: 't', question: 'q' });
      expect(b).not.toBe(a);   // no trigger_reference → nothing to dedupe on
    });

    it('reaps a stalled chain from its existing levels without calling the model', async () => {
      // A chain whose levels were written but which never reached completeChain
      // is invisible to the pending query (num_levels > 0) and stays
      // 'in_progress' forever, holding LLM work already paid for.
      await db.run(
        `INSERT INTO market_why_chains (id, title, prediction_id, num_levels, status)
         VALUES ('mwhy_stalled', 'Why-chain: stalled', 'mpred_s', 5, 'in_progress')`);
      await db.run(
        `INSERT INTO market_why_chain_levels (chain_id, level_number, question, answer, key_insight)
         VALUES ('mwhy_stalled', 1, 'q1', 'a1', 'first insight'),
                ('mwhy_stalled', 2, 'q2', 'a2', 'second insight')`);

      const executor = await createWhyChainExecutor(db);
      const r = await executor.executeAllPending();

      expect(r.reaped).toBe(1);
      const row = await db.get<{ status: string; root_cause_type: string; root_cause_summary: string }>(
        `SELECT status, root_cause_type, root_cause_summary FROM market_why_chains WHERE id = 'mwhy_stalled'`);
      expect(row?.status).toBe('completed');
      expect(row?.root_cause_type).toBe('inconclusive');
      expect(row?.root_cause_summary).toContain('first insight');
    });

    it('dispatches and reaps without the model when the LLM tier is off', async () => {
      // The free half must not be hostage to the paid half: dispatch is pure DB
      // work and reaping reads levels already on disk, so both run under any
      // spending tier. Only fresh chains wait for a run that may spend.
      await seedPrediction(db, {
        id: 'p_anom', symbol: 'SPY', direction: 'up', confidence: 0.55,
        status: 'validated', wasCorrect: 0, createdAt: daysAgoIso(20),
      });
      await db.run(`UPDATE market_predictions SET brier_score = 0.30 WHERE id = 'p_anom'`);
      await db.run(
        `INSERT INTO market_why_chains (id, title, prediction_id, num_levels, status)
         VALUES ('mwhy_st', 'stalled', 'mpred_st', 3, 'in_progress')`);
      await db.run(
        `INSERT INTO market_why_chain_levels (chain_id, level_number, question, answer, key_insight)
         VALUES ('mwhy_st', 1, 'q', 'a', 'insight')`);

      // The sweep touches neither service; stubs keep the factory happy.
      const orch = await createMarketWorkflowOrchestrator(
        db,
        {} as never,   // computation service — unused by runInvestigationSweep
        {} as never,   // data service — likewise
      );
      const r = await orch.runInvestigationSweep({ allowLLM: false });

      expect(r.llmSkipped).toBe(true);
      expect(r.chainsExecuted).toBe(0);        // no model call
      expect(r.chainsReaped).toBe(1);          // but the stalled chain is freed
      expect(r.dispatched).toBe(1);            // brier 0.30 >= 0.25 anomaly gate
      const inv = await db.all(`SELECT id FROM market_investigation_tasks WHERE trigger_reference = 'p_anom'`);
      expect(inv).toHaveLength(1);

      // A re-scan must report no NEW work. createInvestigation returns the
      // existing row, so counting its return value would claim activity every
      // single day for an anomaly investigated once.
      const again = await orch.runInvestigationSweep({ allowLLM: false });
      expect(again.dispatched).toBe(0);
      expect(again.matched).toBe(1);
      const invAgain = await db.all(`SELECT id FROM market_investigation_tasks WHERE trigger_reference = 'p_anom'`);
      expect(invAgain).toHaveLength(1);
    });

    it('leaves untouched chains pending rather than reaping them', async () => {
      await db.run(
        `INSERT INTO market_why_chains (id, title, prediction_id, num_levels, status)
         VALUES ('mwhy_fresh', 'Why-chain: fresh', 'mpred_f', 0, 'in_progress')`);

      const executor = await createWhyChainExecutor(db);
      const r = await executor.executeAllPending();

      // num_levels = 0 → real work still to do, not a reap candidate.
      expect(r.reaped).toBe(0);
      const row = await db.get<{ status: string }>(
        `SELECT status FROM market_why_chains WHERE id = 'mwhy_fresh'`);
      expect(row?.status).toBe('in_progress');
    });
  });

  // ── 11. Shadow rebalance ─────────────────────────────────────────────────

  describe('shadow rebalance (market-index-rebalance-service)', () => {
    /**
     * Live rebalancing has been paused since 2026-04-27, so predictions have
     * had no route to the portfolio and attribution has one data point. Shadow
     * mode reopens the measurement without committing holdings — but only if it
     * genuinely commits nothing.
     */
    beforeEach(async () => {
      await db.run(
        `INSERT INTO market_indexes (id, name, status, current_nav, rebalance_frequency)
         VALUES ('idx_s', 'Shadow Test', 'active', 1000, 'monthly')`);
      // Weights must be OFF their target or every change is 'hold' and the
      // proposal is empty — which would make every assertion below vacuous.
      // 'equal' weighting over two holdings targets 0.5/0.5, so 0.8/0.2 drifts
      // well past the 2% tolerance in both directions.
      await db.run(
        `INSERT INTO market_index_holdings (index_id, symbol, weight, shares, entry_price, current_price)
         VALUES ('idx_s', 'AAPL', 0.8, 16, 100, 100), ('idx_s', 'MSFT', 0.2, 4, 100, 100)`);
    });

    it('produces a non-empty proposal for a drifted index', async () => {
      // Guards the guard: if this returns nothing, every invariant below passes
      // for the wrong reason.
      const svc = await createMarketIndexRebalanceService(db);
      const r = await svc.runShadowRebalances();
      expect(r.checked).toBeGreaterThan(0);
      expect(r.proposed.length).toBeGreaterThan(0);
      expect(r.proposed[0].trades).toBeGreaterThan(0);
    });

    it('records a proposal without moving a single holding', async () => {
      const before = await db.all<{ symbol: string; weight: string; removed_at: string | null }>(
        `SELECT symbol, weight, removed_at FROM market_index_holdings WHERE index_id = 'idx_s' ORDER BY symbol`);

      const svc = await createMarketIndexRebalanceService(db);
      await svc.runShadowRebalances();

      const after = await db.all<{ symbol: string; weight: string; removed_at: string | null }>(
        `SELECT symbol, weight, removed_at FROM market_index_holdings WHERE index_id = 'idx_s' ORDER BY symbol`);
      expect(after).toEqual(before);
    });

    it('never stamps last_rebalance_at, which gates the live path', async () => {
      const svc = await createMarketIndexRebalanceService(db);
      await svc.runShadowRebalances();

      const idx = await db.get<{ last_rebalance_at: string | null }>(
        `SELECT last_rebalance_at FROM market_indexes WHERE id = 'idx_s'`);
      // A shadow run writing this would silently suppress the real rebalance
      // it is supposed to be rehearsing.
      expect(idx?.last_rebalance_at).toBeNull();
    });

    it('marks its rows shadow so they are not read as executed performance', async () => {
      const svc = await createMarketIndexRebalanceService(db);
      await svc.runShadowRebalances();

      const rows = await db.all<{ trigger_type: string; rebalance_type: string; pre_holdings: string; post_holdings: string }>(
        `SELECT trigger_type, rebalance_type, pre_holdings, post_holdings
           FROM market_index_rebalances WHERE index_id = 'idx_s'`);
      for (const r of rows) {
        expect(r.trigger_type).toBe('shadow');
        expect(r.pre_holdings).toEqual(r.post_holdings);   // nothing moved
      }
    });

    it('keeps shadow contribution out of the executed total', async () => {
      // Attribution rows are only written for symbols that have live
      // predictions — without these the shadow run records nothing to leak and
      // the assertions below would pass for the wrong reason.
      await seedPrediction(db, {
        id: 'p_sh1', symbol: 'AAPL', direction: 'up', confidence: 0.6,
        deadline: new Date(Date.now() + 10 * DAY_MS).toISOString(),
      });
      await seedPrediction(db, {
        id: 'p_sh2', symbol: 'MSFT', direction: 'down', confidence: 0.6,
        deadline: new Date(Date.now() + 10 * DAY_MS).toISOString(),
      });

      const svc = await createMarketIndexRebalanceService(db);
      await svc.runShadowRebalances();

      const attrRows = await db.all<{ id: number }>(
        `SELECT a.id FROM market_prediction_attribution a
           JOIN market_index_rebalances r ON r.id = a.rebalance_id
          WHERE r.trigger_type = 'shadow'`);
      expect(attrRows.length, 'shadow attribution must exist for this to test anything').toBeGreaterThan(0);

      // Give it a computed pnl so it WOULD surface if the summary failed to
      // separate rehearsals from executed trades.
      await db.run(
        `UPDATE market_prediction_attribution SET subsequent_return = 0.1, attribution_pnl = 0.01, computed_at = NOW()
          WHERE rebalance_id IN (SELECT id FROM market_index_rebalances WHERE trigger_type = 'shadow')`);

      const attr = await createMarketPredictionAttributionService(db);
      const summary = await attr.getAttributionSummary();

      expect(summary.totals.shadowPositions).toBeGreaterThan(0);   // counted, but apart
      expect(summary.totals.distinctPositions).toBe(0);            // executed: none
      expect(summary.totals.totalPnlPct).toBe(0);
      expect(summary.positions.filter(p => p.shadow).length).toBe(summary.totals.shadowPositions);
    });
  });
});
