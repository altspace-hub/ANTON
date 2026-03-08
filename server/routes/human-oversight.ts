/**
 * human-oversight.ts
 * EUAI-02: Human oversight sign-off workflow for high-risk FCP modules.
 *
 * Modules requiring mandatory human review before export:
 *   - gap-analysis
 *   - sanctions-advisory
 *   - investigation-support
 *
 * Endpoints:
 *   POST /api/oversight/reviews          — record a human review sign-off
 *   GET  /api/oversight/reviews          — list reviews (filterable by session_id, module_id)
 *   GET  /api/oversight/sessions/:id/review — get latest review for a session
 *   GET  /api/oversight/modules          — list modules that require oversight
 */

import express from 'express';
import type { Database } from 'better-sqlite3';

/** Modules that require mandatory human review before export (EU AI Act Art. 14 scope) */
export const OVERSIGHT_REQUIRED_MODULES = [
  'gap-analysis',
  'sanctions-advisory',
  'investigation-support',
] as const;

export type OversightRequiredModule = typeof OVERSIGHT_REQUIRED_MODULES[number];

function getUserId(req: unknown): string {
  return (req as { user?: { id?: string } }).user?.id ?? 'default';
}

export function createHumanOversightRoutes(db: Database) {
  const router = express.Router();

  /** GET /oversight/modules — list modules requiring human oversight */
  router.get('/oversight/modules', (_req, res) => {
    res.json({
      modules: OVERSIGHT_REQUIRED_MODULES,
      rationale: 'These modules produce compliance outputs that may materially affect regulated entities. EU AI Act Art. 14 requires human oversight before export.',
    });
  });

  /** POST /oversight/reviews — record a human review sign-off */
  router.post('/oversight/reviews', (req, res) => {
    try {
      const userId = getUserId(req);
      const { session_id, module_id, reviewer_name, reviewer_role, verdict, notes } = req.body as {
        session_id?: string;
        module_id?: string;
        reviewer_name?: string;
        reviewer_role?: string;
        verdict?: string;
        notes?: string;
      };

      if (!session_id || !module_id || !reviewer_name || !verdict) {
        return res.status(400).json({ error: 'session_id, module_id, reviewer_name, and verdict are required' });
      }

      if (!['approved', 'requires_amendment', 'rejected'].includes(verdict)) {
        return res.status(400).json({ error: 'verdict must be approved | requires_amendment | rejected' });
      }

      if (reviewer_name.length > 200) {
        return res.status(400).json({ error: 'reviewer_name too long (max 200 chars)' });
      }
      if (notes && notes.length > 2000) {
        return res.status(400).json({ error: 'notes too long (max 2000 chars)' });
      }

      const attestation = `I, ${reviewer_name.trim()}, confirm that I have reviewed the AI-generated analysis produced by openEXPERT for session ${session_id}. I understand that this output is AI-assisted and does not constitute legal or regulatory advice. I take professional responsibility for any compliance decisions made based on this analysis.`;

      const result = db.prepare(`
        INSERT INTO human_oversight_reviews
          (session_id, module_id, user_id, reviewer_name, reviewer_role, attestation, verdict, notes, export_blocked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        session_id,
        module_id,
        userId,
        reviewer_name.trim(),
        reviewer_role?.trim() ?? null,
        attestation,
        verdict,
        notes?.trim() ?? null,
        verdict === 'rejected' ? 1 : 0,
      );

      const review = db.prepare('SELECT * FROM human_oversight_reviews WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ review });
    } catch (err) {
      console.error('[oversight] POST /oversight/reviews error:', err);
      res.status(500).json({ error: 'Failed to record review' });
    }
  });

  /** GET /oversight/reviews — list reviews for current user, optionally filtered */
  router.get('/oversight/reviews', (req, res) => {
    try {
      const userId = getUserId(req);
      const { session_id, module_id, limit: limitStr } = req.query as Record<string, string | undefined>;
      const limit = Math.min(parseInt(limitStr ?? '50', 10) || 50, 200);

      let sql = 'SELECT * FROM human_oversight_reviews WHERE user_id = ?';
      const params: unknown[] = [userId];

      if (session_id) {
        sql += ' AND session_id = ?';
        params.push(session_id);
      }
      if (module_id) {
        sql += ' AND module_id = ?';
        params.push(module_id);
      }

      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const reviews = db.prepare(sql).all(...params);
      res.json({ reviews });
    } catch (err) {
      console.error('[oversight] GET /oversight/reviews error:', err);
      res.status(500).json({ error: 'Failed to fetch reviews' });
    }
  });

  /** GET /oversight/sessions/:sessionId/review — latest review for a session */
  router.get('/oversight/sessions/:sessionId/review', (req, res) => {
    try {
      const userId = getUserId(req);
      const { sessionId } = req.params;

      const review = db.prepare(`
        SELECT * FROM human_oversight_reviews
        WHERE session_id = ? AND user_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(sessionId, userId);

      res.json({ review: review ?? null });
    } catch (err) {
      console.error('[oversight] GET session review error:', err);
      res.status(500).json({ error: 'Failed to fetch session review' });
    }
  });

  return router;
}
