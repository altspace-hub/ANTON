/**
 * atom-injection-gate-ratings.test.ts — the memory gate's 30 ratings can be
 * reached through normal use.
 *
 * 2026-09-22 Work QA: auto mode counted only retrieval_feedback ratings. Those
 * rows are written only when atoms are injected, and injection waited for the
 * 30 ratings — a closed loop. 482 rows, 0 ever rated; auto could never open.
 * The ratings people actually give sit on the answer: the Good output / Needs
 * work verdict and the rating form (output_feedback) and the five stars
 * (post_market_events, event_type 'quality_rating'). Those count now, next to
 * memory ratings.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { ATOM_INJECTION_GATE_SQL } from '../../server/services/atom-injection-gate.js';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';

describe('the ratings statement', () => {
  it('counts memory ratings, answer verdicts / rating-form rows and star ratings', () => {
    const sql = ATOM_INJECTION_GATE_SQL.ratings;
    expect(sql).toMatch(/FROM retrieval_feedback WHERE was_relevant IS NOT NULL/);
    expect(sql).toMatch(/FROM output_feedback/);
    expect(sql).toMatch(/FROM post_market_events WHERE event_type = 'quality_rating'/);
    expect(sql).toMatch(/AS c\b/);
  });
});

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

d('against PostgreSQL', () => {
  let db: DatabaseAdapter;
  const session = `s_gate_${randomUUID()}`;
  const feedbackId = `of_gate_${randomUUID()}`;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
  });

  afterAll(async () => {
    await db.run('DELETE FROM output_feedback WHERE id = ?', feedbackId);
    await db.run('DELETE FROM post_market_events WHERE session_id = ?', session);
    await db.close();
  });

  it('one answer verdict and one star rating raise the count by two', async () => {
    const count = async () => Number(((await db.get(ATOM_INJECTION_GATE_SQL.ratings)) as { c: number | string }).c);
    const before = await count();

    await db.run(
      `INSERT INTO output_feedback (id, session_id, module_id, rating, verdict) VALUES (?, ?, ?, ?, ?)`,
      feedbackId, session, 'green-claims-review', 5, 'good',
    );
    await db.run(
      `INSERT INTO post_market_events (user_id, session_id, module_id, event_type, quality_score, description)
       VALUES (?, ?, ?, 'quality_rating', 4, ?)`,
      'solo', session, 'green-claims-review', 'test rating',
    );

    expect(await count()).toBe(before + 2);
  });
});
