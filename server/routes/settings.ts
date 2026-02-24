import { Router } from 'express';
import type Database from 'better-sqlite3';

export interface CustomModelConfig {
  enabled: boolean;
  displayName: string;
  modelId: string;
  provider: 'anthropic' | 'openai' | 'google' | 'mistral';
  apiKeyEnvVar?: string;
  apiKeyOverride?: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
  costTier: 0 | 1 | 2 | 3;
  supportsThinking: boolean;
  supportsJsonMode: boolean;
}

const ALLOWED_KEYS = new Set([
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'MISTRAL_API_KEY',
  'CUSTOM_MODEL_1_API_KEY',
  'CUSTOM_MODEL_2_API_KEY',
]);

export function createSettingsRoutes(db: Database.Database) {
  const router = Router();

  // POST /api/settings/set-env — runtime-only environment variable setter (dev convenience)
  router.post('/settings/set-env', (req, res) => {
    const { key, value } = req.body as { key?: string; value?: string };

    if (!key || typeof key !== 'string') {
      res.status(400).json({ error: 'Missing or invalid key' });
      return;
    }

    if (!ALLOWED_KEYS.has(key)) {
      res.status(403).json({ error: `Setting '${key}' is not allowed via this endpoint` });
      return;
    }

    if (value && typeof value === 'string' && value.trim().length > 0) {
      process.env[key] = value.trim();
      console.log(`[settings] Set ${key} (runtime only)`);
      res.json({ ok: true, key, configured: true });
    } else {
      delete process.env[key];
      console.log(`[settings] Cleared ${key}`);
      res.json({ ok: true, key, configured: false });
    }
  });

  // GET /api/settings/provider-status — check which provider keys are configured
  router.get('/settings/provider-status', (_req, res) => {
    res.json({
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
      MISTRAL_API_KEY: !!process.env.MISTRAL_API_KEY,
    });
  });

  // GET /api/settings/custom-models — return both custom model slot configs
  router.get('/settings/custom-models', (_req, res) => {
    try {
      const slot1Row = db.prepare("SELECT value FROM app_settings WHERE key = 'custom_model_slot_1'").get() as { value: string } | undefined;
      const slot2Row = db.prepare("SELECT value FROM app_settings WHERE key = 'custom_model_slot_2'").get() as { value: string } | undefined;

      res.json({
        slot1: slot1Row ? JSON.parse(slot1Row.value) as CustomModelConfig : null,
        slot2: slot2Row ? JSON.parse(slot2Row.value) as CustomModelConfig : null,
      });
    } catch (error) {
      console.error('[settings] Failed to load custom models:', error);
      res.json({ slot1: null, slot2: null });
    }
  });

  // POST /api/settings/custom-models — save a custom model config for a slot
  router.post('/settings/custom-models', (req, res) => {
    const { slot, config } = req.body as { slot?: number; config?: CustomModelConfig | null };

    if (slot !== 1 && slot !== 2) {
      res.status(400).json({ error: 'slot must be 1 or 2' });
      return;
    }

    const settingKey = `custom_model_slot_${slot}`;

    try {
      if (config === null || config === undefined) {
        // Clear the slot
        db.prepare("DELETE FROM app_settings WHERE key = ?").run(settingKey);
        console.log(`[settings] Cleared custom model slot ${slot}`);
      } else {
        const jsonValue = JSON.stringify(config);
        db.prepare(
          "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).run(settingKey, jsonValue);

        // If there's an API key override, also set it in the runtime env
        if (config.apiKeyOverride) {
          process.env[`CUSTOM_MODEL_${slot}_API_KEY`] = config.apiKeyOverride;
        }

        console.log(`[settings] Saved custom model slot ${slot}: ${config.displayName} (${config.modelId})`);
      }

      res.json({ ok: true, slot });
    } catch (error) {
      console.error(`[settings] Failed to save custom model slot ${slot}:`, error);
      res.status(500).json({ error: 'Failed to save custom model configuration' });
    }
  });

  return router;
}
