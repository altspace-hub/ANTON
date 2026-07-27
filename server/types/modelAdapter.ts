// ═══════════════════════════════════════════════════════════
// Multi-LLM Model Adapter — Type definitions & registry
// ═══════════════════════════════════════════════════════════
//
// MODEL_REGISTRY is DERIVED from MODEL_CAPABILITIES (server/config/model-capabilities.ts),
// which is the single source of truth for pricing / context / output / provider.
// The presentation/capability fields that have no home in MODEL_CAPABILITIES
// (displayName, costTier, json/seed/thinking/native-reasoning flags) live ONCE in
// REGISTRY_SUPPLEMENT below. No pricing/context value is duplicated, so the
// "two registries drift" class (2026-05-30 audit, roadmap ⑤) is structurally gone:
// adding or repricing a model is a single edit in model-capabilities.ts.
// Guarded by tests/config/model-registry-consistency.test.ts.

import { MODEL_CAPABILITIES, type ModelCapabilities } from '../config/model-capabilities.js';

export type ModelProvider = 'anthropic' | 'openai' | 'azure_openai' | 'google' | 'mistral';
export type PrecisionLevel = 'strict' | 'precise' | 'balanced' | 'creative' | 'exploratory';

export interface ModelConfig {
  provider: ModelProvider;
  modelId: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsThinking: boolean;
  supportsJsonMode: boolean;
  supportsPromptCaching: boolean;
  supportsSeed: boolean;
  temperatureRange: [number, number];
  costPer1MInput: number;
  costPer1MOutput: number;
  requiresApiKey: string;
  costTier: 1 | 2 | 3; // 1=low 2=medium 3=high
  supportsNativeReasoning: boolean;
}

// ── Registry supplement ─────────────────────────────────────────────
// Per-model fields that the registry exposes but that are NOT pricing/context/
// output (those are the SoT in MODEL_CAPABILITIES). Hand-set, one entry per
// capabilities model. supportsThinking is hand-set (NOT derived from the caps
// adaptive/extended flags) because Gemini reports thinking=true while using
// neither Anthropic thinking API; supportsNativeReasoning likewise (Magistral
// uses prompt_mode:'reasoning' with both caps thinking flags false).
interface RegistrySupplement {
  displayName: string;
  costTier: 1 | 2 | 3;
  supportsThinking: boolean;
  supportsJsonMode: boolean;
  supportsSeed: boolean;
  supportsNativeReasoning: boolean;
}

const REGISTRY_SUPPLEMENT: Record<string, RegistrySupplement> = {
  'claude-opus-5':              { displayName: 'Claude Opus 5',     costTier: 3, supportsThinking: true,  supportsJsonMode: false, supportsSeed: false, supportsNativeReasoning: true  },
  'claude-sonnet-5':            { displayName: 'Claude Sonnet 5',   costTier: 2, supportsThinking: true,  supportsJsonMode: false, supportsSeed: false, supportsNativeReasoning: true  },
  'claude-fable-5':             { displayName: 'Claude Fable 5',    costTier: 3, supportsThinking: true,  supportsJsonMode: false, supportsSeed: false, supportsNativeReasoning: true  },
  'claude-opus-4-8':            { displayName: 'Claude Opus 4.8',   costTier: 3, supportsThinking: true,  supportsJsonMode: false, supportsSeed: false, supportsNativeReasoning: true  },
  'claude-opus-4-7':            { displayName: 'Claude Opus 4.7',   costTier: 3, supportsThinking: true,  supportsJsonMode: false, supportsSeed: false, supportsNativeReasoning: true  },
  'claude-opus-4-6':            { displayName: 'Claude Opus 4.6',   costTier: 3, supportsThinking: true,  supportsJsonMode: false, supportsSeed: false, supportsNativeReasoning: true  },
  'claude-sonnet-4-6':          { displayName: 'Claude Sonnet 4.6', costTier: 2, supportsThinking: true,  supportsJsonMode: false, supportsSeed: false, supportsNativeReasoning: true  },
  'claude-sonnet-4-5-20250929': { displayName: 'Claude Sonnet 4.5', costTier: 2, supportsThinking: true,  supportsJsonMode: false, supportsSeed: false, supportsNativeReasoning: true  },
  'claude-haiku-4-5-20251001':  { displayName: 'Claude Haiku 4.5',  costTier: 1, supportsThinking: true,  supportsJsonMode: false, supportsSeed: false, supportsNativeReasoning: false },
  'gpt-5.6-sol':                { displayName: 'GPT-5.6 Sol',       costTier: 3, supportsThinking: true,  supportsJsonMode: true,  supportsSeed: true,  supportsNativeReasoning: true  },
  'gpt-5.6-terra':              { displayName: 'GPT-5.6 Terra',     costTier: 2, supportsThinking: true,  supportsJsonMode: true,  supportsSeed: true,  supportsNativeReasoning: true  },
  'gpt-5.6-luna':               { displayName: 'GPT-5.6 Luna',      costTier: 1, supportsThinking: true,  supportsJsonMode: true,  supportsSeed: true,  supportsNativeReasoning: true  },
  'gpt-5.4':                    { displayName: 'GPT-5.4',           costTier: 3, supportsThinking: false, supportsJsonMode: true,  supportsSeed: true,  supportsNativeReasoning: false },
  'gpt-4.1':                    { displayName: 'GPT-4.1',           costTier: 3, supportsThinking: false, supportsJsonMode: true,  supportsSeed: true,  supportsNativeReasoning: false },
  'gpt-4o':                     { displayName: 'GPT-4o',            costTier: 2, supportsThinking: false, supportsJsonMode: true,  supportsSeed: true,  supportsNativeReasoning: false },
  'gpt-4o-mini':                { displayName: 'GPT-4o Mini',       costTier: 1, supportsThinking: false, supportsJsonMode: true,  supportsSeed: true,  supportsNativeReasoning: false },
  'gemini-2.5-pro':             { displayName: 'Gemini 2.5 Pro',    costTier: 3, supportsThinking: true,  supportsJsonMode: true,  supportsSeed: false, supportsNativeReasoning: true  },
  'gemini-2.5-flash':           { displayName: 'Gemini 2.5 Flash',  costTier: 2, supportsThinking: true,  supportsJsonMode: true,  supportsSeed: false, supportsNativeReasoning: true  },
  'gemini-2.0-flash':           { displayName: 'Gemini 2.0 Flash',  costTier: 1, supportsThinking: false, supportsJsonMode: true,  supportsSeed: false, supportsNativeReasoning: false },
  'mistral-large-latest':       { displayName: 'Mistral Large 3',   costTier: 3, supportsThinking: false, supportsJsonMode: true,  supportsSeed: true,  supportsNativeReasoning: false },
  'mistral-medium-latest':      { displayName: 'Mistral Medium 3.5',costTier: 2, supportsThinking: false, supportsJsonMode: true,  supportsSeed: true,  supportsNativeReasoning: false },
  'mistral-small-latest':       { displayName: 'Mistral Small 4',   costTier: 1, supportsThinking: false, supportsJsonMode: true,  supportsSeed: true,  supportsNativeReasoning: false },
  'magistral-medium-latest':    { displayName: 'Magistral Medium 1.2', costTier: 3, supportsThinking: false, supportsJsonMode: true, supportsSeed: true, supportsNativeReasoning: true },
  'magistral-small-latest':     { displayName: 'Magistral Small 1.2',  costTier: 2, supportsThinking: false, supportsJsonMode: true, supportsSeed: true, supportsNativeReasoning: true },
  'codestral-latest':           { displayName: 'Codestral',         costTier: 1, supportsThinking: false, supportsJsonMode: true,  supportsSeed: true,  supportsNativeReasoning: false },
  'devstral-medium-latest':     { displayName: 'Devstral 2 Medium', costTier: 2, supportsThinking: false, supportsJsonMode: true,  supportsSeed: true,  supportsNativeReasoning: false },
};

const API_KEY_ENV: Record<ModelProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  azure_openai: 'AZURE_OPENAI',
};

function capProviderToModelProvider(provider: ModelCapabilities['provider'], modelId: string): ModelProvider {
  // The static capabilities table never uses 'ollama' (ollama models resolve via
  // the DB custom-slot / hyphenated model-adapter path, not this registry).
  if (provider === 'ollama') {
    throw new Error(`MODEL_REGISTRY: capabilities provider 'ollama' for '${modelId}' has no static registry mapping`);
  }
  return provider;
}

function buildModelConfig(modelId: string, caps: ModelCapabilities, sup: RegistrySupplement): ModelConfig {
  const provider = capProviderToModelProvider(caps.provider, modelId);
  return {
    provider,
    modelId,
    displayName: sup.displayName,
    // Registry tracks the GA-default context; capabilities tracks the MAX
    // achievable (1M behind a beta header for some Claude models). Claude's GA
    // context is 200k before the 1M beta, so beta-gated models report 200k here.
    contextWindow: caps.requires1MBetaHeader ? 200_000 : caps.maxContextWindow,
    maxOutputTokens: caps.maxOutputTokens,
    supportsThinking: sup.supportsThinking,
    supportsJsonMode: sup.supportsJsonMode,
    supportsPromptCaching: provider === 'anthropic',
    supportsSeed: sup.supportsSeed,
    temperatureRange: provider === 'anthropic' ? [0, 1] : [0, 2],
    costPer1MInput: caps.pricing.inputPerMillion,
    costPer1MOutput: caps.pricing.outputPerMillion,
    requiresApiKey: API_KEY_ENV[provider],
    costTier: sup.costTier,
    supportsNativeReasoning: sup.supportsNativeReasoning,
  };
}

/**
 * MODEL_REGISTRY — derived projection of MODEL_CAPABILITIES. Drives the main
 * /api/claude dispatch. Each entry combines caps (pricing/context/output/provider)
 * with REGISTRY_SUPPLEMENT (presentation/capability flags). Fails loudly at module
 * load if a capabilities model lacks a supplement entry.
 */
export const MODEL_REGISTRY: Record<string, ModelConfig> = Object.fromEntries(
  Object.entries(MODEL_CAPABILITIES).map(([modelId, caps]) => {
    const sup = REGISTRY_SUPPLEMENT[modelId];
    if (!sup) {
      throw new Error(`MODEL_REGISTRY: missing REGISTRY_SUPPLEMENT entry for '${modelId}' (add it in modelAdapter.ts)`);
    }
    return [modelId, buildModelConfig(modelId, caps, sup)];
  }),
);

export const TEMPERATURE_MAP: Record<ModelProvider, Record<PrecisionLevel, number>> = {
  anthropic:     { strict: 0.0, precise: 0.2, balanced: 0.5, creative: 0.7, exploratory: 0.9 },
  openai:        { strict: 0.0, precise: 0.3, balanced: 0.7, creative: 1.2, exploratory: 1.6 },
  azure_openai:  { strict: 0.0, precise: 0.3, balanced: 0.7, creative: 1.2, exploratory: 1.6 },
  google:        { strict: 0.5, precise: 0.7, balanced: 1.0, creative: 1.0, exploratory: 1.2 },
  // Mistral API rejects temperature > 1.0 (422), so creative/exploratory are clamped to the max.
  mistral:       { strict: 0.0, precise: 0.3, balanced: 0.7, creative: 1.0, exploratory: 1.0 },
};

export function getTemperature(modelId: string, precision: PrecisionLevel): number {
  const config = MODEL_REGISTRY[modelId];
  if (!config) return 0.5;
  return TEMPERATURE_MAP[config.provider][precision];
}

export async function getModelConfig(modelId: string, db?: import('../db/database.js').DatabaseAdapter): Promise<ModelConfig | undefined> {
  const registryEntry = MODEL_REGISTRY[modelId];
  if (registryEntry) return registryEntry;

  // Fallback: check custom model slots in the database
  if (db) {
    for (const slot of [1, 2]) {
      try {
        const row = await db.get(`SELECT value FROM app_settings WHERE key = 'custom_model_slot_${slot}'`) as { value: string } | undefined;
        if (row) {
          const custom = JSON.parse(row.value) as {
            enabled: boolean; modelId: string; displayName: string;
            provider: ModelProvider; contextWindow: number; maxOutputTokens: number;
            inputCostPer1M: number; outputCostPer1M: number; costTier: 0 | 1 | 2 | 3;
            supportsThinking: boolean; supportsJsonMode: boolean;
            apiKeyEnvVar?: string;
          };
          if (custom.enabled && custom.modelId === modelId) {
            return {
              provider: custom.provider,
              modelId: custom.modelId,
              displayName: custom.displayName,
              contextWindow: custom.contextWindow,
              maxOutputTokens: custom.maxOutputTokens,
              supportsThinking: custom.supportsThinking,
              supportsJsonMode: custom.supportsJsonMode,
              supportsPromptCaching: false,
              supportsSeed: false,
              temperatureRange: custom.provider === 'anthropic' ? [0, 1] : [0, 2],
              costPer1MInput: custom.inputCostPer1M,
              costPer1MOutput: custom.outputCostPer1M,
              requiresApiKey: custom.apiKeyEnvVar || (
                custom.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' :
                custom.provider === 'openai' ? 'OPENAI_API_KEY' :
                custom.provider === 'google' ? 'GOOGLE_API_KEY' :
                'MISTRAL_API_KEY'
              ),
              costTier: (custom.costTier || 2) as 1 | 2 | 3,
              supportsNativeReasoning: custom.supportsThinking,
            };
          }
        }
      } catch {
        // Skip invalid entries
      }
    }
  }

  // Fallback: check Azure deployments
  if (db && modelId.startsWith('azure:')) {
    const deploymentName = modelId.replace('azure:', '');
    try {
      const dep = await db.get(
        'SELECT deployment_name, model_name, is_reasoning_model FROM azure_openai_deployments WHERE deployment_name = $1 AND is_active = TRUE',
        deploymentName
      ) as { deployment_name: string; model_name: string; is_reasoning_model: boolean } | undefined;
      if (dep) {
        return {
          provider: 'azure_openai' as ModelProvider,
          modelId,
          displayName: `Azure: ${dep.deployment_name}`,
          contextWindow: 128000,
          maxOutputTokens: 16384,
          supportsThinking: false,
          supportsJsonMode: true,
          supportsPromptCaching: false,
          supportsSeed: true,
          temperatureRange: [0, 2],
          costPer1MInput: 0,
          costPer1MOutput: 0,
          requiresApiKey: 'AZURE_OPENAI',
          costTier: 2,
          supportsNativeReasoning: dep.is_reasoning_model,
        };
      }
    } catch {
      // Skip
    }
  }

  return undefined;
}

export function isApiKeyAvailable(modelId: string): boolean {
  // Azure models use DB-stored credentials, not env vars
  if (modelId.startsWith('azure:')) return true;
  const config = MODEL_REGISTRY[modelId];
  if (!config) return false;
  return !!process.env[config.requiresApiKey];
}
