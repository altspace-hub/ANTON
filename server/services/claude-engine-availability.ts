/**
 * claude-engine-availability.ts — "is there any way to run Claude here?"
 *
 * Several routes gated their LLM endpoints on the raw Anthropic client
 * object (`if (!anthropic) return 503`), built only when ANTHROPIC_API_KEY is
 * set. Their calls go through provider-router, which follows the configured
 * engine — so on a subscription-only instance the gate passed only because
 * an unfunded key happened to remain in .env, and removing that key would
 * have turned working features into "Claude API not configured".
 *
 * The honest question is whether the SDK engine is enabled OR a key exists.
 * Whether either actually works is decided at call time, where the error is
 * specific (engine busy / not signed in / credit).
 *
 * hasAnyModelEngine() asks the wider question for routes whose calls go
 * through provider-router and so run on whatever engine is configured, not
 * only on Claude: a server whose only engine is an OpenAI-compatible endpoint
 * (the public showcase on OpenRouter) or Ollama has one too.
 */

import { isSdkEngineEnabled } from './sdk-engine-store.js';
import { getConfiguredProvider } from './provider-router.js';

export function hasClaudeEngine(): boolean {
  return isSdkEngineEnabled() || Boolean(process.env.ANTHROPIC_API_KEY);
}

export const NO_CLAUDE_ENGINE_MESSAGE =
  'No Claude engine available — enable the SDK engine in Settings → Execution engines (uses this machine\'s Claude Code login) or add an Anthropic API key.';

/**
 * Whether any model can answer a provider-router call here: a Claude engine,
 * a keyless configured default (an OpenAI-compatible endpoint, Ollama, the
 * ChatGPT engine — getConfiguredProvider() names it from the Settings
 * default), or a Mistral, OpenAI or Google key. As with hasClaudeEngine,
 * whether it actually answers is decided at call time.
 */
export function hasAnyModelEngine(): boolean {
  if (hasClaudeEngine()) return true;
  const configured = getConfiguredProvider();
  if (configured === 'openai_compatible' || configured === 'ollama' || configured === 'openai_codex') return true;
  return Boolean(process.env.MISTRAL_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY);
}

export const NO_MODEL_ENGINE_MESSAGE =
  'No AI model is configured — set a default model in Settings (an OpenAI-compatible endpoint, Ollama or a Claude engine) or add a provider API key.';
