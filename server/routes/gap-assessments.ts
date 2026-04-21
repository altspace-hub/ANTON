/**
 * gap-assessments.ts
 * REST API for the Compliance Gap Assessor.
 * Supports chunked batch assessment, synthesis, board summary, and roadmap generation.
 */

import { Router, Request, Response } from 'express';
import type { DatabaseAdapter } from '../db/database.js';

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
  type GapModelTier,
} from '../services/gap-assessment-engine.js';
import { buildOrgContextLayer, buildKnowledgePackLayer } from '../services/prompt-builder.js';
import { resolveKnowledgeSources } from '../services/knowledge-resolver.js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { compareIterations } from '../services/gap-comparison.js';
import { streamChat, mapModelToProvider } from '../services/provider-router.js';
import { fileURLToPath } from 'url';

const __filename_local = fileURLToPath(import.meta.url);
const __routeDir = dirname(__filename_local);
const FRAMEWORKS_DIR = join(__routeDir, '..', '..', 'data', 'frameworks');

function getUserId(req: Request): string {
  return (req as unknown as { user?: { id?: string } }).user?.id ?? 'default';
}

export async function createGapAssessmentsRoutes(db: DatabaseAdapter, sharedAnthropic?: Anthropic | undefined): Promise<Router> {
  const router = Router();
  const engine = await createGapAssessmentEngine(db);
  const anthropic = sharedAnthropic ?? (process.env.ANTHROPIC_API_KEY ? new AnthropicSDK({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 20 * 60 * 1000 }) : null);

  // ── List available frameworks ───────────────────────────────────────────────
  router.get('/gap-assessments/frameworks', async (_req: Request, res: Response) => {
    try {
      const frameworks = listAvailableFrameworks();
      res.json({ frameworks });
    } catch (err) {
      console.error('[gap-assessments] frameworks error:', err);
      res.status(500).json({ error: 'Failed to list frameworks' });
    }
  });

  // ── Get framework detail (includes all articles) ────────────────────────────
  router.get('/gap-assessments/frameworks/:id', async (req: Request, res: Response) => {
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

      const result = await streamChat({
        model: mapModelToProvider('claude-sonnet-4-6'),
        system: systemPrompt,
        messages: [{ role: 'user', content: userMsg }],
        maxTokens: 16384,
      }, res);
      const fullText = result.text;

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
  router.get('/gap-assessments', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const assessments = await db.all(
        `SELECT id, title, frameworks, status, current_step, created_at, updated_at
         FROM gap_assessments WHERE user_id = ?
         ORDER BY updated_at DESC LIMIT 50`
      , uid);
      res.json({ assessments });
    } catch (err) {
      console.error('[gap-assessments] list error:', err);
      res.status(500).json({ error: 'Failed to list assessments' });
    }
  });

  // ── Create assessment ───────────────────────────────────────────────────────
  router.post('/gap-assessments', async (req: Request, res: Response) => {
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
      await db.run(
        `INSERT INTO gap_assessments (id, title, frameworks, scope_config, context_config, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      , id,
        title || 'Untitled Gap Assessment',
        JSON.stringify(frameworks || []),
        JSON.stringify(scope_config || {}),
        JSON.stringify(context_config || {}),
        uid,
        now,
        now);
      const assessment = await db.get('SELECT * FROM gap_assessments WHERE id = ?', id);
      res.status(201).json({ assessment });
    } catch (err) {
      console.error('[gap-assessments] create error:', err);
      res.status(500).json({ error: 'Failed to create assessment' });
    }
  });

  // ── Get single assessment ───────────────────────────────────────────────────
  router.get('/gap-assessments/:id', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const assessment = await db.get('SELECT * FROM gap_assessments WHERE id = ? AND user_id = ?', req.params.id as string, uid);
      if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
      const findings = await db.all('SELECT * FROM gap_findings WHERE assessment_id = ? ORDER BY framework, article_id', req.params.id as string);
      // Map snake_case DB columns to camelCase for frontend
      const mappedFindings = (findings as Record<string, unknown>[]).map(f => ({
        ...f,
        articleId: f.article_id,
        articleTitle: f.article_title,
        currentState: f.current_state,
        numericScore: f.numeric_score ?? 0,
      }));
      res.json({ assessment, findings: mappedFindings });
    } catch (err) {
      console.error('[gap-assessments] get error:', err);
      res.status(500).json({ error: 'Failed to get assessment' });
    }
  });

  // ── Update assessment step/config ───────────────────────────────────────────
  router.patch('/gap-assessments/:id', async (req: Request, res: Response) => {
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
      await db.run(`UPDATE gap_assessments SET ${sets}, updated_at = ? WHERE id = ? AND user_id = ?`, ...vals);
      const assessment = await db.get('SELECT * FROM gap_assessments WHERE id = ? AND user_id = ?', req.params.id as string, uid);
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
    const assessment = await engine.getAssessmentForUser(req.params.id as string, uid);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    async function sendEvent(data: Record<string, unknown>) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    try {
      const frameworks = JSON.parse(assessment.frameworks || '[]') as string[];
      const scopeConfig = JSON.parse(assessment.scope_config || '{}') as { selectedThemes?: string[]; selectedArticles?: string[] };
      const contextConfig = JSON.parse((assessment as unknown as { context_config: string }).context_config || '{}') as Record<string, unknown>;

      await db.run("UPDATE gap_assessments SET status = 'assessing', current_step = 4, updated_at = ? WHERE id = ?", new Date().toISOString(), req.params.id as string);

      // Build org context + knowledge pack layers to enrich every Claude batch call
      const orgContextLayer = await buildOrgContextLayer(db, uid);
      const knowledgePackLayer = await buildKnowledgePackLayer(db);

      // Resolve knowledge sources (RAG, folders, web search, URLs) if configured
      let knowledgeContext = '';
      if (contextConfig.knowledgeSources && typeof contextConfig.knowledgeSources === 'object') {
        try {
          sendEvent({ type: 'status', status: 'resolving', message: 'Resolving knowledge sources (folders, RAG, web)...' });
          const resolved = await resolveKnowledgeSources(
            contextConfig.knowledgeSources as Parameters<typeof resolveKnowledgeSources>[0],
            [],
            { db, userQuery: String(contextConfig.concerns || 'AML compliance gap assessment'), contextBudget: 100_000 }
          );
          knowledgeContext = [resolved.systemPromptAdditions, resolved.contextDocuments].filter(Boolean).join('\n\n');
          if (resolved.sourceManifest?.length) {
            sendEvent({ type: 'info', message: `Knowledge sources loaded: ${resolved.sourceManifest.join(', ')} (~${resolved.tokenEstimate.toLocaleString()} tokens)` });
          }
        } catch (err) {
          console.error('[gap-assessments] knowledge source resolution error:', err);
          sendEvent({ type: 'warning', message: 'Could not resolve some knowledge sources — continuing with available context' });
        }
      }

      const extraSystemContext = [orgContextLayer, knowledgePackLayer, knowledgeContext].filter(Boolean).join('\n\n');

      // Model tier: 'opus'/'sonnet' for Claude, or a custom model ID (azure:*, gpt-*, mistral-*, etc.)
      const modelTier: GapModelTier = contextConfig.modelTier || 'sonnet';
      const tierLabel = modelTier === 'opus' ? 'Opus 4.7 (deep reasoning)'
        : modelTier === 'sonnet' ? 'Sonnet 4.6 (standard)'
        : modelTier;
      sendEvent({ type: 'status', status: 'assessing', message: `Starting assessment with ${tierLabel}...` });

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
              extraSystemContext || undefined,
              modelTier,
              db
            );

            // Save findings to DB
            engine.saveFindings(req.params.id as string, frameworkId, result.findings);
            engine.updateArticleScores(req.params.id as string, frameworkId, result.findings);

            // Append batch reasoning
            if (result.thinking) {
              const existingReasoning = await db.get<{ batch_reasoning: string | null }>(
                'SELECT batch_reasoning FROM gap_assessments WHERE id = ?', req.params.id as string
              );
              const combined = [existingReasoning?.batch_reasoning, `--- Batch ${batchIdx + 1}/${batches.length} ---\n${result.thinking}`]
                .filter(Boolean).join('\n\n');
              await db.run('UPDATE gap_assessments SET batch_reasoning = ? WHERE id = ?', combined, req.params.id as string);
            }

            sendEvent({
              type: 'batch_complete',
              framework: frameworkId,
              batchIndex: batchIdx,
              totalBatches: batches.length,
              findings: result.findings,
              thinking: result.thinking || undefined,
              message: `Batch ${batchIdx + 1}/${batches.length} complete`,
            });
          } catch (batchErr) {
            const errMsg = batchErr instanceof Error ? batchErr.message : String(batchErr);
            console.error(`[gap-assessments] batch ${batchIdx + 1} error:`, errMsg);
            sendEvent({
              type: 'batch_error',
              framework: frameworkId,
              batchIndex: batchIdx,
              error: errMsg,
              message: `Batch ${batchIdx + 1} failed: ${errMsg.slice(0, 200)}`,
            });
          }
        }

        sendEvent({ type: 'framework_complete', framework: frameworkId });
      }

      await db.run("UPDATE gap_assessments SET status = 'scoring', current_step = 5, updated_at = ? WHERE id = ?", new Date().toISOString(), req.params.id as string);

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
    const assessment = await engine.getAssessmentForUser(req.params.id as string, uid);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

    try {
      const allFindings = JSON.parse(assessment.article_scores || '{}') as Record<string, import('../services/gap-assessment-engine.js').ArticleFinding[]>;
      const contextConfig = JSON.parse((assessment as unknown as { context_config: string }).context_config || '{}') as Record<string, unknown>;

      await db.run("UPDATE gap_assessments SET status = 'synthesising', current_step = 6, updated_at = ? WHERE id = ?", new Date().toISOString(), req.params.id as string);

      const findingsCount = Object.values(allFindings).flat().length;
      console.log(`[gap-assessments] synthesise: starting — ${findingsCount} findings, anthropic timeout: ${(anthropic as unknown as { timeout?: number }).timeout ?? 'default'}`);

      const modelTier: GapModelTier = contextConfig.modelTier || 'sonnet';
      const result = await synthesiseCapabilityView(anthropic, allFindings, contextConfig, modelTier, db);
      console.log(`[gap-assessments] synthesise: Claude returned ${result.json.length} chars JSON, ${result.reasoning.length} chars reasoning`);

      await db.run('UPDATE gap_assessments SET capability_view = ?, synthesis_reasoning = ?, current_step = 6, status = ?, updated_at = ? WHERE id = ?', result.json, result.reasoning || null, 'scoring', new Date().toISOString(), req.params.id as string);

      const capabilities = JSON.parse(result.json);
      res.json({ capabilities, reasoning: result.reasoning });
    } catch (err) {
      console.error('[gap-assessments] synthesise error:', err);
      console.error('[gap-assessments] synthesise error name:', (err as Error)?.name);
      console.error('[gap-assessments] synthesise error message:', (err as Error)?.message);
      if ((err as { status?: number }).status) console.error('[gap-assessments] synthesise error status:', (err as { status?: number }).status);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Generate board summary (Step 7) ────────────────────────────────────────
  router.post('/gap-assessments/:id/board-summary', async (req: Request, res: Response) => {
    if (!anthropic) return res.status(503).json({ error: 'Claude API not configured' });

    const uid = getUserId(req);
    const assessment = await engine.getAssessmentForUser(req.params.id as string, uid);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!assessment.capability_view) return res.status(400).json({ error: 'Run synthesis first (Step 6)' });

    try {
      const allFindings = JSON.parse(assessment.article_scores || '{}') as Record<string, import('../services/gap-assessment-engine.js').ArticleFinding[]>;
      const contextConfig = JSON.parse((assessment as unknown as { context_config: string }).context_config || '{}') as Record<string, unknown>;

      const modelTier: GapModelTier = contextConfig.modelTier || 'sonnet';
      const result = await generateBoardSummary(anthropic, assessment.capability_view, allFindings, contextConfig, modelTier, db);

      await db.run('UPDATE gap_assessments SET board_summary = ?, board_reasoning = ?, current_step = 7, updated_at = ? WHERE id = ?', result.summary, result.reasoning || null, new Date().toISOString(), req.params.id as string);

      res.json({ boardSummary: result.summary, reasoning: result.reasoning });
    } catch (err) {
      console.error('[gap-assessments] board-summary error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Generate roadmap (Step 8) ───────────────────────────────────────────────
  router.post('/gap-assessments/:id/roadmap', async (req: Request, res: Response) => {
    if (!anthropic) return res.status(503).json({ error: 'Claude API not configured' });

    const uid = getUserId(req);
    const assessment = await engine.getAssessmentForUser(req.params.id as string, uid);
    if (!assessment) return res.status(404).json({ error: 'Assessment not found' });
    if (!assessment.capability_view) return res.status(400).json({ error: 'Run synthesis first (Step 6)' });

    try {
      const allFindings = JSON.parse(assessment.article_scores || '{}') as Record<string, import('../services/gap-assessment-engine.js').ArticleFinding[]>;
      const contextConfig = JSON.parse((assessment as unknown as { context_config: string }).context_config || '{}') as Record<string, unknown>;

      const modelTier: GapModelTier = contextConfig.modelTier || 'sonnet';
      const result = await generateRoadmap(anthropic, assessment.capability_view, allFindings, contextConfig, modelTier, db);

      await db.run('UPDATE gap_assessments SET roadmap = ?, roadmap_reasoning = ?, current_step = 8, status = ?, updated_at = ? WHERE id = ?', result.json, result.reasoning || null, 'complete', new Date().toISOString(), req.params.id as string);

      const roadmap = JSON.parse(result.json);
      res.json({ roadmap, reasoning: result.reasoning });
    } catch (err) {
      console.error('[gap-assessments] roadmap error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Snapshot current iteration ──────────────────────────────────────────────
  router.post('/gap-assessments/:id/snapshot', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);

      if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

      const findings = await db.all('SELECT * FROM gap_findings WHERE assessment_id = ? ORDER BY framework, article_id', req.params.id as string) as Record<string, unknown>[];

      // Build score summary
      const mapped = findings.map(f => ({
        articleId: f.article_id as string,
        articleTitle: f.article_title as string,
        framework: f.framework as string,
        score: f.score as string,
        numericScore: (f.numeric_score as number) || 0,
        priority: f.priority as string,
        notes: f.notes as string,
        currentState: f.current_state as string,
        requirement: f.requirement as string,
      }));
      const avg = mapped.length > 0 ? Math.round(mapped.reduce((s, f) => s + f.numericScore, 0) / mapped.length) : 0;
      const scoreSummary = {
        red: mapped.filter(f => f.score === 'red').length,
        amber: mapped.filter(f => f.score === 'amber').length,
        yellow: mapped.filter(f => f.score === 'yellow').length,
        green: mapped.filter(f => f.score === 'green').length,
        avg,
        total: mapped.length,
      };

      // Determine iteration number
      const lastIter = await db.get('SELECT MAX(iteration_number) as n FROM gap_iterations WHERE assessment_id = ?', req.params.id as string) as { n: number | null };
      const iterNum = (lastIter?.n ?? 0) + 1;

      const iterationId = randomUUID();
      const { notes, evidenceSummary } = req.body as { notes?: string; evidenceSummary?: string };

      await db.run(`INSERT INTO gap_iterations (id, assessment_id, iteration_number, status, context_snapshot, evidence_summary, findings_snapshot, capability_snapshot, board_snapshot, roadmap_snapshot, score_summary, notes, created_by) VALUES (?, ?, ?, 'complete', ?, ?, ?, ?, ?, ?, ?, ?, ?)`, iterationId,
          req.params.id as string,
          iterNum,
          String(assessment.context_config || '{}'),
          evidenceSummary || null,
          JSON.stringify(mapped),
          String(assessment.capability_view || ''),
          String(assessment.board_summary || ''),
          String(assessment.roadmap || ''),
          JSON.stringify(scoreSummary),
          notes || null,
          uid,);

      res.json({ iterationId, iterationNumber: iterNum, scoreSummary });
    } catch (err) {
      console.error('[gap-assessments] snapshot error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── List iterations ────────────────────────────────────────────────────────
  router.get('/gap-assessments/:id/iterations', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const assessment = await engine.getAssessmentForUser(req.params.id as string, uid);
      if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

      const iterations = await db.all(
        'SELECT id, iteration_number, status, evidence_summary, score_summary, notes, created_at FROM gap_iterations WHERE assessment_id = $1 ORDER BY iteration_number ASC'
      , req.params.id as string) as Record<string, unknown>[];

      const mapped = (iterations || []).map(i => ({
        id: i.id,
        iterationNumber: i.iteration_number,
        status: i.status,
        evidenceSummary: i.evidence_summary,
        scoreSummary: typeof i.score_summary === 'string' ? JSON.parse(i.score_summary as string) : i.score_summary,
        notes: i.notes,
        createdAt: i.created_at,
      }));

      res.json({ iterations: mapped });
    } catch (err) {
      console.error('[gap-assessments] list iterations error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Get single iteration ──────────────────────────────────────────────────
  router.get('/gap-assessments/:id/iterations/:iterationId', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);

      if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

      const iteration = await db.get('SELECT * FROM gap_iterations WHERE id = ? AND assessment_id = ?', req.params.iterationId as string, req.params.id as string) as Record<string, unknown> | undefined;
      if (!iteration) return res.status(404).json({ error: 'Iteration not found' });

      res.json({
        id: iteration.id,
        iterationNumber: iteration.iteration_number,
        status: iteration.status,
        contextSnapshot: typeof iteration.context_snapshot === 'string' ? JSON.parse(iteration.context_snapshot as string) : iteration.context_snapshot,
        evidenceSummary: iteration.evidence_summary,
        findingsSnapshot: typeof iteration.findings_snapshot === 'string' ? JSON.parse(iteration.findings_snapshot as string) : iteration.findings_snapshot,
        capabilitySnapshot: iteration.capability_snapshot,
        boardSnapshot: iteration.board_snapshot,
        roadmapSnapshot: iteration.roadmap_snapshot,
        scoreSummary: typeof iteration.score_summary === 'string' ? JSON.parse(iteration.score_summary as string) : iteration.score_summary,
        notes: iteration.notes,
        createdAt: iteration.created_at,
      });
    } catch (err) {
      console.error('[gap-assessments] get iteration error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Compare two iterations ─────────────────────────────────────────────────
  router.post('/gap-assessments/:id/compare', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);

      if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

      const { iterationA, iterationB } = req.body as { iterationA: string; iterationB: string };
      if (!iterationA || !iterationB) return res.status(400).json({ error: 'Both iterationA and iterationB are required' });

      const a = await db.get('SELECT findings_snapshot, capability_snapshot FROM gap_iterations WHERE id = ? AND assessment_id = ?', iterationA, req.params.id as string) as Record<string, unknown> | undefined;
      const b = await db.get('SELECT findings_snapshot, capability_snapshot FROM gap_iterations WHERE id = ? AND assessment_id = ?', iterationB, req.params.id as string) as Record<string, unknown> | undefined;
      if (!a || !b) return res.status(404).json({ error: 'One or both iterations not found' });

      const findingsA = typeof a.findings_snapshot === 'string' ? JSON.parse(a.findings_snapshot as string) : a.findings_snapshot;
      const findingsB = typeof b.findings_snapshot === 'string' ? JSON.parse(b.findings_snapshot as string) : b.findings_snapshot;
      const capsA = a.capability_snapshot ? (typeof a.capability_snapshot === 'string' ? JSON.parse(a.capability_snapshot as string) : a.capability_snapshot) : undefined;
      const capsB = b.capability_snapshot ? (typeof b.capability_snapshot === 'string' ? JSON.parse(b.capability_snapshot as string) : b.capability_snapshot) : undefined;

      const comparison = compareIterations(findingsA, findingsB, capsA, capsB);
      res.json(comparison);
    } catch (err) {
      console.error('[gap-assessments] compare error:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Delete assessment ───────────────────────────────────────────────────────
  router.delete('/gap-assessments/:id', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      await db.run('DELETE FROM gap_assessments WHERE id = ? AND user_id = ?', req.params.id as string, uid);
      res.json({ ok: true });
    } catch (err) {
      console.error('[gap-assessments] delete error:', err);
      res.status(500).json({ error: 'Failed to delete assessment' });
    }
  });

  return router;
}
