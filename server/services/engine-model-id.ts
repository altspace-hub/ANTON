/**
 * engine-model-id.ts — the `sdk:` model-id convention, as a leaf module.
 *
 * The subscription engine addresses models by prefix: sdk:claude-opus-5 runs
 * claude-opus-5 through the Claude Agent SDK on this machine's Claude Code
 * login. The prefix decides the ENGINE; the bare id is still the MODEL — and
 * the model is what every capability table is keyed by.
 *
 * Until 2026-09-07 only the engine itself stripped the prefix. Every lookup
 * upstream of it — the context budget, the 1M-window check in the claude
 * route, the portal walkthrough depth — took the prefixed id straight into
 * MODEL_CAPABILITIES, missed, and fell to the "unknown local model" default.
 * The product's default engine was budgeted 16,576 knowledge tokens on a
 * 1M-window model, and any run above that was rejected as CONTEXT_TOO_LARGE.
 *
 * These helpers used to live in claude-sdk-client.ts, whose module load kicks
 * off the Agent SDK import. A capability lookup should not drag the engine in,
 * so they live here with no imports at all; claude-sdk-client re-exports them
 * and existing importers are untouched.
 */

export const SDK_MODEL_PREFIX = 'sdk:';

export function isSdkModel(modelId: string): boolean {
  return modelId.startsWith(SDK_MODEL_PREFIX);
}

/** sdk:claude-opus-5 → claude-opus-5; any other id passes through unchanged. */
export function sdkUnderlyingModel(modelId: string): string {
  return isSdkModel(modelId) ? modelId.slice(SDK_MODEL_PREFIX.length) : modelId;
}

/**
 * The key to look a model up by in MODEL_CAPABILITIES / MODEL_REGISTRY.
 *
 * sdk: is stripped — the underlying Claude model IS the capability. codex: is
 * deliberately not: the OpenAI ids behind it are not in the table under those
 * names, and a miss there correctly falls to the conservative default.
 *
 * Use this ONLY where the result is a lookup key. A model id that will later be
 * DISPATCHED must keep its prefix, or the request routes to the API key instead
 * of the engine — the exact failure the prefix exists to prevent.
 */
export function capabilityModelId(modelId: string): string {
  return sdkUnderlyingModel(modelId);
}
