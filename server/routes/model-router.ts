import { Router } from 'express';
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { recommendModel } from '../services/model-router.js';
import { getEffectiveDefaultModel } from '../services/default-model-store.js';

export function createModelRouterRoutes(db?: DatabaseAdapter): Router {
  const router = Router();

  // POST /api/model-router/recommend
  // Body: { moduleId?, thinkingLevel?, outputFormats?, areaId? }
  // Returns: ModelRecommendation (provider-aware, registry-derived — Wave 3.7)
  router.post('/model-router/recommend', requireAuth, (req, res) => {
    try {
      const { moduleId, thinkingLevel, outputFormats, areaId } = req.body as {
        moduleId?: string;
        thinkingLevel?: string;
        outputFormats?: string[];
        areaId?: string;
      };

      const recommendation = recommendModel({
        moduleId,
        thinkingLevel,
        outputFormats,
        areaId,
        defaultModel: getEffectiveDefaultModel(),
      });

      res.json(recommendation);
    } catch (error) {
      console.error('[model-router] Recommendation error:', error);
      res.status(500).json({ error: 'Failed to generate model recommendation' });
    }
  });

  // POST /api/model-router/feedback
  // Body: { event: 'accepted'|'dismissed', recommendedModel, selectedModel?, provider?, moduleId?, thinkingLevel? }
  // Lightweight accept/dismiss logging (migration 226: model_recommendation_events)
  // so the recommender's acceptance rate is measurable — the validation gate.
  router.post('/model-router/feedback', requireAuth, async (req, res) => {
    try {
      const { event, recommendedModel, selectedModel, provider, moduleId, thinkingLevel } = req.body as {
        event?: string;
        recommendedModel?: string;
        selectedModel?: string;
        provider?: string;
        moduleId?: string;
        thinkingLevel?: string;
      };

      if (event !== 'accepted' && event !== 'dismissed') {
        return res.status(400).json({ error: "event must be 'accepted' or 'dismissed'" });
      }
      if (!recommendedModel || typeof recommendedModel !== 'string') {
        return res.status(400).json({ error: 'recommendedModel is required' });
      }

      if (db) {
        try {
          await db.run(`
            INSERT INTO model_recommendation_events
              (id, event, recommended_model, selected_model, provider, module_id, thinking_level)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
            randomUUID(),
            event,
            recommendedModel.slice(0, 200),
            selectedModel ? String(selectedModel).slice(0, 200) : null,
            provider ? String(provider).slice(0, 50) : null,
            moduleId ? String(moduleId).slice(0, 200) : null,
            thinkingLevel ? String(thinkingLevel).slice(0, 50) : null
          );
        } catch (err) {
          // Table may not exist yet (migration pending) — never block the UI.
          console.warn('[model-router] feedback log skipped:', err instanceof Error ? err.message : 'db error');
        }
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('[model-router] Feedback error:', error);
      res.status(500).json({ error: 'Failed to record feedback' });
    }
  });

  return router;
}
