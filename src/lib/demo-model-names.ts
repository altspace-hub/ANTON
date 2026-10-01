/**
 * demo-model-names.ts — the names the demo's legal texts and sign-up form
 * give the models a demo offers (DEMO_OFFERED_MODELS and the server's
 * default model, from /api/config).
 *
 * The privacy notice and the terms name the model that answers and who made
 * it. They used to name GLM 5.3 Flash in the text itself; when Inceptron
 * stopped serving it (429 "rate-limited upstream", 2026-10-01) the default had
 * to move, and the text with it. Now the texts carry [[DEFAULT_MODEL]],
 * [[OTHER_MODELS]] and [[MODEL_MAKERS]], filled from the server's settings.
 */
import type { DemoConfig } from '@/lib/demo-config';

/** Display names for the models a showcase offers; anything else is shown by its id. */
const KNOWN_NAMES: Readonly<Record<string, string>> = {
  'z-ai/glm-5.3-flash': 'GLM 5.3 Flash',
  'z-ai/glm-5.3': 'GLM 5.3',
  'z-ai/glm-5.2': 'GLM 5.2',
  'deepseek/deepseek-v4-flash-0731': 'DeepSeek V4 Flash',
  'moonshotai/kimi-k2.6': 'Kimi K2.6',
  'moonshotai/kimi-k2.7-code': 'Kimi K2.7 Code',
};

/** Who OpenRouter lists as the maker, by the id's first part. */
const MAKERS: Readonly<Record<string, string>> = {
  'z-ai': 'Z.ai (GLM)',
  deepseek: 'DeepSeek',
  moonshotai: 'Moonshot AI (Kimi)',
  qwen: 'Alibaba (Qwen)',
  mistralai: 'Mistral AI',
  'meta-llama': 'Meta (Llama)',
};

/** 'compat:openrouter:z-ai/glm-5.3' → 'z-ai/glm-5.3'. */
function bareModel(id: string): string {
  const m = /^compat:[^:]+:(.+)$/.exec(id);
  return m ? m[1] : id;
}

export function modelDisplayName(id: string): string {
  const bare = bareModel(id);
  return KNOWN_NAMES[bare] ?? bare;
}

export function modelMaker(id: string): string {
  const prefix = bareModel(id).split('/')[0];
  return MAKERS[prefix] ?? prefix;
}

/** The model that answers unless the visitor picks another: the server's default when offered, else the first offered. */
export function demoDefaultModel(cfg: DemoConfig): string | null {
  if (cfg.defaultModel && cfg.offeredModels.includes(cfg.defaultModel)) return cfg.defaultModel;
  return cfg.offeredModels[0] ?? (cfg.defaultModel || null);
}

/** "A", "A or B", "A, B or C". */
function orList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

function andList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The values for [[DEFAULT_MODEL]], [[OTHER_MODELS]] and [[MODEL_MAKERS]]; empty when the server named no model. */
export function demoModelFacts(cfg: DemoConfig): { DEFAULT_MODEL: string; OTHER_MODELS: string; MODEL_MAKERS: string } {
  const def = demoDefaultModel(cfg);
  if (!def) return { DEFAULT_MODEL: '', OTHER_MODELS: '', MODEL_MAKERS: '' };
  const all = [def, ...cfg.offeredModels.filter((m) => m !== def)];
  const others = all.slice(1).map(modelDisplayName);
  return {
    DEFAULT_MODEL: modelDisplayName(def),
    OTHER_MODELS: others.length > 0 ? orList(others) : 'another model, when one is offered',
    MODEL_MAKERS: andList([...new Set(all.map(modelMaker))]),
  };
}
