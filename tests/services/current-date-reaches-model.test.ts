/**
 * current-date-reaches-model.test.ts — the date is in what the MODEL receives, on
 * every path, not merely in a string some function returned.
 *
 * 2026-09-22. The composer fix (Wave 9A) dated Work module runs only. Everything else
 * built its own system prompt and sent no date: the gap assessor, specialised agents,
 * Pathfinder, missions and School mode through provider-router.ts; the Civic, Grow and
 * Procure pillars, the companion app, the intent router and smart actions through a
 * SECOND router, unified-llm-client.ts; and the agentic runner, which calls the Agent
 * SDK directly because it needs MCP tools.
 *
 * Each case fakes the model at the production seam and inspects what arrived:
 *   - setSdkQueryImplForTests — the subscription engine's query() options
 *   - setSdkAgentImplForTests — the agentic runner's query() options
 *   - @anthropic-ai/sdk — the API engine's request params
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Response } from 'express';

const anthropicCalls = vi.hoisted(() => ({ params: [] as Array<Record<string, unknown>> }));

vi.mock('@anthropic-ai/sdk', () => {
  class FakeAnthropic {
    messages = {
      stream: (params: Record<string, unknown>) => {
        anthropicCalls.params.push(params);
        return {
          finalMessage: async () => ({
            content: [{ type: 'text', text: 'api text' }],
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
        };
      },
    };
  }
  return { default: FakeAnthropic };
});

import { streamChat, callChat } from '../../server/services/provider-router.js';
import { sendRequest, streamToResponse, streamToHandler } from '../../server/services/unified-llm-client.js';
import { runAgentic } from '../../server/services/sdk-agentic-runner.js';
import {
  setSdkQueryImplForTests,
  setSdkAgentImplForTests,
  type AgentSdkModule,
} from '../../server/services/claude-sdk-client.js';
import { resetSdkEngineStoreForTests } from '../../server/services/sdk-engine-store.js';
import { CURRENT_DATE_HEADING, currentDateBlock } from '../../server/lib/current-date.js';

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL', 'SDK_ENGINE_ENABLED'] as const;
let saved: Record<string, string | undefined>;

/** The local date the block should carry right now (the router uses the real clock). */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const count = (hay: string, needle: string): number => hay.split(needle).length - 1;

const success = { type: 'result', subtype: 'success', result: 'ok', usage: { input_tokens: 1, output_tokens: 1 } };
const textDelta = (text: string) => ({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });

/** Fake the subscription engine; return what each query() call received. */
function fakeEngine() {
  const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
  setSdkQueryImplForTests((params) => {
    calls.push(params as { prompt: string; options: Record<string, unknown> });
    return (async function* () {
      yield textDelta('ok') as { type: string };
      yield success as { type: string };
    })();
  });
  return calls;
}

function callerResponse(): Response {
  return {
    headersSent: true,
    write: () => true,
    end: () => undefined,
    writeHead: () => undefined,
    setHeader: () => undefined,
  } as unknown as Response;
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.SDK_ENGINE_ENABLED = 'true';
  anthropicCalls.params.length = 0;
  resetSdkEngineStoreForTests();
});

afterEach(() => {
  setSdkQueryImplForTests(null);
  setSdkAgentImplForTests(null);
  for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  resetSdkEngineStoreForTests();
});

describe('provider-router — gap assessor, agents, Pathfinder, missions, School mode', () => {
  it('callChat on the subscription engine: the model receives today\'s date', async () => {
    const calls = fakeEngine();
    await callChat({ model: 'sdk:claude-opus-5', system: 'You assess AML controls.', messages: [{ role: 'user', content: 'q' }] });
    const sent = String(calls[0].options.systemPrompt);
    expect(sent).toContain(CURRENT_DATE_HEADING);
    expect(sent).toContain(`(${todayIso()})`);
    // appended, so the caller's prompt still leads — the prefix the engine caches
    expect(sent.startsWith('You assess AML controls.')).toBe(true);
  });

  it('streamChat on the subscription engine: the model receives today\'s date', async () => {
    const calls = fakeEngine();
    await streamChat({ model: 'sdk:claude-opus-5', system: 'You are Pathfinder.', messages: [{ role: 'user', content: 'q' }] }, callerResponse());
    expect(String(calls[0].options.systemPrompt)).toContain(`(${todayIso()})`);
  });

  it('callChat on the API engine: the request carries today\'s date', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    await callChat({ model: 'claude-opus-4-8', system: 'You are an agent.', messages: [{ role: 'user', content: 'q' }] });
    expect(anthropicCalls.params).toHaveLength(1);
    expect(JSON.stringify(anthropicCalls.params[0].system)).toContain(todayIso());
  });

  it('a prompt that already carries the date (a composed Work run) reaches the model with it ONCE', async () => {
    const calls = fakeEngine();
    const composed = `## FOUNDATION\n\n---\n\n${currentDateBlock(new Date())}\n\n---\n\n## PROFILE`;
    await callChat({ model: 'sdk:claude-opus-5', system: composed, messages: [{ role: 'user', content: 'q' }] });
    const sent = String(calls[0].options.systemPrompt);
    expect(count(sent, CURRENT_DATE_HEADING)).toBe(1);
  });

  it('replay\'s opt-out sends the stored prompt byte-for-byte, with no date added', async () => {
    const calls = fakeEngine();
    const stored = 'A prompt stored on 2026-08-01, before the date layer existed.';
    await callChat({ model: 'sdk:claude-opus-5', system: stored, currentDate: false, messages: [{ role: 'user', content: 'q' }] });
    const sent = String(calls[0].options.systemPrompt);
    expect(sent).not.toContain(CURRENT_DATE_HEADING);
    expect(sent).toContain(stored);
  });
});

describe('unified-llm-client — Civic, Grow, Procure, the companion app, intent routing, smart actions', () => {
  it('sendRequest on the subscription engine: the model receives today\'s date', async () => {
    const calls = fakeEngine();
    await sendRequest({
      model: 'sdk:claude-opus-5', thinking: 'quick',
      system: 'You help with a procurement cycle.',
      messages: [{ role: 'user', content: 'q' }],
    });
    const sent = String(calls[0].options.systemPrompt);
    expect(sent).toContain(`(${todayIso()})`);
    expect(sent.startsWith('You help with a procurement cycle.')).toBe(true);
  });

  it('streamToResponse (the Civic, Grow and Procure pillars): the model receives today\'s date', async () => {
    const calls = fakeEngine();
    const sink = { headersSent: false, writeHead: () => undefined, write: () => true, end: () => undefined };
    await new Promise<void>((resolve) => {
      void streamToResponse({
        model: 'sdk:claude-opus-5', thinking: 'quick',
        system: 'You help run a civic engagement.',
        messages: [{ role: 'user', content: 'q' }],
      }, sink, () => resolve());
      // resolve even if the engine path does not call onComplete
      setTimeout(resolve, 2000);
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(String(calls[0].options.systemPrompt)).toContain(`(${todayIso()})`);
  });

  it('streamToHandler (the app gateway and Markets): the model receives today\'s date', async () => {
    const calls = fakeEngine();
    await new Promise<void>((resolve) => {
      void streamToHandler({
        model: 'sdk:claude-opus-5', thinking: 'quick',
        system: 'You answer from the companion app.',
        messages: [{ role: 'user', content: 'q' }],
      }, () => undefined, () => resolve());
      setTimeout(resolve, 2000);
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(String(calls[0].options.systemPrompt)).toContain(`(${todayIso()})`);
  });

  it('does not double the date when the caller already sent it', async () => {
    const calls = fakeEngine();
    await sendRequest({
      model: 'sdk:claude-opus-5', thinking: 'quick',
      system: `prefix\n\n${currentDateBlock(new Date())}`,
      messages: [{ role: 'user', content: 'q' }],
    });
    expect(count(String(calls[0].options.systemPrompt), CURRENT_DATE_HEADING)).toBe(1);
  });
});

describe('sdk-agentic-runner — gap batches, mission task steps, engagement steps', () => {
  it('the model receives today\'s date, although this path bypasses both routers', async () => {
    const calls: Array<{ prompt: string; options: Record<string, unknown> }> = [];
    const impl: AgentSdkModule = {
      tool: (name, description, schema, handler) => ({ name, description, schema, handler }),
      createSdkMcpServer: (options) => ({ name: options.name, instance: 'fake' }),
      query: ((params: { prompt: string; options: Record<string, unknown> }) => {
        calls.push(params);
        return (async function* () {
          yield textDelta('done') as { type: string };
          yield success as { type: string };
        })();
      }) as AgentSdkModule['query'],
    };
    setSdkAgentImplForTests(impl);
    await runAgentic({ model: 'sdk:claude-opus-5', thinking: 'quick', system: 'You run a gap batch.', prompt: 'p', tools: [] }, () => undefined);
    const sent = String(calls[0].options.systemPrompt);
    expect(sent).toContain(CURRENT_DATE_HEADING);
    expect(sent).toContain(`(${todayIso()})`);
    expect(sent.startsWith('You run a gap batch.')).toBe(true);
  });
});
