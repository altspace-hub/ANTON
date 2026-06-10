import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { PERSISTABLE_ENV_KEYS, persistEnvKey } from '../services/env-keys-store.js';
import { resetClient as resetAnthropicClient } from '../services/claude-client.js';

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

// Single allowlist shared with the boot-time loader (env-keys-store.ts).
// Includes ANTHROPIC_API_KEY so a fresh GitHub-clone install can paste its
// key in Settings without ever touching .env.
const ALLOWED_KEYS = PERSISTABLE_ENV_KEYS;

export async function createSettingsRoutes(db: DatabaseAdapter) {
  const router = Router();

  // POST /api/settings/set-env — set a provider API key. Applies immediately
  // (process.env + cached-client invalidation) AND persists to app_settings
  // so the key survives restarts (restored at boot by env-keys-store.ts).
  // SECURITY: never log or echo key values — names + booleans only.
  router.post('/settings/set-env', async (req, res) => {
    const { key, value } = req.body as { key?: string; value?: string };

    if (!key || typeof key !== 'string') {
      res.status(400).json({ error: 'Missing or invalid key' });
      return;
    }

    if (!ALLOWED_KEYS.has(key)) {
      res.status(403).json({ error: `Setting '${key}' is not allowed via this endpoint` });
      return;
    }

    const trimmed = typeof value === 'string' ? value.trim() : '';
    const configured = trimmed.length > 0;

    if (configured) {
      process.env[key] = trimmed;
    } else {
      delete process.env[key];
    }

    // The Anthropic client is a module-level singleton constructed once —
    // drop it so the next request picks up the new (or cleared) key.
    if (key === 'ANTHROPIC_API_KEY') resetAnthropicClient();

    // Write-through persistence (encrypted at rest when
    // INSTANCE_KEY_ENCRYPTION_KEY is set). A persistence failure must not
    // undo the runtime set — report it so the UI can warn.
    let persisted = true;
    try {
      await persistEnvKey(db, key, configured ? trimmed : null);
    } catch (err) {
      persisted = false;
      console.error(`[settings] failed to persist ${key}:`, err instanceof Error ? err.message : err);
    }

    console.log(`[settings] ${configured ? 'Set' : 'Cleared'} ${key}${persisted ? ' (persisted)' : ' (runtime only — persistence failed)'}`);
    res.json({ ok: true, key, configured, persisted });
  });

  // GET /api/settings/provider-status — check which provider keys are configured
  router.get('/settings/provider-status', async (_req, res) => {
    res.json({
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY,
      MISTRAL_API_KEY: !!process.env.MISTRAL_API_KEY,
    });
  });

  // GET /api/settings/custom-models — return both custom model slot configs
  router.get('/settings/custom-models', async (_req, res) => {
    try {
      const slot1Row = await db.get("SELECT value FROM app_settings WHERE key = 'custom_model_slot_1'") as { value: string } | undefined;
      const slot2Row = await db.get("SELECT value FROM app_settings WHERE key = 'custom_model_slot_2'") as { value: string } | undefined;

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
  router.post('/settings/custom-models', async (req, res) => {
    const { slot, config } = req.body as { slot?: number; config?: CustomModelConfig | null };

    if (slot !== 1 && slot !== 2) {
      res.status(400).json({ error: 'slot must be 1 or 2' });
      return;
    }

    const settingKey = `custom_model_slot_${slot}`;

    try {
      if (config === null || config === undefined) {
        // Clear the slot
        await db.run("DELETE FROM app_settings WHERE key = ?", settingKey);
        console.log(`[settings] Cleared custom model slot ${slot}`);
      } else {
        const jsonValue = JSON.stringify(config);
        await db.run(
          "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        , settingKey, jsonValue);

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
