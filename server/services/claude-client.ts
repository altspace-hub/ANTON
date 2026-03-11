import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';

// ── Types ──────────────────────────────────────────────────

type ModelId = 'claude-opus-4-6' | 'claude-sonnet-4-6' | 'claude-sonnet-4-5-20250929' | 'claude-haiku-4-5-20251001';
type ThinkingLevel = 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate';

// Models that support prompt caching via cache_control: { type: "ephemeral" }
const CACHE_SUPPORTED_MODELS: ReadonlySet<ModelId> = new Set([
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-sonnet-4-5-20250929',
]);

interface StreamConfig {
  model: ModelId;
  thinking: ThinkingLevel;
  /**
   * The dynamic portion of the system prompt (output format instructions, creativity,
   * knowledge additions, reference documents, etc.) — changes per request.
   * When `staticSystemPrompt` is also provided, this is used as the second content block
   * (without cache_control). When `staticSystemPrompt` is absent, this is the full prompt
   * sent as a single cached block.
   */
  system: string;
  /**
   * Optional: the static portion of the system prompt (Foundation + Area Context +
   * Module System Prompt) that does not change between follow-up turns in the same session.
   * When provided, and the model supports prompt caching, this is sent as the first
   * content block with cache_control: { type: "ephemeral" } so Anthropic can cache it
   * across API calls, reducing cost (~90% savings on cached tokens).
   *
   * Only supported for claude-opus-4-6 and claude-sonnet-4-5-20250929.
   * Ignored (falls back to single-block) for claude-haiku-4-5-20251001.
   */
  staticSystemPrompt?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string | object[] }>;
  tools?: Array<{ type: string; name: string }>;
  maxTokens?: number;
  nativeReasoningEnabled?: boolean;
  /** When true, adds the anthropic-beta: context-1m-2025-08-07 header to unlock
   *  up to 1M token context for Opus 4.6 and Sonnet 4.6. Requires API beta access. */
  useLongContext?: boolean;
  /** Optional abort signal — wire to req.on('close') to cancel the stream when the client disconnects. */
  signal?: AbortSignal;
  /** ATTR-05: Source manifest — injected into stream_end so the client can show "Sources used". */
  sourceManifest?: string[];
}

export interface StreamCompletionData {
  text: string;
  thinking: string;
  inputTokens: number;
  outputTokens: number;
  /** Tokens read from the prompt cache (billed at ~10% of standard input rate). */
  cacheReadTokens: number;
  /** Tokens written to the prompt cache (billed at ~125% of standard input rate). */
  cacheCreationTokens: number;
  /** Full content array from the API response (includes thinking blocks with signatures).
   *  Must be preserved and replayed in subsequent turns when thinking is enabled. */
  rawContentBlocks?: unknown[];
}

interface ContentBlock {
  type: 'thinking' | 'text' | 'web_search' | 'web_search_result';
  content: string;
  metadata?: Record<string, unknown>;
}

// ── Retry Helper ───────────────────────────────────────────

const RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

async function withRetry<T>(factory: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await factory();
    } catch (error) {
      lastError = error;

      // Determine if this error is retryable based on HTTP status code
      const status =
        (error instanceof Anthropic.APIError ? error.status : null) ??
        (error instanceof Error && 'status' in error ? (error as { status?: number }).status : null);

      const isRetryable = typeof status === 'number' && RETRYABLE_STATUS_CODES.has(status);

      if (!isRetryable || attempt >= MAX_RETRIES) {
        throw error;
      }

      const delayMs = RETRY_DELAYS_MS[attempt];
      console.warn(
        `[claude-client] Retryable error (HTTP ${status}) on attempt ${attempt + 1}/${MAX_RETRIES}. ` +
          `Retrying in ${delayMs}ms...`
      );

      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Unreachable, but satisfies TypeScript
  throw lastError;
}

// ── Thinking Config Resolution ─────────────────────────────

// Per-model max output token ceilings (Anthropic API limits, August 2025).
// Opus 4.6: 128 000  |  Sonnet 4.6: 64 000  |  all others: 32 000
const MODEL_MAX_OUTPUT: Partial<Record<string, number>> = {
  'claude-opus-4-6':             128_000,
  'claude-sonnet-4-6':            64_000,
  'claude-sonnet-4-5-20250929':   64_000,
  'claude-haiku-4-5-20251001':    32_000,
};
function getOutputCeiling(model: string): number {
  return MODEL_MAX_OUTPUT[model] ?? 32_000;
}

function getThinkingConfig(level: ThinkingLevel, model: ModelId) {
  // Opus 4.6: use adaptive thinking with effort levels (no budget_tokens cap).
  // Sonnet/Haiku: use enabled + budget_tokens.
  if (model === 'claude-opus-4-6') {
    const effortMap: Record<ThinkingLevel, string | null> = {
      quick: 'low',
      think: 'medium',
      think_hard: 'high',
      investigate: 'max',
      plan_first: 'max',
      deep_investigate: 'max',
    };
    const effort = effortMap[level];
    if (effort === null) return {};
    return {
      thinking: { type: 'adaptive' as const },
      output_config: { effort: effort as 'low' | 'medium' | 'high' | 'max' },
    };
  }

  // Sonnet / Haiku: budget_tokens approach
  const budgetMap: Record<ThinkingLevel, number | null> = {
    quick: null,
    think: 4096,
    think_hard: 10000,
    investigate: 32768,
    plan_first: 32768,
    deep_investigate: 32768,
  };
  const budget = budgetMap[level];
  if (budget === null) return {};
  return { thinking: { type: 'enabled' as const, budget_tokens: budget } };
}

function getMaxTokens(model: ModelId, thinkingLevel: ThinkingLevel): number {
  const ceiling = getOutputCeiling(model);
  // max_tokens must be >= budget_tokens + reasonable text headroom.
  // Use a flat ceiling per model — simpler and avoids under-allocating.
  return ceiling;
}

// ── Client ─────────────────────────────────────────────────

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

export function isApiKeyConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ── Stream to SSE Response ─────────────────────────────────

export async function streamToResponse(
  config: StreamConfig,
  res: Response,
  onComplete?: (data: StreamCompletionData) => void
): Promise<void> {
  const anthropic = getClient();
  const thinkingConfig = config.nativeReasoningEnabled
    ? (config.model === 'claude-opus-4-6'
        ? { thinking: { type: 'adaptive' as const }, output_config: { effort: 'max' as const } }
        : { thinking: { type: 'enabled' as const, budget_tokens: 32768 } })
    : getThinkingConfig(config.thinking, config.model);

  const contentBlocks: ContentBlock[] = [];
  let currentText = '';
  let currentThinking = '';
  let currentToolInput = ''; // accumulates input_json_delta for server_tool_use blocks

  // Set SSE headers BEFORE the retry loop — only stream creation is retried.
  // Skip if headers were already sent (e.g. TOKEN-03 early-progress path in claude.ts).
  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  }

  // Inactivity timeout: close stream if no events for 5 minutes (STREAM-04)
  const INACTIVITY_MS = 5 * 60 * 1000;
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

  const sendEvent = (event: object) => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      res.write('data: ' + JSON.stringify({ type: 'error', message: 'Request timeout — no activity for 5 minutes.' }) + '\n\n');
      res.end();
    }, INACTIVITY_MS);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    // Build the system prompt content blocks.
    //
    // Prompt caching strategy:
    //   - Supported models (Opus 4.6, Sonnet 4.5): split into two blocks.
    //       Block 1 (static): Foundation + Area Context + Module Prompt
    //                         → cache_control: { type: "ephemeral" } applied here.
    //                         Anthropic caches this block across API calls in the same
    //                         session, saving ~90% on those cached tokens.
    //       Block 2 (dynamic): Output format instructions, creativity, knowledge additions,
    //                          reference documents — changes per request, NOT cached.
    //   - Haiku and unknown models: single block without cache_control (no caching).
    //   - Fallback: if staticSystemPrompt is not provided, the full system string is sent
    //               as a single cached block (original behaviour, backwards-compatible).
    const supportsCache = CACHE_SUPPORTED_MODELS.has(config.model);

    let systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;

    if (supportsCache && config.staticSystemPrompt && config.staticSystemPrompt.trim()) {
      // Two-block format: static (cached) + dynamic (not cached)
      systemBlocks = [
        {
          type: 'text' as const,
          text: config.staticSystemPrompt,
          cache_control: { type: 'ephemeral' as const },
        },
      ];
      // Only add the dynamic block if it has content
      if (config.system.trim()) {
        systemBlocks.push({
          type: 'text' as const,
          text: config.system,
          // No cache_control — this block changes per request
        });
      }
    } else if (supportsCache) {
      // No static/dynamic split provided — cache the whole prompt as a single block
      // (backwards-compatible with callers that don't supply staticSystemPrompt)
      systemBlocks = [
        {
          type: 'text' as const,
          text: config.system,
          cache_control: { type: 'ephemeral' as const },
        },
      ];
    } else {
      // Model does not support prompt caching — plain single block, no cache_control
      systemBlocks = [
        {
          type: 'text' as const,
          text: config.system,
        },
      ];
    }

    const requestParams: Record<string, unknown> = {
      model: config.model,
      max_tokens: getMaxTokens(config.model, config.thinking),
      system: systemBlocks,
      messages: config.messages,
      stream: true,
      ...thinkingConfig,
    };

    if (config.tools && config.tools.length > 0) {
      requestParams.tools = config.tools;
    }

    sendEvent({ type: 'stream_start', messageId: crypto.randomUUID() });
    console.log(`[claude-client] API call → model=${config.model} thinking=${config.thinking} max_tokens=${getMaxTokens(config.model, config.thinking)}`);

    // Build per-request options (beta headers + abort signal).
    const requestOptions: Record<string, unknown> = {};

    // Collect beta headers — extended thinking requires interleaved-thinking-2025-05-14;
    // the 1M-context beta is added when the caller requests long-context mode.
    const betaHeaders: string[] = [];
    // thinking is enabled if getThinkingConfig returned a non-empty object (budget_tokens set)
    const isThinkingEnabled = Object.keys(thinkingConfig).length > 0;
    if (isThinkingEnabled) {
      betaHeaders.push('interleaved-thinking-2025-05-14');
    }
    if (config.useLongContext) {
      betaHeaders.push('context-1m-2025-08-07');
    }
    if (betaHeaders.length > 0) {
      requestOptions.headers = { 'anthropic-beta': betaHeaders.join(',') };
    }

    if (config.signal) {
      requestOptions.signal = config.signal;
    }

    // Wrap stream creation in withRetry so transient 429/500/503 errors are retried
    // with exponential backoff (1s → 2s → 4s) before surfacing to the caller.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await withRetry(async () => anthropic.messages.stream(requestParams as any, Object.keys(requestOptions).length ? requestOptions as any : undefined));

    for await (const event of stream) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const evt = event as any;
      switch (evt.type) {
        case 'content_block_start': {
          const block = evt.content_block;
          if (block?.type === 'thinking') {
            currentThinking = '';
          } else if (block?.type === 'text') {
            currentText = '';
          } else if (block?.type === 'server_tool_use') {
            // Don't emit yet — accumulate input_json_delta first so we can send the actual query
            currentToolInput = '';
          } else if (block?.type === 'web_search_tool_result') {
            // Server-side search completed; results are embedded in this block
            const resultCount = Array.isArray(block.content) ? block.content.length : 0;
            sendEvent({ type: 'web_search_result', resultCount });
          }
          break;
        }
        case 'content_block_delta': {
          const delta = evt.delta;
          if (delta?.type === 'thinking_delta') {
            const text = delta.thinking as string;
            currentThinking += text;
            sendEvent({ type: 'thinking_delta', content: text });
          } else if (delta?.type === 'text_delta') {
            const text = delta.text as string;
            currentText += text;
            sendEvent({ type: 'text_delta', content: text });
          } else if (delta?.type === 'input_json_delta') {
            currentToolInput += (delta.partial_json as string) ?? '';
          }
          break;
        }
        case 'content_block_stop': {
          if (currentThinking) {
            contentBlocks.push({ type: 'thinking', content: currentThinking });
            currentThinking = '';
          }
          if (currentText) {
            contentBlocks.push({ type: 'text', content: currentText });
            currentText = '';
          }
          if (currentToolInput) {
            // Emit web_search_start now that we have the full query JSON
            try {
              const parsed = JSON.parse(currentToolInput) as { query?: string };
              sendEvent({ type: 'web_search_start', query: parsed.query ?? '' });
            } catch {
              sendEvent({ type: 'web_search_start', query: '' });
            }
            currentToolInput = '';
          }
          break;
        }
        case 'message_delta': {
          const usage = evt.usage;
          if (usage) {
            sendEvent({
              type: 'usage',
              inputTokens: usage.input_tokens || 0,
              outputTokens: usage.output_tokens || 0,
              thinkingTokens: 0,
              cacheCreationTokens: usage.cache_creation_input_tokens || 0,
              cacheReadTokens: usage.cache_read_input_tokens || 0,
            });
          }
          break;
        }
      }
    }

    // Final usage from the stream
    const finalMessage = await stream.finalMessage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalUsage = finalMessage.usage as any;
    const finalInputTokens: number = finalUsage.input_tokens || 0;
    const finalOutputTokens: number = finalUsage.output_tokens || 0;

    sendEvent({
      type: 'usage',
      inputTokens: finalInputTokens,
      outputTokens: finalOutputTokens,
      thinkingTokens: 0,
      cacheCreationTokens: finalUsage.cache_creation_input_tokens || 0,
      cacheReadTokens: finalUsage.cache_read_input_tokens || 0,
    });

    const textBlockCount = contentBlocks.filter(b => b.type === 'text').length;
    const textLength = contentBlocks.filter(b => b.type === 'text').reduce((acc, b) => acc + b.content.length, 0);
    console.log(`[claude-client] stream_end → blocks=${contentBlocks.length} textBlocks=${textBlockCount} textLen=${textLength}`);
    sendEvent({ type: 'stream_end', contentBlocks, sourceManifest: config.sourceManifest ?? [] });

    // Call completion callback if provided (used for DB persistence)
    if (onComplete) {
      const fullText = contentBlocks.filter((b) => b.type === 'text').map((b) => b.content).join('');
      const fullThinking = contentBlocks.filter((b) => b.type === 'thinking').map((b) => b.content).join('');
      // Pass the raw content blocks from finalMessage — these include thinking signatures
      // needed to replay thinking blocks correctly in subsequent conversation turns.
      onComplete({
        text: fullText,
        thinking: fullThinking,
        inputTokens: finalInputTokens,
        outputTokens: finalOutputTokens,
        cacheReadTokens: finalUsage.cache_read_input_tokens || 0,
        cacheCreationTokens: finalUsage.cache_creation_input_tokens || 0,
        rawContentBlocks: finalMessage.content as unknown[],
      });
    }

    if (inactivityTimer) clearTimeout(inactivityTimer);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[claude-client] stream error: ${message}`);
    // Don't emit error event if the stream was intentionally aborted (client disconnect)
    if (message !== 'This operation was aborted') {
      sendEvent({ type: 'error', message });
    }
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

// ── Non-streaming (sync) call ───────────────────────────────
// Used by the MCP server which cannot consume SSE streams.

export interface SyncCallConfig {
  model: ModelId;
  thinking: ThinkingLevel;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export async function callSync(config: SyncCallConfig): Promise<StreamCompletionData> {
  const anthropic = getClient();
  const thinkingConfig = getThinkingConfig(config.thinking, config.model);

  const supportsCache = CACHE_SUPPORTED_MODELS.has(config.model);
  const systemBlocks: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> = supportsCache
    ? [{ type: 'text' as const, text: config.system, cache_control: { type: 'ephemeral' as const } }]
    : [{ type: 'text' as const, text: config.system }];

  const requestParams: Record<string, unknown> = {
    model: config.model,
    max_tokens: getMaxTokens(config.model, config.thinking),
    system: systemBlocks,
    messages: config.messages,
    ...thinkingConfig,
  };

  // Use streaming internally and accumulate — SDK requires streaming for extended thinking
  let text = '';
  let thinking = '';
  let inputTokens = 0;
  let outputTokens = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await withRetry(() => (anthropic.messages as any).stream(requestParams));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const event of stream as AsyncIterable<any>) {
    if (event.type === 'content_block_delta') {
      if (event.delta?.type === 'text_delta') text += event.delta.text as string;
      else if (event.delta?.type === 'thinking_delta') thinking += event.delta.thinking as string;
    } else if (event.type === 'message_delta' && event.usage) {
      outputTokens = (event.usage.output_tokens as number) || 0;
    } else if (event.type === 'message_start' && event.message?.usage) {
      inputTokens = (event.message.usage.input_tokens as number) || 0;
    }
  }

  return { text, thinking, inputTokens, outputTokens, cacheReadTokens: 0, cacheCreationTokens: 0 };
}
