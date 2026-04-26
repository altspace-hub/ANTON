/**
 * routes/school-evidence.ts — School Evidence Log + Curriculum Registry REST surface.
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §E.3.
 */

import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';

export function createSchoolEvidenceRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  // ── Evidence log ───────────────────────────────────────────────────
  router.get('/evidence', async (req, res) => {
    try {
      const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : null;
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
      res.json({ entries: rows });
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
