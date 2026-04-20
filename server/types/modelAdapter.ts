// ═══════════════════════════════════════════════════════════
// Multi-LLM Model Adapter — Type definitions & registry
// ═══════════════════════════════════════════════════════════

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

export const MODEL_REGISTRY: Record<string, ModelConfig> = {
  'claude-opus-4-7': {
    provider: 'anthropic',
    modelId: 'claude-opus-4-7',
    displayName: 'Claude Opus 4.7',
    contextWindow: 1000000,
    maxOutputTokens: 128000,
    supportsThinking: true,
    supportsJsonMode: false,
    supportsPromptCaching: true,
    supportsSeed: false,
    temperatureRange: [0, 1],
    costPer1MInput: 5,
    costPer1MOutput: 25,
    requiresApiKey: 'ANTHROPIC_API_KEY',
    costTier: 3,
    supportsNativeReasoning: true,
  },
  'claude-sonnet-4-6': {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    contextWindow: 1000000,             // 1M context GA (no beta header needed)
    maxOutputTokens: 64000,
    supportsThinking: true,
    supportsJsonMode: false,
    supportsPromptCaching: true,
    supportsSeed: false,
    temperatureRange: [0, 1],
    costPer1MInput: 3,
    costPer1MOutput: 15,
    requiresApiKey: 'ANTHROPIC_API_KEY',
    costTier: 2,
    supportsNativeReasoning: true,
  },
  'claude-sonnet-4-5-20250929': {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5-20250929',
    displayName: 'Claude Sonnet 4.5',
    contextWindow: 200000,
    maxOutputTokens: 64000,
    supportsThinking: true,
    supportsJsonMode: false,
    supportsPromptCaching: true,
    supportsSeed: false,
    temperatureRange: [0, 1],
    costPer1MInput: 3,
    costPer1MOutput: 15,
    requiresApiKey: 'ANTHROPIC_API_KEY',
    costTier: 2,
    supportsNativeReasoning: true,
  },
  'claude-haiku-4-5-20251001': {
    provider: 'anthropic',
    modelId: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku 4.5',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsThinking: true,             // Haiku supports extended thinking
    supportsJsonMode: false,
    supportsPromptCaching: true,
    supportsSeed: false,
    temperatureRange: [0, 1],
    costPer1MInput: 0.80,
    costPer1MOutput: 4,
    requiresApiKey: 'ANTHROPIC_API_KEY',
    costTier: 1,
    supportsNativeReasoning: false,
  },
  // ── OpenAI ─────────────────────────────────────────────────
  'gpt-5.4': {
    provider: 'openai',
    modelId: 'gpt-5.4',
    displayName: 'GPT-5.4',
    contextWindow: 256000,
    maxOutputTokens: 32768,
    supportsThinking: false,
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: true,
    temperatureRange: [0, 2],
    costPer1MInput: 5,
    costPer1MOutput: 15,
    requiresApiKey: 'OPENAI_API_KEY',
    costTier: 3,
    supportsNativeReasoning: false,
  },
  'gpt-4.1': {
    provider: 'openai',
    modelId: 'gpt-4.1',
    displayName: 'GPT-4.1',
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    supportsThinking: false,
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: true,
    temperatureRange: [0, 2],
    costPer1MInput: 2,
    costPer1MOutput: 8,
    requiresApiKey: 'OPENAI_API_KEY',
    costTier: 3,
    supportsNativeReasoning: false,
  },
  'gpt-4o': {
    provider: 'openai',
    modelId: 'gpt-4o',
    displayName: 'GPT-4o',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsThinking: false,
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: true,
    temperatureRange: [0, 2],
    costPer1MInput: 2.5,
    costPer1MOutput: 10,
    requiresApiKey: 'OPENAI_API_KEY',
    costTier: 2,
    supportsNativeReasoning: false,
  },
  'gpt-4o-mini': {
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsThinking: false,
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: true,
    temperatureRange: [0, 2],
    costPer1MInput: 0.15,
    costPer1MOutput: 0.6,
    requiresApiKey: 'OPENAI_API_KEY',
    costTier: 1,
    supportsNativeReasoning: false,
  },
  // ── Google Gemini ───────────────────────────────────────────
  'gemini-2.5-pro': {
    provider: 'google',
    modelId: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsThinking: true,
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: false,
    temperatureRange: [0, 2],
    costPer1MInput: 1.25,
    costPer1MOutput: 10,
    requiresApiKey: 'GOOGLE_API_KEY',
    costTier: 3,
    supportsNativeReasoning: true,
  },
  'gemini-2.5-flash': {
    provider: 'google',
    modelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    supportsThinking: true,
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: false,
    temperatureRange: [0, 2],
    costPer1MInput: 0.3,
    costPer1MOutput: 2.5,
    requiresApiKey: 'GOOGLE_API_KEY',
    costTier: 2,
    supportsNativeReasoning: true,
  },
  'gemini-2.0-flash': {
    provider: 'google',
    modelId: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsThinking: false,
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: false,
    temperatureRange: [0, 2],
    costPer1MInput: 0.1,
    costPer1MOutput: 0.4,
    requiresApiKey: 'GOOGLE_API_KEY',
    costTier: 1,
    supportsNativeReasoning: false,
  },
  // ── Mistral (verified from docs.mistral.ai 2026-03-15) ──────
  'mistral-large-latest': {
    provider: 'mistral',
    modelId: 'mistral-large-latest',
    displayName: 'Mistral Large 3',
    contextWindow: 256000,             // 256K (Large 3, Dec 2025)
    maxOutputTokens: 128000,           // Match Opus tier
    supportsThinking: false,
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: true,
    temperatureRange: [0, 2],
    costPer1MInput: 0.50,
    costPer1MOutput: 1.50,
    requiresApiKey: 'MISTRAL_API_KEY',
    costTier: 3,
    supportsNativeReasoning: false,
  },
  'mistral-medium-latest': {
    provider: 'mistral',
    modelId: 'mistral-medium-latest',
    displayName: 'Mistral Medium 3.1',
    contextWindow: 128000,
    maxOutputTokens: 64000,            // Match Sonnet tier
    supportsThinking: false,
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: true,
    temperatureRange: [0, 2],
    costPer1MInput: 0.40,
    costPer1MOutput: 2.00,
    requiresApiKey: 'MISTRAL_API_KEY',
    costTier: 2,
    supportsNativeReasoning: false,
  },
  'mistral-small-latest': {
    provider: 'mistral',
    modelId: 'mistral-small-latest',
    displayName: 'Mistral Small 3.2',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsThinking: false,
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: true,
    temperatureRange: [0, 2],
    costPer1MInput: 0.10,
    costPer1MOutput: 0.30,
    requiresApiKey: 'MISTRAL_API_KEY',
    costTier: 1,
    supportsNativeReasoning: false,
  },
  // ── Magistral (reasoning models) ──────────────────────────────
  'magistral-medium-latest': {
    provider: 'mistral',
    modelId: 'magistral-medium-latest',
    displayName: 'Magistral Medium 1.2',
    contextWindow: 128000,
    maxOutputTokens: 64000,
    supportsThinking: false,           // Uses prompt_mode: "reasoning" instead
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: true,
    temperatureRange: [0, 2],
    costPer1MInput: 2.00,
    costPer1MOutput: 5.00,
    requiresApiKey: 'MISTRAL_API_KEY',
    costTier: 3,
    supportsNativeReasoning: true,     // Magistral supports native reasoning
  },
  'magistral-small-latest': {
    provider: 'mistral',
    modelId: 'magistral-small-latest',
    displayName: 'Magistral Small 1.2',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsThinking: false,
    supportsJsonMode: true,
    supportsPromptCaching: false,
    supportsSeed: true,
    temperatureRange: [0, 2],
    costPer1MInput: 0.50,
    costPer1MOutput: 1.50,
    requiresApiKey: 'MISTRAL_API_KEY',
    costTier: 2,
    supportsNativeReasoning: true,
  },
};

export const TEMPERATURE_MAP: Record<ModelProvider, Record<PrecisionLevel, number>> = {
  anthropic:     { strict: 0.0, precise: 0.2, balanced: 0.5, creative: 0.7, exploratory: 0.9 },
  openai:        { strict: 0.0, precise: 0.3, balanced: 0.7, creative: 1.2, exploratory: 1.6 },
  azure_openai:  { strict: 0.0, precise: 0.3, balanced: 0.7, creative: 1.2, exploratory: 1.6 },
  google:        { strict: 0.5, precise: 0.7, balanced: 1.0, creative: 1.0, exploratory: 1.2 },
  mistral:       { strict: 0.0, precise: 0.3, balanced: 0.7, creative: 1.2, exploratory: 1.6 },
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
