// @vitest-environment jsdom
/**
 * compat-run-request.test.ts — what a Work-page run sends for a compat: model.
 *
 * Public showcase, live test 2026-09-25: on compat:openrouter:z-ai/glm-5.3-flash
 * the page showed web search off and locked (KnowledgeSourcePanel) and
 * multi-agent locked (MultiAgentPanel), but the saved flags were still sent.
 * The server then put "WEB SEARCH ENABLED — use the web_search tool" into the
 * prompt of a model that has no such tool, and answered with "Web search is
 * not available … nothing was searched" — a notice the visitor never asked
 * for. The request now carries both flags off for a compat model; the saved
 * settings are untouched, so they come back when a Claude model is picked.
 *
 * The run goes through the real useClaude hook and streamMessage; fetch is a
 * stub that records the POST /api/claude/message body.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useClaude } from '../../src/hooks/useClaude';
import { useConfigStore } from '../../src/stores/useConfigStore';
import { useSessionMetaStore } from '../../src/stores/useSessionStore';
import { useStreamStore } from '../../src/stores/useStreamStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { fetchPromptPreview } from '../../src/lib/api';
import type { KnowledgeSourceConfig, ModelId } from '../../src/lib/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GLM = 'compat:openrouter:z-ai/glm-5.3-flash' as ModelId;
const CLAUDE = 'claude-opus-5-5' as ModelId;

const knowledge = (webSearchEnabled: boolean): KnowledgeSourceConfig => ({
  modes: {
    claudeKnowledge: { enabled: true, webSearchEnabled, description: 'AMLR' },
    onlineReference: { enabled: true, urls: ['https://example.org/amlr'], fetchDepth: 'full' },
    localFolder: { enabled: false, folderPaths: [], recursive: false },
    combinedMode: { enabled: false, priority: 'merged' },
  },
});

let container: HTMLDivElement;
let root: Root;
let sent: Array<{ url: string; body: Record<string, unknown> }> = [];
let run: ((text: string) => Promise<boolean>) | null = null;

function Probe() {
  const { runMessage } = useClaude();
  run = runMessage;
  return null;
}

/** One SSE answer: a line of text, then the end. */
function sseAnswer(): Response {
  const body = 'data: {"type":"text_delta","content":"An answer."}\n\ndata: {"type":"stream_end"}\n\ndata: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

beforeEach(() => {
  sent = [];
  run = null;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === '/api/csrf-token') return new Response(JSON.stringify({ csrfToken: 't' }), { status: 200 });
    if (typeof init?.body === 'string') sent.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    if (url === '/api/claude/message') return sseAnswer();
    if (url === '/api/claude/preview-prompt') {
      return new Response(JSON.stringify({ prompt: '', estimatedTokens: 0, knowledgeTokenEstimate: 0, sourceManifest: [], model: GLM }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  });
  // Solo, no session and no module: the run posts straight to /claude/message.
  useAuthStore.setState({ user: null, token: null, isTeamMode: false, isLoading: false });
  useSessionMetaStore.setState({ sessionId: null, moduleId: null, messages: [] });
  useStreamStore.setState({ isStreaming: false, abortController: null });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  useConfigStore.setState({ model: CLAUDE, multiAgentEnabled: false, knowledgeSources: knowledge(false) });
  useSessionMetaStore.setState({ sessionId: null, moduleId: null, messages: [] });
});

async function runWith(model: ModelId): Promise<Record<string, unknown>> {
  useConfigStore.setState({ model, multiAgentEnabled: true, knowledgeSources: knowledge(true) });
  await act(async () => { root.render(createElement(Probe)); });
  await act(async () => { await run!('What does Article 10 AMLR require?'); });
  const call = sent.find((c) => c.url === '/api/claude/message');
  if (!call) throw new Error('no /api/claude/message request was sent');
  return call.body;
}

type SentKnowledge = { modes: { claudeKnowledge: { webSearchEnabled: boolean; description: string }; onlineReference: { urls: string[] } } };

describe('a Work-page run on a compat model', () => {
  it('sends web search and multi-agent off, and leaves the saved settings alone', async () => {
    const body = await runWith(GLM);
    const ks = body.knowledgeSources as SentKnowledge;
    expect(body.model).toBe(GLM);
    expect(ks.modes.claudeKnowledge.webSearchEnabled).toBe(false);
    expect(body.multiAgentEnabled).toBe(false);
    // Everything else goes as it was: the focus and the online references.
    expect(ks.modes.claudeKnowledge.description).toBe('AMLR');
    expect(ks.modes.onlineReference.urls).toEqual(['https://example.org/amlr']);
    // The saved choice is kept for when a Claude model is picked again.
    expect(useConfigStore.getState().knowledgeSources.modes.claudeKnowledge.webSearchEnabled).toBe(true);
    expect(useConfigStore.getState().multiAgentEnabled).toBe(true);
  });

  it('negative control: on Claude both flags go as saved', async () => {
    const body = await runWith(CLAUDE);
    expect((body.knowledgeSources as SentKnowledge).modes.claudeKnowledge.webSearchEnabled).toBe(true);
    expect(body.multiAgentEnabled).toBe(true);
  });
});

describe('the prompt preview on a compat model', () => {
  it('asks for the prompt the run will send: no web search, no multi-agent', async () => {
    await fetchPromptPreview({ model: GLM, multiAgentEnabled: true, knowledgeSources: knowledge(true) });
    const body = sent.find((c) => c.url === '/api/claude/preview-prompt')!.body;
    expect((body.knowledgeSources as SentKnowledge).modes.claudeKnowledge.webSearchEnabled).toBe(false);
    expect(body.multiAgentEnabled).toBe(false);
  });

  it('negative control: on Claude the preview carries web search', async () => {
    await fetchPromptPreview({ model: CLAUDE, knowledgeSources: knowledge(true) });
    const body = sent.find((c) => c.url === '/api/claude/preview-prompt')!.body;
    expect((body.knowledgeSources as SentKnowledge).modes.claudeKnowledge.webSearchEnabled).toBe(true);
  });
});
