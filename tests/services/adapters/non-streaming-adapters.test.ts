/**
 * non-streaming-adapters.test.ts — M3 (multi-provider parity): the new
 * non-streaming helpers that let provider-router.callChat (agents + specialty
 * routes) run on local Ollama/Qwen and on OpenAI-compatible (OpenRouter/Together)
 * endpoints, which previously threw "Non-streaming not implemented".
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { callOllama } from '../../../server/services/adapters/ollamaAdapter.js';
import { callOpenAICompatible } from '../../../server/services/adapters/openaiCompatibleAdapter.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function okJson(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe('callOllama (non-streaming)', () => {
  it('posts stream:false to /api/chat and returns parsed text + token counts', async () => {
    const fetchMock = okJson({ message: { content: 'hi from qwen' }, prompt_eval_count: 12, eval_count: 7 });
    vi.stubGlobal('fetch', fetchMock);

    const out = await callOllama({ model: 'qwen2.5', system: 'sys', messages: [{ role: 'user', content: 'q' }], maxTokens: 100 });

    expect(out.text).toBe('hi from qwen');
    expect(out.inputTokens).toBe(12);
    expect(out.outputTokens).toBe(7);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/api/chat');
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(false);
    expect(body.model).toBe('qwen2.5');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('throws a clear error on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }));
    await expect(callOllama({ model: 'x', system: '', messages: [] })).rejects.toThrow(/Ollama error: 500/);
  });
});

describe('callOpenAICompatible (non-streaming)', () => {
  it('posts stream:false with bearer auth + extra headers and returns parsed text', async () => {
    const fetchMock = okJson({ choices: [{ message: { content: 'compat says hi' } }], usage: { prompt_tokens: 5, completion_tokens: 9 } });
    vi.stubGlobal('fetch', fetchMock);

    const out = await callOpenAICompatible({
      baseUrl: 'https://api.together.xyz/v1',
      apiKey: 'k',
      extraHeaders: { 'X-Title': 'ANTON' },
      model: 'qwen/qwen-2.5-72b-instruct',
      system: 'sys',
      messages: [{ role: 'user', content: 'q' }],
    });

    expect(out.text).toBe('compat says hi');
    expect(out.inputTokens).toBe(5);
    expect(out.outputTokens).toBe(9);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe('https://api.together.xyz/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer k');
    expect(headers['X-Title']).toBe('ANTON');
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(false);
    expect(body.model).toBe('qwen/qwen-2.5-72b-instruct');
  });

  it('omits the Authorization header when no apiKey is given (open endpoint)', async () => {
    const fetchMock = okJson({ choices: [{ message: { content: 'x' } }] });
    vi.stubGlobal('fetch', fetchMock);
    await callOpenAICompatible({ baseUrl: 'http://localhost:1234/v1', model: 'local', system: '', messages: [] });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });
});
