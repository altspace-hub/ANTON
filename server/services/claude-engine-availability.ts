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
 */

import { isSdkEngineEnabled } from './sdk-engine-store.js';

export function hasClaudeEngine(): boolean {
  return isSdkEngineEnabled() || Boolean(process.env.ANTHROPIC_API_KEY);
}

export const NO_CLAUDE_ENGINE_MESSAGE =
  'No Claude engine available — enable the SDK engine in Settings → Execution engines (uses this machine\'s Claude Code login) or add an Anthropic API key.';
