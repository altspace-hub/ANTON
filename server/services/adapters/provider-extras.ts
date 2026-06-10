// ═══════════════════════════════════════════════════════════
// provider-extras.ts — shared helpers for the M7 capability fix
// (plan 2.13): send JSON-mode + tools to Mistral / Ollama /
// OpenAI-compatible endpoints, with a one-retry fallback when an
// endpoint rejects them.
//
// Shared by the per-provider adapters in this folder, the SDK
// adapters in model-adapter.ts, and provider-router's inline
// Mistral bodies — so the (known, M10) copies at least agree on
// the tool format and the retry trigger.
// ═══════════════════════════════════════════════════════════

/** Claude tool shape as ANTON passes it around (web_search, function tools). */
export interface ClaudeToolLike {
  type: string;
  name?: string;
  [key: string]: unknown;
}

/** OpenAI/Mistral/Ollama function-calling tool shape. */
export interface OpenAIToolLike {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

/**
 * Convert Claude-format tools to the OpenAI function-calling shape used
 * by Mistral, Ollama and every OpenAI-compatible endpoint. Claude-only
 * web_search tools are dropped (no non-Claude equivalent — Bing
 * pre-search covers that path). Returns undefined when nothing survives
 * so callers can omit the field entirely.
 */
export function convertClaudeToolsToOpenAI(
  tools?: ClaudeToolLike[],
): OpenAIToolLike[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  const convertible = tools.filter(
    (t) => t.type !== 'web_search_20250305' && t.type !== 'web_search',
  );
  if (convertible.length === 0) return undefined;
  return convertible.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name || tool.type,
      description: typeof tool.description === 'string' ? tool.description : '',
      parameters: tool.input_schema ?? { type: 'object', properties: {} },
    },
  }));
}

/**
 * True when an HTTP error looks like "this endpoint/model doesn't accept
 * tools or response_format" (e.g. older Ollama builds, minimal vLLM
 * configs, some OpenRouter upstreams). Used to retry ONCE without the
 * advanced fields rather than failing the whole request.
 */
export function isCapabilityRejection(status: number, bodyText: string): boolean {
  if (status !== 400 && status !== 422) return false;
  return /tool|response_format|json_object|format/i.test(bodyText);
}

/**
 * SDK-error variant of isCapabilityRejection — for clients (Mistral SDK)
 * that throw instead of exposing the raw HTTP response. Checks an
 * optional statusCode property and falls back to the message text.
 */
export function isCapabilityRejectionError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  const status = typeof statusCode === 'number'
    ? statusCode
    : (/\b(400|422)\b/.test(message) ? 400 : 0);
  return isCapabilityRejection(status, message);
}

/**
 * Prompt-based fallback appended to the system prompt when native JSON
 * mode was requested but had to be dropped on retry.
 */
export const JSON_ONLY_NUDGE =
  '\n\nIMPORTANT: Respond with ONLY a single valid JSON object. No prose, no explanation, no markdown fences.';
