import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import Anthropic from '@anthropic-ai/sdk';
import { streamToResponse, isApiKeyConfigured } from '../services/claude-client.js';
import { streamChat, mapModelToProvider, setSSEHeaders } from '../services/provider-router.js';
import { REVIEW_MODES } from '../services/review-engine.js';
import { createReviewOrchestrator, type ReviewContext } from '../services/review-orchestrator.js';
import { safeError } from '../lib/error-response.js';

export async function createReviewRoutes(db: DatabaseAdapter, anthropic?: Anthropic) {
  const router = Router();
  const orchestrator = await createReviewOrchestrator(anthropic);

  // GET /api/reviews/modes — list available review modes
  router.get('/reviews/modes', async (_req, res) => {
    res.json(REVIEW_MODES.map(({ id, label, icon, description, color }) => ({ id, label, icon, description, color })));
  });

  // POST /api/reviews — run a review on content, streaming SSE
  router.post('/reviews', async (req, res) => {
    if (!isApiKeyConfigured() && !process.env.MISTRAL_API_KEY && !process.env.OPENAI_API_KEY && !process.env.GOOGLE_API_KEY) {
      res.status(500).json({ error: 'No AI provider API key configured.' });
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
      const resolvedModel = mapModelToProvider((model as string) || 'claude-opus-4-8');

      setSSEHeaders(res);

      const result = await streamChat({
        model: resolvedModel,
        system: mode.systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Please review the following document:\n\n---\n\n${content}`,
          },
        ],
        maxTokens: 16000,
        thinkingLevel: 'investigate',
      }, res);

      // Send completion event
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();

      // Save review to database
      if (sessionId) {
        try {
          await db.run(
            `INSERT INTO reviews (id, session_id, review_mode, content, created_at) VALUES (?, ?, ?, ?, ?)`
          , crypto.randomUUID(), sessionId, modeId, result.text, new Date().toISOString());
        } catch {
          // Non-fatal
        }
      }
    } catch (error) {
      const message = safeError(error);
      if (!res.headersSent) res.status(500).json({ error: message });
    }
  });

  // GET /api/reviews?sessionId= — list reviews for a session
  router.get('/reviews', async (req, res) => {
    const { sessionId } = req.query as { sessionId?: string };
    if (!sessionId) { res.json([]); return; }
    try {
      const reviews = await db.all(
        `SELECT * FROM reviews WHERE session_id = ? ORDER BY created_at DESC`,
        sessionId,
      );
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
        message: safeError(error),
      });
    }
  });

  return router;
}
