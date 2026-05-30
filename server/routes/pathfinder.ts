/**
 * Pathfinder Routes — Multi-model AI search
 * POST /pathfinder/search          — SSE streaming search
 * POST /pathfinder/followup        — SSE streaming follow-up
 * GET  /pathfinder/searches        — Search history
 * GET  /pathfinder/searches/:id    — Single search result
 * DELETE /pathfinder/searches/:id  — Delete a search
 * GET  /pathfinder/available-models — Which models are configured
 * CRUD /pathfinder/threads         — Thread management
 * POST /pathfinder/documents       — Upload document for context
 * GET  /pathfinder/documents       — List documents
 * DELETE /pathfinder/documents/:id — Delete document
 * GET  /pathfinder/suggestions     — Get proactive suggestions
 * POST /pathfinder/suggestions/:id/dismiss — Dismiss suggestion
 * POST /pathfinder/suggestions/refresh — Refresh suggestions
 */

import { safeError } from '../lib/error-response.js';
import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { join } from 'path';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import type { DatabaseAdapter } from '../db/database.js';

import type Anthropic from '@anthropic-ai/sdk';
import {
  dispatchQuickSearch,
  dispatchThoroughSearch,
  dispatchDeepSearch,
  handleFollowUp,
  buildDocumentContext,
  getAvailableSearchModels,
  generateSuggestions,
  type SearchDepth,
  type SearchMode,
  type SearchCallbacks,
} from '../services/pathfinder-engine.js';
import { extractTextFromFile } from '../services/text-extractor.js';
import { estimateTokens } from '../services/token-estimator.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function getUserId(req: Request): string {
  return (req as unknown as Record<string, unknown>).userId as string || 'solo';
}

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

function sendEvent(res: Response, event: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ── Upload config ──────────────────────────────────────────────────────────

const UPLOAD_DIR = join(process.cwd(), 'data', 'pathfinder-uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.txt', '.md', '.html'];
    const ext = '.' + (file.originalname.split('.').pop()?.toLowerCase() || '');
    cb(null, allowed.includes(ext));
  },
});

// ── Route Factory ──────────────────────────────────────────────────────────

export function createPathfinderRoutes(
  db: DatabaseAdapter,
  anthropic?: Anthropic | null,
): Router {
  const router = Router();

  // ── POST /pathfinder/search — SSE streaming search ────────────────────────
  router.post('/pathfinder/search', async (req: Request, res: Response) => {
    const { query, depth = 'quick', threadId = null, documentIds = [], activeAreaId, activeModuleId, searchMode = 'knowledge', userLocation } = req.body as {
      query: string;
      depth?: SearchDepth;
      threadId?: string | null;
      documentIds?: string[];
      activeAreaId?: string;
      activeModuleId?: string;
      searchMode?: SearchMode;
      userLocation?: string;
    };
    const searchContext = (activeAreaId || activeModuleId || userLocation)
      ? { activeAreaId, activeModuleId, userLocation }
      : undefined;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required' });
    }
    if (!anthropic) {
      return res.status(503).json({ error: 'Anthropic API not configured' });
    }

    const uid = getUserId(req);
    res.writeHead(200, SSE_HEADERS);

    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    const documentContext = await buildDocumentContext(db, documentIds ?? []);

    const callbacks: SearchCallbacks = {
      onSearchStart: (searchId, d) => sendEvent(res, { type: 'search_start', searchId, depth: d }),
      onPreSearchReasoning: (reasoning) => sendEvent(res, { type: 'pre_search_reasoning', reasoning }),
      onModelStart: (modelId, role) => sendEvent(res, { type: 'model_start', modelId, role }),
      onModelComplete: (result) => sendEvent(res, {
        type: 'model_complete',
        modelId: result.modelId,
        role: result.role,
        status: result.status,
        durationMs: result.durationMs,
        responsePreview: result.response.slice(0, 300),
        sourceCount: result.webSources.length,
        error: result.error,
        confidenceScore: result.confidenceScore,
      }),
      onSynthesisStart: () => sendEvent(res, { type: 'synthesis_start' }),
      onTextDelta: (text) => sendEvent(res, { type: 'text_delta', content: text }),
      onThinkingDelta: (text) => sendEvent(res, { type: 'thinking_delta', content: text }),
      onSearchComplete: (result) => sendEvent(res, {
        type: 'search_complete',
        searchId: result.id,
        webSources: result.webSources,
        localSources: result.localSources,
        enrichedQuery: result.enrichedQuery,
        modelResults: result.modelResults.map(r => ({
          modelId: r.modelId,
          role: r.role,
          status: r.status,
          durationMs: r.durationMs,
          response: r.response,
          sourceCount: r.webSources.length,
        })),
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
        followUpSuggestions: result.followUpSuggestions,
      }),
      onError: (error) => sendEvent(res, { type: 'error', message: error }),
    };

    try {
      if (depth === 'quick') {
        await dispatchQuickSearch(db, query.trim(), uid, threadId, documentContext, anthropic, callbacks, abortController.signal, searchContext, searchMode);
      } else if (depth === 'thorough') {
        await dispatchThoroughSearch(db, query.trim(), uid, threadId, documentContext, anthropic, callbacks, abortController.signal, searchContext, searchMode);
      } else {
        await dispatchDeepSearch(db, query.trim(), uid, threadId, documentContext, anthropic, callbacks, abortController.signal, searchContext, searchMode);
      }
    } catch (err) {
      sendEvent(res, { type: 'error', message: String(err) });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  });

  // ── POST /pathfinder/followup — SSE streaming follow-up ───────────────────
  router.post('/pathfinder/followup', async (req: Request, res: Response) => {
    const { searchId, question } = req.body as { searchId: string; question: string };
    if (!searchId || !question) return res.status(400).json({ error: 'searchId and question required' });
    if (!anthropic) return res.status(503).json({ error: 'Anthropic API not configured' });

    res.writeHead(200, SSE_HEADERS);
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    sendEvent(res, { type: 'followup_start', searchId });

    try {
      const result = await handleFollowUp(db, searchId, question, anthropic, {
        onTextDelta: (text) => sendEvent(res, { type: 'text_delta', content: text }),
        onThinkingDelta: (text) => sendEvent(res, { type: 'thinking_delta', content: text }),
      }, abortController.signal);
      sendEvent(res, { type: 'followup_complete', followUpId: result.id });
    } catch (err) {
      sendEvent(res, { type: 'error', message: String(err) });
    }

    res.write('data: [DONE]\n\n');
    res.end();
  });

  // ── GET /pathfinder/searches — Search history ─────────────────────────────
  router.get('/pathfinder/searches', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Number(req.query.offset) || 0;
      const searches = await db.all(
        `SELECT id, query, depth, status, input_tokens, output_tokens, cost_usd, duration_ms, thread_id, created_at
         FROM pathfinder_searches WHERE user_id = ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`
      , uid, limit, offset);
      const total = ((await db.get('SELECT COUNT(*) as count FROM pathfinder_searches WHERE user_id = ?', uid)) as { count: number } | undefined)?.count ?? 0;
      res.json({ searches, total });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /pathfinder/searches/:id — Single search ──────────────────────────
  router.get('/pathfinder/searches/:id', async (req: Request, res: Response) => {
    try {
      const search = await db.get('SELECT * FROM pathfinder_searches WHERE id = ?', req.params.id) as Record<string, unknown> | undefined;
      if (!search) return res.status(404).json({ error: 'Search not found' });

      // Parse JSON fields
      search.model_results = search.model_results ? JSON.parse(search.model_results as string) : [];
      search.web_sources = search.web_sources ? JSON.parse(search.web_sources as string) : [];

      // Get follow-ups
      const followups = await db.all('SELECT * FROM pathfinder_followups WHERE search_id = ? ORDER BY created_at', req.params.id);
      res.json({ search, followups });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── DELETE /pathfinder/searches/:id ───────────────────────────────────────
  router.delete('/pathfinder/searches/:id', async (req: Request, res: Response) => {
    try {
      await db.run('DELETE FROM pathfinder_searches WHERE id = ? AND user_id = ?', req.params.id, getUserId(req));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── GET /pathfinder/available-models ──────────────────────────────────────
  router.get('/pathfinder/available-models', async (_req: Request, res: Response) => {
    res.json({ models: getAvailableSearchModels() });
  });

  // ── Thread CRUD ──────────────────────────────────────────────────────────
  router.get('/pathfinder/threads', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const threads = await db.all(`SELECT t.*, (SELECT COUNT(*) FROM pathfinder_searches WHERE thread_id = t.id) as search_count
         FROM pathfinder_threads t WHERE t.user_id = ?
         ORDER BY t.pinned DESC, t.updated_at DESC`
      , uid);
      res.json({ threads });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/pathfinder/threads', async (req: Request, res: Response) => {
    try {
      const id = randomUUID();
      const { title = 'New Thread' } = req.body;
      await db.run('INSERT INTO pathfinder_threads (id, user_id, title) VALUES (?, ?, ?)', id, getUserId(req), title);
      res.json({ id, title });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.patch('/pathfinder/threads/:id', async (req: Request, res: Response) => {
    try {
      const { title, pinned } = req.body;
      if (title !== undefined) await db.run('UPDATE pathfinder_threads SET title = ? WHERE id = ? AND user_id = ?', title, req.params.id, getUserId(req));
      if (pinned !== undefined) await db.run('UPDATE pathfinder_threads SET pinned = ? WHERE id = ? AND user_id = ?', pinned ? 1 : 0, req.params.id, getUserId(req));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/pathfinder/threads/:id', async (req: Request, res: Response) => {
    try {
      await db.run('DELETE FROM pathfinder_threads WHERE id = ? AND user_id = ?', req.params.id, getUserId(req));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Document upload / list / delete ──────────────────────────────────────
  router.post('/pathfinder/documents', upload.single('file'), async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const uid = getUserId(req);
      const threadId = req.body.threadId || null;
      const id = randomUUID();

      // Extract text from uploaded file
      const extractedText = await extractTextFromFile(file.path) || '';
      const wordCount = extractedText.split(/\s+/).filter(Boolean).length;
      const tokenEstimate = estimateTokens(extractedText);

      await db.run(
        `INSERT INTO pathfinder_documents (id, user_id, thread_id, filename, file_path, file_size, mime_type, extracted_text, word_count, token_estimate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      , id, uid, threadId, file.originalname, file.path, file.size, file.mimetype, extractedText, wordCount, tokenEstimate);

      res.json({ id, filename: file.originalname, wordCount, tokenEstimate });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.get('/pathfinder/documents', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const threadId = req.query.threadId as string | undefined;
      let query = 'SELECT id, filename, file_size, word_count, token_estimate, thread_id, created_at FROM pathfinder_documents WHERE user_id = ?';
      const params: unknown[] = [uid];
      if (threadId) { query += ' AND thread_id = ?'; params.push(threadId); }
      query += ' ORDER BY created_at DESC';
      const docs = await db.all(query, ...params);
      res.json({ documents: docs });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.delete('/pathfinder/documents/:id', async (req: Request, res: Response) => {
    try {
      const doc = await db.get('SELECT file_path FROM pathfinder_documents WHERE id = ? AND user_id = ?', req.params.id, getUserId(req)) as { file_path: string } | undefined;
      if (doc?.file_path) {
        try { unlinkSync(doc.file_path); } catch { /* file may already be deleted */ }
      }
      await db.run('DELETE FROM pathfinder_documents WHERE id = ? AND user_id = ?', req.params.id, getUserId(req));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── POST /pathfinder/searches/:id/to-module — Pipe results to a module ────
  router.post('/pathfinder/searches/:id/to-module', async (req: Request, res: Response) => {
    try {
      const search = await db.get('SELECT query, synthesis, web_sources FROM pathfinder_searches WHERE id = ?', req.params.id) as {
        query: string; synthesis: string; web_sources: string;
      } | undefined;
      if (!search) return res.status(404).json({ error: 'Search not found' });

      const { moduleId, areaId } = req.body as { moduleId?: string; areaId?: string };

      // Build context text from synthesis + sources
      const sources = search.web_sources ? JSON.parse(search.web_sources) : [];
      const sourceList = sources.slice(0, 10).map((s: Record<string, unknown>) =>
        `- [${s.title || s.url}](${s.url})`
      ).join('\n');

      const contextText = [
        `## Pathfinder Search Results`,
        `**Query:** ${search.query}`,
        '',
        search.synthesis,
        '',
        sourceList ? `### Sources\n${sourceList}` : '',
      ].filter(Boolean).join('\n');

      res.json({
        contextText,
        query: search.query,
        moduleId: moduleId || null,
        areaId: areaId || null,
      });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Suggestions ──────────────────────────────────────────────────────────
  router.get('/pathfinder/suggestions', async (req: Request, res: Response) => {
    try {
      const uid = getUserId(req);
      const suggestions = await db.all(
        'SELECT * FROM pathfinder_suggestions WHERE user_id = ? AND dismissed = 0 ORDER BY created_at DESC LIMIT 10',
        uid
      );
      res.json({ suggestions });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/pathfinder/suggestions/:id/dismiss', async (req: Request, res: Response) => {
    try {
      await db.run('UPDATE pathfinder_suggestions SET dismissed = 1 WHERE id = ? AND user_id = ?', req.params.id, getUserId(req));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/pathfinder/suggestions/refresh', async (req: Request, res: Response) => {
    try {
      if (!anthropic) return res.status(503).json({ error: 'Anthropic API not configured' });
      const uid = getUserId(req);
      // Clear old suggestions
      await db.run('DELETE FROM pathfinder_suggestions WHERE user_id = ?', uid);
      const suggestions = await generateSuggestions(db, uid, anthropic);
      res.json({ suggestions });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Smart Action Bar — extract actionable items from synthesis ────────────

  router.post('/pathfinder/actions/smart', async (req: Request, res: Response) => {
    try {
      const { synthesis, searchMode, query } = req.body;
      if (!synthesis || !query) {
        res.status(400).json({ error: 'synthesis and query are required' });
        return;
      }
      const { analyzeForActions } = await import('../services/smart-actions-analyzer.js');
      const actions = await analyzeForActions(synthesis, searchMode || 'knowledge', query);
      res.json({ actions });
    } catch (err) {
      console.error('[pathfinder] Smart actions error:', err);
      res.status(500).json({ error: 'Failed to extract actions' });
    }
  });

  // ── Visitor Layer v0.8 endpoints ────────────────────────────────────────

  // GET /api/pathfinder/trending?since=24h&limit=10
  // Returns the top N distinct query_hashes by frequency in the window.
  // Time-windowed frequency only — no ML ranking, no user-level targeting.
  router.get('/pathfinder/trending', async (req: Request, res: Response) => {
    try {
      const since = typeof req.query.since === 'string' ? req.query.since : '24h';
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10)));
      const interval = since === '7d' ? '7 days' : since === '1h' ? '1 hour' : '24 hours';
      const rows = await db.all<{ query_hash: string; n: number | string }>(
        `SELECT query_hash, COUNT(*) AS n
         FROM pathfinder_search_log
         WHERE created_at > NOW() - INTERVAL '${interval}'
         GROUP BY query_hash
         ORDER BY n DESC
         LIMIT ?`,
        limit,
      );
      res.json({ trending: rows.map(r => ({ query_hash: r.query_hash, count: Number(r.n) })) });
    } catch (err) {
      console.error('[pathfinder] Trending error:', err);
      res.status(500).json({ error: 'Failed to fetch trending' });
    }
  });

  // POST /api/pathfinder/visitor-search
  // Records a search event + returns search_id. Clients pair this with the
  // existing /pathfinder/search SSE to get the search_id for feedback.
  router.post('/pathfinder/visitor-search', async (req: Request, res: Response) => {
    try {
      const { query, mode, scope, result_count } = req.body ?? {};
      if (typeof query !== 'string' || typeof mode !== 'string') {
        res.status(400).json({ error: 'query + mode required' }); return;
      }
      const userId = req.user?.id ?? null;
      const { createHash } = await import('crypto');
      const salt = userId ?? 'anon';
      const queryHash = createHash('sha256').update(`${query}|${salt}`).digest('hex');
      const result = await db.get<{ id: string }>(
        `INSERT INTO pathfinder_search_log (user_id, query_hash, mode, scope, result_count)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id`,
        userId, queryHash, mode,
        typeof scope === 'string' ? scope : null,
        typeof result_count === 'number' ? result_count : 0,
      );
      res.json({ search_id: result?.id });
    } catch (err) {
      console.error('[pathfinder] Visitor search log error:', err);
      res.status(500).json({ error: 'Failed to log search' });
    }
  });

  // POST /api/pathfinder/feedback
  // Visitor marks a result helpful / wrong-match / low-quality / spam.
  router.post('/pathfinder/feedback', async (req: Request, res: Response) => {
    try {
      const { search_id, result_ref, signal, note } = req.body ?? {};
      if (typeof result_ref !== 'string' || typeof signal !== 'string') {
        res.status(400).json({ error: 'result_ref + signal required' }); return;
      }
      if (!['helpful', 'wrong-match', 'low-quality', 'spam'].includes(signal)) {
        res.status(400).json({ error: 'signal must be helpful | wrong-match | low-quality | spam' }); return;
      }
      const userId = req.user?.id ?? null;
      await db.run(
        `INSERT INTO pathfinder_result_feedback (user_id, search_log_id, result_ref, signal, note)
         VALUES (?, ?, ?, ?, ?)`,
        userId,
        typeof search_id === 'string' ? search_id : null,
        result_ref, signal,
        typeof note === 'string' ? note.slice(0, 500) : null,
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[pathfinder] Feedback error:', err);
      res.status(500).json({ error: 'Failed to record feedback' });
    }
  });

  return router;
}
