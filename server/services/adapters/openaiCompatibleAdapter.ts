// ═══════════════════════════════════════════════════════════
// OpenAI-Compatible Adapter
//
// Generic adapter for any endpoint that speaks the OpenAI
// /v1/chat/completions wire format with bearer-token auth.
//
// Works for:
//   - DeepSeek            (api.deepseek.com/v1)
//   - OpenRouter          (openrouter.ai/api/v1) — 200+ models behind one key
//   - Together.ai         (api.together.xyz/v1)
//   - Groq                (api.groq.com/openai/v1) — fastest tokens/sec
//   - Fireworks           (api.fireworks.ai/inference/v1)
//   - DeepInfra           (api.deepinfra.com/v1/openai)
//   - vLLM (self-hosted)  (http://your-host:8000/v1)
//   - LM Studio (local)   (http://localhost:1234/v1)
//   - llama.cpp server    (http://localhost:8080/v1)
//   - Ollama OpenAI-compat (http://localhost:11434/v1) — alternative to Ollama native
//
// Wire format: standard OpenAI Chat Completions. SSE streaming for live deltas.
//
// 2026-09-25 (public showcase on OpenRouter): this file holds the ONE request
// body builder and the one response reader for compat endpoints — the
// unified-llm-client adapter class in model-adapter.ts calls into it rather
// than keeping a second copy. What it adds:
//   - the endpoint's extra body (OpenRouter provider routing, plugins, …);
//   - `reasoning` from the thinking level, only for a model the endpoint says
//     reasons, fitted to the efforts that model takes (thinking-map.ts);
//   - max_tokens clamped to the endpoint / model ceiling, with room for
//     reasoning, which counts against max_tokens;
//   - stream_options.include_usage, and `user` = an HMAC of the user id;
//   - images as image_url content parts when the model reads images, else a
//     clear refusal — never base64 JSON-stringified into the prompt;
//   - usage.cost and reasoning tokens read back, the cost written to the
//     spend ledger — reserved before the call, and recorded however the call
//     ends, aborted and failed part-way included (CompatSpend);
//   - the abort signal passed to fetch, a mid-stream `error` object or
//     finish_reason 'error' raised as an error, 'length' reported, and a 402
//     turned into a plain "budget used up" message.
// Tools are no longer sent: tool_calls in the reply were never read back, so a
// model that chose to call one produced an empty answer.
// ═══════════════════════════════════════════════════════════

import { createHmac, randomBytes } from 'node:crypto';
import type { StreamSink } from '../stream-sink.js';
import type { DatabaseAdapter } from '../../db/database.js';
import type { ThinkingLevel } from '../../../src/lib/types.js';
import {
  isCapabilityRejection,
  JSON_ONLY_NUDGE,
  type ClaudeToolLike,
} from './provider-extras.js';
import { compatReasoningParam, compatReasoningAllowance, type CompatReasoningParam } from '../thinking-map.js';
import { modelAcceptsImages, parseModelsListing, type CompatModelMeta } from '../compat-endpoint.js';
import {
  recordSpend,
  reserveSpend,
  openSpendRow,
  settleSpend,
  releaseSpend,
  priceFromEndpoint,
  type EndpointPricing,
  type SpendCostSource,
  type SpendRow,
} from '../llm-spend.js';
import { currentRequestContext } from '../../lib/request-context.js';

/** A message as ANTON holds it: plain text, or Claude-style content blocks. */
export interface CompatInputMessage {
  role: string;
  content: string | readonly unknown[];
}

export type CompatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/** A message as the endpoint receives it. */
export interface CompatMessage {
  role: string;
  content: string | CompatContentPart[];
}

export interface OpenAICompatibleStreamParams {
  baseUrl: string;                            // e.g. 'https://api.deepseek.com/v1'
  apiKey?: string;                            // bearer token (omitted for fully open endpoints)
  model: string;                              // raw model id as the endpoint expects it
  system: string;
  messages: CompatInputMessage[];
  temperature?: number;
  maxTokens?: number;
  extraHeaders?: Record<string, string>;      // e.g. OpenRouter wants HTTP-Referer + X-Title
  /** Native JSON mode (response_format json_object). OpenRouter/Groq/DeepSeek accept it. */
  jsonMode?: boolean;
  /** Claude-format tools. NOT sent — a compat reply is read as text only, so a
   *  tool call would be lost. Kept so callers need not special-case compat. */
  tools?: ClaudeToolLike[];
  /** The endpoint's extra body, merged into every request (migration 288). */
  extraBody?: Record<string, unknown>;
  /** ANTON's thinking level, mapped to `reasoning` when the model reasons. */
  thinkingLevel?: ThinkingLevel;
  /** What the endpoint's /models said about this model (health check). */
  modelMeta?: CompatModelMeta;
  /** The endpoint's max_tokens ceiling (migration 288). */
  maxOutputTokens?: number | null;
  /** The user the call is for; undefined = the request context's user. */
  userId?: string | null;
  signal?: AbortSignal;
  /** Admin prices, used when the endpoint reports no cost itself (else the model's list price from modelMeta). */
  pricing?: EndpointPricing | null;
  /**
   * When set, a priced call writes a spend-ledger row under this model id: a
   * reservation before it is sent, settled when it ends however it ends.
   * `role` (undefined = the request context's) exempts admins from the
   * per-user cap the reservation checks.
   */
  spend?: { modelId: string; db?: DatabaseAdapter; purpose?: string; sessionId?: string | null; role?: string | null };
}

// ── End-user id ─────────────────────────────────────────────────

let bootSecret: string | null = null;
function userHashSecret(): string {
  const configured = process.env.LLM_USER_HASH_SECRET || process.env.JWT_SECRET;
  if (configured) return configured;
  bootSecret ??= randomBytes(32).toString('hex');
  return bootSecret;
}

/**
 * The `user` sent to the endpoint: an HMAC of ANTON's user id, never the id
 * itself. OpenRouter keys abuse handling on it, so one visitor who trips a
 * provider's policy does not get the whole showcase account blocked.
 */
export function compatEndUserId(userId: string): string {
  return `anton-${createHmac('sha256', userHashSecret()).update(userId).digest('hex').slice(0, 32)}`;
}

// ── Messages ────────────────────────────────────────────────────

/** Image input refused because the model does not read images. HTTP 400 at a route. */
export class CompatImageRefusedError extends Error {
  readonly code = 'IMAGE_NOT_SUPPORTED';
  readonly status = 400;
  constructor(model: string) {
    super(`The model "${model}" does not read images. Remove the image, or pick a model that accepts images.`);
    this.name = 'CompatImageRefusedError';
  }
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** An image block's data URL / URL, or undefined when the block is not an image. */
function imageUrlOf(block: Record<string, unknown>): string | undefined {
  if (block.type === 'image') {
    const src = asRecord(block.source);
    if (src?.type === 'base64' && typeof src.data === 'string') {
      const mediaType = typeof src.media_type === 'string' && src.media_type ? src.media_type : 'image/png';
      return `data:${mediaType};base64,${src.data}`;
    }
    if (src?.type === 'url' && typeof src.url === 'string') return src.url;
    return undefined;
  }
  if (block.type === 'image_url') {
    const iu = asRecord(block.image_url);
    return typeof iu?.url === 'string' ? iu.url : undefined;
  }
  return undefined;
}

/**
 * Claude content blocks → OpenAI content. Text blocks become text; an image
 * becomes an image_url part (text first, then images) when the model reads
 * images, and is refused otherwise. Thinking, tool and document blocks are
 * dropped. A message with no image stays a plain string.
 */
export function toCompatMessages(
  messages: readonly CompatInputMessage[],
  opts: { acceptsImages: boolean; model: string },
): CompatMessage[] {
  return messages.map((m) => {
    if (typeof m.content === 'string') return { role: m.role, content: m.content };
    const texts: string[] = [];
    const images: string[] = [];
    for (const raw of m.content) {
      if (typeof raw === 'string') { texts.push(raw); continue; }
      const block = asRecord(raw);
      if (!block) continue;
      if (block.type === 'text' && typeof block.text === 'string') { texts.push(block.text); continue; }
      const url = imageUrlOf(block);
      if (url === undefined) continue;
      if (m.role !== 'user') continue;          // an image only ever travels in a user turn
      if (!opts.acceptsImages) throw new CompatImageRefusedError(opts.model);
      images.push(url);
    }
    if (images.length === 0) return { role: m.role, content: texts.join('\n\n') };
    return {
      role: m.role,
      content: [
        ...texts.map((text) => ({ type: 'text' as const, text })),
        ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
      ],
    };
  });
}

/** True when any message carries an image block. */
export function messagesHaveImages(messages: readonly CompatInputMessage[]): boolean {
  return messages.some((m) => typeof m.content !== 'string'
    && m.content.some((b) => { const r = asRecord(b); return !!r && imageUrlOf(r) !== undefined; }));
}

// ── Request body ────────────────────────────────────────────────

function positive(n: number | null | undefined): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/**
 * What a Work run asks a compat model for when its endpoint sets no ceiling —
 * room for a long deliverable; reasoning room comes on top (compatMaxTokens).
 * The context budget reserves the same (context-budget.ts).
 */
export const COMPAT_WORK_RUN_MAX_TOKENS = 16_384;

/**
 * max_tokens to send: what the caller asked for plus room for reasoning,
 * clamped to the endpoint's ceiling and the model's own. Undefined = send none.
 */
export function compatMaxTokens(
  requested: number | undefined,
  reasoning: CompatReasoningParam | undefined,
  endpointCeiling: number | null | undefined,
  modelCeiling: number | undefined,
): number | undefined {
  const ceilings = [positive(endpointCeiling), positive(modelCeiling)].filter((c): c is number => c !== undefined);
  const ceiling = ceilings.length > 0 ? Math.min(...ceilings) : undefined;
  const asked = positive(requested);
  if (asked === undefined) return ceiling;
  const total = asked + compatReasoningAllowance(reasoning);
  return ceiling !== undefined ? Math.min(total, ceiling) : total;
}

function resolveUserId(params: OpenAICompatibleStreamParams): string | null {
  if (params.userId !== undefined) return params.userId;
  return currentRequestContext()?.userId ?? null;
}

/** The max_tokens the body builder sends for these params (reasoning room included). */
export function compatSentMaxTokens(params: Pick<OpenAICompatibleStreamParams, 'maxTokens' | 'thinkingLevel' | 'modelMeta' | 'maxOutputTokens'>): number | undefined {
  const wanted = compatReasoningParam(params.thinkingLevel, params.modelMeta?.reasoning);
  return compatMaxTokens(params.maxTokens, wanted, params.maxOutputTokens, params.modelMeta?.maxCompletionTokens);
}

/**
 * Request-body keys an endpoint's extraBody may never carry, because they
 * choose WHICH model answers or what it is sent: `models` (OpenRouter's
 * fallback list), `route`, `preset` (an OpenRouter preset can name models),
 * and the fields ANTON itself sets. Letting them through would run models
 * outside the endpoint's allowedModels on the owner's key. The settings route
 * refuses them on save; the body builder drops them from any stored row.
 */
export const COMPAT_EXTRA_BODY_RESERVED_KEYS = ['model', 'models', 'route', 'preset', 'messages', 'prompt', 'stream'] as const;

function withoutReservedKeys(extra: Record<string, unknown>): Record<string, unknown> {
  const out = { ...extra };
  for (const key of COMPAT_EXTRA_BODY_RESERVED_KEYS) delete out[key];
  return out;
}

/**
 * The chat body. The endpoint's extra body goes in first, so ANTON's own
 * fields (model, messages, stream, max_tokens, user) always win; `reasoning`
 * and `stream_options` are merged key by key, so an admin's
 * { reasoning: { exclude: true } } survives beside ANTON's effort.
 * `withExtras=false` is the plain body for the one retry against a strict
 * endpoint that rejects an optional field (minimal vLLM / llama.cpp configs):
 * no response_format (a prompt nudge instead), stream_options, user or
 * ANTON's reasoning — the admin's extra body stays.
 */
export function buildCompatBody(
  params: OpenAICompatibleStreamParams,
  stream: boolean,
  withExtras: boolean,
): Record<string, unknown> {
  const useJson = withExtras && params.jsonMode;
  const system = !withExtras && params.jsonMode
    ? params.system + JSON_ONLY_NUDGE
    : params.system;
  const messages = toCompatMessages(params.messages, {
    acceptsImages: modelAcceptsImages(params.modelMeta),
    model: params.model,
  });
  const wanted = compatReasoningParam(params.thinkingLevel, params.modelMeta?.reasoning);
  const reasoning = withExtras ? wanted : undefined;
  // max_tokens keeps the reasoning room either way: a mandatory reasoner still reasons.
  const maxTokens = compatSentMaxTokens(params);
  const extra = withoutReservedKeys(params.extraBody ?? {});
  const extraReasoning = asRecord(extra.reasoning);
  const extraStreamOptions = asRecord(extra.stream_options);
  const userId = withExtras ? resolveUserId(params) : null;

  const body: Record<string, unknown> = {
    ...extra,
    model: params.model,
    stream,
    messages: [
      { role: 'system', content: system },
      ...messages,
    ],
  };
  delete body.tools;
  delete body.tool_choice;
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;
  if (useJson) body.response_format = { type: 'json_object' };
  if (reasoning || extraReasoning) body.reasoning = { ...(extraReasoning ?? {}), ...(reasoning ?? {}) };
  if (stream && withExtras) body.stream_options = { ...(extraStreamOptions ?? {}), include_usage: true };
  else if (!stream) delete body.stream_options;
  if (userId) body.user = compatEndUserId(userId);
  return body;
}

// ── Errors ──────────────────────────────────────────────────────

/** An endpoint refusal or failure, with a message a user can act on. */
export class CompatUpstreamError extends Error {
  /**
   * What the person may be told (publicErrorMessage). The budget, busy,
   * output-limit and stream-error sentences are written for them (a stream
   * error carries the provider's short reason, e.g. "Provider disconnected").
   * An HTTP failure is named by its status only: its `message` holds the
   * endpoint URL and the raw response body, which stay in the logs.
   */
  readonly publicMessage: string;
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly retryAfterMs = 0,
    publicMessage?: string,
  ) {
    super(message);
    this.name = 'CompatUpstreamError';
    this.publicMessage = publicMessage ?? (code === 'COMPAT_HTTP_ERROR'
      ? `The AI provider could not answer (HTTP ${status}). Please try again.`
      : message);
  }
}

export const COMPAT_BUDGET_EXHAUSTED_MESSAGE =
  "Today's AI budget for this demo is used up (the AI provider's spending limit was reached). Please try again later.";
export const COMPAT_IN_FLIGHT_MESSAGE =
  'The AI service for this demo is busy right now — too many answers are being written at once. Please try again in a minute.';
export const COMPAT_RATE_LIMITED_MESSAGE =
  'The AI provider is busy right now and asked us to slow down. Please try again in a moment.';
export const COMPAT_CONTEXT_TOO_LONG_MESSAGE =
  "The request is too long for this model's context window. Remove some documents or earlier turns, or start a new session.";

/**
 * Milliseconds to wait before the in-flight retry. No header (null — what
 * Headers.get returns when it is absent) or an empty one is absent, not zero:
 * Number(null) is 0, which sent the retry at once, still inside the window.
 */
export function retryAfterMs(header: string | null | undefined): number {
  if (header == null || header.trim() === '') return 2_000;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return 2_000;
  return Math.min(seconds * 1000, 10_000);
}

/** A 400 that says the prompt plus max_tokens is larger than the model's window. */
function isContextLengthRejection(status: number, bodyText: string): boolean {
  if (status !== 400 && status !== 413) return false;
  return /context.?length|context window|maximum context|too many tokens|requested about \d+ tokens|prompt is too long/i.test(bodyText);
}

/**
 * The error for a non-2xx reply. A 402 from OpenRouter names its reason in
 * error.metadata.limit_source: the key's own limit or the account's credit
 * means the demo budget is used up; the in-flight budget (new or low-balance
 * accounts) means too many requests at once, worth one retry.
 */
export function compatHttpError(
  status: number,
  bodyText: string,
  baseUrl: string,
  retryAfter?: string | null,
): CompatUpstreamError {
  if (status === 402) {
    let source = '';
    try {
      const parsed = JSON.parse(bodyText) as { error?: { message?: unknown; metadata?: { limit_source?: unknown } } };
      source = String(parsed.error?.metadata?.limit_source ?? '');
    } catch { /* not JSON */ }
    if (/in_flight/i.test(source)) {
      return new CompatUpstreamError(COMPAT_IN_FLIGHT_MESSAGE, 'COMPAT_IN_FLIGHT_BUDGET', 402, retryAfterMs(retryAfter));
    }
    return new CompatUpstreamError(COMPAT_BUDGET_EXHAUSTED_MESSAGE, 'COMPAT_BUDGET_EXHAUSTED', 402);
  }
  if (status === 429) {
    // Rate-limited upstream (OpenRouter: "temporarily rate-limited upstream"),
    // common when the endpoint pins a few providers with no fallback. Worth a
    // retry after Retry-After; the body stays in the logs.
    return new CompatUpstreamError(
      `OpenAI-compatible endpoint rate-limited (${baseUrl}): 429 — ${bodyText.slice(0, 300)}`,
      'COMPAT_RATE_LIMITED',
      429,
      retryAfterMs(retryAfter),
      COMPAT_RATE_LIMITED_MESSAGE,
    );
  }
  if (isContextLengthRejection(status, bodyText)) {
    // Trying again cannot help, so the person is not told to.
    return new CompatUpstreamError(
      `OpenAI-compatible endpoint error (${baseUrl}): ${status} — ${bodyText.slice(0, 500)}`,
      'COMPAT_CONTEXT_TOO_LONG',
      status,
      0,
      COMPAT_CONTEXT_TOO_LONG_MESSAGE,
    );
  }
  return new CompatUpstreamError(
    `OpenAI-compatible endpoint error (${baseUrl}): ${status} — ${bodyText.slice(0, 500)}`,
    'COMPAT_HTTP_ERROR',
    status,
  );
}

function errorMessageOf(err: unknown): string {
  const o = asRecord(err);
  if (o && typeof o.message === 'string' && o.message) return o.message;
  return typeof err === 'string' && err ? err : 'unknown error';
}

// ── Transport ───────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A 400/422 that names a field the plain body leaves out — response_format
 * (as before), or one of the optional fields added for OpenRouter that a
 * strict server may not know: stream_options, reasoning, user.
 */
function isOptionalFieldRejection(status: number, bodyText: string): boolean {
  if (isCapabilityRejection(status, bodyText)) return true;
  if (status !== 400 && status !== 422) return false;
  return /stream_options|include_usage|reasoning|\buser\b|unrecognized request argument|extra.?(fields|inputs).*not permitted/i.test(bodyText);
}

function compatHeaders(params: OpenAICompatibleStreamParams): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(params.extraHeaders ?? {}),
  };
  if (params.apiKey) headers['Authorization'] = `Bearer ${params.apiKey}`;
  return headers;
}

/**
 * POST the chat request. One retry without response_format on a 400/422 that
 * names it; one retry after Retry-After on OpenRouter's in-flight budget 402;
 * up to three after Retry-After, doubling, on a 429 (rate-limited upstream).
 * Any other failure throws with a message the caller can show.
 */
async function postCompatChat(
  params: OpenAICompatibleStreamParams,
  stream: boolean,
): Promise<globalThis.Response> {
  const url = `${params.baseUrl.replace(/\/$/, '')}/chat/completions`;
  let withExtras = true;
  let retriedInFlight = false;
  let rateLimitRetries = 0;
  for (;;) {
    const response = await fetch(url, {
      method: 'POST',
      headers: compatHeaders(params),
      body: JSON.stringify(buildCompatBody(params, stream, withExtras)),
      signal: params.signal,
    });
    if (response.ok) return response;
    const errText = await response.text().catch(() => '');
    if (withExtras && isOptionalFieldRejection(response.status, errText)) {
      console.warn(`[openai-compatible-adapter] ${response.status} rejecting an optional field — retrying with a plain body (model=${params.model})`);
      withExtras = false;
      continue;
    }
    const err = compatHttpError(response.status, errText, params.baseUrl, response.headers?.get?.('retry-after'));
    if (err.code === 'COMPAT_IN_FLIGHT_BUDGET' && !retriedInFlight) {
      retriedInFlight = true;
      await sleep(err.retryAfterMs);
      continue;
    }
    if (err.code === 'COMPAT_RATE_LIMITED' && rateLimitRetries < 3 && !params.signal?.aborted) {
      rateLimitRetries++;
      // 2 s, 4 s, 8 s by default: "retry shortly" upstream, measured live.
      await sleep(err.retryAfterMs * 2 ** (rateLimitRetries - 1));
      continue;
    }
    throw err;
  }
}

// ── Reading the reply ───────────────────────────────────────────

export interface OpenAICompatibleStreamResult {
  inputTokens: number;
  outputTokens: number;
  text: string;
  /** The model's reasoning text, where the endpoint returns it. */
  thinking: string;
  /** completion_tokens_details.reasoning_tokens (part of outputTokens). */
  reasoningTokens: number;
  /**
   * USD for this call: the endpoint's usage.cost, else its usage at the
   * endpoint's (or the model's list) prices, else — no usage came back — an
   * estimate; null = unknown.
   */
  costUsd: number | null;
  costSource: SpendCostSource | null;
  finishReason: string | null;
  /** Set when the answer was cut off at the output limit. */
  warning?: string;
}

export const COMPAT_TRUNCATED_WARNING =
  "The answer was cut off at the model's output limit, so it is incomplete. Ask for a shorter answer or continue in a follow-up.";
export const COMPAT_REASONING_ONLY_MESSAGE =
  'The model spent its whole output allowance reasoning and wrote no answer. Try a lower thinking level or a shorter request.';

interface CompatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number | string;
  completion_tokens_details?: { reasoning_tokens?: number };
}

interface Accumulated {
  text: string;
  thinking: string;
  finishReason: string | null;
  usage: CompatUsage | null;
  /** The chunk id — OpenRouter's generation id, which names the call's real cost afterwards. */
  generationId?: string;
}

function reportedCost(usage: CompatUsage | null): number | null {
  const raw = usage?.cost;
  const n = typeof raw === 'string' ? Number(raw) : raw;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

// ── Spend: reserve before, settle after, estimate when cut short ─

/** Tokens one image part is taken to cost in an estimate. */
const IMAGE_TOKEN_ESTIMATE = 1_500;
/** Output reserved for a call that sends no max_tokens and has no ceiling. */
const DEFAULT_OUTPUT_RESERVE = 16_384;

/**
 * A cheap, deliberately generous token count: a quarter token per ASCII
 * character (English runs about four characters a token) and a whole token
 * for any other character (CJK and similar run about one each). It never
 * tokenises, so a 50 MB request cannot stall the event loop, and it does not
 * undercount the text someone would pick to be billed the most tokens.
 */
export function estimateCompatTextTokens(text: string): number {
  // A request body can carry anything; only a real string is counted.
  if (typeof text !== 'string') return 0;
  let ascii = 0;
  let other = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 128) ascii++;
    else other++;
  }
  return Math.ceil(ascii / 4) + other;
}

/** Estimated prompt tokens of a request: the system prompt, each message's text, a fixed amount per image. */
export function estimateCompatInputTokens(system: string, messages: readonly CompatInputMessage[]): number {
  let tokens = estimateCompatTextTokens(system);
  for (const m of messages) {
    tokens += 4;   // role and separators
    if (typeof m.content === 'string') {
      tokens += estimateCompatTextTokens(m.content);
      continue;
    }
    for (const raw of m.content) {
      if (typeof raw === 'string') { tokens += estimateCompatTextTokens(raw); continue; }
      const block = asRecord(raw);
      if (!block) continue;
      if (block.type === 'text' && typeof block.text === 'string') tokens += estimateCompatTextTokens(block.text);
      else if (block.type === 'image' || block.type === 'image_url') tokens += IMAGE_TOKEN_ESTIMATE;
    }
  }
  return tokens;
}

/** What a call that ended without a finished reply was recorded at. */
export interface CompatUnfinishedUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  /** True when no usage came back and the tokens are an estimate. */
  estimated: boolean;
}

const unfinishedUsage = new WeakMap<object, CompatUnfinishedUsage>();

/**
 * The usage recorded for the call that failed with this error (abort,
 * timeout, an error part-way through). The Work route counts it against the
 * user's monthly token budget, which only a finished run used to reach.
 */
export function compatUnfinishedUsageOf(err: unknown): CompatUnfinishedUsage | undefined {
  return typeof err === 'object' && err !== null ? unfinishedUsage.get(err) : undefined;
}

function isAbortLike(err: unknown): boolean {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined;
  return name === 'AbortError' || name === 'TimeoutError';
}

// OpenRouter keeps a record of every generation, cancelled ones included, and
// serves its real cost at GET /generation?id=… a few seconds after it ends.
const RECONCILE_DELAYS_MS: readonly number[] = [3_000, 10_000, 30_000];
let reconcileDelaysMs: readonly number[] = RECONCILE_DELAYS_MS;
let reconcileAnyHost = false;

/** Test hook: shorter delays, and a local fake server taken for OpenRouter. null restores the defaults. */
export function setCompatReconcileForTests(opts: { delaysMs?: number[]; anyHost?: boolean } | null): void {
  reconcileDelaysMs = opts?.delaysMs ?? RECONCILE_DELAYS_MS;
  reconcileAnyHost = opts?.anyHost ?? false;
}

function servesGenerationCosts(baseUrl: string): boolean {
  if (reconcileAnyHost) return true;
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'openrouter.ai' || host.endsWith('.openrouter.ai');
  } catch {
    return false;
  }
}

interface GenerationCost {
  costUsd: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
}

function nonNegativeNumber(v: unknown): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** OpenRouter's record of one generation: its cost, 'retry' while it is not there yet, null to give up. */
async function fetchGenerationCost(params: OpenAICompatibleStreamParams, id: string): Promise<GenerationCost | 'retry' | null> {
  try {
    const res = await fetch(`${params.baseUrl.replace(/\/$/, '')}/generation?id=${encodeURIComponent(id)}`, {
      headers: compatHeaders(params),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 429 || res.status >= 500) return 'retry';
    if (!res.ok) return null;
    const data = asRecord(asRecord(await res.json())?.data);
    const costUsd = nonNegativeNumber(data?.total_cost) ?? nonNegativeNumber(data?.usage);
    if (costUsd === undefined) return 'retry';
    return {
      costUsd,
      inputTokens: nonNegativeNumber(data?.native_tokens_prompt) ?? nonNegativeNumber(data?.tokens_prompt),
      outputTokens: nonNegativeNumber(data?.native_tokens_completion) ?? nonNegativeNumber(data?.tokens_completion),
      reasoningTokens: nonNegativeNumber(data?.native_tokens_reasoning),
    };
  } catch {
    return 'retry';
  }
}

/** Replace an estimate with OpenRouter's own figure — in the background, best-effort, a few tries. */
function scheduleGenerationReconcile(params: OpenAICompatibleStreamParams, generationId: string, row: SpendRow): void {
  const delays = reconcileDelaysMs;
  const attempt = (i: number): void => {
    if (i >= delays.length) return;
    const timer = setTimeout(() => {
      void fetchGenerationCost(params, generationId).then(async (got) => {
        if (got === 'retry') { attempt(i + 1); return; }
        if (got) await settleSpend(row, { ...got, source: 'reported' });
      });
    }, delays[i]);
    timer.unref?.();
  };
  attempt(0);
}

type SettledSource = Exclude<SpendCostSource, 'reserved'>;

interface CallTokens { input: number; output: number; reasoning: number }

/**
 * One priced call's ledger row, from before it is sent until it has ended.
 *
 * open() reserves the worst case — the estimated prompt and the whole
 * max_tokens at the endpoint's prices, else the model's list price — and the
 * daily caps are checked with every call in flight counted (reserveSpend).
 * The row is then settled exactly once: to the reported or priced cost when a
 * reply finished; to what was billed when the call was cut short (abort,
 * timeout, an error part-way, a reader that stopped) — the usage the provider
 * sent before stopping, else an estimate from the prompt and the text
 * received, later replaced by OpenRouter's own figure; or dropped when the
 * endpoint refused the call. Before this a cut-short call wrote nothing, so
 * closing the connection got past every cap.
 */
class CompatSpend {
  settled = false;

  private constructor(
    private readonly params: OpenAICompatibleStreamParams,
    private readonly stream: boolean,
    private readonly inputEstimate: number,
    private readonly outputCeiling: number,
    private readonly pricing: EndpointPricing | null,
    private readonly reservation: SpendRow | null,
  ) {}

  /** Reserve the worst case. Throws SpendCapError, before anything is sent, when a cap is reached. */
  static async open(params: OpenAICompatibleStreamParams, stream: boolean): Promise<CompatSpend> {
    const pricing = params.pricing ?? params.modelMeta?.pricing ?? null;
    const inputEstimate = estimateCompatInputTokens(params.system, params.messages);
    const outputCeiling = compatSentMaxTokens(params) ?? DEFAULT_OUTPUT_RESERVE;
    const spend = params.spend;
    const worst = spend ? priceFromEndpoint(pricing, inputEstimate, outputCeiling) : null;
    const reservation = spend && worst !== null
      ? await reserveSpend({
          model: spend.modelId,
          costUsd: worst,
          inputTokens: inputEstimate,
          outputTokens: outputCeiling,
          userId: resolveUserId(params),
          ...(spend.role !== undefined ? { role: spend.role } : {}),
          purpose: spend.purpose ?? null,
          ...(spend.sessionId !== undefined ? { sessionId: spend.sessionId } : {}),
        }, spend.db)
      : null;
    return new CompatSpend(params, stream, inputEstimate, outputCeiling, pricing, reservation);
  }

  /** Settle the reservation, or write a row. Returns the row when its id is known (keepRow). */
  private async write(costUsd: number, source: SettledSource, tokens: CallTokens, keepRow: boolean): Promise<SpendRow | null> {
    const spend = this.params.spend;
    if (!spend) return null;
    if (this.reservation) {
      await settleSpend(this.reservation, {
        costUsd, source, inputTokens: tokens.input, outputTokens: tokens.output, reasoningTokens: tokens.reasoning,
      });
      return this.reservation;
    }
    const entry = {
      model: spend.modelId,
      costUsd,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      userId: resolveUserId(this.params),
      purpose: spend.purpose ?? null,
      ...(spend.sessionId !== undefined ? { sessionId: spend.sessionId } : {}),
    };
    if (keepRow) return openSpendRow(entry, source, spend.db);
    await recordSpend({ ...entry, reasoningTokens: tokens.reasoning, source }, spend.db);
    return null;
  }

  /** A reply that finished: its reported cost, else its usage priced, else (no usage came back) an estimate. */
  async finished(acc: Accumulated): Promise<{ costUsd: number | null; costSource: SettledSource | null } & CallTokens> {
    this.settled = true;
    const estimated = !acc.usage;
    const tokens: CallTokens = {
      input: acc.usage?.prompt_tokens ?? (estimated ? this.inputEstimate : 0),
      output: acc.usage?.completion_tokens ?? (estimated ? estimateCompatTextTokens(acc.text + acc.thinking) : 0),
      reasoning: acc.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    };
    let costUsd = reportedCost(acc.usage);
    let costSource: SettledSource | null = costUsd !== null ? 'reported' : null;
    if (costUsd === null) {
      costUsd = priceFromEndpoint(this.pricing, tokens.input, tokens.output);
      if (costUsd !== null) costSource = estimated ? 'estimated' : 'endpoint_price';
    }
    if (costUsd !== null && costSource) await this.write(costUsd, costSource, tokens, false);
    else if (this.reservation) await releaseSpend(this.reservation);
    return { costUsd, costSource, ...tokens };
  }

  /**
   * The call ended without a finished reply. What the provider already billed
   * is recorded — the usage it sent before stopping (an error chunk can carry
   * it), else an estimate: the prompt as sent and the text received. For
   * OpenRouter the real cost replaces the estimate once its generation record
   * is there. The recorded usage rides on the error for the Work route.
   */
  async unfinished(acc: Accumulated, err: unknown): Promise<void> {
    if (this.settled) return;
    this.settled = true;
    const estimated = !acc.usage;
    const tokens: CallTokens = {
      input: acc.usage?.prompt_tokens ?? this.inputEstimate,
      output: acc.usage?.completion_tokens ?? estimateCompatTextTokens(acc.text + acc.thinking),
      reasoning: acc.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    };
    let costUsd = reportedCost(acc.usage);
    let source: SettledSource | null = costUsd !== null ? 'reported' : null;
    if (costUsd === null) {
      costUsd = priceFromEndpoint(this.pricing, tokens.input, tokens.output);
      if (costUsd !== null) source = estimated ? 'estimated' : 'endpoint_price';
    }
    const reconcile = source !== 'reported'
      && !!acc.generationId
      && !!this.params.apiKey
      && servesGenerationCosts(this.params.baseUrl);
    let row: SpendRow | null = null;
    if (costUsd !== null && source) row = await this.write(costUsd, source, tokens, reconcile);
    // No price known: a placeholder row the real cost replaces.
    else if (reconcile) row = await this.write(0, 'estimated', tokens, true);
    if (reconcile && row && acc.generationId) scheduleGenerationReconcile(this.params, acc.generationId, row);
    if (typeof err === 'object' && err !== null) {
      unfinishedUsage.set(err, { inputTokens: tokens.input, outputTokens: tokens.output, costUsd, estimated });
    }
  }

  /**
   * No reply to read: refused by the endpoint, unreachable, or aborted while
   * waiting for the reply to start. A refusal is not billed and its
   * reservation is dropped. An abort may have been billed: a streamed call is
   * charged its prompt; a non-streamed one, whose answer was being written
   * while we waited, keeps its worst case.
   */
  async notAnswered(err: unknown): Promise<void> {
    if (this.settled) return;
    this.settled = true;
    if (!isAbortLike(err)) {
      if (this.reservation) await releaseSpend(this.reservation);
      return;
    }
    const tokens: CallTokens = { input: this.inputEstimate, output: this.stream ? 0 : this.outputCeiling, reasoning: 0 };
    const costUsd = priceFromEndpoint(this.pricing, tokens.input, tokens.output);
    if (costUsd !== null) await this.write(costUsd, 'estimated', tokens, false);
    if (typeof err === 'object' && err !== null) {
      unfinishedUsage.set(err, { inputTokens: tokens.input, outputTokens: tokens.output, costUsd, estimated: true });
    }
  }
}

/**
 * Tokens, cost, the ledger row and the finish-reason verdict — the same for a
 * streamed and a non-streamed call. The spend is recorded before a
 * reasoning-only reply is raised as an error: it was billed either way.
 */
async function finishCompatCall(
  params: OpenAICompatibleStreamParams,
  acc: Accumulated,
  spend: CompatSpend,
): Promise<OpenAICompatibleStreamResult> {
  const cost = await spend.finished(acc);
  if (!acc.usage) {
    console.warn(`[openai-compatible-adapter] reply carried no usage (model=${params.model}) — tokens estimated`);
  }

  const result: OpenAICompatibleStreamResult = {
    inputTokens: cost.input,
    outputTokens: cost.output,
    text: acc.text,
    thinking: acc.thinking,
    reasoningTokens: cost.reasoning,
    costUsd: cost.costUsd,
    costSource: cost.costSource,
    finishReason: acc.finishReason,
  };
  if (acc.finishReason === 'length') {
    if (!acc.text.trim()) throw new CompatUpstreamError(COMPAT_REASONING_ONLY_MESSAGE, 'COMPAT_OUTPUT_LIMIT', 502);
    result.warning = COMPAT_TRUNCATED_WARNING;
  }
  return result;
}

interface CompatChunk {
  id?: unknown;
  error?: unknown;
  choices?: Array<{
    delta?: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null };
    message?: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: CompatUsage;
}

export type CompatStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string };

/**
 * Stream a chat completion as text and reasoning events; the generator's
 * return value is the finished call (tokens, cost, finish reason). An `error`
 * object in the stream — OpenRouter's way of failing after the 200 — or a
 * finish_reason of 'error' is thrown, so a cut-short answer never reads as
 * a complete one. However the call ends — finished, aborted, timed out,
 * failed part-way, or abandoned by its reader — its spend is recorded
 * (CompatSpend).
 */
export async function* compatStreamEvents(
  params: OpenAICompatibleStreamParams,
): AsyncGenerator<CompatStreamEvent, OpenAICompatibleStreamResult, undefined> {
  const spend = await CompatSpend.open(params, true);
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    const response = await postCompatChat(params, true);
    if (!response.body) {
      throw new CompatUpstreamError(`OpenAI-compatible endpoint error (${params.baseUrl}): empty response body`, 'COMPAT_HTTP_ERROR', 502);
    }
    reader = response.body.getReader();
  } catch (err) {
    await spend.notAnswered(err);
    throw err;
  }
  const acc: Accumulated = { text: '', thinking: '', finishReason: null, usage: null };
  const decoder = new TextDecoder();
  let buffer = '';

  const handleLine = (line: string): CompatStreamEvent[] => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return [];
    const dataStr = trimmed.slice(5).trim();
    if (dataStr === '[DONE]') return [];
    let parsed: CompatChunk;
    try {
      parsed = JSON.parse(dataStr) as CompatChunk;
    } catch {
      return [];   // keep-alive comments / malformed lines
    }
    if (!acc.generationId && typeof parsed.id === 'string' && parsed.id) acc.generationId = parsed.id;
    // Usage first: an error chunk can carry what the call was billed.
    if (parsed.usage) acc.usage = { ...(acc.usage ?? {}), ...parsed.usage };
    if (parsed.error) {
      throw new CompatUpstreamError(
        `The model stopped with an error part-way through the answer: ${errorMessageOf(parsed.error)}`,
        'COMPAT_STREAM_ERROR',
        502,
      );
    }
    const out: CompatStreamEvent[] = [];
    const choice = parsed.choices?.[0];
    const reasoning = choice?.delta?.reasoning ?? choice?.delta?.reasoning_content;
    if (typeof reasoning === 'string' && reasoning) {
      acc.thinking += reasoning;
      out.push({ type: 'reasoning', text: reasoning });
    }
    const content = choice?.delta?.content;
    if (typeof content === 'string' && content) {
      acc.text += content;
      out.push({ type: 'text', text: content });
    }
    if (choice?.finish_reason) {
      if (choice.finish_reason === 'error') {
        throw new CompatUpstreamError('The model stopped with an error part-way through the answer.', 'COMPAT_STREAM_ERROR', 502);
      }
      acc.finishReason = choice.finish_reason;
    }
    return out;
  };

  let drained = false;
  let failure: { err: unknown } | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        for (const ev of handleLine(line)) yield ev;
      }
    }
    drained = true;
    buffer += decoder.decode();
    for (const ev of handleLine(buffer)) yield ev;
    return await finishCompatCall(params, acc, spend);
  } catch (err) {
    failure = { err };
    throw err;
  } finally {
    // An error or an abandoned read leaves the body open: close it, so the
    // endpoint stops generating (and billing) an answer nobody will read.
    if (!drained) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    // Then record what the call was billed, however it ended.
    if (!spend.settled) await spend.unfinished(acc, failure?.err);
  }
}

/**
 * Stream a chat completion through any OpenAI-compatible endpoint and forward
 * the deltas to the supplied SSE response — text as text_delta, the model's
 * reasoning as thinking_delta (the page was silent while a reasoning model
 * thought). Only those two frame types are written here; the warning for a
 * cut-off answer is in the result, for the caller to show.
 */
export async function streamOpenAICompatible(
  params: OpenAICompatibleStreamParams,
  res: StreamSink,
): Promise<OpenAICompatibleStreamResult> {
  const events = compatStreamEvents(params);
  for (;;) {
    const next = await events.next();
    if (next.done) return next.value;
    const ev = next.value;
    try {
      res.write(`data: ${JSON.stringify({ type: ev.type === 'text' ? 'text_delta' : 'thinking_delta', content: ev.text })}\n\n`);
    } catch (err) {
      // A sink that stops taking frames (Pathfinder's throws once its client
      // has gone) must still end the call: the error is handed to the
      // generator, whose cleanup cancels the read and records the spend.
      await events.throw(err).catch(() => undefined);
      throw err;
    }
  }
}

/**
 * Non-streaming completion through any OpenAI-compatible endpoint (for callChat /
 * scoring / agent paths). Mirrors streamOpenAICompatible but returns full text.
 */
export async function callOpenAICompatible(
  params: OpenAICompatibleStreamParams,
): Promise<OpenAICompatibleStreamResult> {
  const spend = await CompatSpend.open(params, false);
  let response: globalThis.Response;
  try {
    response = await postCompatChat(params, false);
  } catch (err) {
    await spend.notAnswered(err);
    throw err;
  }
  const acc: Accumulated = { text: '', thinking: '', finishReason: null, usage: null };
  try {
    const data = (await response.json()) as CompatChunk;
    if (data.usage) acc.usage = data.usage;
    if (typeof data.id === 'string' && data.id) acc.generationId = data.id;
    if (data.error) {
      throw new CompatUpstreamError(`The model returned an error: ${errorMessageOf(data.error)}`, 'COMPAT_STREAM_ERROR', 502);
    }
    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'error') {
      throw new CompatUpstreamError('The model stopped with an error before finishing its answer.', 'COMPAT_STREAM_ERROR', 502);
    }
    const reasoning = choice?.message?.reasoning ?? choice?.message?.reasoning_content;
    acc.text = choice?.message?.content ?? '';
    acc.thinking = typeof reasoning === 'string' ? reasoning : '';
    acc.finishReason = choice?.finish_reason ?? null;
    return await finishCompatCall(params, acc, spend);
  } catch (err) {
    if (!spend.settled) await spend.unfinished(acc, err);
    throw err;
  }
}

// ── Model listing ───────────────────────────────────────────────

/**
 * GET /models with each model's metadata (context length, output ceiling,
 * input modalities, reasoning, supported parameters — what OpenRouter
 * reports). `ok` is false when the endpoint could not be listed.
 */
export async function listOpenAICompatibleModelsDetailed(
  baseUrl: string,
  apiKey?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ ok: boolean; ids: string[]; meta: Record<string, CompatModelMeta>; error?: string }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers,
      // OpenRouter's listing is several hundred models — give it time.
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, ids: [], meta: {}, error: `GET /models answered ${res.status}` };
    return { ok: true, ...parseModelsListing(await res.json()) };
  } catch (err) {
    return { ok: false, ids: [], meta: {}, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * List the models exposed by an OpenAI-compatible endpoint via GET /models.
 * Most providers honour this; returns an empty array if the endpoint doesn't.
 */
export async function listOpenAICompatibleModels(
  baseUrl: string,
  apiKey?: string,
  extraHeaders?: Record<string, string>,
): Promise<string[]> {
  return (await listOpenAICompatibleModelsDetailed(baseUrl, apiKey, extraHeaders)).ids;
}

/**
 * Health-check an OpenAI-compatible endpoint. Lightweight: tries GET /models.
 */
export async function checkOpenAICompatibleHealth(
  baseUrl: string,
  apiKey?: string,
  extraHeaders?: Record<string, string>,
): Promise<{ available: boolean; modelCount?: number; error?: string }> {
  const listing = await listOpenAICompatibleModelsDetailed(baseUrl, apiKey, extraHeaders);
  return listing.ok
    ? { available: true, modelCount: listing.ids.length }
    : { available: false, error: listing.error };
}
