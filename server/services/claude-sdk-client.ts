/**
 * claude-sdk-client.ts — the SDK execution engine.
 *
 * Runs Anthropic models through the Claude Agent SDK subprocess instead of
 * the Messages API (claude-client.ts). The point is auth: the subprocess
 * authenticates with the machine's Claude Code login, so a Claude
 * SUBSCRIPTION can power module runs on an instance whose ANTHROPIC_API_KEY
 * is absent or unfunded. Model ids use the `sdk:` prefix (sdk:claude-opus-5),
 * following the azure:/ollama:/compat: convention — no static registry entry.
 *
 * This engine is a TEXT ENGINE, not an agent:
 *   - `tools: []` — every built-in tool disabled. No file access, no shell,
 *     no web search. Nothing needs containing because nothing is granted.
 *   - `maxTurns: 1` — one completion per request.
 *   - `settingSources: []` — the user's personal Claude Code settings, hooks
 *     and CLAUDE.md never leak into an ANTON run.
 *   - `persistSession: false` — runs don't pile up in ~/.claude/projects.
 *
 * AUTH RULE (the load-bearing line): the subprocess env is
 * `{ ...process.env }` with ANTHROPIC_API_KEY DELETED. ANTON's server holds
 * the (possibly unfunded) key in its own environment; if the subprocess saw
 * it, the SDK would bill the key instead of the subscription. The spread is
 * mandatory — Options.env REPLACES the subprocess environment wholesale, and
 * a bare object strips PATH/HOME and the subprocess never starts on Windows.
 *
 * Capability differences vs the API path, stated rather than hidden:
 *   - ANTON's web-search knowledge mode does not run on this engine.
 *   - The SDK reports a cost figure, but on subscription auth the spend is
 *     plan usage, not a bill.
 *   - Each request spawns the Claude Code runtime (~seconds of startup);
 *     concurrent SDK runs are capped at MAX_CONCURRENT_SDK_RUNS.
 */

import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { StreamSink } from './stream-sink.js';
import { anthropicUsesAdaptive, anthropicEffort, anthropicBudgetTokens } from './thinking-map.js';
import { isSdkEngineEnabled } from './sdk-engine-store.js';

// ── Model id convention ─────────────────────────────────────

export const SDK_MODEL_PREFIX = 'sdk:';

export function isSdkModel(modelId: string): boolean {
  return modelId.startsWith(SDK_MODEL_PREFIX);
}

/** sdk:claude-opus-5 → claude-opus-5 */
export function sdkUnderlyingModel(modelId: string): string {
  return isSdkModel(modelId) ? modelId.slice(SDK_MODEL_PREFIX.length) : modelId;
}

/** The models offered in the picker when the engine is enabled — single
 *  source for the Settings route; the frontend renders what this returns. */
export const SDK_ENGINE_MODELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'sdk:claude-opus-5', label: 'Claude Opus 5 (subscription)' },
  { id: 'sdk:claude-sonnet-5', label: 'Claude Sonnet 5 (subscription)' },
  { id: 'sdk:claude-fable-5', label: 'Claude Fable 5 (subscription)' },
];

// ── Subprocess environment ──────────────────────────────────

/**
 * The env handed to the SDK subprocess: everything the server has (PATH,
 * HOME, proxies) EXCEPT the Anthropic API key, whose absence is what makes
 * the SDK authenticate with the machine's Claude Code login. Exported so a
 * test can prove the key never leaks through.
 */
export function buildSdkEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...base };
  delete env.ANTHROPIC_API_KEY;
  return env;
}

// ── Thinking mapping ────────────────────────────────────────

type ThinkingLevel = 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate';

/**
 * ANTON's six thinking levels map onto the SDK's first-class thinking/effort
 * options via the same single-source tables the API path uses (thinking-map.ts).
 * Adaptive models get { thinking: adaptive, effort }; budget models get an
 * explicit budget; quick on a budget model disables thinking.
 */
export function sdkThinkingOptions(level: ThinkingLevel, underlyingModel: string): {
  thinking?: { type: 'adaptive' } | { type: 'enabled'; budgetTokens: number } | { type: 'disabled' };
  effort?: 'low' | 'medium' | 'high' | 'max';
} {
  if (anthropicUsesAdaptive(underlyingModel)) {
    return { thinking: { type: 'adaptive' }, effort: anthropicEffort(level) };
  }
  const budget = anthropicBudgetTokens(level);
  if (budget === null) return { thinking: { type: 'disabled' } };
  return { thinking: { type: 'enabled', budgetTokens: budget } };
}

// ── Config / result shapes (mirror claude-client) ───────────

export interface SdkStreamConfig {
  /** The prefixed id, e.g. sdk:claude-opus-5. */
  model: string;
  thinking: ThinkingLevel;
  /** Dynamic system prompt portion (or the whole prompt when static is absent). */
  system: string;
  /** Static portion — concatenated ahead of `system`. The SDK has no
   *  cache_control surface, so the split collapses; order is preserved. */
  staticSystemPrompt?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string | object[] }>;
  signal?: AbortSignal;
  sourceManifest?: string[];
}

export interface SdkCompletionData {
  text: string;
  thinking: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

interface ContentBlock {
  type: 'thinking' | 'text';
  content: string;
}

// ── Concurrency cap ─────────────────────────────────────────

const MAX_CONCURRENT_SDK_RUNS = 2;
let activeRuns = 0;

// ── Prompt flattening ───────────────────────────────────────

/**
 * The SDK takes one prompt string per run (persistSession:false — no session
 * to continue). Multi-turn ANTON sessions are flattened into a transcript:
 * prior turns labelled, final user message last. Content blocks that are not
 * plain strings (tool results from older runs) are JSON-stringified — lossy
 * but honest, and rare on this path.
 */
export function flattenMessages(messages: SdkStreamConfig['messages']): string {
  const text = (content: string | object[]): string =>
    typeof content === 'string' ? content : JSON.stringify(content);
  if (messages.length === 0) return '';
  if (messages.length === 1) return text(messages[0].content);
  const history = messages.slice(0, -1)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${text(m.content)}`)
    .join('\n\n');
  const last = messages[messages.length - 1];
  return `<conversation_so_far>\n${history}\n</conversation_so_far>\n\n${text(last.content)}`;
}

// ── Streaming ───────────────────────────────────────────────

/** Minimal structural types for the SDK messages this engine consumes —
 *  narrow on discriminants, never trust the rest (strict mode, no `any`). */
interface SdkPartialMessage {
  type: 'stream_event';
  event?: {
    type?: string;
    delta?: { type?: string; text?: string; thinking?: string };
  };
}
interface SdkResultMessage {
  type: 'result';
  subtype: string;
  result?: string;
  total_cost_usd?: number;
  num_turns?: number;
  errors?: string[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}
type SdkMessage = SdkPartialMessage | SdkResultMessage | { type: string };

/** Injectable SDK boundary — tests replace this; production resolves the real
 *  package lazily (the SDK is a ~1.2 MB module; don't pay for it at boot). */
type QueryFn = (params: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<SdkMessage>;
let queryImpl: QueryFn | null = null;
export function setSdkQueryImplForTests(impl: QueryFn | null): void {
  queryImpl = impl;
}
async function resolveQuery(): Promise<QueryFn> {
  if (queryImpl) return queryImpl;
  const mod = await import('@anthropic-ai/claude-agent-sdk');
  return mod.query as unknown as QueryFn;
}

export async function streamToResponse(
  config: SdkStreamConfig,
  res: StreamSink,
  onComplete?: (data: SdkCompletionData) => void | Promise<void>,
  opts?: {
    /** The Settings "Test" button probes the engine BEFORE the user enables
     *  it — that one caller may bypass the enabled gate. Route callers never set this. */
    bypassEnabledCheck?: boolean;
  },
): Promise<void> {
  if (!res.headersSent) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
  }

  const sendEvent = (event: object) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  if (!opts?.bypassEnabledCheck && !isSdkEngineEnabled()) {
    sendEvent({ type: 'error', message: 'The SDK execution engine is disabled. Enable it in Settings → Execution engines.' });
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }
  if (activeRuns >= MAX_CONCURRENT_SDK_RUNS) {
    sendEvent({ type: 'error', message: `SDK engine busy — at most ${MAX_CONCURRENT_SDK_RUNS} concurrent subscription runs. Try again shortly or pick an API model.` });
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  const underlying = sdkUnderlyingModel(config.model);
  const systemPrompt = config.staticSystemPrompt && config.staticSystemPrompt.trim()
    ? `${config.staticSystemPrompt}\n\n${config.system}`
    : config.system;

  const abortController = new AbortController();
  if (config.signal) {
    if (config.signal.aborted) abortController.abort();
    else config.signal.addEventListener('abort', () => abortController.abort(), { once: true });
  }

  activeRuns++;
  const contentBlocks: ContentBlock[] = [];
  let currentText = '';
  let currentThinking = '';
  let usageData = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

  try {
    console.log(`[sdk-engine] run → model=${underlying} thinking=${config.thinking}`);
    const query = await resolveQuery();
    sendEvent({ type: 'stream_start', messageId: randomUUID() });

    const session = query({
      prompt: flattenMessages(config.messages),
      options: {
        model: underlying,
        systemPrompt,
        tools: [],               // text engine: no built-in tools, ever
        maxTurns: 1,
        permissionMode: 'dontAsk',
        settingSources: [],      // never inherit the user's personal Claude Code config
        persistSession: false,
        includePartialMessages: true,
        env: buildSdkEnv(),      // process.env minus ANTHROPIC_API_KEY → subscription auth
        cwd: os.tmpdir(),        // neutral cwd; nothing reads it (no tools) but never the repo
        abortController,
        ...sdkThinkingOptions(config.thinking, underlying),
      },
    });

    for await (const message of session) {
      if (message.type === 'stream_event') {
        const delta = (message as SdkPartialMessage).event?.delta;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          currentText += delta.text;
          sendEvent({ type: 'text_delta', content: delta.text });
        } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          currentThinking += delta.thinking;
          sendEvent({ type: 'thinking_delta', content: delta.thinking });
        }
      } else if (message.type === 'result') {
        const result = message as SdkResultMessage;
        if (result.subtype === 'success') {
          // Native builds may not emit partials — fall back to the final text.
          if (!currentText && typeof result.result === 'string' && result.result.length > 0) {
            currentText = result.result;
            sendEvent({ type: 'text_delta', content: result.result });
          }
          usageData = {
            inputTokens: result.usage?.input_tokens ?? 0,
            outputTokens: result.usage?.output_tokens ?? 0,
            cacheReadTokens: result.usage?.cache_read_input_tokens ?? 0,
            cacheCreationTokens: result.usage?.cache_creation_input_tokens ?? 0,
          };
          sendEvent({ type: 'usage', ...usageData, thinkingTokens: 0 });
        } else {
          const detail = result.errors?.length ? ` — ${result.errors.join('; ')}` : '';
          console.warn(`[sdk-engine] run failed (${result.subtype})${detail}`);
          sendEvent({
            type: 'error',
            message: `SDK engine run failed (${result.subtype})${detail}. If this mentions authentication, run \`claude\` once on this machine and log in.`,
          });
        }
      }
      // system/assistant envelope messages carry nothing this engine needs.
    }

    console.log(`[sdk-engine] run complete — ${usageData.inputTokens} in / ${usageData.outputTokens} out tokens`);
    if (currentThinking) contentBlocks.push({ type: 'thinking', content: currentThinking });
    if (currentText) contentBlocks.push({ type: 'text', content: currentText });
    sendEvent({ type: 'stream_end', contentBlocks, sourceManifest: config.sourceManifest });
    res.write('data: [DONE]\n\n');
    res.end();

    if (onComplete && currentText) {
      await onComplete({ text: currentText, thinking: currentThinking, ...usageData });
    }
  } catch (err) {
    // Mirror claude-client's contract: failures surface as an SSE error event,
    // never a thrown exception after headers are out.
    const msg = err instanceof Error ? err.message : 'SDK engine failed to start';
    console.error(`[sdk-engine] error: ${msg}`);
    sendEvent({
      type: 'error',
      message: `SDK engine error: ${msg}. The Claude Code runtime must be installed and logged in on this machine.`,
    });
    res.write('data: [DONE]\n\n');
    res.end();
  } finally {
    activeRuns--;
  }
}

// ── Non-streaming + health check ────────────────────────────

/** In-memory StreamSink for callers that want a single aggregated answer. */
class CollectingSink implements StreamSink {
  readonly headersSent = false;
  writeHead(): void { /* no HTTP channel */ }
  write(_chunk: string): void { /* events not needed; onComplete carries the result */ }
  end(): void { /* no-op */ }
}

/** One-shot completion through the SDK engine (unified-llm-client sendRequest path). */
export async function completeText(
  config: SdkStreamConfig,
  opts?: { bypassEnabledCheck?: boolean },
): Promise<SdkCompletionData> {
  let completion: SdkCompletionData | null = null;
  let errorMessage: string | null = null;
  const sink = new CollectingSink();
  const captureErrors: StreamSink = {
    get headersSent() { return sink.headersSent; },
    writeHead: () => undefined,
    write: (chunk: string) => {
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const event = JSON.parse(line.slice(6)) as { type?: string; message?: string };
          if (event.type === 'error' && event.message) errorMessage = event.message;
        } catch { /* non-JSON line — ignore */ }
      }
    },
    end: () => undefined,
  };
  await streamToResponse(config, captureErrors, (data) => { completion = data; }, opts);
  if (completion) return completion;
  throw new Error(errorMessage ?? 'SDK engine returned no completion');
}

/**
 * Settings "Test" button: a one-word ping through the real engine. Returns an
 * honest status instead of throwing — the caller renders message verbatim.
 */
export async function testSdkEngine(): Promise<{ ok: boolean; message: string }> {
  try {
    const data = await completeText({
      model: 'sdk:claude-sonnet-5',
      thinking: 'quick',
      system: 'You are a connectivity check. Reply with the single word: ready',
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
    }, { bypassEnabledCheck: true });
    return {
      ok: true,
      message: `SDK engine works — model replied ("${data.text.slice(0, 40).trim()}"), ${data.inputTokens} in / ${data.outputTokens} out tokens via this machine's Claude Code login.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'SDK engine test failed' };
  }
}
