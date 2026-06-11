/**
 * atom-ab.test.ts — Wave 3.4 atom-layer A/B experiment
 * (CORE_EXPERIENCE_REVIEW 2026-06).
 *
 *  - assignAtomArm: deterministic (no Math.random), ~20% holdout.
 *  - isAtomAbEnabled / setAtomAbEnabled: app_settings switch, default ON.
 *  - audit tagging: writeAuditEntry persists audit_log.atom_arm (migration 226).
 *  - getAtomAbStats: per-arm run counts + quality means; mixed-arm sessions
 *    excluded from quality attribution; honest insufficient-data state.
 *
 * DB-backed parts require DATABASE_URL (env or .env) + migration 226;
 * skipped otherwise. Stats assertions are RELATIVE to a pre-seed baseline so
 * the suite stays green on a live DB that already carries tagged runs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import { assignAtomArm, MIN_SCORED_PER_ARM, ATOM_AB_SETTING_KEY } from '../../server/services/atom-ab.js';

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

// ── Pure: deterministic arm assignment ──────────────────────────────────────

describe('assignAtomArm (deterministic A/B unit)', () => {
  it('is deterministic — the same id always lands in the same arm', () => {
    for (let i = 0; i < 50; i++) {
      const id = `fixed-id-${i}`;
      expect(assignAtomArm(id)).toBe(assignAtomArm(id));
    }
  });

  it('assigns ~20% of ids to the holdout arm (both arms occur)', () => {
    const N = 2000;
    let holdout = 0;
    for (let i = 0; i < N; i++) {
      if (assignAtomArm(`message-${i}`) === 'holdout') holdout++;
    }
    const fraction = holdout / N;
    expect(fraction).toBeGreaterThan(0.14);
    expect(fraction).toBeLessThan(0.26);
  });

  it('returns only the two valid arms', () => {
    const arms = new Set([assignAtomArm('a'), assignAtomArm('b'), assignAtomArm('c'), assignAtomArm(randomUUID())]);
    for (const arm of arms) expect(['injected', 'holdout']).toContain(arm);
  });
});

// ── DB-backed: setting, audit tagging, aggregation ──────────────────────────

describeOrSkip('atom A/B experiment (DB)', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let atomAb: typeof import('../../server/services/atom-ab.js');
  let auditLogger: typeof import('../../server/services/auditLogger.js');

  // Sessions seeded by this run (cleaned up in afterAll).
  const sessInjectedA = randomUUID();
  const sessInjectedB = randomUUID();
  const sessHoldout = randomUUID();
  const sessMixed = randomUUID();
  const qualityIds: string[] = [];
  let savedSetting: string | null = null;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    atomAb = await import('../../server/services/atom-ab.js');
    auditLogger = await import('../../server/services/auditLogger.js');

    // Preserve the operator's current experiment setting.
    const row = await db.get('SELECT value FROM app_settings WHERE key = ?', ATOM_AB_SETTING_KEY) as { value: string } | undefined;
    savedSetting = row?.value ?? null;
  }, 30_000);

  afterAll(async () => {
    try {
      await db.run('DELETE FROM audit_log WHERE session_id IN (?, ?, ?, ?)', sessInjectedA, sessInjectedB, sessHoldout, sessMixed);
      await db.run('DELETE FROM quality_scores WHERE session_id IN (?, ?, ?, ?)', sessInjectedA, sessInjectedB, sessHoldout, sessMixed);
      if (savedSetting === null) {
        await db.run('DELETE FROM app_settings WHERE key = ?', ATOM_AB_SETTING_KEY);
      } else {
        await db.run(
          `INSERT INTO app_settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          ATOM_AB_SETTING_KEY, savedSetting);
      }
    } finally {
      await db.close();
    }
  });

  it('defaults ON when no app_setting exists; toggles via setAtomAbEnabled', async () => {
    await db.run('DELETE FROM app_settings WHERE key = ?', ATOM_AB_SETTING_KEY);
    expect(await atomAb.isAtomAbEnabled(db)).toBe(true);

    await atomAb.setAtomAbEnabled(db, false);
    expect(await atomAb.isAtomAbEnabled(db)).toBe(false);

    await atomAb.setAtomAbEnabled(db, true);
    expect(await atomAb.isAtomAbEnabled(db)).toBe(true);
  });

  it('writeAuditEntry persists the atom_arm tag (migration 226)', async () => {
    const id = await auditLogger.writeAuditEntry(db, {
      sessionId: sessHoldout,
      model: 'claude-opus-4-8',
      atomArm: 'holdout',
    });
    const row = await db.get('SELECT atom_arm FROM audit_log WHERE id = ?', id) as { atom_arm: string | null };
    expect(row.atom_arm).toBe('holdout');
  });

  it('aggregates quality per arm, excluding mixed-arm sessions', async () => {
    const before = await atomAb.getAtomAbStats(db);
    const sumOf = (arm: { scored: number; meanQuality: number | null }) =>
      (arm.meanQuality ?? 0) * arm.scored;

    // Seed: two injected sessions (scores 8 + 6), one holdout (score 5),
    // one MIXED session (one run per arm, score 9 — must be excluded from
    // quality attribution but counted in run totals).
    await auditLogger.writeAuditEntry(db, { sessionId: sessInjectedA, model: 'claude-opus-4-8', atomArm: 'injected' });
    await auditLogger.writeAuditEntry(db, { sessionId: sessInjectedB, model: 'claude-opus-4-8', atomArm: 'injected' });
    // sessHoldout gets a fresh entry HERE (the previous test's entry is already
    // in the `before` baseline, so it cancels out of every delta below).
    await auditLogger.writeAuditEntry(db, { sessionId: sessHoldout, model: 'claude-opus-4-8', atomArm: 'holdout' });
    await auditLogger.writeAuditEntry(db, { sessionId: sessMixed, model: 'claude-opus-4-8', atomArm: 'injected' });
    await auditLogger.writeAuditEntry(db, { sessionId: sessMixed, model: 'claude-opus-4-8', atomArm: 'holdout' });

    const seedScore = async (sessionId: string, score: number) => {
      const id = `qs_test_${randomUUID().slice(0, 8)}`;
      qualityIds.push(id);
      await db.run(
        `INSERT INTO quality_scores (id, session_id, module_id, content_hash, score_overall)
         VALUES (?, ?, 'gap-analysis', ?, ?)`,
        id, sessionId, randomUUID().slice(0, 16), score);
    };
    await seedScore(sessInjectedA, 8);
    await seedScore(sessInjectedB, 6);
    await seedScore(sessHoldout, 5);
    await seedScore(sessMixed, 9);

    const after = await atomAb.getAtomAbStats(db);

    // Run counts: +3 injected (A, B, mixed), +2 holdout (holdout sess + mixed).
    expect(after.arms.injected.runs - before.arms.injected.runs).toBe(3);
    expect(after.arms.holdout.runs - before.arms.holdout.runs).toBe(2);

    // Quality attribution: +2 scored injected outputs summing 14, +1 holdout
    // summing 5. The mixed session's score (9) must appear in NEITHER arm.
    expect(after.arms.injected.scored - before.arms.injected.scored).toBe(2);
    expect(after.arms.holdout.scored - before.arms.holdout.scored).toBe(1);
    expect(sumOf(after.arms.injected) - sumOf(before.arms.injected)).toBeCloseTo(14, 5);
    expect(sumOf(after.arms.holdout) - sumOf(before.arms.holdout)).toBeCloseTo(5, 5);

    // Honest threshold is exported and respected in the shape.
    expect(after.minPerArm).toBe(MIN_SCORED_PER_ARM);
    if (after.arms.injected.scored < MIN_SCORED_PER_ARM || after.arms.holdout.scored < MIN_SCORED_PER_ARM) {
      expect(after.sufficient).toBe(false);
    }
    // Means present on both arms → delta is published as a number.
    expect(after.delta).not.toBeNull();
    expect(after.enabled).toBe(true);
  });
});
