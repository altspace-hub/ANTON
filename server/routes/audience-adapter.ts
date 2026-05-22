import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { AUDIENCES, getAudienceProfile } from '../services/audience-adapter.js';
import { callSync } from '../services/claude-client.js';
import { safeError } from '../lib/error-response.js';

export async function createAudienceAdapterRoutes(): Promise<Router> {
  const router = Router();

  // GET /api/audience-adapter/profiles — returns all audience profiles
  router.get('/audience-adapter/profiles', requireAuth, (_req, res) => {
    res.json(AUDIENCES);
  });

  // POST /api/audience-adapter/adapt
  // Body: { content: string, audienceId: string, model?: string }
  // Returns: { adapted: string }
  router.post('/audience-adapter/adapt', requireAuth, async (req, res) => {
    try {
      const { content, audienceId, model } = req.body as {
        content?: string;
        audienceId?: string;
        model?: string;
      };

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        res.status(400).json({ error: 'content is required and must be a non-empty string' });
        return;
      }

      if (!audienceId || typeof audienceId !== 'string') {
        res.status(400).json({ error: 'audienceId is required' });
        return;
      }

      const profile = getAudienceProfile(audienceId);
      if (!profile) {
        res.status(400).json({
          error: `Unknown audienceId "${audienceId}". Valid values: ${AUDIENCES.map((a) => a.id).join(', ')}`,
        });
        return;
      }

      const resolvedModel = (model as string | undefined) || 'claude-sonnet-4-5-20250929';

      const result = await callSync({
        model: resolvedModel as Parameters<typeof callSync>[0]['model'],
        thinking: 'think',
        system: profile.systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Please rewrite the following content for the ${profile.name} audience as described in your instructions.\n\n## CONTENT TO REWRITE\n\n${content}`,
          },
        ],
      });

      res.json({ adapted: result.text });
    } catch (error) {
      console.error('[audience-adapter] Adapt error:', error);
      res.status(500).json({
        error: safeError(error),
      });
    }
  });

  return router;
}
