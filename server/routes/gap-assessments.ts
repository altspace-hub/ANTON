/**
 * gap-assessments.ts
 * REST API for the Compliance Gap Assessor.
 * Supports chunked batch assessment, synthesis, board summary, and roadmap generation.
 */

import { Router, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type Anthropic from '@anthropic-ai/sdk';
import AnthropicSDK from '@anthropic-ai/sdk';
import {
  createGapAssessmentEngine,
  listAvailableFrameworks,
  getFramework,
  runAssessmentBatch,
  synthesiseCapabilityView,
  generateBoardSummary,
  generateRoadmap,
  type FrameworkArticle,
} from '../services/gap-assessment-engine.js';
import { buildOrgContextLayer, buildKnowledgePackLayer } from '../services/prompt-builder.js';

function getUserId(req: Request): string {
  return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
}

export function createGapAssessmentsRoutes(db: Database.Database, sharedAnthropic?: Anthropic | undefined): Router {
  const router = Router();
  const engine = createGapAssessmentEngine(db);
  const anthropic = sharedAnthropic ?? (process.env.ANTHROPIC_API_KEY ? new AnthropicSDK({ apiKey: process.env.ANTHROPIC_API_KEY }) : null);

  // ── List available frameworks ───────────────────────────────────────────────
  router.get('/gap-assessments/frameworks', (_req: Request, res: Response) => {
    try {
      const frameworks = listAvailableFrameworks();
      res.json({ frameworks });
    } catch (err) {
      console.error('[gap-assessments] frameworks error:', err);
      res.status(500).json({ error: 'Failed to list frameworks' });
    }
  });

  // ── Get framework detail (includes all articles) ────────────────────────────
  router.get('/gap-assessments/frameworks/:id', (req: Request, res: Response) => {
    try {
      const fw = getFramework(req.params.id as string);
      if (!fw) return res.status(404).json({ error: 'Framework not found' });
      res.json({ framework: fw });
    } catch (err) {
      console.error('[gap-assessments] framework detail error:', err);
      res.status(500).json({ error: 'Failed to get framework' });
    }
  });

  // ── List assessments ────────────────────────────────────────────────────────
  router.get('/gap-assessments', (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const assessments = db.prepare(
        `SELECT id, title, frameworks, status, current_step, created_at, updated_at
         FROM gap_assessments WHERE user_id = ?
         ORDER BY updated_at DESC LIMIT 50`
      ).all(uid);
      res.json({ assessments });
    } catch (err) {
      console.error('[gap-assessments] list error:', err);
      res.status(500).json({ error: 'Failed to list assessments' });
    }
  });

  // ── Create assessment ───────────────────────────────────────────────────────
  router.post('/gap-assessments', (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const { title, frameworks, scope_config, context_config } = req.body as {
        title?: string;
        frameworks?: string[];
        scope_config?: Record<string, unknown>;
        context_config?: Record<string, unknown>;
      };
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO gap_assessments (id, title, frameworks, scope_config, context_config, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        title || 'Untitled Gap Assessment',
        JSON.stringify(frameworks || []),
        JSON.stringify(scope_config || {}),
        JSON.stringify(context_config || {}),
        uid,
        now,
        now
      );
      const assessment = db.prepare('SELECT * FROM gap_assessments WHERE id = ?').get(id);
      res.status(201).json({ assessment });
    } catch (err) {
      console.error('[gap-assessments] create error:', err);
      res.status(500).json({ error: 'Failed to create assessment' });
    }
  });

  // ── Get single assessment ───────────────────────────────────────────────────
  router.get('/gap-assessments/:id', (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const assessment = db.prepare('SELECT * FROM gap_assessments WHERE id = ? AND user_id = ?').get(req.params.id as string, uid);
      if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
      const findings = db.prepare('SELECT * FROM gap_findings WHERE assessment_id = ? ORDER BY framework, article_id').all(req.params.id as string);
      res.json({ assessment, findings });
    } catch (err) {
      console.error('[gap-assessments] get error:', err);
      res.status(500).json({ error: 'Failed to get assessment' });
    }
  });

  // ── Update assessment step/config ───────────────────────────────────────────
  router.patch('/gap-assessments/:id', (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const allowed = ['title', 'frameworks', 'scope_config', 'context_config', 'status', 'current_step'];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          updates[key] = typeof req.body[key] === 'object' ? JSON.stringify(req.body[key]) : req.body[key];
        }
      }
      if (Object.keys(updates).length === 0) return res.json({ ok: true });
      // Keys are guaranteed safe: sourced from the allowed whitelist above
      const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const vals = [...Object.values(updates), new Date().toISOString(), req.params.id as string, uid];
      db.prepare(`UPDATE gap_assessments SET ${sets}, updated_at = ? WHERE id = ? AND user_id = ?`).run(...vals);
      const assessment = db.prepare('SELECT * FROM gap_assessments WHERE id = ? AND user_id = ?').get(req.params.id as string, uid);
      res.json({ assessment });
    } catch (err) {
      console.error('[gap-assessments] patch error:', err);
      res.status(500).json({ error: 'Failed to update assessment' });
    }
  });

  // ── Run assessment batch (SSE streaming) ────────────────────────────────────
  // POST /api/gap-assessments/:id/run
  // Triggers chunked Claude calls for the selected frameworks/articles.
  // Streams progress events to the client via SSE.
  router.post('/gap-assessments/:id/run', async (req: Request, res: Response) => {
    if (!anthropic) return res.status(503).json({ error: 'Claude API not configured' });

    const uid = getUserId(req);
    const assessment = engine.getAssessmentForUser(req.params.id as string, uid);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    function sendEvent(data: Record<string, unknown>) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    try {
      const frameworks = JSON.parse(assessment.frameworks || '[]') as string[];
      const scopeConfig = JSON.parse(assessment.scope_config || '{}') as { selectedThemes?: string[]; selectedArticles?: string[] };
      const contextConfig = JSON.parse((assessment as unknown as { context_config: string }).context_config || '{}') as Record<string, unknown>;

      db.prepare("UPDATE gap_assessments SET status = 'assessing', current_step = 4, updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), req.params.id as string);

      // Build org context + knowledge pack layers to enrich every Claude batch call
      const orgContextLayer = buildOrgContextLayer(db, uid);
      const knowledgePackLayer = buildKnowledgePackLayer(db);
      const extraSystemContext = [orgContextLayer, knowledgePackLayer].filter(Boolean).join('\n\n');

      sendEvent({ type: 'status', status: 'assessing', message: 'Starting assessment...' });

      for (const frameworkId of frameworks) {
        const fw = getFramework(frameworkId);
        if (!fw) {
          sendEvent({ type: 'warning', message: `Framework ${frameworkId} not found, skipping` });
          continue;
        }

        // Filter to selected articles/themes if scope is restricted
        let articles = fw.articles;
        if (scopeConfig.selectedThemes && scopeConfig.selectedThemes.length > 0) {
          articles = articles.filter(a => scopeConfig.selectedThemes!.includes(a.theme));
        }
        if (scopeConfig.selectedArticles && scopeConfig.selectedArticles.length > 0) {
          articles = articles.filter(a => scopeConfig.selectedArticles!.includes(a.id));
        }

        const BATCH_SIZE = 12;
        const batches: FrameworkArticle[][] = [];
        for (let i = 0; i < articles.length; i += BATCH_SIZE) {
          batches.push(articles.slice(i, i + BATCH_SIZE));
        }

        sendEvent({
          type: 'framework_start',
          framework: frameworkId,
          frameworkName: fw.name,
          articleCount: articles.length,
          batchCount: batches.length,
        });

        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
          const batch = batches[batchIdx];
          sendEvent({
            type: 'batch_start',
            framework: frameworkId,
            batchIndex: batchIdx,
            totalBatches: batches.length,
            articles: batch.map(a => a.id),
            message: `Assessing ${fw.shortName} batch ${batchIdx + 1}/${batches.length} (${batch[0].id}–${batch[batch.length - 1].id})`,
          });

          try {
            const result = await runAssessmentBatch(
              anthropic,
              frameworkId,
              batch,
              contextConfig,
              batchIdx,
              batches.length,
              extraSystemContext || undefined
            );

            // Save findings to DB
            engine.saveFindings(req.params.id as string, frameworkId, result.findings);
            engine.updateArticleScores(req.params.id as string, frameworkId, result.findings);

            sendEvent({
              type: 'batch_complete',
              framework: frameworkId,
              batchIndex: batchIdx,
              totalBatches: batches.length,
              findings: result.findings,
              message: `Batch ${batchIdx + 1}/${batches.length} complete`,
            });
          } catch (batchErr) {
            sendEvent({
              type: 'batch_error',
              framework: frameworkId,
              batchIndex: batchIdx,
              error: String(batchErr),
              message: `Batch ${batchIdx + 1} failed — continuing`,
            });
          }
        }

        sendEvent({ type: 'framework_complete', framework: frameworkId });
      }

      db.prepare("UPDATE gap_assessments SET status = 'scoring', current_step = 5, updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), req.params.id as string);

      sendEvent({ type: 'complete', message: 'Assessment complete. Proceed to scoring view (Step 5).' });
      res.end();

    } catch (err) {
      console.error('[gap-assessments] run error:', err);
      sendEvent({ type: 'error', error: String(err) });
      res.end();
    }
  });

  // ── Synthesise capability view (Step 6) ────────────────────────────────────
  router.post('/gap-assessments/:id/synthesise', async (req: Request, res: Response) => {
    if (!anthropic) return res.status(503).json({ error: 'Claude API not configured' });

    const uid = getUserId(req);
    const assessment = engine.getAssessmentForUser(req.params.id as string, uid);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    try {
      const allFindings = JSON.parse(assessment.article_scores || '{}') as Record<string, import('../services/gap-assessment-engine.js').ArticleFinding[]>;
      const contextConfig = JSON.parse((assessment as unknown as { context_config: string }).context_config || '{}') as Record<string, unknown>;

      db.prepare("UPDATE gap_assessments SET status = 'synthesising', current_step = 6, updated_at = ? WHERE id = ?")
        .run(new Date().toISOString(), req.params.id as string);

      const capabilityJson = await synthesiseCapabilityView(anthropic, allFindings, contextConfig);

      db.prepare('UPDATE gap_assessments SET capability_view = ?, current_step = 6, status = ?, updated_at = ? WHERE id = ?')
        .run(capabilityJson, 'scoring', new Date().toISOString(), req.params.id as string);

      const capabilities = JSON.parse(capabilityJson);
      res.json({ capabilities });
    } catch (err) {
      console.error('[gap-assessments] synthesise error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Generate board summary (Step 7) ────────────────────────────────────────
  router.post('/gap-assessments/:id/board-summary', async (req: Request, res: Response) => {
    if (!anthropic) return res.status(503).json({ error: 'Claude API not configured' });

    const uid = getUserId(req);
    const assessment = engine.getAssessmentForUser(req.params.id as string, uid);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!assessment.capability_view) return res.status(400).json({ error: 'Run synthesis first (Step 6)' });

    try {
      const allFindings = JSON.parse(assessment.article_scores || '{}') as Record<string, import('../services/gap-assessment-engine.js').ArticleFinding[]>;
      const contextConfig = JSON.parse((assessment as unknown as { context_config: string }).context_config || '{}') as Record<string, unknown>;

      const boardSummary = await generateBoardSummary(anthropic, assessment.capability_view, allFindings, contextConfig);

      db.prepare('UPDATE gap_assessments SET board_summary = ?, current_step = 7, updated_at = ? WHERE id = ?')
        .run(boardSummary, new Date().toISOString(), req.params.id as string);

      res.json({ boardSummary });
    } catch (err) {
      console.error('[gap-assessments] board-summary error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Generate roadmap (Step 8) ───────────────────────────────────────────────
  router.post('/gap-assessments/:id/roadmap', async (req: Request, res: Response) => {
    if (!anthropic) return res.status(503).json({ error: 'Claude API not configured' });

    const uid = getUserId(req);
    const assessment = engine.getAssessmentForUser(req.params.id as string, uid);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!assessment.capability_view) return res.status(400).json({ error: 'Run synthesis first (Step 6)' });

    try {
      const allFindings = JSON.parse(assessment.article_scores || '{}') as Record<string, import('../services/gap-assessment-engine.js').ArticleFinding[]>;
      const contextConfig = JSON.parse((assessment as unknown as { context_config: string }).context_config || '{}') as Record<string, unknown>;

      const roadmapJson = await generateRoadmap(anthropic, assessment.capability_view, allFindings, contextConfig);

      db.prepare('UPDATE gap_assessments SET roadmap = ?, current_step = 8, status = ?, updated_at = ? WHERE id = ?')
        .run(roadmapJson, 'complete', new Date().toISOString(), req.params.id as string);

      const roadmap = JSON.parse(roadmapJson);
      res.json({ roadmap });
    } catch (err) {
      console.error('[gap-assessments] roadmap error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Delete assessment ───────────────────────────────────────────────────────
  router.delete('/gap-assessments/:id', (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      db.prepare('DELETE FROM gap_assessments WHERE id = ? AND user_id = ?').run(req.params.id as string, uid);
      res.json({ ok: true });
    } catch (err) {
      console.error('[gap-assessments] delete error:', err);
      res.status(500).json({ error: 'Failed to delete assessment' });
    }
  });

  return router;
}
