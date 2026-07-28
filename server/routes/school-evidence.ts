/**
 * routes/school-evidence.ts — School Evidence Log + Curriculum Registry REST surface.
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §E.3.
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import { scopesToOwner, type OwnedRequest } from '../middleware/ownership.js';

export function createSchoolEvidenceRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  // ── Evidence log ───────────────────────────────────────────────────
  router.get('/evidence', async (req, res) => {
    try {
      const requested = typeof req.query.studentId === 'string' ? req.query.studentId : null;

      /**
       * SECURITY (2026-07-27 survey): this returned EVERY pupil's rows when
       * `studentId` was omitted — AI assessment summaries and teacher notes for the
       * whole school, to any authenticated caller. These are children's records, so
       * the failure is a safeguarding one, not merely a permissions one.
       *
       * On a shared instance a non-admin may only read their OWN evidence: an
       * explicit studentId is honoured only when it is theirs, and an omitted one
       * resolves to themselves rather than to everybody. Solo and admin are
       * unscoped, matching every other ownership check in the codebase.
       *
       * NOTE for whoever builds teacher oversight: there is deliberately no
       * teacher-sees-their-class path here, because no adult role exists in the
       * schema yet to authorise one. Scoping to self is the safe interim; widening
       * it needs a real guardian/teacher relation, not a role string.
       */
      const scoped = scopesToOwner(req as OwnedRequest);
      const selfId = (req as OwnedRequest).user?.id ?? null;
      const studentId = scoped ? selfId : requested;

      if (scoped && requested && requested !== selfId) {
        // Same shape as "no rows" — do not confirm another pupil exists.
        res.json({ entries: [] });
        return;
      }

      const where = studentId ? 'WHERE student_user_id = $1 AND deleted_at IS NULL' : 'WHERE deleted_at IS NULL';
      const args = studentId ? [studentId] : [];
      const rows = await db.all(
        `SELECT id, student_user_id, evidence_type, subject, learning_objective_id,
                ai_assessment_summary, guardian_visible, teacher_notes,
                study_pack_bundle_ref, attachments, created_at
           FROM learning_evidence_log
           ${where}
           ORDER BY created_at DESC
           LIMIT 200`,
        ...args
      );

      // teacher_notes and ai_assessment_summary are ADULT-FACING. A teacher writing
      // "struggling, suspect dyslexia — raising with SENCO" is writing about the child,
      // not to them, and this endpoint was handing it straight back to the pupil whose
      // own record it is. Withheld from the scoped (pupil) read; an admin or solo
      // operator still sees the full row.
      const entries = scoped
        ? rows.map((r) => {
            const { teacher_notes: _tn, ai_assessment_summary: _ai, ...visible } =
              r as Record<string, unknown>;
            return visible;
          })
        : rows;

      res.json({ entries });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/evidence', async (req, res) => {
    try {
      const b = req.body ?? {};
      if (!b.student_user_id || !b.evidence_type) {
        res.status(400).json({ error: 'student_user_id and evidence_type required' });
        return;
      }

      // The write-side mirror of the read fix above: student_user_id came straight
      // from the request body, so any authenticated pupil could fabricate assessment
      // records — including teacher_notes — against another pupil's name. On a shared
      // instance a non-admin may only write evidence for themselves. Solo and admin
      // are unrestricted (imports and seeding legitimately write for others).
      if (scopesToOwner(req as OwnedRequest)) {
        const selfId = (req as OwnedRequest).user?.id;
        if (!selfId || b.student_user_id !== selfId) {
          res.status(403).json({ error: 'Cannot record evidence for another student' });
          return;
        }
      }

      const id = randomUUID();
      await db.run(
        `INSERT INTO learning_evidence_log (
           id, student_user_id, evidence_type, subject, learning_objective_id,
           ai_assessment_summary, guardian_visible, teacher_notes,
           study_pack_bundle_ref, attachments
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        b.student_user_id,
        b.evidence_type,
        b.subject ?? null,
        b.learning_objective_id ?? null,
        b.ai_assessment_summary ?? null,
        b.guardian_visible !== false,
        b.teacher_notes ?? null,
        b.study_pack_bundle_ref ?? null,
        b.attachments ? JSON.stringify(b.attachments) : null
      );
      res.json({ id, ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Curriculum registry ────────────────────────────────────────────
  router.get('/curriculum', async (_req, res) => {
    try {
      const rows = await db.all(
        `SELECT id, country_code, jurisdiction, subject, year_level,
                learning_objective_code, learning_objective_text, source_url,
                last_verified_at, is_active
           FROM curriculum_registry
           ORDER BY country_code, subject, year_level, learning_objective_code`
      );
      res.json({ entries: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/curriculum', async (req, res) => {
    try {
      const b = req.body ?? {};
      const required = ['country_code', 'subject', 'year_level', 'learning_objective_code', 'learning_objective_text'];
      const missing = required.filter(k => !b[k]);
      if (missing.length) {
        res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
        return;
      }
      const id = b.id ?? randomUUID();
      await db.run(
        `INSERT INTO curriculum_registry (
           id, country_code, jurisdiction, subject, year_level,
           learning_objective_code, learning_objective_text, source_url, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (country_code, jurisdiction, subject, year_level, learning_objective_code) DO NOTHING`,
        id,
        b.country_code, b.jurisdiction ?? null,
        b.subject, b.year_level,
        b.learning_objective_code, b.learning_objective_text,
        b.source_url ?? null,
        b.is_active !== false
      );
      res.json({ id, ok: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
