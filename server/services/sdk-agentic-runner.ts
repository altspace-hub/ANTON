/**
 * sdk-agentic-runner.ts — an engine run that can use ANTON's tools.
 *
 * Wave 3 (2026-09-08). The subscription engine has run as a text engine: one
 * turn, no tools (claude-sdk-client.ts). Every multi-step surface — Task
 * Agent steps, engagement deliverables, the Gap Assessor batches — therefore
 * got one shot with whatever was pasted into the prompt. This runner gives a
 * run a small set of ANTON-provided tools over several turns:
 *
 *   - the tools are ordinary async functions, registered with the Agent SDK's
 *     in-process MCP server (`createSdkMcpServer` + `tool`), so nothing
 *     leaves the process and no permission prompt can appear;
 *   - `permissionMode: 'dontAsk'` with `allowedTools` naming exactly those
 *     tools (plus WebSearch/WebFetch when asked) — every other built-in tool
 *     stays denied, and the working directory is a temp dir;
 *   - every tool call and its result is reported to the caller as it happens
 *     and returned in the result, so the page can show the work and the
 *     record can keep it;
 *   - the same subscription slot accounting as the text engine.
 *
 * The result's `text` is the FINAL assistant turn — the deliverable — not
 * the tool-calling chatter before it; `transcript` keeps every turn.
 */
import os from 'os';
import {
  resolveAgentSdk,
  tryAcquireSdkSlot,
  releaseSdkSlot,
  yieldSdkSlotDuring,
  buildSdkEnv,
  sdkThinkingOptions,
  sdkUnderlyingModel,
  SDK_WEB_TOOLS,
} from './claude-sdk-client.js';

type ThinkingLevel = 'quick' | 'think' | 'think_hard' | 'investigate' | 'plan_first' | 'deep_investigate';

export interface AgentToolDefinition {
  /** snake_case; the model sees it as mcp__anton__<name>. */
  name: string;
  description: string;
  /** A zod raw shape, e.g. `{ query: z.string().describe('…') }`. */
  schema: Record<string, unknown>;
  /** Returns the text the model reads. Throw to report a tool error. */
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface AgenticRunConfig {
  /** The prefixed id, e.g. sdk:claude-opus-5. */
  model: string;
  thinking: ThinkingLevel;
  system: string;
  prompt: string;
  tools: AgentToolDefinition[];
  /** Also grant the SDK's WebSearch/WebFetch. */
  webSearch?: boolean;
  /** Assistant turns before the run is cut off (default 12). */
  maxTurns?: number;
  /** Scheduled work yields the last slot to interactive requests. */
  background?: boolean;
  signal?: AbortSignal;
  /** Hard wall-clock cap (default 15 minutes). */
  timeoutMs?: number;
}

export type AgenticEvent =
  | { type: 'turn_start'; turn: number }
  | { type: 'text_delta'; content: string }
  | { type: 'thinking_delta'; content: string }
  | { type: 'tool_call'; id: number; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; id: number; name: string; output: string; isError: boolean; ms: number }
  | { type: 'error'; message: string };

export interface AgenticToolCall {
  id: number;
  name: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
  ms: number;
}

export interface AgenticRunResult {
  ok: boolean;
  /** The final assistant turn. */
  text: string;
  thinking: string;
  /** Every assistant turn's text, in order. */
  transcript: string[];
  toolCalls: AgenticToolCall[];
  turns: number;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };
  /** Set when ok is false, or when the run was cut off but kept its answer. */
  warning?: string;
  error?: string;
}

const DEFAULT_MAX_TURNS = 12;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
const TOOL_OUTPUT_CAP = 40_000;
const MCP_SERVER_NAME = 'anton';

export const mcpToolName = (name: string): string => `mcp__${MCP_SERVER_NAME}__${name}`;

/** Minimal structural types for the SDK messages this runner consumes. */
interface StreamEventMessage {
  type: 'stream_event';
  event?: { type?: string; delta?: { type?: string; text?: string; thinking?: string } };
}
interface AssistantMessage {
  type: 'assistant';
  message?: { content?: Array<{ type?: string; text?: string; thinking?: string; name?: string; input?: unknown }> };
}
interface ResultMessage {
  type: 'result';
  subtype: string;
  result?: string;
  num_turns?: number;
  errors?: string[];
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
}

export async function runAgentic(config: AgenticRunConfig, onEvent: (event: AgenticEvent) => void): Promise<AgenticRunResult> {
  const empty = (): AgenticRunResult => ({
    ok: false, text: '', thinking: '', transcript: [], toolCalls: [], turns: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
  });

  const slotError = tryAcquireSdkSlot(config.background === true);
  if (slotError) {
    onEvent({ type: 'error', message: slotError });
    return { ...empty(), error: slotError };
  }

  const toolCalls: AgenticToolCall[] = [];
  const transcript: string[] = [];
  let currentTurnText = '';
  let currentTurnThinking = '';
  let allThinking = '';
  let turns = 0;
  let nextCallId = 1;
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

  const abortController = new AbortController();
  if (config.signal) {
    if (config.signal.aborted) abortController.abort();
    else config.signal.addEventListener('abort', () => abortController.abort(), { once: true });
  }
  const timeout = setTimeout(() => abortController.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const finishTurn = (): void => {
    if (currentTurnText) transcript.push(currentTurnText);
    if (currentTurnThinking) allThinking += (allThinking ? '\n\n' : '') + currentTurnThinking;
    currentTurnText = '';
    currentTurnThinking = '';
  };

  try {
    const sdk = await resolveAgentSdk();
    const underlying = sdkUnderlyingModel(config.model);

    // ANTON's tools, wrapped for the in-process MCP server. The wrapper is
    // where a call is reported and recorded; the definition stays a plain
    // function that knows nothing about the SDK.
    const wrapped = config.tools.map((def) =>
      sdk.tool(def.name, def.description, def.schema, async (args) => {
        const id = nextCallId++;
        const input = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
        onEvent({ type: 'tool_call', id, name: def.name, input });
        const t0 = Date.now();
        try {
          // The engine subprocess waits while the tool runs: give its slot up
          // so a tool that consults the engine itself is not refused.
          const output = String(await yieldSdkSlotDuring(() => def.handler(input))).slice(0, TOOL_OUTPUT_CAP);
          const ms = Date.now() - t0;
          toolCalls.push({ id, name: def.name, input, output, isError: false, ms });
          onEvent({ type: 'tool_result', id, name: def.name, output, isError: false, ms });
          return { content: [{ type: 'text', text: output || '(no result)' }] };
        } catch (err) {
          const ms = Date.now() - t0;
          const message = err instanceof Error ? err.message : String(err);
          toolCalls.push({ id, name: def.name, input, output: message, isError: true, ms });
          onEvent({ type: 'tool_result', id, name: def.name, output: message, isError: true, ms });
          return { content: [{ type: 'text', text: `Tool error: ${message}` }], isError: true };
        }
      }),
    );
    const server = sdk.createSdkMcpServer({ name: MCP_SERVER_NAME, version: '1.0.0', tools: wrapped });
    const allowedTools = [
      ...config.tools.map((t) => mcpToolName(t.name)),
      ...(config.webSearch ? [...SDK_WEB_TOOLS] : []),
    ];

    console.log(`[sdk-agentic] run → model=${underlying} thinking=${config.thinking} tools=${config.tools.map((t) => t.name).join(',') || 'none'}${config.webSearch ? '+web' : ''} maxTurns=${config.maxTurns ?? DEFAULT_MAX_TURNS}`);

    const session = sdk.query({
      prompt: config.prompt,
      options: {
        model: underlying,
        systemPrompt: config.system,
        tools: config.webSearch ? [...SDK_WEB_TOOLS] : [],
        allowedTools,
        mcpServers: { [MCP_SERVER_NAME]: server },
        maxTurns: config.maxTurns ?? DEFAULT_MAX_TURNS,
        permissionMode: 'dontAsk',
        settingSources: [],
        persistSession: false,
        includePartialMessages: true,
        env: buildSdkEnv(),
        cwd: os.tmpdir(),
        abortController,
        ...sdkThinkingOptions(config.thinking, underlying),
      },
    });

    let resultSeen: ResultMessage | null = null;
    for await (const message of session) {
      if (message.type === 'stream_event') {
        const event = (message as StreamEventMessage).event;
        if (event?.type === 'message_start') {
          finishTurn();
          turns += 1;
          onEvent({ type: 'turn_start', turn: turns });
          continue;
        }
        const delta = event?.delta;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          currentTurnText += delta.text;
          onEvent({ type: 'text_delta', content: delta.text });
        } else if (delta?.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          currentTurnThinking += delta.thinking;
          onEvent({ type: 'thinking_delta', content: delta.thinking });
        }
      } else if (message.type === 'assistant') {
        // A native build may not emit partials: take the turn's text from the
        // complete message when nothing was streamed for it.
        if (!currentTurnText) {
          const blocks = (message as AssistantMessage).message?.content ?? [];
          const text = blocks.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string).join('');
          if (text) {
            if (turns === 0) { turns = 1; onEvent({ type: 'turn_start', turn: 1 }); }
            currentTurnText = text;
            onEvent({ type: 'text_delta', content: text });
          }
        }
      } else if (message.type === 'result') {
        resultSeen = message as ResultMessage;
      }
    }
    finishTurn();

    const result: AgenticRunResult = {
      ok: false,
      text: [...transcript].reverse().find((t) => t.trim().length > 0) ?? '',
      thinking: allThinking,
      transcript,
      toolCalls,
      turns: resultSeen?.num_turns ?? turns,
      usage,
    };
    if (!resultSeen) {
      result.error = abortController.signal.aborted ? 'The run was cancelled or timed out.' : 'The engine ended without a result.';
      onEvent({ type: 'error', message: result.error });
      return result;
    }
    usage.inputTokens = resultSeen.usage?.input_tokens ?? 0;
    usage.outputTokens = resultSeen.usage?.output_tokens ?? 0;
    usage.cacheReadTokens = resultSeen.usage?.cache_read_input_tokens ?? 0;
    usage.cacheCreationTokens = resultSeen.usage?.cache_creation_input_tokens ?? 0;

    if (resultSeen.subtype === 'success') {
      if (!result.text && typeof resultSeen.result === 'string' && resultSeen.result.trim()) {
        result.text = resultSeen.result;
        transcript.push(resultSeen.result);
        onEvent({ type: 'text_delta', content: resultSeen.result });
      }
      result.ok = true;
    } else if (resultSeen.subtype === 'error_max_turns' && result.text) {
      result.ok = true;
      result.warning = `The run hit its ${config.maxTurns ?? DEFAULT_MAX_TURNS}-turn cap; the last answer was kept.`;
      console.warn(`[sdk-agentic] ${result.warning}`);
    } else {
      const detail = resultSeen.errors?.length ? ` — ${resultSeen.errors.join('; ')}` : '';
      result.error = `SDK engine run failed (${resultSeen.subtype})${detail}`;
      onEvent({ type: 'error', message: result.error });
    }
    console.log(`[sdk-agentic] run ${result.ok ? 'complete' : 'failed'} — ${result.turns} turn(s), ${toolCalls.length} tool call(s), ${usage.inputTokens + usage.cacheReadTokens + usage.cacheCreationTokens} in / ${usage.outputTokens} out`);
    return result;
  } catch (err) {
    finishTurn();
    const message = err instanceof Error ? err.message : 'SDK engine failed to start';
    console.error(`[sdk-agentic] error: ${message}`);
    onEvent({ type: 'error', message });
    return { ...empty(), transcript, toolCalls, turns, error: message };
  } finally {
    clearTimeout(timeout);
    releaseSdkSlot();
  }
}
