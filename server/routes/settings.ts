import { Router } from 'express';
import { requireAdminOrSolo } from '../middleware/role-guards.js';
import type { DatabaseAdapter } from '../db/database.js';
import { PERSISTABLE_ENV_KEYS, persistEnvKey } from '../services/env-keys-store.js';
import { resetClient as resetAnthropicClient } from '../services/claude-client.js';
import {
  initDefaultModelStore,
  getPersistedDefaultModelSync,
  setPersistedDefaultModel,
} from '../services/default-model-store.js';
import { initAreaDefaultModelStore } from '../services/area-default-model-store.js';
import { initCodingModelStrategy } from '../services/coding-model-resolver.js';
import { getCustomModelConfigs } from '../services/model-adapter.js';
import {
  DEFAULT_UTILITY_MODEL,
  initUtilityModelStore,
  getUtilityModelSync,
  setUtilityModel,
  isValidUtilityModelId,
} from '../services/utility-model.js';
import {
  DEFAULT_VERIFIER_MODEL,
  initVerifierStore,
  isDoubleCheckEnabledSync,
  getVerifierModelSync,
  setDoubleCheckEnabled,
  setVerifierModel,
  isValidVerifierModelId,
} from '../services/verifier-model.js';
import { getParseStats } from '../services/parse-telemetry.js';
import { initSdkEngineStore, isSdkEngineEnabled, setSdkEngineEnabled } from '../services/sdk-engine-store.js';
import { testSdkEngine, SDK_ENGINE_MODELS } from '../services/claude-sdk-client.js';
import { initCodexEngineStore, isCodexEngineEnabled, setCodexEngineEnabled } from '../services/codex-engine-store.js';
import { testCodexEngine, CODEX_ENGINE_MODELS } from '../services/codex-sdk-client.js';

// Model-id prefixes accepted as a server-side default. Anything else must
// match a configured custom-model slot (checked against the DB below).
const KNOWN_MODEL_PREFIXES = [
  'claude-', 'gpt-', 'gemini-', 'mistral-', 'magistral-',
  'codestral', 'devstral', 'azure:', 'ollama:', 'compat:', 'sdk:', 'codex:',
];

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

  // Prime the server-side default-model + utility-model caches at boot so
  // the sync resolvers never miss on first call.
  initDefaultModelStore(db);
  initUtilityModelStore(db);
  // Prime the double-check (four-eyes) settings cache at boot.
  initVerifierStore(db);
  // ANTON Studio P0: prime the per-area default + coding role-strategy caches.
  initAreaDefaultModelStore(db);
  initCodingModelStrategy(db);
  // Prime the SDK execution-engine toggle cache.
  initSdkEngineStore(db);

  // ── SDK execution engine (Claude Agent SDK / subscription auth) ─────────
  // GET is open (booleans + static model list, no secrets — same rule as the
  // other GET routes here). Mutations are admin-gated like every other
  // instance-wide setting.
  router.get('/settings/sdk-engine', async (_req, res) => {
    res.json({
      enabled: isSdkEngineEnabled(),
      models: SDK_ENGINE_MODELS,
    });
  });

  router.post('/settings/sdk-engine', requireAdminOrSolo, async (req, res) => {
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    await setSdkEngineEnabled(db, enabled);
    console.log(`[settings] SDK execution engine ${enabled ? 'enabled' : 'disabled'}`);
    res.json({ ok: true, enabled });
  });

  // POST /api/settings/sdk-engine/test — a one-word live ping through the
  // engine (bypasses the enabled gate so users can test BEFORE enabling).
  // Spawns the Claude Code runtime; response reports honest status either way.
  router.post('/settings/sdk-engine/test', requireAdminOrSolo, async (_req, res) => {
    const result = await testSdkEngine();
    res.json(result);
  });

  // ── ChatGPT execution engine (Codex SDK / ChatGPT-subscription auth) ────
  // Same contract as the Claude engine routes above.
  initCodexEngineStore(db);

  router.get('/settings/codex-engine', async (_req, res) => {
    res.json({
      enabled: isCodexEngineEnabled(),
      models: CODEX_ENGINE_MODELS,
    });
  });

  router.post('/settings/codex-engine', requireAdminOrSolo, async (req, res) => {
    const { enabled } = req.body as { enabled?: unknown };
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }
    await setCodexEngineEnabled(db, enabled);
    console.log(`[settings] ChatGPT (Codex) execution engine ${enabled ? 'enabled' : 'disabled'}`);
    res.json({ ok: true, enabled });
  });

  router.post('/settings/codex-engine/test', requireAdminOrSolo, async (_req, res) => {
    const result = await testCodexEngine();
    res.json(result);
  });

  // GET /api/settings/default-model — the server-side default model and
  // where it comes from (Settings persistence vs .env vs unset).
  router.get('/settings/default-model', async (_req, res) => {
    const persisted = getPersistedDefaultModelSync();
    const model = persisted ?? process.env.DEFAULT_MODEL ?? null;
    res.json({
      model,
      source: persisted ? 'settings' : (process.env.DEFAULT_MODEL ? 'env' : null),
    });
  });

  // POST /api/settings/default-model — persist the Settings default-model
  // choice server-side (app_settings 'default_model'; plain value, not a
  // secret). This is what makes the Settings picker govern missions /
  // agents / renderers / extractor — not just module runs. Empty/null
  // clears the row (env DEFAULT_MODEL applies again).
  // SECURITY (2026-07-27 survey): every MUTATING route here is instance-wide config.
  // They were completely ungated, so in DEPLOYMENT_MODE=team any authenticated user —
  // including a `viewer` — could overwrite the org's provider API keys or repoint the
  // default model. Combined with creating a compat endpoint, that routes EVERY user's
  // module runs (client documents, legal analysis) to an attacker-controlled URL.
  // requireAdminOrSolo is a no-op in solo mode (authMiddleware stamps role:'admin'),
  // so single-user installs are unaffected. GET routes stay open — the app needs them
  // to render, and they expose names/booleans, never key values.
  router.post('/settings/default-model', requireAdminOrSolo, async (req, res) => {
    const { model } = req.body as { model?: string | null };

    if (model === null || model === undefined || model === '') {
      await setPersistedDefaultModel(db, null);
      console.log('[settings] Cleared server-side default model');
      res.json({ ok: true, model: null });
      return;
    }

    if (typeof model !== 'string' || model.length > 200) {
      res.status(400).json({ error: 'model must be a string of at most 200 characters' });
      return;
    }

    const known = KNOWN_MODEL_PREFIXES.some((p) => model.startsWith(p));
    if (!known) {
      // Allow custom-slot model ids (arbitrary ids with a configured provider)
      const customModels = await getCustomModelConfigs(db);
      if (!customModels.some((m) => m.modelId === model)) {
        res.status(400).json({ error: `Unrecognised model id '${model}' — expected a known provider prefix or a configured custom model` });
        return;
      }
    }

    await setPersistedDefaultModel(db, model);
    console.log(`[settings] Set server-side default model: ${model}`);
    res.json({ ok: true, model });
  });

  // GET /api/settings/utility-model — the model used for background utility
  // calls (extraction, scoring, naming, classification). Review 3.8.
  router.get('/settings/utility-model', async (_req, res) => {
    const persisted = getUtilityModelSync();
    res.json({
      model: persisted,
      isDefault: persisted === DEFAULT_UTILITY_MODEL,
      default: DEFAULT_UTILITY_MODEL,
    });
  });

  // POST /api/settings/utility-model — persist the utility-model choice
  // (app_settings 'utility_model'; plain value, not a secret). Consumed by
  // the ~38 utility call-sites via server/services/utility-model.ts. Empty/
  // null clears the row (default Haiku applies again). Validated against
  // the model registry; dynamic ollama:/compat:/azure: ids and configured
  // custom-slot models are accepted.
  router.post('/settings/utility-model', requireAdminOrSolo, async (req, res) => {
    const { model } = req.body as { model?: string | null };

    if (model === null || model === undefined || model === '') {
      await setUtilityModel(db, null);
      console.log('[settings] Cleared utility model (default applies)');
      res.json({ ok: true, model: DEFAULT_UTILITY_MODEL, isDefault: true });
      return;
    }

    if (typeof model !== 'string' || model.length > 200) {
      res.status(400).json({ error: 'model must be a string of at most 200 characters' });
      return;
    }

    if (!isValidUtilityModelId(model)) {
      // Allow custom-slot model ids (arbitrary ids with a configured provider)
      const customModels = await getCustomModelConfigs(db);
      if (!customModels.some((m) => m.modelId === model)) {
        res.status(400).json({ error: `Unrecognised model id '${model}' — expected a model-registry id, an ollama:/compat:/azure: id, or a configured custom model` });
        return;
      }
    }

    await setUtilityModel(db, model);
    console.log(`[settings] Set utility model: ${model}`);
    res.json({ ok: true, model, isDefault: model === DEFAULT_UTILITY_MODEL });
  });

  // GET /api/settings/double-check — the optional "four-eyes" secondary review.
  // OFF by default. When enabled, a second (verifier) model scrutinises a primary
  // AI output and can escalate to a human (see four-eyes-review.ts). Currently
  // wired to the seller auto-quote path; extensible to other surfaces.
  router.get('/settings/double-check', async (_req, res) => {
    const model = getVerifierModelSync();
    res.json({
      enabled: isDoubleCheckEnabledSync(),
      model,
      isDefault: model === DEFAULT_VERIFIER_MODEL,
      default: DEFAULT_VERIFIER_MODEL,
    });
  });

  // POST /api/settings/double-check — persist the toggle and/or the verifier model.
  // Body: { enabled?: boolean, model?: string | null }. Empty/null model clears the
  // row (default Haiku applies). Model id validated like the utility model.
  router.post('/settings/double-check', requireAdminOrSolo, async (req, res) => {
    const { enabled, model } = req.body as { enabled?: unknown; model?: string | null };

    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be a boolean' });
        return;
      }
      await setDoubleCheckEnabled(db, enabled);
    }

    if (model !== undefined) {
      if (model === null || model === '') {
        await setVerifierModel(db, null);
      } else if (typeof model !== 'string' || model.length > 200) {
        res.status(400).json({ error: 'model must be a string of at most 200 characters' });
        return;
      } else {
        if (!isValidVerifierModelId(model)) {
          const customModels = await getCustomModelConfigs(db);
          if (!customModels.some((m) => m.modelId === model)) {
            res.status(400).json({ error: `Unrecognised model id '${model}' — expected a model-registry id, an ollama:/compat:/azure: id, or a configured custom model` });
            return;
          }
        }
        await setVerifierModel(db, model);
      }
    }

    const finalModel = getVerifierModelSync();
    console.log(`[settings] double-check enabled=${isDoubleCheckEnabledSync()} model=${finalModel}`);
    res.json({
      ok: true,
      enabled: isDoubleCheckEnabledSync(),
      model: finalModel,
      isDefault: finalModel === DEFAULT_VERIFIER_MODEL,
    });
  });

  // GET /api/settings/parse-stats — JSON-parse success/failure counters per
  // (service, model) for the learning-layer utility calls (review 3.1 —
  // effectiveness must be measurable). Feeds the cost-effective health view.
  router.get('/settings/parse-stats', async (_req, res) => {
    res.json({ stats: await getParseStats(db) });
  });

  // POST /api/settings/set-env — set a provider API key. Applies immediately
  // (process.env + cached-client invalidation) AND persists to app_settings
  // so the key survives restarts (restored at boot by env-keys-store.ts).
  // SECURITY: never log or echo key values — names + booleans only.
  router.post('/settings/set-env', requireAdminOrSolo, async (req, res) => {
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
  router.post('/settings/custom-models', requireAdminOrSolo, async (req, res) => {
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
