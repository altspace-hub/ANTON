// @vitest-environment jsdom
/**
 * demo-work-privacy.test.ts — what a public-demo visitor meets on the Work
 * page that keeps real personal data out (DEMO_MODE=true; privacy review):
 *
 *   - no microphone button (M5, D9): the browser's speech recognition may
 *     send the audio to the browser's maker;
 *   - no human-oversight sign-off form (H1, D10): it asks for a full name;
 *   - a line under the prompt, "Demo: don't enter real personal or client
 *     data.", and a check before sending (H3): a personnummer with a valid
 *     check digit, an email address or a phone number is shown back and the
 *     visitor confirms before anything is sent;
 *   - no Online References (H4, D8): the knowledge panel's web-search note
 *     points a visitor to uploads instead of the hidden links card.
 *
 * Every block has a negative control: an admin on the demo and everyone on
 * an ordinary server keep the old behaviour. Rendered with react-dom in
 * jsdom; fetch is a stub that records every call.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import KnowledgeSourcePanel from '../../src/components/shared/KnowledgeSourcePanel';
import ModulePage from '../../src/pages/ModulePage';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useSessionMetaStore } from '../../src/stores/useSessionStore';
import { DEMO_OFF } from '../../src/lib/demo-config';
import { resetPublicModelConfigCache } from '../../src/lib/compat-model-policy';
import type { KnowledgeSourceConfig, Message, ModelId } from '../../src/lib/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GLM = 'compat:openrouter:z-ai/glm-5.3-flash' as ModelId;

const DEMO_CONFIG = {
  deploymentMode: 'team',
  demoMode: true,
  offeredModels: [GLM],
  enabledPillars: ['work'],
  signupOpen: true,
  signupCodeRequired: true,
  retentionDays: 30,
  privacyPath: '/privacy',
  termsPath: '/terms',
  termsVersion: '2026-09-26',
  answersScored: false,
};
const ORDINARY = { deploymentMode: 'team', demoMode: false };

type Who = 'visitor' | 'admin' | 'ordinary';

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string }> = [];
let configAnswer: unknown = DEMO_CONFIG;
let answers: Record<string, unknown> = {};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function as(who: Who) {
  configAnswer = who === 'ordinary' ? ORDINARY : DEMO_CONFIG;
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useDemoStore.getState().applyConfig(configAnswer);
  const role = who === 'admin' ? 'admin' : 'analyst';
  useAuthStore.setState({ user: { id: `u-${who}`, username: `user_${who}`, role }, token: 't', isTeamMode: true, isLoading: false });
}

async function fresh(): Promise<void> {
  await act(async () => root.unmount());
  root = createRoot(container);
  calls = [];
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
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
const sessionPosts = () => calls.filter((c) => c.method === 'POST' && c.url === '/api/sessions').length;

function button(label: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label || b.title === label,
  ) as HTMLButtonElement | undefined;
}

async function click(el: HTMLElement | undefined): Promise<void> {
  if (!el) throw new Error('nothing to click');
  await act(async () => { el.click(); });
  await settle();
}

/** Types into the prompt box the way a person does. */
async function typePrompt(value: string): Promise<void> {
  const box = container.querySelector('#module-prompt') as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(box, value);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function moduleAnswers(moduleId: string, areaId = 'fcp') {
  answers = {
    [`/api/modules/${moduleId}`]: { id: moduleId, areaId, guidedInputs: [] },
    [`/api/modules/${moduleId}/prompt`]: { prompt: 'You assist a compliance officer.' },
  };
}

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: {} } }, interpolation: { escapeValue: false } });
});

beforeEach(() => {
  calls = [];
  answers = {};
  configAnswer = DEMO_CONFIG;
  resetPublicModelConfigCache();
  localStorage.clear();
  sessionStorage.clear();
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
  // The browser offers speech recognition, so only the demo rule can hide the microphone.
  (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = class {};
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: (init?.method ?? 'GET').toUpperCase() });
    if (url === '/api/config') return json(configAnswer);
    if (url in answers) return json(answers[url]);
    if (url.startsWith('/api/knowledge-packs')) return json({ packs: [] });
    if (url === '/api/collections') return json([]);
    if (url === '/api/custom-modules') return json([]);
    if (url.startsWith('/api/sessions/stats')) return json({ totalSessions: 0, totalMessages: 0, totalOutputTokens: 0, thisWeekSessions: 0, thisMonthSessions: 0, recentSessions: [] });
    if (url.startsWith('/api/sessions?')) return json([]);
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
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  useAuthStore.setState({ user: null, token: null });
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useSessionMetaStore.setState({ sessionId: null, messages: [] });
});

// ── Microphone and the warning line ──────────────────────────────────────

describe('ModulePage: voice input and the line under the prompt', () => {
  it('gives a visitor no microphone and tells them not to enter real data', async () => {
    moduleAnswers('risk-assessment');
    as('visitor');
    await renderModulePage('risk-assessment');
    expect(button('module.runAnalysis')).toBeDefined();
    expect(button('module.voiceInput')).toBeUndefined();
    expect(text()).toContain("Demo: don't enter real personal or client data.");
    expect(container.querySelector('#module-prompt')?.getAttribute('aria-describedby')).toBe('demo-data-warning');
  });

  it('negative controls: an admin on the demo and an ordinary server keep the microphone and see no demo line', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      moduleAnswers('risk-assessment');
      as(who);
      await renderModulePage('risk-assessment');
      expect(button('module.voiceInput'), who).toBeDefined();
      expect(text(), who).not.toContain("Demo: don't enter real personal or client data.");
    }
  });
});

// ── The check before sending ─────────────────────────────────────────────

describe('ModulePage: the check before a visitor\'s text is sent', () => {
  it('holds a text with a personnummer, email or phone number until the visitor confirms', async () => {
    moduleAnswers('risk-assessment');
    as('visitor');
    await renderModulePage('risk-assessment');
    await typePrompt('Assess the customer 811228-9874, reachable at anna@firma.se or 070-123 45 67.');
    await click(button('module.runAnalysis'));

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      'Your text seems to contain a Swedish personal identity number (personnummer), an email address and a phone number',
    );
    expect(alert?.textContent).toContain('811228-9874');
    expect(sessionPosts()).toBe(0);

    await click(button('It is made up or public: send it'));
    expect(sessionPosts()).toBe(1);
    expect(text()).not.toContain('Your text seems to contain');
  });

  it('lets the visitor edit instead, and checks the edited text again', async () => {
    moduleAnswers('risk-assessment');
    as('visitor');
    await renderModulePage('risk-assessment');
    await typePrompt('Call 070-123 45 67 about the case.');
    await click(button('module.runAnalysis'));
    expect(text()).toContain('Your text seems to contain a phone number');

    await click(button('Edit my text'));
    expect(text()).not.toContain('Your text seems to contain');
    expect(sessionPosts()).toBe(0);

    // Changing the text clears the question; a made-up text is then sent at once.
    await click(button('module.runAnalysis'));
    expect(text()).toContain('Your text seems to contain a phone number');
    await typePrompt('Call the customer about the case.');
    expect(text()).not.toContain('Your text seems to contain');
    await click(button('module.runAnalysis'));
    expect(sessionPosts()).toBe(1);
  });

  it('sends a text with nothing personal-looking at once', async () => {
    moduleAnswers('risk-assessment');
    as('visitor');
    await renderModulePage('risk-assessment');
    await typePrompt('Assess the ML/TF risk of a mid-sized Swedish payment institution under Regulation (EU) 2024/1624.');
    await click(button('module.runAnalysis'));
    expect(text()).not.toContain('Your text seems to contain');
    expect(sessionPosts()).toBe(1);
  });

  it('negative controls: an admin on the demo and an ordinary server send the same text without a question', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      moduleAnswers('risk-assessment');
      as(who);
      await renderModulePage('risk-assessment');
      await typePrompt('Assess the customer 811228-9874, reachable at anna@firma.se or 070-123 45 67.');
      await click(button('module.runAnalysis'));
      expect(text(), who).not.toContain('Your text seems to contain');
      expect(sessionPosts(), who).toBe(1);
    }
  });
});

// ── The sign-off form ────────────────────────────────────────────────────

describe('ModulePage: the human-oversight sign-off form', () => {
  const answered: Message[] = [
    { id: 'm1', sessionId: 's1', role: 'user', content: 'Run the gap analysis.', createdAt: '2026-09-26T10:00:00Z' },
    { id: 'm2', sessionId: 's1', role: 'assistant', content: 'The gap analysis.', createdAt: '2026-09-26T10:00:05Z' },
  ];

  async function openAnsweredGapAnalysis(): Promise<void> {
    moduleAnswers('gap-analysis');
    await renderModulePage('gap-analysis');
    await act(async () => { useSessionMetaStore.setState({ sessionId: 's1', messages: answered }); });
    await settle();
  }

  it('is not shown to a visitor: it asks for a reviewer\'s full name', async () => {
    as('visitor');
    await openAnsweredGapAnalysis();
    expect(text()).toContain('The gap analysis.');
    expect(text()).not.toContain('Professional Review Required');
  });

  it('negative controls: an admin on the demo and an ordinary server keep it', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await openAnsweredGapAnalysis();
      expect(text(), who).toContain('Professional Review Required');
    }
  });
});

// ── Knowledge sources: where the web-search note points ─────────────────

describe('KnowledgeSourcePanel: the note on a model without web search', () => {
  const config: KnowledgeSourceConfig = {
    modes: {
      claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
      onlineReference: { enabled: true, urls: ['https://example.org/rule'], fetchDepth: 'full' },
      localFolder: { enabled: false, folderPaths: [], recursive: true },
      combinedMode: { enabled: false, priority: 'merged' },
    },
  };

  async function renderPanel(): Promise<void> {
    await act(async () => {
      root.render(createElement(MemoryRouter, null, createElement(KnowledgeSourcePanel, { config, onChange: () => {}, model: GLM })));
    });
    await settle();
  }

  it('points a visitor to uploads, not to the online links they are not offered', async () => {
    as('visitor');
    await renderPanel();
    expect(text()).toContain('To give the model a source, upload it as a file.');
    expect(text()).not.toContain('Online Regulation / Document Links');
    expect(text()).not.toContain('https://example.org/rule');
  });

  it('negative controls: an admin on the demo and an ordinary server keep the online links', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await renderPanel();
      expect(text(), who).toContain('add its link under Online Regulation / Document Links');
      expect(text(), who).toContain('https://example.org/rule');
    }
  });
});
