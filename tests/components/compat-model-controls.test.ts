// @vitest-environment jsdom
/**
 * compat-model-controls.test.ts — the Work page's controls, rendered, with a
 * compat: model (an OpenAI-compatible endpoint such as OpenRouter) selected.
 *
 * Public showcase (2026-09-25): on a compat model ANTON runs no web search,
 * no revelation chain (Investigate, Deep) and no multi-agent team — the server
 * sends one plain call and a notice. The page must not offer them, and must
 * say why. The model picker must list only an endpoint's allowed models, and
 * on a demo only the offered models.
 *
 * Rendered with react-dom in jsdom (no testing library in this repo); fetch is
 * a stub answering the few GETs the components make.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ThinkingControls from '../../src/components/shared/ThinkingControls';
import KnowledgeSourcePanel from '../../src/components/shared/KnowledgeSourcePanel';
import MultiAgentPanel from '../../src/components/shared/MultiAgentPanel';
import ModelSelector from '../../src/components/shared/ModelSelector';
import LocalModelsSettingsPanel from '../../src/components/settings/LocalModelsSettingsPanel';
import { useConfigStore } from '../../src/stores/useConfigStore';
import { resetPublicModelConfigCache } from '../../src/lib/compat-model-policy';
import type { KnowledgeSourceConfig, ModelId, ThinkingLevel } from '../../src/lib/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GLM = 'compat:openrouter:z-ai/glm-5.3-flash' as ModelId;
const CLAUDE = 'claude-opus-5-5' as ModelId;

let container: HTMLDivElement;
let root: Root;

async function render<P extends object>(component: ComponentType<P>, props: P): Promise<void> {
  await act(async () => {
    root.render(createElement(component as ComponentType<object>, props));
  });
  // Let fetch promises and the effects they trigger settle.
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Answers each GET the components make; anything else is a 404. */
function stubFetch(routes: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const key = `${method} ${url}`;
    if (key in routes) return json(routes[key]);
    if (url in routes && method === 'GET') return json(routes[url]);
    return json({ error: 'not found' }, 404);
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const btn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  if (!btn) throw new Error(`no button with text "${text}"`);
  return btn;
}

const knowledge = (webSearchEnabled: boolean): KnowledgeSourceConfig =>
  ({
    modes: {
      claudeKnowledge: { enabled: true, webSearchEnabled, description: '' },
      onlineReference: { enabled: false, urls: [] },
      localFolder: { enabled: false, recursive: false, folderPaths: [] },
      combinedMode: { enabled: false, priority: 'local-first' },
    },
  }) as unknown as KnowledgeSourceConfig;

beforeEach(() => {
  resetPublicModelConfigCache();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

// ── Thinking level ───────────────────────────────────────────────────────

describe('ThinkingControls on a compat model', () => {
  it('disables Investigate and Deep, and says why', async () => {
    await render(ThinkingControls, { value: 'think' as ThinkingLevel, onChange: () => {}, model: GLM });
    expect(buttonByText('Investigate').disabled).toBe(true);
    expect(buttonByText('Deep').disabled).toBe(true);
    expect(buttonByText('Think Hard').disabled).toBe(false);
    expect(buttonByText('Plan First').disabled).toBe(false);
    expect(container.textContent).toContain('run on Claude models only');
    // The generic "levels have no effect" note is not true on a compat endpoint.
    expect(container.textContent).not.toContain("doesn't use thinking levels");
  });

  it('moves a chain level it cannot run to Think Hard — through onAutoAdjust when given', async () => {
    const onChange = vi.fn();
    const onAutoAdjust = vi.fn();
    await render(ThinkingControls, { value: 'deep_investigate' as ThinkingLevel, onChange, onAutoAdjust, model: GLM });
    expect(onAutoAdjust).toHaveBeenCalledWith('think_hard');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('falls back to onChange for the move when onAutoAdjust is not given', async () => {
    const onChange = vi.fn();
    await render(ThinkingControls, { value: 'investigate' as ThinkingLevel, onChange, model: GLM });
    expect(onChange).toHaveBeenCalledWith('think_hard');
  });

  it('negative control: on Claude every level is enabled and nothing is moved', async () => {
    const onChange = vi.fn();
    await render(ThinkingControls, { value: 'deep_investigate' as ThinkingLevel, onChange, model: CLAUDE });
    expect(buttonByText('Investigate').disabled).toBe(false);
    expect(buttonByText('Deep').disabled).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('run on Claude models only');
  });
});

// ── Web search ───────────────────────────────────────────────────────────

describe('KnowledgeSourcePanel web search on a compat model', () => {
  function webBox(): HTMLInputElement {
    const label = [...container.querySelectorAll('label')].find((l) => l.textContent?.includes('Enable web search'));
    const box = label?.querySelector('input[type="checkbox"]');
    if (!box) throw new Error('web search checkbox not found');
    return box as HTMLInputElement;
  }

  it('shows the box off and locked, with the reason, and keeps the saved choice', async () => {
    stubFetch({});
    const onChange = vi.fn();
    await render(KnowledgeSourcePanel, { config: knowledge(true), onChange, model: GLM });
    expect(webBox().disabled).toBe(true);
    expect(webBox().checked).toBe(false);
    expect(container.textContent).toContain('Web search runs on Claude models only');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reads the session model when the page passes none (the Work page)', async () => {
    stubFetch({});
    useConfigStore.setState({ model: GLM });
    await render(KnowledgeSourcePanel, { config: knowledge(true), onChange: () => {} });
    expect(webBox().disabled).toBe(true);
    await act(async () => useConfigStore.setState({ model: CLAUDE }));
  });

  it('negative control: on Claude the box works as before', async () => {
    stubFetch({});
    await render(KnowledgeSourcePanel, { config: knowledge(true), onChange: () => {}, model: CLAUDE });
    expect(webBox().disabled).toBe(false);
    expect(webBox().checked).toBe(true);
    expect(container.textContent).not.toContain('Web search runs on Claude models only');
  });
});

// ── Multi-agent ──────────────────────────────────────────────────────────

describe('MultiAgentPanel on a compat model', () => {
  it('shows the switch off and locked, with the reason, and hides the team settings', async () => {
    useConfigStore.setState({ model: GLM, multiAgentEnabled: true });
    await render(MultiAgentPanel, {});
    const toggle = container.querySelector('button[role="switch"]') as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(container.textContent).toContain('off for z-ai/glm-5.3-flash');
    expect(container.textContent).not.toContain('Collaboration Style');
    // The saved choice is kept for when a Claude model is picked again.
    expect(useConfigStore.getState().multiAgentEnabled).toBe(true);
  });

  it('negative control: on Claude the switch is live and the team settings show', async () => {
    useConfigStore.setState({ model: CLAUDE, multiAgentEnabled: true });
    await render(MultiAgentPanel, {});
    const toggle = container.querySelector('button[role="switch"]') as HTMLButtonElement;
    expect(toggle.disabled).toBe(false);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('Collaboration Style');
    await act(async () => useConfigStore.setState({ multiAgentEnabled: false }));
  });
});

// ── Model picker ─────────────────────────────────────────────────────────

const OPENROUTER_ENDPOINT = {
  slug: 'openrouter',
  displayName: 'OpenRouter',
  defaultModel: 'z-ai/glm-5.3-flash',
  availableModels: ['z-ai/glm-5.3-flash', 'anthropic/claude-opus-5.5', 'openai/gpt-6-astra'],
  enabled: true,
};

function pickerRoutes(over: { config?: unknown; endpoints?: unknown[] } = {}): Record<string, unknown> {
  return {
    '/api/config': over.config ?? { deploymentMode: 'team', demoMode: false },
    '/api/settings/model-endpoints': { endpoints: over.endpoints ?? [OPENROUTER_ENDPOINT] },
    '/api/ollama/models': { models: ['qwen3.5:9b'] },
    '/api/settings/custom-models': { slot1: null, slot2: null },
    '/api/azure-openai/deployments': { deployments: [] },
    '/api/settings/sdk-engine': { enabled: false, models: [] },
    '/api/settings/codex-engine': { enabled: false, models: [] },
  };
}

async function openPicker(): Promise<void> {
  const trigger = container.querySelector('button') as HTMLButtonElement;
  await act(async () => {
    trigger.click();
  });
}

describe('ModelSelector: an endpoint\'s allowed models', () => {
  it('lists only the allowed models of an endpoint that has a list', async () => {
    stubFetch(pickerRoutes({ endpoints: [{ ...OPENROUTER_ENDPOINT, allowedModels: ['z-ai/glm-5.3-flash'] }] }));
    await render(ModelSelector, { value: GLM, onChange: () => {} });
    await openPicker();
    const text = container.textContent ?? '';
    expect(text).toContain('Cost-effective (API)');
    expect(text).toContain('z-ai/glm-5.3-flash');
    expect(text).not.toContain('anthropic/claude-opus-5.5');
    expect(text).not.toContain('openai/gpt-6-astra');
  });

  it('warns when the selected model is outside the endpoint\'s allowed models', async () => {
    stubFetch(pickerRoutes({ endpoints: [{ ...OPENROUTER_ENDPOINT, allowedModels: ['z-ai/glm-5.3-flash'] }] }));
    await render(ModelSelector, { value: 'compat:openrouter:anthropic/claude-opus-5.5' as ModelId, onChange: () => {} });
    expect(container.textContent).toContain("is not on OpenRouter's allowed models");
  });

  it('negative control: with no allowed-models list every discovered model is listed, and no warning', async () => {
    stubFetch(pickerRoutes());
    await render(ModelSelector, { value: 'compat:openrouter:anthropic/claude-opus-5.5' as ModelId, onChange: () => {} });
    expect(container.textContent).not.toContain('allowed models');
    await openPicker();
    expect(container.textContent).toContain('anthropic/claude-opus-5.5');
    expect(container.textContent).toContain('openai/gpt-6-astra');
  });
});

describe('ModelSelector on a public demo', () => {
  const demoConfig = {
    deploymentMode: 'team',
    demoMode: true,
    offeredModels: [GLM, 'compat:openrouter:inclusionai/ling-3.0-flash-vl'],
    enabledPillars: ['work'],
    signupOpen: true,
    retentionDays: 30,
    privacyPath: '/privacy',
  };

  it('lists the offered models and nothing else', async () => {
    stubFetch(pickerRoutes({ config: demoConfig }));
    await render(ModelSelector, { value: GLM, onChange: () => {} });
    await openPicker();
    const text = container.textContent ?? '';
    expect(text).toContain('Models on this demo');
    expect(text).toContain('z-ai/glm-5.3-flash');
    expect(text).toContain('inclusionai/ling-3.0-flash-vl');
    // No built-in Claude / GPT section, no other OpenRouter model, no Ollama.
    expect(text).not.toContain('Claude Opus');
    expect(text).not.toContain('anthropic/claude-opus-5.5');
    expect(text).not.toContain('Local (Ollama)');
  });

  it('moves the built-in default a new browser starts with to the first offered model', async () => {
    stubFetch(pickerRoutes({ config: demoConfig }));
    const onChange = vi.fn();
    await render(ModelSelector, { value: CLAUDE, onChange });
    expect(onChange).toHaveBeenCalledWith(GLM);
  });

  it('negative control: outside a demo the full picker shows and the selection is left alone', async () => {
    stubFetch(pickerRoutes());
    const onChange = vi.fn();
    await render(ModelSelector, { value: CLAUDE, onChange });
    expect(onChange).not.toHaveBeenCalled();
    await openPicker();
    expect(container.textContent).toContain('Claude Opus');
    expect(container.textContent).not.toContain('Models on this demo');
  });
});

// ── Settings: the endpoint form ──────────────────────────────────────────

describe('LocalModelsSettingsPanel endpoint form', () => {
  function textareaByLabel(label: string): HTMLTextAreaElement {
    const el = container.querySelector(`textarea[aria-label="${label}"]`);
    if (!el) throw new Error(`no textarea "${label}"`);
    return el as HTMLTextAreaElement;
  }

  const settingsRoutes = (endpoints: unknown[] = []) => ({
    '/api/ollama/status': { available: false, baseUrl: '' },
    '/api/settings/model-endpoints': { endpoints },
    '/api/settings/sdk-engine': { enabled: false, models: [] },
    '/api/settings/codex-engine': { enabled: false, models: [] },
    '/api/csrf-token': { csrfToken: 't' },
    'POST /api/settings/model-endpoints': { endpoint: {} },
  });

  it('the OpenRouter preset pre-fills the EU zero-retention body, the attribution headers and the allow-list, and saves them', async () => {
    const fetchSpy = stubFetch(settingsRoutes());
    await render(LocalModelsSettingsPanel, {});
    await act(async () => buttonByText('OpenRouter').click());

    const body = JSON.parse(textareaByLabel('Extra request body (JSON)').value);
    expect(body).toEqual({
      provider: { only: ['inceptron', 'nextbit'], allow_fallbacks: true, zdr: true, data_collection: 'deny' },
    });
    const headers = JSON.parse(textareaByLabel('Extra headers (JSON)').value);
    expect(headers).toEqual({ 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'ANTON by openEXPERT' });
    expect(container.textContent).toContain('z-ai/glm-5.3-flash');

    await act(async () => buttonByText('Save endpoint').click());
    for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
    const sent = fetchSpy.mock.calls
      .filter(([url, init]) => url === '/api/settings/model-endpoints' && (init as RequestInit | undefined)?.method === 'POST')
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      slug: 'openrouter',
      defaultModel: 'z-ai/glm-5.3-flash',
      allowedModels: ['z-ai/glm-5.3-flash'],
      extraBody: body,
      extraHeaders: headers,
      maxOutputTokens: null,
      // The pinned providers' price, not /models' promotional one: it prices the
      // worst-case reservation made before each call.
      inputPricePerMillion: 0.165,
      outputPricePerMillion: 0.55,
    });
  });

  it('a broken extra body is shown as an error and cannot be saved', async () => {
    stubFetch(settingsRoutes());
    await render(LocalModelsSettingsPanel, {});
    await act(async () => buttonByText('Add endpoint').click());
    const area = textareaByLabel('Extra request body (JSON)');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(area, '{"model": "anthropic/claude-opus-5.5"}');
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.textContent).toContain('cannot set "model"');
    expect(buttonByText('Save endpoint').disabled).toBe(true);
  });

  it('editing an endpoint shows its allowed models, output ceiling and extra body', async () => {
    stubFetch(
      settingsRoutes([
        {
          id: 1,
          slug: 'openrouter',
          displayName: 'OpenRouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          hasApiKey: true,
          defaultModel: 'z-ai/glm-5.3-flash',
          availableModels: ['z-ai/glm-5.3-flash', 'openai/gpt-6-astra'],
          contextWindow: 131072,
          extraHeaders: {},
          extraBody: { provider: { zdr: true } },
          allowedModels: ['z-ai/glm-5.3-flash'],
          maxOutputTokens: 16000,
          inputPricePerMillion: 0.15,
          outputPricePerMillion: 0.5,
          modelMeta: {
            'z-ai/glm-5.3-flash': { contextLength: 1_310_720, reasoning: { mandatory: true, supportedEfforts: ['low', 'high', 'max'] } },
          },
          enabled: true,
          notes: null,
          updatedAt: '2026-09-25',
        },
      ]),
    );
    await render(LocalModelsSettingsPanel, {});
    const text = container.textContent ?? '';
    expect(text).toContain('Only these models may run');
    expect(text).toContain('always reasons (low/high/max)');
    expect(text).toMatch(/Answers capped at 16.000 tokens/); // locale-formatted
    expect(text).toContain('Priced at $0.15 in / $0.5 out per 1M tokens');

    const edit = container.querySelector('button[title="Edit"]') as HTMLButtonElement;
    await act(async () => edit.click());
    expect(JSON.parse(textareaByLabel('Extra request body (JSON)').value)).toEqual({ provider: { zdr: true } });
    expect((container.querySelector('input[aria-label="Max output tokens"]') as HTMLInputElement).value).toBe('16000');
    expect((container.querySelector('input[aria-label="Output price (USD per 1M tokens)"]') as HTMLInputElement).value).toBe('0.5');
    // The discovered list offers both models; only the allowed one is ticked.
    const boxes = [...container.querySelectorAll('label')]
      .filter((l) => l.querySelector('input[type="checkbox"]') && l.textContent?.includes('/'))
      .map((l) => ({ model: l.querySelector('code')?.textContent, checked: (l.querySelector('input') as HTMLInputElement).checked }));
    expect(boxes).toEqual([
      { model: 'z-ai/glm-5.3-flash', checked: true },
      { model: 'openai/gpt-6-astra', checked: false },
    ]);
  });
});
