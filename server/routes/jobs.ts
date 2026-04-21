// ── jobs.ts ─────────────────────────────────────────────────────────────────
// Candidate-side Jobs API. Consumes the existing recruiter-side tables
// (talent_campaigns, talent_applications) and adds the candidate's own
// surface: search, apply, dashboard, career-profile CRUD.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import type { DatabaseAdapter } from '../db/database.js';
import { parseCareerProfile, renderProfileAsMarkdown, type CareerProfileBundle } from '../services/portals/career-profile.js';
import { safeError } from '../lib/error-response.js';

const applicationSchema = z.object({
  campaign_id: z.string(),
  answers: z.array(z.object({
    question_number: z.number().int().min(1).max(5),
    text: z.string().min(1).max(4000),
  })).max(5),
  cv_text: z.string().max(32 * 1024).optional(),
  career_profile_bundle_id: z.string().uuid().optional(),
});

const savedSearchSchema = z.object({
  label: z.string().min(1).max(64),
  filter_json: z.record(z.string(), z.unknown()),
});

const followUpAnswerSchema = z.object({
  answer_text: z.string().min(1).max(4000),
});

export function createJobsRoutes(db: DatabaseAdapter): Router {
  const router = Router();

  // ── Public search: open campaigns with published ads ────────────────────
  router.get('/jobs', async (req: Request, res: Response) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const location = typeof req.query.location === 'string' ? req.query.location : '';
      const rows = await db.all<{
        id: string; title: string; organisation: string | null;
        location: string | null; salary_min: number | string | null;
        salary_max: number | string | null; salary_currency: string | null;
        remote_mode: string | null; created_at: string;
      }>(
        `SELECT id, title, organisation, location,
                salary_min, salary_max, salary_currency, remote_mode, created_at
         FROM talent_campaigns
         WHERE status IN ('active', 'published')
           ${q ? "AND (title ILIKE ? OR organisation ILIKE ?)" : ''}
           ${location ? "AND location ILIKE ?" : ''}
         ORDER BY created_at DESC
         LIMIT 100`,
        ...(q ? [`%${q}%`, `%${q}%`] : []),
        ...(location ? [`%${location}%`] : []),
      ).catch(() => []);
      res.json({ jobs: rows.map(r => ({
        ...r,
        salary_min: r.salary_min == null ? null : Number(r.salary_min),
        salary_max: r.salary_max == null ? null : Number(r.salary_max),
      })) });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Job detail — published fields only ─────────────────────────────────
  router.get('/jobs/:id', async (req: Request, res: Response) => {
    try {
      const row = await db.get<Record<string, unknown>>(
        `SELECT id, title, description, organisation, location, salary_min, salary_max,
                salary_currency, remote_mode, assessment_framework, questions, created_at
         FROM talent_campaigns WHERE id = ? AND status IN ('active', 'published')`,
        req.params.id,
      );
      if (!row) { res.status(404).json({ error: 'Job not found' }); return; }
      res.json({ job: row });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Submit application ─────────────────────────────────────────────────
  router.post('/jobs/:id/apply', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = applicationSchema.safeParse({ ...(req.body ?? {}), campaign_id: req.params.id });
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues }); return; }
      const applicationId = `app_${Date.now()}_${randomUUID().slice(0, 8)}`;
      await db.run(
        `INSERT INTO talent_applications
          (id, campaign_id, candidate_user_id, status, cv_text, career_profile_bundle_id, answers_json, created_at)
         VALUES (?, ?, ?, 'submitted', ?, ?, ?, NOW())`,
        applicationId, parsed.data.campaign_id, req.user!.id,
        parsed.data.cv_text ?? null,
        parsed.data.career_profile_bundle_id ?? null,
        JSON.stringify(parsed.data.answers),
      );
      res.status(201).json({ application_id: applicationId });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Candidate dashboard: own applications ──────────────────────────────
  router.get('/jobs/applications/mine', requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.all(
        `SELECT a.id, a.campaign_id, a.status, a.created_at,
                c.title AS campaign_title, c.organisation
         FROM talent_applications a
         LEFT JOIN talent_campaigns c ON c.id = a.campaign_id
         WHERE a.candidate_user_id = ?
         ORDER BY a.created_at DESC`,
        req.user!.id,
      );
      res.json({ applications: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Application detail (candidate view only) ───────────────────────────
  router.get('/jobs/applications/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const row = await db.get<Record<string, unknown>>(
        `SELECT a.*, c.title AS campaign_title, c.assessment_framework
         FROM talent_applications a
         LEFT JOIN talent_campaigns c ON c.id = a.campaign_id
         WHERE a.id = ? AND a.candidate_user_id = ?`,
        req.params.id, req.user!.id,
      );
      if (!row) { res.status(404).json({ error: 'Not found' }); return; }
      const followUps = await db.all(
        `SELECT id, question_number, question_text, answer_text, asked_at, answered_at
         FROM job_follow_up_questions
         WHERE application_id = ?
         ORDER BY question_number`,
        req.params.id,
      );
      res.json({ application: row, follow_ups: followUps });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Answer a follow-up question ────────────────────────────────────────
  router.post('/jobs/follow-ups/:id/answer', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = followUpAnswerSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const ownership = await db.get<{ candidate_user_id: string }>(
        `SELECT a.candidate_user_id
         FROM job_follow_up_questions q
         JOIN talent_applications a ON a.id = q.application_id
         WHERE q.id = ?`,
        req.params.id,
      );
      if (!ownership || ownership.candidate_user_id !== req.user!.id) {
        res.status(404).json({ error: 'Not found' }); return;
      }
      await db.run(
        `UPDATE job_follow_up_questions SET answer_text = ?, answered_at = NOW() WHERE id = ?`,
        parsed.data.answer_text, req.params.id,
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Withdraw an application ────────────────────────────────────────────
  router.post('/jobs/applications/:id/withdraw', requireAuth, async (req: Request, res: Response) => {
    try {
      await db.run(
        `UPDATE talent_applications SET status = 'withdrawn', updated_at = NOW()
         WHERE id = ? AND candidate_user_id = ?`,
        req.params.id, req.user!.id,
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Saved searches ─────────────────────────────────────────────────────
  router.get('/jobs/saved-searches', requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.all(
        `SELECT id, label, filter_json, created_at FROM job_saved_searches
         WHERE user_id = ? ORDER BY created_at DESC`,
        req.user!.id,
      );
      res.json({ searches: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/jobs/saved-searches', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = savedSearchSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const result = await db.get<{ id: string }>(
        `INSERT INTO job_saved_searches (user_id, label, filter_json)
         VALUES (?, ?, ?) RETURNING id`,
        req.user!.id, parsed.data.label, JSON.stringify(parsed.data.filter_json),
      );
      res.status(201).json({ id: result?.id });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.delete('/jobs/saved-searches/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      await db.run(
        `DELETE FROM job_saved_searches WHERE id = ? AND user_id = ?`,
        req.params.id, req.user!.id,
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // ── Career profile CRUD ───────────────────────────────────────────────
  router.get('/jobs/profile', requireAuth, async (req: Request, res: Response) => {
    try {
      const userRow = await db.get<{ career_profile_bundle_id: string | null }>(
        `SELECT career_profile_bundle_id FROM users WHERE id = ?`, req.user!.id,
      );
      if (!userRow?.career_profile_bundle_id) {
        res.json({ profile: null });
        return;
      }
      const bundle = await db.get<{ payload: unknown }>(
        `SELECT payload FROM anton_bundles WHERE id = ?`,
        userRow.career_profile_bundle_id,
      ).catch(() => null);
      res.json({ profile: bundle?.payload ?? null });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/jobs/profile/import', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = parseCareerProfile(req.body);
      if (!parsed.ok) { res.status(400).json({ error: parsed.reason }); return; }
      // Store as generic anton_bundle if that table exists; otherwise as a
      // user-column payload. Keep this thin: downstream render works either way.
      const userId = req.user!.id;
      const bundleId = randomUUID();
      try {
        await db.run(
          `INSERT INTO anton_bundles (id, bundle_type, owner_user_id, payload, created_at)
           VALUES (?, 'career-profile', ?, ?, NOW())`,
          bundleId, userId, JSON.stringify(parsed.profile),
        );
      } catch { /* table may not exist; still update user pointer */ }
      await db.run(
        `UPDATE users SET career_profile_bundle_id = ? WHERE id = ?`,
        bundleId, userId,
      );
      res.json({ ok: true, bundle_id: bundleId });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.get('/jobs/profile/render', requireAuth, async (req: Request, res: Response) => {
    try {
      const userRow = await db.get<{ career_profile_bundle_id: string | null }>(
        `SELECT career_profile_bundle_id FROM users WHERE id = ?`, req.user!.id,
      );
      if (!userRow?.career_profile_bundle_id) { res.status(404).json({ error: 'No profile' }); return; }
      const bundle = await db.get<{ payload: string | object }>(
        `SELECT payload FROM anton_bundles WHERE id = ?`,
        userRow.career_profile_bundle_id,
      ).catch(() => null);
      if (!bundle?.payload) { res.status(404).json({ error: 'Profile payload missing' }); return; }
      const profile = typeof bundle.payload === 'string'
        ? JSON.parse(bundle.payload) as CareerProfileBundle
        : bundle.payload as CareerProfileBundle;
      res.set('Content-Type', 'text/markdown; charset=utf-8');
      res.send(renderProfileAsMarkdown(profile));
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
