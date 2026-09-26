// @vitest-environment jsdom
/**
 * demo-prompt-voice-privacy.test.ts — Open Chat (/prompt) and the hardware
 * symptom capture on a public demo (DEMO_MODE=true; privacy verification
 * 2026-09-26, problem 5). A visitor can reach /prompt by its address, and
 * /claude/message is open to them, so it carries the module page's
 * safeguards:
 *
 *   - no microphone (M5, D9): the browser's speech recognition may send the
 *     audio to the browser's maker — on /prompt and in VoiceSymptomCapture;
 *   - the line "Demo: don't enter real personal or client data." under the
 *     composer, tied to it with aria-describedby;
 *   - the check before sending (H3): a personnummer, an email address or a
 *     phone number is shown back and nothing is sent until the visitor
 *     confirms or edits — for the message and for "improve prompt", which
 *     sends the draft too;
 *   - a lens the router suggests that the demo keeps off is not taken.
 *
 * Negative controls: an admin on the demo and everyone on an ordinary server
 * keep the microphone, see no demo line and send at once. Rendered with
 * react-dom in jsdom; fetch is a stub that records every call.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useConfigStore } from '../../src/stores/useConfigStore';
import { useSessionMetaStore } from '../../src/stores/useSessionStore';
import { DEMO_OFF } from '../../src/lib/demo-config';
import { resetPublicModelConfigCache } from '../../src/lib/compat-model-policy';

// VoiceSymptomCapture reads the browser's speech recognition when it loads,
// so the stand-in is there before any import: only the demo rule can hide a
// microphone below.
vi.hoisted(() => {
  (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = class {};
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEMO_CONFIG = {
  deploymentMode: 'team',
  demoMode: true,
  offeredModels: ['compat:openrouter:z-ai/glm-5.3-flash'],
  enabledPillars: ['work'],
  signupOpen: true,
  signupCodeRequired: true,
  retentionDays: 30,
  privacyPath: '/privacy',
  termsPath: '/terms',
  termsVersion: '2026-09-26',
  answersScored: false,
  hiddenAreas: ['healthcare'],
  hiddenModules: ['cv-writer'],
};
const ORDINARY = { deploymentMode: 'team', demoMode: false };
const PERSONAL = 'Assess the customer 811228-9874, reachable at anna@firma.se or 070-123 45 67.';

type Who = 'visitor' | 'admin' | 'ordinary';

let PromptPage: ComponentType<object>;
let VoiceSymptomCapture: ComponentType<{ value: string; onChange: (s: string) => void; workingLanguage?: string }>;

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string }> = [];
/** What /api/modules/smart-search suggests as the lens. */
let lensAnswer: unknown = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function as(who: Who) {
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useDemoStore.getState().applyConfig(who === 'ordinary' ? ORDINARY : DEMO_CONFIG);
  const role = who === 'admin' ? 'admin' : 'analyst';
  useAuthStore.setState({ user: { id: `u-${who}`, username: `user_${who}`, role }, token: 't', isTeamMode: true, isLoading: false });
}

async function fresh(): Promise<void> {
  await act(async () => root.unmount());
  root = createRoot(container);
  calls = [];
  useConfigStore.setState({ lens: null });
  useSessionMetaStore.setState({ sessionId: null, messages: [] });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve(); });
}

async function render(component: ComponentType<object>, props: object = {}, path = '/prompt'): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(component, props)));
  });
  await settle();
}

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

async function typeComposer(value: string): Promise<void> {
  const box = container.querySelector('#prompt-composer') as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(box, value);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const text = () => container.textContent ?? '';
/** Anything that carries the text off the page: the lens router, a session, the model. */
const sent = () => calls.filter((c) => c.method === 'POST'
  && (c.url.includes('/modules/smart-search') || c.url === '/api/sessions' || c.url.includes('/claude/'))).length;

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: {} } }, interpolation: { escapeValue: false } });
  PromptPage = (await import('../../src/pages/PromptPage')).default as ComponentType<object>;
  VoiceSymptomCapture = (await import('../../src/components/hardware/VoiceSymptomCapture')).default;
});

beforeEach(() => {
  calls = [];
  lensAnswer = [];
  resetPublicModelConfigCache();
  localStorage.clear();
  sessionStorage.clear();
  useConfigStore.setState({ lens: null });
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, method: (init?.method ?? 'GET').toUpperCase() });
    if (url === '/api/config') return json(DEMO_CONFIG);
    if (url.includes('/modules/smart-search')) return json(lensAnswer);
    if (url.startsWith('/api/knowledge-packs')) return json({ packs: [] });
    if (url === '/api/collections') return json([]);
    if (url.includes('/custom-modules')) return json([]);
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
  useAuthStore.setState({ user: null, token: null });
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useConfigStore.setState({ lens: null });
  useSessionMetaStore.setState({ sessionId: null, messages: [] });
});

// ── /prompt ──────────────────────────────────────────────────────────────

describe('Open Chat: voice input and the line under the composer', () => {
  it('gives a visitor no microphone and tells them not to enter real data', async () => {
    as('visitor');
    await render(PromptPage);
    expect(button('Send message (Ctrl+Enter)')).toBeDefined();
    expect(button('Voice input')).toBeUndefined();
    expect(text()).toContain("Demo: don't enter real personal or client data.");
    expect(container.querySelector('#prompt-composer')?.getAttribute('aria-describedby')).toBe('demo-data-warning');
  });

  it('negative controls: an admin on the demo and an ordinary server keep the microphone and see no demo line', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await render(PromptPage);
      expect(button('Voice input'), who).toBeDefined();
      expect(text(), who).not.toContain("Demo: don't enter real personal or client data.");
      expect(container.querySelector('#prompt-composer')?.getAttribute('aria-describedby'), who).toBeNull();
    }
  });
});

describe('Open Chat: the check before a visitor\'s text is sent', () => {
  it('holds a message with a personnummer, email or phone number until the visitor confirms', async () => {
    as('visitor');
    await render(PromptPage);
    await typeComposer(PERSONAL);
    await click(button('Send message (Ctrl+Enter)'));

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      'Your text seems to contain a Swedish personal identity number (personnummer), an email address and a phone number',
    );
    expect(alert?.textContent).toContain('811228-9874');
    expect(sent()).toBe(0);

    await click(button('It is made up or public: send it'));
    expect(text()).not.toContain('Your text seems to contain');
    expect(sent()).toBeGreaterThan(0);
  });

  it('lets the visitor edit instead; an edited text is checked again', async () => {
    as('visitor');
    await render(PromptPage);
    await typeComposer('Call 070-123 45 67 about the case.');
    await click(button('Send message (Ctrl+Enter)'));
    expect(text()).toContain('Your text seems to contain a phone number');

    await click(button('Edit my text'));
    expect(text()).not.toContain('Your text seems to contain');
    expect(sent()).toBe(0);

    await typeComposer('Call the customer about the case.');
    await click(button('Send message (Ctrl+Enter)'));
    expect(text()).not.toContain('Your text seems to contain');
    expect(sent()).toBeGreaterThan(0);
  });

  it('checks the draft that "improve prompt" sends, too', async () => {
    as('visitor');
    await render(PromptPage);
    await typeComposer(PERSONAL);
    await click(button('Improve prompt with AI'));
    expect(text()).toContain('Your text seems to contain');
    expect(sent()).toBe(0);
  });

  it('sends a text with nothing personal-looking at once', async () => {
    as('visitor');
    await render(PromptPage);
    await typeComposer('Explain the risk-based approach of Regulation (EU) 2024/1624.');
    await click(button('Send message (Ctrl+Enter)'));
    expect(text()).not.toContain('Your text seems to contain');
    expect(sent()).toBeGreaterThan(0);
  });

  it('negative controls: an admin on the demo and an ordinary server send the same text without a question', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await render(PromptPage);
      await typeComposer(PERSONAL);
      await click(button('Send message (Ctrl+Enter)'));
      expect(text(), who).not.toContain('Your text seems to contain');
      expect(sent(), who).toBeGreaterThan(0);
    }
  });
});

describe('Open Chat: the expert lens', () => {
  it('does not take a lens the demo keeps off for a visitor', async () => {
    lensAnswer = [{ moduleId: 'cv-writer', areaId: 'personal-dev', label: 'CV & LinkedIn Writer', reason: 'CV' }];
    as('visitor');
    await render(PromptPage);
    await typeComposer('Help me with my career.');
    await click(button('Send message (Ctrl+Enter)'));
    expect(calls.some((c) => c.url.includes('/modules/smart-search'))).toBe(true);
    expect(useConfigStore.getState().lens).toBeNull();
  });

  it('drops a kept lens the demo keeps off', async () => {
    as('visitor');
    useConfigStore.setState({ lens: { moduleId: 'clinical-protocol', areaId: 'healthcare', label: 'Clinical Protocol Development' } });
    await render(PromptPage);
    expect(useConfigStore.getState().lens).toBeNull();
    expect(text()).not.toContain('Clinical Protocol Development');
  });

  it('negative control: an admin on the demo takes the same lens', async () => {
    lensAnswer = [{ moduleId: 'cv-writer', areaId: 'personal-dev', label: 'CV & LinkedIn Writer', reason: 'CV' }];
    as('admin');
    await render(PromptPage);
    await typeComposer('Help me with my career.');
    await click(button('Send message (Ctrl+Enter)'));
    expect(useConfigStore.getState().lens?.moduleId).toBe('cv-writer');
  });
});

// ── The hardware symptom capture ─────────────────────────────────────────

describe('VoiceSymptomCapture', () => {
  const props = { value: '', onChange: () => {}, workingLanguage: 'sv' };
  const mic = () => [...container.querySelectorAll('button')].find((b) => b.title.startsWith('Hold to talk'));

  it('gives a visitor the text box but no microphone', async () => {
    as('visitor');
    await render(VoiceSymptomCapture as ComponentType<object>, props, '/');
    expect(container.querySelector('textarea')).not.toBeNull();
    expect(mic()).toBeUndefined();
    expect(text()).not.toContain('Working language');
  });

  it('negative controls: an admin on the demo and an ordinary server keep the microphone', async () => {
    for (const who of ['admin', 'ordinary'] as const) {
      await fresh();
      as(who);
      await render(VoiceSymptomCapture as ComponentType<object>, props, '/');
      expect(mic(), who).toBeDefined();
      expect(text(), who).toContain('Working language: sv (sv-SE)');
    }
  });
});
