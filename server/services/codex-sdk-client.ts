/**
 * codex-sdk-client.ts — the ChatGPT-subscription execution engine.
 *
 * Sibling of claude-sdk-client.ts: runs OpenAI models through the Codex SDK
 * subprocess (@openai/codex-sdk, which bundles the Codex CLI), authenticated
 * by the machine's ChatGPT sign-in (`codex login` → ~/.codex/auth.json). A
 * ChatGPT Plus/Pro/Team subscription powers module runs with no OPENAI_API_KEY.
 * Model ids use the `codex:` prefix; `codex:auto` runs the CLI's default model.
 *
 * Containment — honest wording: this engine is a READ-ONLY SANDBOX, not a
 * no-tools text engine. The Codex CLI has no tools:[] equivalent; instead the
 * thread runs with sandboxMode 'read-only', approvalPolicy 'never', web search
 * disabled, network access disabled, cwd = tmpdir, skipGitRepoCheck. The agent
 * could still run read-only commands inside the sandbox; it cannot write,
 * reach the network, or see the repo.
 *
 * AUTH RULE (mirror of the Claude engine): the subprocess env is
 * `{ ...process.env }` with OPENAI_API_KEY DELETED, and CodexOptions.apiKey is
 * NEVER set — so ~/.codex/auth.json (the ChatGPT login) is the only auth the
 * runtime can use. CodexOptions.env, like the Claude SDK's, REPLACES the
 * subprocess environment when provided, so the spread is mandatory.
 *
 * No system-prompt option exists on Codex threads: ANTON's composed prompt is
 * carried in a <system_instructions> block ahead of the user message. Stated
 * here and in the UI rather than hidden.
 *
 * Unauthenticated behaviour (measured on this machine before writing this):
 * the runtime retries 401s through a slow reconnect ladder (~30s+ of
 * "Reconnecting... 401 Unauthorized" error events). The event loop
 * short-circuits on the first 401 with an actionable sign-in message.
 */

import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { StreamSink } from './stream-sink.js';
import { codexReasoningEffort } from './thinking-map.js';
import { isCodexEngineEnabled } from './codex-engine-store.js';
import { flattenMessages, type SdkStreamConfig, type SdkCompletionData } from './claude-sdk-client.js';

// ── Model id convention ─────────────────────────────────────

export const CODEX_MODEL_PREFIX = 'codex:';

export function isCodexModel(modelId: string): boolean {
  return modelId.startsWith(CODEX_MODEL_PREFIX);
}

/** codex:gpt-5.2-codex → gpt-5.2-codex; codex:auto → undefined (CLI default). */
export function codexUnderlyingModel(modelId: string): string | undefined {
  const bare = isCodexModel(modelId) ? modelId.slice(CODEX_MODEL_PREFIX.length) : modelId;
  return bare === 'auto' ? undefined : bare;
}

/** The models offered in the picker when the engine is enabled. `codex:auto`
 *  (the CLI's own default) leads — explicit Codex model ids drift with OpenAI
 *  releases, and a wrong one fails loudly at run time. */
export const CODEX_ENGINE_MODELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'codex:auto', label: 'ChatGPT — Codex default model (subscription)' },
  { id: 'codex:gpt-5.2-codex', label: 'GPT-5.2 Codex (subscription)' },
  { id: 'codex:gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini (subscription)' },
];

// ── Subprocess environment ──────────────────────────────────

/**
 * The env handed to the Codex subprocess: everything the server has EXCEPT
 * OPENAI_API_KEY, whose absence (together with never setting
 * CodexOptions.apiKey) makes the runtime authenticate with the machine's
 * ChatGPT sign-in. Exported so a test can prove the key never leaks through.
 */
export function buildCodexEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined) env[k] = v;
  }
  delete env.OPENAI_API_KEY;
  return env;
}

// ── Concurrency cap ─────────────────────────────────────────

const MAX_CONCURRENT_CODEX_RUNS = 2;
let activeRuns = 0;

// ── SDK boundary (injectable for tests) ─────────────────────

/** Minimal structural view of the codex-sdk surface this engine touches. */
export interface CodexThreadLike {
  runStreamed(input: string, turnOptions?: { signal?: AbortSignal }): Promise<{ events: AsyncIterable<CodexEvent> }>;
}
export interface CodexLike {
  startThread(options?: Record<string, unknown>): CodexThreadLike;
}
export type CodexFactory = (options: { env: Record<string, string> }) => CodexLike;

export type CodexEvent =
  | { type: 'thread.started'; thread_id?: string }
  | { type: 'turn.started' }
  | {
      type: 'turn.completed';
      usage?: {
        input_tokens?: number;
        cached_input_tokens?: number;
        cache_write_input_tokens?: number;
        output_tokens?: number;
        reasoning_output_tokens?: number;
      };
    }
  | { type: 'turn.failed'; error?: { message?: string } }
  | { type: 'item.started' | 'item.updated' | 'item.completed'; item?: { id?: string; type?: string; text?: string; message?: string } }
  | { type: 'error'; message?: string }
  | { type: string };

let codexFactoryImpl: CodexFactory | null = null;
export function setCodexFactoryForTests(impl: CodexFactory | null): void {
  codexFactoryImpl = impl;
}
async function resolveCodexFactory(): Promise<CodexFactory> {
  if (codexFactoryImpl) return codexFactoryImpl;
  const mod = await import('@openai/codex-sdk');
  return (options) => new mod.Codex(options) as unknown as CodexLike;
}

const SIGN_IN_HINT =
  'No ChatGPT sign-in found on this machine. Run `npx codex login` once in the ANTON folder (opens a browser; uses your ChatGPT account), then test again.';

// ── Streaming ───────────────────────────────────────────────

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

  if (!opts?.bypassEnabledCheck && !isCodexEngineEnabled()) {
    sendEvent({ type: 'error', message: 'The ChatGPT (Codex) execution engine is disabled. Enable it in Settings → Execution engines.' });
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }
  if (activeRuns >= MAX_CONCURRENT_CODEX_RUNS) {
    sendEvent({ type: 'error', message: `ChatGPT engine busy — at most ${MAX_CONCURRENT_CODEX_RUNS} concurrent subscription runs. Try again shortly or pick an API model.` });
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  const systemPrompt = config.staticSystemPrompt && config.staticSystemPrompt.trim()
    ? `${config.staticSystemPrompt}\n\n${config.system}`
    : config.system;
  const prompt = `<system_instructions>\n${systemPrompt}\n</system_instructions>\n\n${flattenMessages(config.messages)}`;

  const abortController = new AbortController();
  if (config.signal) {
    if (config.signal.aborted) abortController.abort();
    else config.signal.addEventListener('abort', () => abortController.abort(), { once: true });
  }

  activeRuns++;
  // Per-item accumulators: agent_message/reasoning items carry CUMULATIVE
  // text across item.updated events — emit only the suffix as a delta.
  const itemText = new Map<string, string>();
  let currentText = '';
  let currentThinking = '';
  let usageData = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  let thinkingTokens = 0;
  let terminalError: string | null = null;

  const takeDelta = (id: string, cumulative: string): string => {
    const prev = itemText.get(id) ?? '';
    const delta = cumulative.startsWith(prev) ? cumulative.slice(prev.length) : cumulative;
    itemText.set(id, cumulative);
    return delta;
  };

  try {
    const factory = await resolveCodexFactory();
    const codex = factory({ env: buildCodexEnv() }); // apiKey NEVER set — ChatGPT login is the only auth
    const thread = codex.startThread({
      ...(codexUnderlyingModel(config.model) ? { model: codexUnderlyingModel(config.model) } : {}),
      sandboxMode: 'read-only',
      workingDirectory: os.tmpdir(),   // never the repo; read-only besides
      skipGitRepoCheck: true,
      approvalPolicy: 'never',
      webSearchMode: 'disabled',
      networkAccessEnabled: false,
      modelReasoningEffort: codexReasoningEffort(config.thinking),
    });

    sendEvent({ type: 'stream_start', messageId: randomUUID() });
    const { events } = await thread.runStreamed(prompt, { signal: abortController.signal });

    for await (const event of events) {
      if (event.type === 'item.updated' || event.type === 'item.completed' || event.type === 'item.started') {
        const item = (event as { item?: { id?: string; type?: string; text?: string; message?: string } }).item;
        if (item?.type === 'agent_message' && typeof item.text === 'string' && item.id) {
          const delta = takeDelta(`msg:${item.id}`, item.text);
          if (delta) {
            currentText += delta;
            sendEvent({ type: 'text_delta', content: delta });
          }
        } else if (item?.type === 'reasoning' && typeof item.text === 'string' && item.id) {
          const delta = takeDelta(`think:${item.id}`, item.text);
          if (delta) {
            currentThinking += delta;
            sendEvent({ type: 'thinking_delta', content: delta });
          }
        } else if (item?.type === 'error' && /401|unauthorized/i.test(item.message ?? '')) {
          terminalError = SIGN_IN_HINT;
          abortController.abort(); // stop the retry ladder — it grinds for 30s+ otherwise
          break;
        }
      } else if (event.type === 'error') {
        const msg = (event as { message?: string }).message ?? '';
        if (/401|unauthorized/i.test(msg)) {
          terminalError = SIGN_IN_HINT;
          abortController.abort();
          break;
        }
        // Non-401 "Reconnecting..." events are transient noise — not surfaced.
      } else if (event.type === 'turn.failed') {
        terminalError = (event as { error?: { message?: string } }).error?.message
          ?? 'ChatGPT engine run failed';
        break;
      } else if (event.type === 'turn.completed') {
        const usage = (event as { usage?: Record<string, number | undefined> }).usage;
        usageData = {
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          cacheReadTokens: usage?.cached_input_tokens ?? 0,
          cacheCreationTokens: usage?.cache_write_input_tokens ?? 0,
        };
        thinkingTokens = usage?.reasoning_output_tokens ?? 0;
        sendEvent({ type: 'usage', ...usageData, thinkingTokens });
      }
    }

    if (terminalError) {
      sendEvent({ type: 'error', message: `ChatGPT engine error: ${terminalError}` });
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const contentBlocks: Array<{ type: 'thinking' | 'text'; content: string }> = [];
    if (currentThinking) contentBlocks.push({ type: 'thinking', content: currentThinking });
    if (currentText) contentBlocks.push({ type: 'text', content: currentText });
    sendEvent({ type: 'stream_end', contentBlocks, sourceManifest: config.sourceManifest });
    res.write('data: [DONE]\n\n');
    res.end();

    if (onComplete && currentText) {
      await onComplete({ text: currentText, thinking: currentThinking, ...usageData });
    }
  } catch (err) {
    // Mirror the gateway contract: failures surface as an SSE error event.
    const raw = err instanceof Error ? err.message : 'Codex engine failed to start';
    const msg = /401|unauthorized/i.test(raw) ? SIGN_IN_HINT : raw;
    sendEvent({ type: 'error', message: `ChatGPT engine error: ${msg}` });
    res.write('data: [DONE]\n\n');
    res.end();
  } finally {
    activeRuns--;
  }
}

// ── Non-streaming + health check ────────────────────────────

/** One-shot completion through the Codex engine (unified-llm-client sendRequest path). */
export async function completeText(
  config: SdkStreamConfig,
  opts?: { bypassEnabledCheck?: boolean },
): Promise<SdkCompletionData> {
  let completion: SdkCompletionData | null = null;
  let errorMessage: string | null = null;
  const captureErrors: StreamSink = {
    headersSent: false,
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
  throw new Error(errorMessage ?? 'ChatGPT engine returned no completion');
}

/**
 * Settings "Test" button: a one-word ping through the real engine. Returns an
 * honest status instead of throwing — the caller renders message verbatim.
 */
export async function testCodexEngine(): Promise<{ ok: boolean; message: string }> {
  try {
    const data = await completeText({
      model: 'codex:auto',
      thinking: 'quick',
      system: 'You are a connectivity check. Reply with the single word: ready',
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
    }, { bypassEnabledCheck: true });
    return {
      ok: true,
      message: `ChatGPT engine works — model replied ("${data.text.slice(0, 40).trim()}"), ${data.inputTokens} in / ${data.outputTokens} out tokens via this machine's ChatGPT sign-in.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'ChatGPT engine test failed' };
  }
}
