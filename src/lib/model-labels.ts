/**
 * model-labels.ts — the name a page shows for a model id, whichever engine
 * runs it: the built-in label for a Claude / GPT / Gemini / Mistral id, the
 * showcase name for a compat:<slug>:<model> id ("Kimi K2.6"), the bare name
 * for a subscription (sdk:/codex:) or Ollama id.
 *
 * Kept apart from demo-model-names.ts, which the sign-in and privacy pages
 * load: this one pulls in the model list of constants.ts.
 */
import { MODELS } from '@/lib/constants';
import { modelDisplayName } from '@/lib/demo-model-names';

export function modelLabel(id: string | null | undefined): string {
  if (!id) return 'unknown model';
  const builtIn = MODELS.find((m) => m.id === id);
  if (builtIn) return builtIn.label;
  const engine = /^(sdk|codex):(.+)$/.exec(id);
  if (engine) {
    const inner = MODELS.find((m) => m.id === engine[2]);
    return `${inner?.label ?? engine[2]} (subscription)`;
  }
  if (id.startsWith('ollama:')) return `${id.slice('ollama:'.length)} (local)`;
  return modelDisplayName(id);
}

/** Whether the page has a list price for this model (a compat or local model is priced per use, or free). */
export function hasListPrice(id: string | null | undefined): boolean {
  return !!id && MODELS.some((m) => m.id === id);
}
