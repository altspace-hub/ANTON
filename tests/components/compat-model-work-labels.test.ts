// @vitest-environment jsdom
/**
 * compat-model-work-labels.test.ts — what the Work page says and offers when
 * the selected model is a compat: model (an OpenAI-compatible endpoint such as
 * OpenRouter), from the live browser test of 2026-09-25.
 *
 *   - "Go deeper → Switch to Investigate" under an answer did nothing on a
 *     compat model: the thinking control moves Investigate straight back to
 *     Think Hard. It is not offered there; on Claude it is unchanged.
 *   - Labels named Claude although another model answers ("What should Claude
 *     produce?", "Scored by Claude Haiku", "available to Claude", ...). They
 *     are model-neutral now, on every model: the neutral words read as well.
 *     The Trust Score is made by the server's utility model, not always
 *     Haiku, so it is "Scored by the quality check".
 *   - The gap-analysis guide sent a compat reader to web search and to
 *     Investigate; it names only what the selected model runs.
 *
 * Every block has a negative control on a Claude model. Rendered with
 * react-dom in jsdom; fetch is a stub that records every call.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import OutputToolbar from '../../src/components/shared/OutputToolbar';
import OutputFormatSelector from '../../src/components/shared/OutputFormatSelector';
import ModulePage from '../../src/pages/ModulePage';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useConfigStore } from '../../src/stores/useConfigStore';
import { DEMO_OFF } from '../../src/lib/demo-config';
import { resetPublicModelConfigCache } from '../../src/lib/compat-model-policy';
import type { ModelId } from '../../src/lib/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GLM = 'compat:openrouter:z-ai/glm-5.3-flash' as ModelId;
const CLAUDE = 'claude-opus-5-5' as ModelId;

const SCORE = {
  id: 'q1', moduleId: 'risk-assessment', overall: 8, completeness: 8, accuracy: 8, structure: 8,
  actionability: 8, citations: 8, isRegression: false, scoredAt: '2026-09-25T10:00:00Z', reasoning: null,
};

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string }> = [];
/** Extra GET answers for one test, by exact URL. */
let answers: Record<string, unknown> = {};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
}

/** A new root, so the next render mounts afresh. */
async function fresh(): Promise<void> {
  await act(async () => root.unmount());
  root = createRoot(container);
  calls = [];
}

async function render(component: ComponentType<object>, props: object = {}): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(component, props)));
  });
  await settle();
}

async function renderModulePage(moduleId: string): Promise<void> {
  await act(async () => {
    root.render(
      createElement(MemoryRouter, { initialEntries: [`/module/${moduleId}`] },
        createElement(Routes, null, createElement(Route, { path: '/module/:moduleId', element: createElement(ModulePage) }))),
    );
  });
  await settle();
}

const text = () => container.textContent ?? '';

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
  ) as HTMLButtonElement | undefined;
}

async function click(el: HTMLElement | undefined): Promise<void> {
  if (!el) throw new Error('nothing to click');
  await act(async () => { el.click(); });
  await settle();
}

/**
 * Every place the rendered page names Claude: the element around each text
 * node that says "Claude", and every title, aria-label and placeholder.
 */
function claudeMentions(): string[] {
  const found: string[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent?.includes('Claude')) found.push((node.parentElement?.textContent ?? node.textContent).trim());
  }
  for (const el of container.querySelectorAll('[title], [aria-label], [placeholder]')) {
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      const value = el.getAttribute(attr);
      if (value?.includes('Claude')) found.push(`${attr}: ${value}`);
    }
  }
  return found;
}

/** The only Claude mentions a compat page keeps: why a Claude-only feature is off. */
const EXPLAINS_A_CLAUDE_ONLY_FEATURE = /runs? on Claude models only|runs several Claude instances side by side/;

beforeAll(async () => {
  // ModulePage reads react-i18next; with no resources t() returns the key or its default.
  await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: {} } }, interpolation: { escapeValue: false } });
});

beforeEach(() => {
  calls = [];
  answers = {};
  resetPublicModelConfigCache();
  localStorage.clear();
  sessionStorage.clear();
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
  // An ordinary team server (not a demo), an analyst signed in.
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useDemoStore.getState().applyConfig({ deploymentMode: 'team', demoMode: false });
  useAuthStore.setState({ user: { id: 'u-1', username: 'analyst', role: 'analyst' }, token: 't', isTeamMode: true, isLoading: false });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: (init?.method ?? 'GET').toUpperCase() });
    if (url === '/api/config') return json({ deploymentMode: 'team', demoMode: false });
    if (url in answers) return json(answers[url]);
    if (url.startsWith('/api/knowledge-packs')) return json({ packs: [{ id: 'p1', display_name: 'AMLR pack', version: '1', jurisdiction: 'EU', entity_count: 3, relationship_count: 2, status: 'active' }] });
    if (url === '/api/collections') return json([]);
    if (url === '/api/custom-modules') return json([]);
    return json({ error: 'not found' }, 404);
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  useAuthStore.setState({ user: null, token: null });
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useConfigStore.setState({ model: CLAUDE, plainTextMode: false });
});

// ── 1. Go deeper ─────────────────────────────────────────────────────────

describe('OutputToolbar: the Go-deeper offer under an answer', () => {
  const props = (model: ModelId, thinking: string, onUpgradeThinking = vi.fn()) => ({
    outputContent: 'An answer.', model, sessionId: 's1', isStreaming: false, streamingThinking: '',
    systemPrompt: '', creativity: 'balanced', thinking, selectedOutputFormats: [], onUpgradeThinking,
  });

  it('is not offered on a compat model when the next level is Investigate', async () => {
    for (const thinking of ['think_hard', 'quick', 'plan_first']) {
      await fresh();
      await render(OutputToolbar as ComponentType<object>, props(GLM, thinking));
      expect(button('Switch to Investigate'), thinking).toBeUndefined();
      expect(text(), thinking).not.toContain('for deeper analysis');
    }
  });

  it('negative control: on a compat model Think still offers Think Hard, a level the model runs', async () => {
    const onUpgradeThinking = vi.fn();
    await render(OutputToolbar as ComponentType<object>, props(GLM, 'think', onUpgradeThinking));
    await click(button('Switch to Think Hard'));
    expect(onUpgradeThinking).toHaveBeenCalledWith('think_hard');
  });

  it('negative control: on Claude it is offered exactly as before, and the click asks for Investigate', async () => {
    for (const thinking of ['think_hard', 'quick', 'plan_first']) {
      await fresh();
      const onUpgradeThinking = vi.fn();
      await render(OutputToolbar as ComponentType<object>, props(CLAUDE, thinking, onUpgradeThinking));
      expect(text(), thinking).toContain('Re-run at Investigate for deeper analysis.');
      await click(button('Switch to Investigate'));
      expect(onUpgradeThinking, thinking).toHaveBeenCalledWith('investigate');
    }
  });
});

// ── 2. Labels that named Claude ──────────────────────────────────────────

describe('OutputToolbar: the Trust Score names no model', () => {
  const props = (model: ModelId, sessionId?: string) => ({
    outputContent: 'An answer.', model, sessionId, isStreaming: false, streamingThinking: '',
    systemPrompt: '', creativity: 'balanced', thinking: 'think', selectedOutputFormats: [],
  });

  it('says "Scored by the quality check", on a compat model and on Claude alike', async () => {
    for (const model of [GLM, CLAUDE]) {
      await fresh();
      answers = { '/api/quality/by-session/s1': SCORE };
      await render(OutputToolbar as ComponentType<object>, props(model, 's1'));
      await click(button('Trust Score'));
      expect(text(), model).toContain('8.0'); // the score itself arrived
      expect(text(), model).toContain('Scored by the quality check');
      expect(text(), model).toContain('a quality check (a separate model call) rates the response');
      expect(text(), model).not.toContain('Haiku');
    }
  });

  it('while no score is in, the quality check is reviewing — no model named', async () => {
    await render(OutputToolbar as ComponentType<object>, props(GLM));
    await click(button('Trust Score'));
    expect(text()).toContain('The quality check is reviewing the output.');
    expect(text()).not.toContain('Haiku');
  });
});

describe('OutputFormatSelector names no model', () => {
  async function openHelp(): Promise<void> {
    for (const help of container.querySelectorAll('button[aria-label="Help"]')) {
      await act(async () => { (help as HTMLButtonElement).focus(); });
    }
  }

  it('asks what ANTON should produce; its help and plain-text note say "the model"', async () => {
    useConfigStore.setState({ plainTextMode: true });
    await render(OutputFormatSelector as ComponentType<object>, { selected: [], onChange: () => {} });
    await openHelp();
    expect(text()).toContain('What should ANTON produce?');
    expect(text()).toContain('The model will respond naturally without structured formatting.');
    expect(claudeMentions()).toEqual([]);
  });
});

describe('ModulePage (the Work page) with a compat model', () => {
  /** Opens every panel on the page that hides text behind a click. */
  async function openEverything(): Promise<void> {
    await click(button('Executive Summary')); // shows Structure reference and Reference output
    for (const label of ['Skills', 'Reasoning options', 'Structure reference(optional)', 'Reference output(optional)', 'module.advancedSettings']) {
      await click(button(label) ?? [...container.querySelectorAll('button')].find((b) => b.textContent?.startsWith(label.replace('(optional)', ''))));
    }
    await click([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('System Prompt')));
  }

  it('names Claude only to say why a Claude-only feature is off', async () => {
    localStorage.setItem('openexpert-default-model', GLM);
    await renderModulePage('gap-analysis');
    expect(useConfigStore.getState().model).toBe(GLM);
    await openEverything();
    // The panels opened, so their text was looked at.
    expect(text()).toContain('What should ANTON produce?');
    expect(text()).toContain('relationships available to the model.');
    expect(text()).toContain('Attach skills to enhance the model');
    expect(text()).toContain('The model analyses from multiple expert viewpoints');
    expect(text()).toContain('The model will match its structure');
    expect(text()).toContain('the structure you want the output to follow');
    expect(text()).toContain("This prompt shapes the model's behavior");
    const unexplained = claudeMentions().filter((m) => !EXPLAINS_A_CLAUDE_ONLY_FEATURE.test(m));
    expect(unexplained).toEqual([]);
  });

  it('the gap-analysis guide leaves out web search and Investigate on a compat model', async () => {
    localStorage.setItem('openexpert-default-model', GLM);
    await renderModulePage('gap-analysis');
    expect(text()).toContain('Quick start — your first AMLR gap analysis');
    expect(text()).toContain('enable "The Model\'s Own Knowledge", and optionally');
    expect(text()).not.toContain('with web search on');
    expect(text()).toContain('Set thinking to "Think Hard" for the deepest analysis.');
    expect(text()).toContain('ANTON will compare your document');
  });

  it('negative control: on Claude the guide still says web search and Investigate, in neutral words', async () => {
    localStorage.setItem('openexpert-default-model', CLAUDE);
    await renderModulePage('gap-analysis');
    expect(useConfigStore.getState().model).toBe(CLAUDE);
    expect(text()).toContain('enable "The Model\'s Own Knowledge" with web search on');
    expect(text()).toContain('Set thinking to "Investigate" for the deepest analysis.');
    expect(text()).toContain('This gives the model access to the full AMLR text');
    expect(text()).toContain('What should ANTON produce?');
  });
});
