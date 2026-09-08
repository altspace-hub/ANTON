/**
 * sdk-agentic-runner.test.ts — an engine run that can use ANTON's tools.
 *
 * Wave 3 (2026-09-08). The subscription engine ran as a text engine: one
 * turn, no tools. The runner registers ANTON tools with the SDK's in-process
 * MCP server, permits exactly those tools under 'dontAsk', reports every
 * call as it happens, and returns the FINAL turn as the deliverable.
 *
 * The SDK is faked at the module boundary: the fake `tool` captures the
 * handler, the fake `query` "is the model" — it calls the captured handler
 * the way the engine would and then streams the turns.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setSdkAgentImplForTests, activeSdkRunsForTests, tryAcquireSdkSlot, releaseSdkSlot, type AgentSdkModule } from '../../server/services/claude-sdk-client.js';
import { resetSdkEngineStoreForTests } from '../../server/services/sdk-engine-store.js';

/** With no persisted toggle loaded, the engine store falls back to the env flag. */
function setSdkEngineEnabledForTests(enabled: boolean): void {
  resetSdkEngineStoreForTests();
  process.env.SDK_ENGINE_ENABLED = enabled ? 'true' : 'false';
}
import { runAgentic, mcpToolName, type AgenticEvent } from '../../server/services/sdk-agentic-runner.js';

type Captured = { name: string; description: string; schema: Record<string, unknown>; handler: (args: Record<string, unknown>, extra: unknown) => Promise<unknown> };
type Query = AgentSdkModule['query'];

function fakeSdk(model: (tools: Captured[], params: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<{ type: string }>) {
  const tools: Captured[] = [];
  const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
  const servers: Array<{ name: string; tools: unknown[] }> = [];
  const impl: AgentSdkModule = {
    tool: (name, description, schema, handler) => { const t = { name, description, schema, handler }; tools.push(t); return t; },
    createSdkMcpServer: (options) => { servers.push({ name: options.name, tools: options.tools }); return { name: options.name, instance: 'fake' }; },
    query: ((params) => { calls.push(params); return model(tools, params); }) as Query,
  };
  setSdkAgentImplForTests(impl);
  return { tools, calls, servers };
}

const textDelta = (text: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });
const turnStart = () => ({ type: 'stream_event', event: { type: 'message_start' } });
const success = (over: Record<string, unknown> = {}) => ({
  type: 'result', subtype: 'success', result: 'ignored when text streamed', num_turns: 2,
  usage: { input_tokens: 50, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 1 }, ...over,
});

const SEARCH_TOOL = {
  name: 'search_knowledge',
  description: 'Search the regulatory knowledge packs.',
  schema: { query: 'zod-string-placeholder' },
  handler: async (args: Record<string, unknown>) => `Found for "${String(args.query)}": AMLR Article 16 requires a business-wide risk assessment.`,
};

const savedEnv = process.env.SDK_ENGINE_ENABLED;
beforeEach(() => { setSdkEngineEnabledForTests(true); });
afterEach(() => {
  setSdkAgentImplForTests(null);
  resetSdkEngineStoreForTests();
  if (savedEnv === undefined) delete process.env.SDK_ENGINE_ENABLED; else process.env.SDK_ENGINE_ENABLED = savedEnv;
});

describe('runAgentic', () => {
  it('registers the tools with the in-process server, permits exactly them under dontAsk, and returns the final turn', async () => {
    const { calls, servers } = fakeSdk((tools) => (async function* () {
      yield turnStart();
      yield textDelta('Let me check the pack.');
      // The "model" calls the tool the way the engine would.
      const search = tools.find((t) => t.name === 'search_knowledge')!;
      await search.handler({ query: 'AMLR Article 16' }, {});
      yield turnStart();
      yield textDelta('Article 16 requires a business-wide risk assessment.');
      yield success();
    })());

    const events: AgenticEvent[] = [];
    const result = await runAgentic({
      model: 'sdk:claude-opus-5', thinking: 'think', system: 'sys', prompt: 'What does Article 16 require?',
      tools: [SEARCH_TOOL], maxTurns: 6,
    }, (e) => events.push(e));

    // Wiring
    expect(servers).toEqual([{ name: 'anton', tools: expect.any(Array) }]);
    const options = calls[0].options;
    expect(options.permissionMode).toBe('dontAsk');
    expect(options.tools).toEqual([]);
    expect(options.allowedTools).toEqual([mcpToolName('search_knowledge')]);
    expect(options.maxTurns).toBe(6);
    expect(options.model).toBe('claude-opus-5');
    expect((options.mcpServers as Record<string, unknown>).anton).toBeDefined();
    expect((options.env as Record<string, unknown>).ANTHROPIC_API_KEY).toBeUndefined();

    // The work was reported as it happened.
    expect(events.map((e) => e.type)).toEqual(['turn_start', 'text_delta', 'tool_call', 'tool_result', 'turn_start', 'text_delta']);
    const call = events.find((e) => e.type === 'tool_call') as Extract<AgenticEvent, { type: 'tool_call' }>;
    expect(call.name).toBe('search_knowledge');
    expect(call.input).toEqual({ query: 'AMLR Article 16' });

    // The result: final turn as the deliverable, every turn in the transcript, calls recorded.
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Article 16 requires a business-wide risk assessment.');
    expect(result.transcript).toEqual(['Let me check the pack.', 'Article 16 requires a business-wide risk assessment.']);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].output).toMatch(/business-wide risk assessment/);
    expect(result.toolCalls[0].isError).toBe(false);
    expect(result.turns).toBe(2);
    expect(result.usage.inputTokens).toBe(50);
    expect(activeSdkRunsForTests()).toBe(0);
  });

  it('reports a tool that throws as an error result and lets the run continue', async () => {
    const { tools: captured } = fakeSdk((tools) => (async function* () {
      const t = tools[0];
      const out = await t.handler({ query: 'x' }, {}) as { isError?: boolean; content: Array<{ text: string }> };
      yield turnStart();
      yield textDelta(out.isError ? 'The search failed; answering from memory.' : 'unexpected');
      yield success({ num_turns: 1 });
    })());
    const failing = { ...SEARCH_TOOL, handler: async () => { throw new Error('pack index offline'); } };
    const events: AgenticEvent[] = [];
    const result = await runAgentic({ model: 'sdk:claude-opus-5', thinking: 'quick', system: 's', prompt: 'p', tools: [failing] }, (e) => events.push(e));

    expect(captured).toHaveLength(1);
    const res = events.find((e) => e.type === 'tool_result') as Extract<AgenticEvent, { type: 'tool_result' }>;
    expect(res.isError).toBe(true);
    expect(res.output).toBe('pack index offline');
    expect(result.ok).toBe(true);
    expect(result.text).toBe('The search failed; answering from memory.');
    expect(result.toolCalls[0].isError).toBe(true);
  });

  it('keeps the answer when the turn cap is hit, and fails cleanly otherwise', async () => {
    fakeSdk(() => (async function* () {
      yield turnStart();
      yield textDelta('Partial answer.');
      yield success({ subtype: 'error_max_turns', num_turns: 12 });
    })());
    const capped = await runAgentic({ model: 'sdk:claude-opus-5', thinking: 'quick', system: 's', prompt: 'p', tools: [] }, () => undefined);
    expect(capped.ok).toBe(true);
    expect(capped.text).toBe('Partial answer.');
    expect(capped.warning).toMatch(/turn cap/);

    fakeSdk(() => (async function* () {
      yield success({ subtype: 'error_during_execution', errors: ['boom'] });
    })());
    const events: AgenticEvent[] = [];
    const failed = await runAgentic({ model: 'sdk:claude-opus-5', thinking: 'quick', system: 's', prompt: 'p', tools: [] }, (e) => events.push(e));
    expect(failed.ok).toBe(false);
    expect(failed.error).toMatch(/error_during_execution\) — boom/);
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(activeSdkRunsForTests()).toBe(0);
  });

  it('yields its subscription slot while a tool runs, so a tool may call the engine itself', async () => {
    // Live finding (2026-09-08): consult_expert_module inside a step was refused
    // with "SDK engine busy" — the parent run held its slot while it sat
    // waiting for the tool. The parent's subprocess is idle during a tool call.
    let slotsDuringTool = -1;
    let nestedAcquire: string | null = 'not attempted';
    const nestedTool = {
      name: 'consult',
      description: 'calls the engine',
      schema: {},
      handler: async () => {
        slotsDuringTool = activeSdkRunsForTests();
        nestedAcquire = tryAcquireSdkSlot(false);
        if (nestedAcquire === null) releaseSdkSlot();
        return 'specialist answer';
      },
    };
    fakeSdk((tools) => (async function* () {
      yield turnStart();
      expect(activeSdkRunsForTests()).toBe(1);
      await tools[0].handler({}, {});
      expect(activeSdkRunsForTests()).toBe(1);
      yield turnStart();
      yield textDelta('done');
      yield success();
    })());
    const result = await runAgentic({ model: 'sdk:claude-opus-5', thinking: 'quick', system: 's', prompt: 'p', tools: [nestedTool] }, () => undefined);
    expect(result.ok).toBe(true);
    expect(slotsDuringTool).toBe(0);
    expect(nestedAcquire).toBeNull();
    expect(activeSdkRunsForTests()).toBe(0);
  });

  it('grants the web tools only when asked, and refuses when the engine is disabled', async () => {
    const { calls } = fakeSdk(() => (async function* () { yield turnStart(); yield textDelta('ok'); yield success(); })());
    await runAgentic({ model: 'sdk:claude-opus-5', thinking: 'quick', system: 's', prompt: 'p', tools: [SEARCH_TOOL], webSearch: true }, () => undefined);
    expect(calls[0].options.tools).toEqual(['WebSearch', 'WebFetch']);
    expect(calls[0].options.allowedTools).toEqual([mcpToolName('search_knowledge'), 'WebSearch', 'WebFetch']);

    setSdkEngineEnabledForTests(false);
    const events: AgenticEvent[] = [];
    const refused = await runAgentic({ model: 'sdk:claude-opus-5', thinking: 'quick', system: 's', prompt: 'p', tools: [] }, (e) => events.push(e));
    expect(refused.ok).toBe(false);
    expect(refused.error).toMatch(/disabled/);
    expect(calls).toHaveLength(1);
  });
});
