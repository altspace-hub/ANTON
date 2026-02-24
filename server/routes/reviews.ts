import { Router } from 'express';
import type Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import { streamToResponse, isApiKeyConfigured } from '../services/claude-client.js';
import { REVIEW_MODES } from '../services/review-engine.js';
import { createReviewOrchestrator, type ReviewContext } from '../services/review-orchestrator.js';

export function createReviewRoutes(db: Database.Database, anthropic?: Anthropic) {
  const router = Router();
  const orchestrator = createReviewOrchestrator(anthropic);

  // GET /api/reviews/modes — list available review modes
  router.get('/reviews/modes', (_req, res) => {
    res.json(REVIEW_MODES.map(({ id, label, icon, description, color }) => ({ id, label, icon, description, color })));
  });

  // POST /api/reviews — run a review on content, streaming SSE
  router.post('/reviews', async (req, res) => {
    if (!isApiKeyConfigured()) {
      res.status(500).json({ error: 'API key not configured.' });
      return;
    }

    const { modeId, content, model, sessionId } = req.body as {
      modeId: string;
      content: string;
      model?: string;
      sessionId?: string;
    };

    if (!modeId || !content) {
      res.status(400).json({ error: 'modeId and content are required' });
      return;
    }

    const mode = REVIEW_MODES.find((m) => m.id === modeId);
    if (!mode) {
      res.status(400).json({ error: `Unknown review mode: ${modeId}` });
      return;
    }

    try {
      await streamToResponse(
        {
          model: ((model as string) || 'claude-opus-4-6') as 'claude-opus-4-6' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001',
          thinking: 'think_hard',
          system: mode.systemPrompt,
          messages: [
            {
              role: 'user',
              content: `Please review the following document:\n\n---\n\n${content}`,
            },
          ],
        },
        res,
        sessionId
          ? (data) => {
              try {
                db.prepare(
                  `INSERT INTO reviews (id, session_id, review_mode, content, created_at) VALUES (?, ?, ?, ?, ?)`
                ).run(crypto.randomUUID(), sessionId, modeId, data.text, new Date().toISOString());
              } catch {
                // Non-fatal
              }
            }
          : undefined
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Review failed';
      if (!res.headersSent) res.status(500).json({ error: message });
    }
  });

  // GET /api/reviews?sessionId= — list reviews for a session
  router.get('/reviews', (req, res) => {
    const { sessionId } = req.query as { sessionId?: string };
    if (!sessionId) { res.json([]); return; }
    try {
      const reviews = db.prepare('SELECT * FROM reviews WHERE session_id = ? ORDER BY created_at DESC').all(sessionId);
      res.json(reviews);
    } catch {
      res.json([]);
    }
  });

  /**
   * POST /api/reviews/orchestrate
   * Run all 5 review agents in parallel on output
   * Returns overall score + detailed findings from each agent
   */
  router.post('/reviews/orchestrate', async (req, res) => {
    const { output, context } = req.body as { output: string; context: ReviewContext };

    if (!output || !context) {
      res.status(400).json({ error: 'Missing required fields: output, context' });
      return;
    }

    try {
      const result = await orchestrator.runAllReviewers(output, context);
      res.json(result);
    } catch (error) {
      console.error('[review-orchestrator] Error running review engine:', error);
      res.status(500).json({
        error: 'Review engine failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  return router;
}
