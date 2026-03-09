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
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename_local = fileURLToPath(import.meta.url);
const __routeDir = dirname(__filename_local);
const FRAMEWORKS_DIR = join(__routeDir, '..', '..', 'data', 'frameworks');

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

  // ── Generate custom framework via AI ────────────────────────────────────────
  router.post('/gap-assessments/frameworks/generate', async (req: Request, res: Response) => {
    if (!anthropic) return res.status(503).json({ error: 'AI not available' });

    const { name, description, regulationUrl, documentText, articleHints } = req.body as {
      name?: string;
      description?: string;
      regulationUrl?: string;
      documentText?: string;
      articleHints?: string;
    };

    if (!description?.trim()) return res.status(400).json({ error: 'Description is required' });
    if ((description?.length ?? 0) > 5000) return res.status(400).json({ error: 'Description too long (max 5000 chars)' });
    if ((documentText?.length ?? 0) > 50000) return res.status(400).json({ error: 'Document text too long (max 50000 chars)' });

    // SSE stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const contextParts: string[] = [];
      if (regulationUrl) contextParts.push(`Regulation/standard URL for reference: ${regulationUrl}`);
      if (documentText) contextParts.push(`--- DOCUMENT TEXT (extract articles/requirements from this) ---\n${documentText.slice(0, 50000)}`);
      if (articleHints) contextParts.push(`User's hints about what to include:\n${articleHints}`);

      const systemPrompt = `You are a regulatory compliance framework architect. Your job is to generate a structured gap assessment framework from a user's description.

OUTPUT: A valid JSON object (and NOTHING else — no markdown, no explanation, no code fences) with this exact schema:
{
  "id": "lowercase-kebab-case-id",
  "name": "Full Official Name of the Framework",
  "shortName": "ABBR",
  "reference": "Official reference (regulation number, standard ID, etc.)",
  "applicationDate": "YYYY-MM-DD",
  "articleCount": <number of articles>,
  "themes": ["Theme 1", "Theme 2", ...],
  "articles": [
    {"id": "Art.1", "title": "Short title", "theme": "Theme 1", "requirement": "1-2 sentence requirement summary"}
  ]
}

RULES:
- Generate 20-100 articles depending on the framework's complexity
- Use REAL article/section/control IDs if the framework is a known regulation (e.g., Art.1, Section 5.1, Req.1)
- If the user provides document text, extract ACTUAL articles/requirements from it
- Group articles into 4-8 logical themes
- Each requirement should be a concise, assessable statement (1-2 sentences)
- The id field should be a unique kebab-case identifier
- applicationDate should be the regulation's effective/application date, or today if custom
- Output ONLY the JSON — no markdown, no code blocks, no explanation`;

      const userMsg = `Create a gap assessment framework for:

**Name:** ${name || 'Custom Framework'}
**Description:** ${description}

${contextParts.length > 0 ? contextParts.join('\n\n') : ''}

Generate the complete framework JSON now.`;

      res.write(`data: ${JSON.stringify({ type: 'status', message: 'Generating framework structure...' })}\n\n`);

      let fullText = '';
      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          fullText += event.delta.text;
          res.write(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`);
        }
      }

      // Parse the generated JSON
      // Strip markdown code fences if present
      let jsonText = fullText.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      }

      let framework: Record<string, unknown>;
      try {
        framework = JSON.parse(jsonText);
      } catch {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Failed to parse generated framework JSON. Please try again.' })}\n\n`);
        res.end();
        return;
      }

      // Validate essential fields
      const fw = framework as { id?: string; name?: string; shortName?: string; articles?: unknown[] };
      if (!fw.id || !fw.name || !fw.articles || !Array.isArray(fw.articles) || fw.articles.length === 0) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Generated framework is incomplete. Please try again with more detail.' })}\n\n`);
        res.end();
        return;
      }

      // Ensure unique id by prefixing "custom-"
      const safeId = `custom-${(fw.id as string).replace(/[^a-z0-9-]/g, '-').slice(0, 50)}`;
      (framework as Record<string, unknown>).id = safeId;
      (framework as Record<string, unknown>).articleCount = (fw.articles as unknown[]).length;

      // Save to data/frameworks/
      if (!existsSync(FRAMEWORKS_DIR)) mkdirSync(FRAMEWORKS_DIR, { recursive: true });
      const filePath = join(FRAMEWORKS_DIR, `${safeId}.json`);
      writeFileSync(filePath, JSON.stringify(framework, null, 2), 'utf-8');

      res.write(`data: ${JSON.stringify({
        type: 'done',
        framework: { id: safeId, name: fw.name, shortName: fw.shortName, articleCount: (fw.articles as unknown[]).length },
      })}\n\n`);
      res.end();
    } catch (err) {
      console.error('[gap-assessments] framework generate error:', err);
      res.write(`data: ${JSON.stringify({ type: 'error', error: String(err) })}\n\n`);
      res.end();
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
