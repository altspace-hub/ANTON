/**
 * model-endpoint-form.ts — the OpenAI-compatible endpoint form in
 * Settings → Local & cost-effective models: parsing and validating the JSON
 * fields, the OpenRouter showcase defaults, and the request body for
 * POST / PATCH /api/settings/model-endpoints.
 */

/** Per bare model id, what the endpoint's /models said (filled by the health check). */
export interface EndpointModelMeta {
  contextLength?: number;
  maxCompletionTokens?: number;
  inputModalities?: string[];
  reasoning?: { mandatory?: boolean; supportedEfforts?: string[]; defaultEffort?: string };
  supportedParameters?: string[];
}

/**
 * OpenRouter provider routing for the showcase: GLM 5.3 Flash only on the two
 * EU-located zero-data-retention providers, and no provider that keeps prompts
 * for training. `only` is what keeps every call on those two; allow_fallbacks
 * lets one stand in when the other refuses. With it false OpenRouter tries only
 * its first pick: in a live check on 2026-09-25 Inceptron answered 429 and
 * NextBit was never tried (1 of 3 calls served; with it true, 3 of 3 on NextBit).
 */
export const OPENROUTER_EU_ZDR_EXTRA_BODY: Readonly<Record<string, unknown>> = Object.freeze({
  provider: {
    only: ['inceptron', 'nextbit'],
    allow_fallbacks: true,
    zdr: true,
    data_collection: 'deny',
  },
});

export const OPENROUTER_SHOWCASE_MODEL = 'z-ai/glm-5.3-flash';

export const ANTON_APP_TITLE = 'ANTON by openEXPERT';

/**
 * OpenRouter app attribution: HTTP-Referer names the app (its public URL) and
 * X-OpenRouter-Title its display name. Add `X-OpenRouter-App-Visibility: hidden`
 * to keep a new app out of the public rankings.
 */
export function openRouterAttributionHeaders(origin: string): Record<string, string> {
  return { 'HTTP-Referer': origin, 'X-OpenRouter-Title': ANTON_APP_TITLE };
}

/** Body keys ANTON sets itself. `model` / `models` would also route around the allowed-models list. */
export const RESERVED_EXTRA_BODY_KEYS: readonly string[] = ['model', 'models', 'route', 'preset', 'messages', 'prompt', 'stream'];

const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function parseJsonObject(text: string, what: string): ParseResult<Record<string, unknown>> {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { ok: false, error: `${what} is not valid JSON: ${err instanceof Error ? err.message : 'parse error'}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: `${what} must be a JSON object, like {"key": "value"}` };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

/** The extra request body: a JSON object, merged into every request to the endpoint. Empty = {}. */
export function parseExtraBodyInput(text: string): ParseResult<Record<string, unknown>> {
  const res = parseJsonObject(text, 'Extra request body');
  if (!res.ok) return res;
  const reserved = Object.keys(res.value).filter((k) => RESERVED_EXTRA_BODY_KEYS.includes(k));
  if (reserved.length > 0) {
    return {
      ok: false,
      error: `Extra request body cannot set ${reserved.map((k) => `"${k}"`).join(', ')} — ANTON sets ${reserved.length === 1 ? 'it' : 'them'} itself (use Allowed models to limit which models run)`,
    };
  }
  return res;
}

/** Extra headers: a JSON object of header name → string value. Empty = {}. */
export function parseExtraHeadersInput(text: string): ParseResult<Record<string, string>> {
  const res = parseJsonObject(text, 'Extra headers');
  if (!res.ok) return res;
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(res.value)) {
    if (!HEADER_NAME.test(name)) return { ok: false, error: `"${name}" is not a valid header name` };
    if (name.toLowerCase() === 'authorization') {
      return { ok: false, error: 'Put the key in the API key field — it is encrypted there; extra headers are stored as plain text' };
    }
    if (typeof value !== 'string') return { ok: false, error: `Header "${name}" must have a text value` };
    headers[name] = value;
  }
  return { ok: true, value: headers };
}

/** The server's upper bound for an endpoint's output ceiling. */
export const MAX_OUTPUT_TOKENS_LIMIT = 1_000_000;

/** Max output tokens: blank = no ceiling (null); otherwise a whole number from 1 to 1,000,000. */
export function parseMaxOutputTokensInput(text: string): ParseResult<number | null> {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0 || n > MAX_OUTPUT_TOKENS_LIMIT) {
    return { ok: false, error: 'Max output tokens must be a whole number from 1 to 1,000,000, or blank' };
  }
  return { ok: true, value: n };
}

/** A price in USD per million tokens: blank = none (null); otherwise 0 or more. */
export function parsePriceInput(text: string, what: string): ParseResult<number | null> {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: `${what} must be a number of US dollars, 0 or more, or blank` };
  return { ok: true, value: n };
}

/** Trimmed, de-duplicated, blanks dropped, in the order given. */
export function normaliseAllowedModels(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of models) {
    const t = m.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export interface EndpointFormValues {
  slug: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  contextWindow: string;
  notes: string;
  extraHeaders: string;
  extraBody: string;
  allowedModels: string[];
  maxOutputTokens: string;
  /** USD per million tokens, for an endpoint that reports no cost itself (OpenRouter does). */
  inputPricePerMillion: string;
  outputPricePerMillion: string;
}

/**
 * The request body for POST (new) or PATCH (edit). On PATCH the slug is the
 * path, a blank API key keeps the stored one, and an emptied allow-list,
 * extra body, ceiling or price is sent as empty / null so it is cleared.
 */
export function buildEndpointPayload(
  form: EndpointFormValues,
  editing: boolean,
): ParseResult<Record<string, unknown>> {
  const extraHeaders = parseExtraHeadersInput(form.extraHeaders);
  if (!extraHeaders.ok) return extraHeaders;
  const extraBody = parseExtraBodyInput(form.extraBody);
  if (!extraBody.ok) return extraBody;
  const maxOutputTokens = parseMaxOutputTokensInput(form.maxOutputTokens);
  if (!maxOutputTokens.ok) return maxOutputTokens;
  const inputPrice = parsePriceInput(form.inputPricePerMillion, 'Input price');
  if (!inputPrice.ok) return inputPrice;
  const outputPrice = parsePriceInput(form.outputPricePerMillion, 'Output price');
  if (!outputPrice.ok) return outputPrice;

  const payload: Record<string, unknown> = {
    displayName: form.displayName,
    baseUrl: form.baseUrl,
    defaultModel: form.defaultModel || undefined,
    contextWindow: form.contextWindow ? Number(form.contextWindow) : undefined,
    notes: form.notes || undefined,
    extraHeaders: extraHeaders.value,
    extraBody: extraBody.value,
    allowedModels: normaliseAllowedModels(form.allowedModels),
    maxOutputTokens: maxOutputTokens.value,
    inputPricePerMillion: inputPrice.value,
    outputPricePerMillion: outputPrice.value,
  };
  if (!editing) payload.slug = form.slug;
  if (form.apiKey) payload.apiKey = form.apiKey;
  return { ok: true, value: payload };
}

/** Pretty JSON for the form's text areas; {} shows as blank. */
export function jsonForEditor(value: Record<string, unknown> | null | undefined): string {
  if (!value || Object.keys(value).length === 0) return '';
  return JSON.stringify(value, null, 2);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(2))}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/** One line for Settings: context, output ceiling, reasoning, image input. Empty when nothing is known. */
export function describeModelMeta(meta: EndpointModelMeta | undefined): string {
  if (!meta) return '';
  const parts: string[] = [];
  if (meta.contextLength) parts.push(`${formatTokens(meta.contextLength)} context`);
  if (meta.maxCompletionTokens) parts.push(`${formatTokens(meta.maxCompletionTokens)} max output`);
  if (meta.reasoning) {
    const efforts = meta.reasoning.supportedEfforts?.length ? ` (${meta.reasoning.supportedEfforts.join('/')})` : '';
    parts.push(`${meta.reasoning.mandatory ? 'always reasons' : 'reasons'}${efforts}`);
  }
  if (meta.inputModalities?.includes('image')) parts.push('reads images');
  return parts.join(' · ');
}
