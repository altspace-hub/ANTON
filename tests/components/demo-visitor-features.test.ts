// @vitest-environment jsdom
/**
 * demo-visitor-features.test.ts — the features opened to public-demo visitors
 * on 2026-10-01 (DEMO_MODE=true; the server added their routes to
 * WORK_ROUTES), rendered as a visitor sees them on the showcase, where every
 * model is an OpenRouter one and the demo offers GLM 5.3 (the default),
 * DeepSeek V4 Flash and Kimi K2.6:
 *
 *   - the sidebar: My Work, Open Chat, the AI Council, the 5-minute Brief and
 *     Build Module, and (opened 2026-10-02) Engagement Tasks, Discover, the
 *     Task Agent, Projects, the Knowledge Base, Exchange, Orchestration,
 *     Intelligence and Horizon Radar, each once; still none of the admin-only
 *     tools (Coding, the App Gateway, Workflows, …);
 *   - the AI Council: members spread over the offered models instead of all
 *     on one; each answer labelled with the model the server ran; no web
 *     search on models without it; the demo data line and personal-data check;
 *   - the second opinion: "Rerun with…" and Review start on an offered model
 *     other than the one that wrote the answer (Kimi K2.6 for a GLM 5.3
 *     answer), and the review goes to that model;
 *   - the Trust Score panel names the model that scored the answer;
 *   - the rerun comparison says "not scored" at once when the demo scores
 *     nothing;
 *   - Build Module: no community sharing for a visitor, and the .anton download
 *     of their own module (opened 2026-10-02) asks for, and says, unsigned;
 *     and a refused share no longer hides that the module was saved;
 *   - Settings › Double-check lists every model an endpoint allows.
 *
 * Every block has its negative control: an admin on the demo, or an ordinary
 * server, keeps the old behaviour. Rendered with react-dom in jsdom; fetch is
 * a stub that records every call.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Sidebar from '../../src/components/layout/Sidebar';
import AICouncilPage from '../../src/pages/AICouncilPage';
import OutputToolbar, { scoredByLine } from '../../src/components/shared/OutputToolbar';
import RerunComparison from '../../src/components/shared/RerunComparison';
import BuildYourOwnModule from '../../src/pages/BuildYourOwnModule';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { DEMO_OFF } from '../../src/lib/demo-config';
import { resetPublicModelConfigCache } from '../../src/lib/compat-model-policy';
import type { RerunResponse } from '../../src/lib/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const GLM = 'compat:openrouter:z-ai/glm-5.3';
const DEEPSEEK = 'compat:openrouter:deepseek/deepseek-v4-flash-0731';
const KIMI = 'compat:openrouter:moonshotai/kimi-k2.6';

const DEMO_CONFIG = {
  deploymentMode: 'team',
  demoMode: true,
  offeredModels: [GLM, DEEPSEEK, KIMI],
  defaultModel: GLM,
  enabledPillars: ['work'],
  signupOpen: true,
  signupCodeRequired: true,
  retentionDays: 30,
  privacyPath: '/privacy',
  answersScored: false,
  scorerModel: null as string | null,
};
const ORDINARY = { deploymentMode: 'team', demoMode: false };

type Who = 'visitor' | 'admin' | 'ordinary';

let container: HTMLDivElement;
let root: Root;
let calls: Array<{ url: string; method: string; body?: string }> = [];
let configAnswer: unknown = DEMO_CONFIG;
/** Extra answers for one test, by exact URL (any method). */
let answers: Record<string, { status?: number; body: unknown }> = {};
/** The model the stub server says it ran, for a requested one (the context_used frame). */
let servedFor: (requested: string) => string = (m) => m;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function sse(frames: unknown[]): Response {
  const body = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

function as(who: Who, config: unknown = DEMO_CONFIG) {
  configAnswer = who === 'ordinary' ? ORDINARY : config;
  useDemoStore.setState({ config: DEMO_OFF, loaded: false });
  useDemoStore.getState().applyConfig(configAnswer);
  const role = who === 'admin' ? 'admin' : 'analyst';
  useAuthStore.setState({ user: { id: `u-${who}`, username: `user_${who}`, role }, token: 't', isTeamMode: true, isLoading: false });
}

async function fresh(): Promise<void> {
  await act(async () => root.unmount());
  root = createRoot(container);
  calls = [];
  resetPublicModelConfigCache();
}

async function settle(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) await act(async () => { await Promise.resolve(); });
}

async function render(component: ComponentType<object>, props: object = {}): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, null, createElement(component, props)));
  });
  await settle();
}

const text = () => container.textContent ?? '';
const called = (fragment: string) => calls.some((c) => c.url.includes(fragment));
const links = () => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));

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

/** What each model picker labelled `label` shows (ModelSelector: the label, then its button). */
function pickerValues(label: string): string[] {
  return [...container.querySelectorAll('label')]
    .filter((l) => l.textContent === label)
    .map((l) => l.nextElementSibling?.querySelector('span')?.textContent ?? '');
}

async function typeInto(el: HTMLTextAreaElement | HTMLInputElement, value: string): Promise<void> {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: {} } }, interpolation: { escapeValue: false } });
});

beforeEach(() => {
  calls = [];
  answers = {};
  servedFor = (m) => m;
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
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ url, method, body });
    if (url === '/api/config') return json(configAnswer);
    if (url in answers) return json(answers[url].body, answers[url].status ?? 200);
    if (url === '/api/csrf-token') return json({ csrfToken: 'csrf' });
    if (url === '/api/ollama/models') return json({ models: [] });
    if (url === '/api/azure-openai/deployments') return json({ deployments: [] });
    if (url === '/api/settings/custom-models') return json({ slot1: null, slot2: null });
    if (url === '/api/settings/sdk-engine' || url === '/api/settings/codex-engine') return json({ enabled: false, models: [] });
    if (url === '/api/settings/model-endpoints') {
      return json({ endpoints: [{
        slug: 'openrouter', displayName: 'OpenRouter', defaultModel: 'z-ai/glm-5.3', availableModels: [], enabled: true,
        allowedModels: ['z-ai/glm-5.3', 'deepseek/deepseek-v4-flash-0731', 'moonshotai/kimi-k2.6'],
      }] });
    }
    if (url === '/api/claude/message' && method === 'POST') {
      const requested = String((JSON.parse(body ?? '{}') as { model?: string }).model);
      return sse([
        { type: 'stream_start', messageId: 'm' },
        { type: 'context_used', context: { model: servedFor(requested), thinking: 'think' } },
        { type: 'text_delta', content: `An answer from ${requested}.` },
        { type: 'stream_end', contentBlocks: [] },
      ]);
    }
    if (url === '/api/reviews/modes') return json([{ id: 'balanced', label: 'Balanced', icon: 'Scale', description: 'A balanced review.', color: 'teal' }]);
    if (url === '/api/reviews' && method === 'POST') return sse([{ type: 'text_delta', content: 'A review.' }, { type: 'stream_end' }]);
    if (url === '/api/sessions' && method === 'POST') return json({ id: 'council-1' });
    if (url.startsWith('/api/council/')) return json({ status: 'failed', error: 'not now' });
    if (url === '/api/custom-modules' && method === 'GET') return json([{ id: 'm0', name: 'My checker', description: '', config: {}, area: 'my-modules' }]);
    if (url === '/api/custom-modules' && method === 'POST') return json({ id: 'm1', name: 'New module' });
    if (url.startsWith('/api/sessions/stats')) return json({ topModules: [] });
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
});

// ── The sidebar ─────────────────────────────────────────────────────────

describe('Sidebar: the visitor\'s features', () => {
  const VISITOR_FEATURES = ['/my-work', '/prompt', '/council', '/brief', '/build-module',
    '/engagements', '/discover', '/task-agent', '/projects', '/knowledge-base', '/exchange', '/orchestration',
    '/intelligence', '/radar'];
  const ADMIN_ONLY = ['/pathfinder', '/coding', '/app-gateway', '/workflows', '/agents', '/knowledge', '/graph',
    '/patterns', '/datasets', '/coworkers'];

  // A starred entry is drawn in Favorites only; every first launch stars some
  // (DEFAULT_FAVORITE_NAV_ITEMS), and a person can unstar them all.
  for (const favourites of ['the default favourites', 'no favourites'] as const) {
    it(`gives a visitor My Work, Open Chat, the AI Council, the Brief, Build Module and the features opened on 2026-10-02, once each — none of the admin-only tools (${favourites})`, async () => {
      if (favourites === 'no favourites') localStorage.setItem('openexpert-favorite-nav-items', '[]');
      as('visitor');
      await render(Sidebar as ComponentType<object>);
      const hrefs = links();
      for (const href of VISITOR_FEATURES) expect(hrefs.filter((h) => h === href), href).toHaveLength(1);
      for (const href of ADMIN_ONLY) expect(hrefs, href).not.toContain(href);
      // Build Module and the visitor's other tools show outside the Tools
      // section a visitor does not get.
      expect(container.querySelector('[aria-controls="nav-section-tools"]')).toBeNull();
    });
  }

  it('negative control: an admin on the demo keeps the tools, Build Module among them', async () => {
    localStorage.setItem('openexpert-favorite-nav-items', '[]');
    as('admin');
    await render(Sidebar as ComponentType<object>);
    for (const href of ['/my-work', '/prompt', '/council', '/brief', '/discover', '/task-agent']) expect(links(), href).toContain(href);
    // Build Module and the other tools stay under Tools & Features for an admin.
    for (const href of ['/build-module', '/projects', '/knowledge-base', '/exchange', '/orchestration', '/radar']) {
      expect(links(), href).not.toContain(href);
    }
    await click(container.querySelector('[aria-controls="nav-section-tools"]') as HTMLButtonElement);
    for (const href of ['/build-module', '/projects', '/knowledge-base', '/exchange', '/orchestration', '/intelligence',
      '/radar', '/coding', '/app-gateway']) {
      expect(links().filter((h) => h === href), href).toHaveLength(1);
    }
  });
});

// ── The AI Council ──────────────────────────────────────────────────────

describe('AI Council on the demo', () => {
  it('spreads the members over the offered models and seats the chair on the default', async () => {
    as('visitor');
    await render(AICouncilPage as ComponentType<object>);
    expect(pickerValues('Model')).toEqual(['z-ai/glm-5.3', 'deepseek/deepseek-v4-flash-0731']);
    expect(pickerValues('Chair model')).toEqual(['z-ai/glm-5.3']);
    expect(text()).not.toContain('Claude');

    // A preset names Claude models; on the demo its members move onto the offered ones.
    await click(button("Devil's Council ▶"));
    const models = pickerValues('Model');
    expect(models).toEqual(['z-ai/glm-5.3', 'deepseek/deepseek-v4-flash-0731', 'moonshotai/kimi-k2.6', 'z-ai/glm-5.3']);
    expect(new Set(models).size).toBe(3);

    // A new member starts on the offered model used least.
    await click(button('Add Member'));
    expect(pickerValues('Model')[4]).toBe('deepseek/deepseek-v4-flash-0731');
  });

  it('offers no web search on the offered models, and gives a visitor the data line', async () => {
    as('visitor');
    await render(AICouncilPage as ComponentType<object>);
    expect(text()).not.toContain('Web Search');
    expect(container.querySelector('#demo-data-warning')?.textContent).toContain("don't enter real personal or client data");
  });

  it('labels each answer, vote and the synthesis with the model the server ran', async () => {
    as('visitor');
    // The stub server runs Kimi K2.6 whenever GLM 5.3 is asked for.
    servedFor = (m) => (m === GLM ? KIMI : m);
    await render(AICouncilPage as ComponentType<object>);
    await typeInto(container.querySelector('textarea') as HTMLTextAreaElement, 'Should we open a second office?');
    await click(button('Start Council'));
    await settle(40);
    const posts = calls.filter((c) => c.url === '/api/claude/message');
    // Two members over two rounds, then the chair: each its own request.
    expect(posts).toHaveLength(5);
    expect(posts.map((c) => (JSON.parse(c.body!) as { model: string }).model)).toEqual([GLM, DEEPSEEK, GLM, DEEPSEEK, GLM]);
    expect(text()).toContain('Chair Synthesis (Kimi K2.6)');
    const memberLabels = [...container.querySelectorAll('span[title]')].map((s) => s.textContent);
    expect(memberLabels).toContain('Kimi K2.6');
    expect(memberLabels).toContain('DeepSeek V4 Flash');
    expect(memberLabels).not.toContain('GLM 5.3');
    // The chair's record names the models that wrote each answer.
    const chairBody = JSON.parse(posts[4].body!) as { userMessage: string };
    expect(chairBody.userMessage).toContain('— Kimi K2.6');
    expect(chairBody.userMessage).not.toContain('Claude');
  });

  it('holds a visitor\'s topic with a personnummer until they confirm it is made up', async () => {
    as('visitor');
    await render(AICouncilPage as ComponentType<object>);
    await typeInto(container.querySelector('textarea') as HTMLTextAreaElement, 'Review the case of 811218-9876 for us.');
    await click(button('Start Council'));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('personal identity number');
    expect(called('/api/claude/message')).toBe(false);
    await click(button('It is made up or public: start the council'));
    await settle(40);
    expect(called('/api/claude/message')).toBe(true);
  });

  it('negative controls: an ordinary server keeps its configured models, web search and no demo line', async () => {
    as('ordinary');
    await render(AICouncilPage as ComponentType<object>);
    expect(pickerValues('Model')).toEqual(['Claude Opus 5.5', 'Claude Sonnet 4.6']);
    expect(text()).toContain('Web Search');
    expect(container.querySelector('#demo-data-warning')).toBeNull();
    await typeInto(container.querySelector('textarea') as HTMLTextAreaElement, 'Review the case of 811218-9876 for us.');
    await click(button('Start Council'));
    await settle(40);
    expect(container.querySelector('[role="alert"]')?.textContent ?? '').not.toContain('personal identity number');
    expect(called('/api/claude/message')).toBe(true);
  });
});

// ── The second opinion and the Trust Score ─────────────────────────────

describe('OutputToolbar: the second opinion', () => {
  const props = {
    outputContent: 'An answer.', model: GLM, sessionId: 's1', isStreaming: false, streamingThinking: '',
    systemPrompt: '', creativity: 'balanced', thinking: 'think', selectedOutputFormats: [],
  };

  it('"Rerun with…" starts a visitor on Kimi K2.6 for a GLM 5.3 answer, ready to run; no verbatim replay', async () => {
    as('visitor');
    await render(OutputToolbar as ComponentType<object>, props);
    await click(button('Rerun with…'));
    expect(pickerValues('Model')).toEqual(['moonshotai/kimi-k2.6']);
    expect(button('Rerun with another model and compare')?.disabled).toBe(false);
    expect(text()).toContain('The original was produced by GLM 5.3');
    expect(button('Replay verbatim with the same model and the stored prompt')).toBeUndefined();
  });

  it('Review starts on another offered model and sends the review to it', async () => {
    as('visitor');
    await render(OutputToolbar as ComponentType<object>, props);
    await click(button('Review'));
    expect(pickerValues('Model')).toEqual(['moonshotai/kimi-k2.6']);
    expect(text()).toContain('Kimi K2.6 reviews the answer GLM 5.3 wrote.');
    await click(button('Balanced'));
    await click(button('Run Review'));
    const post = calls.find((c) => c.url === '/api/reviews' && c.method === 'POST');
    expect(JSON.parse(post!.body!)).toMatchObject({ modeId: 'balanced', model: KIMI, sessionId: 's1' });
    expect(text()).toContain('Balanced Review by Kimi K2.6');
  });

  it('negative controls: an ordinary server starts on the answer\'s own model; an admin keeps the replay', async () => {
    as('ordinary');
    await render(OutputToolbar as ComponentType<object>, props);
    await click(button('Rerun with…'));
    expect(button('Rerun with another model and compare')?.disabled).toBe(true);
    expect(text()).toContain('Pick a different model than the one that produced this output.');

    await fresh();
    as('admin');
    await render(OutputToolbar as ComponentType<object>, props);
    await click(button('Rerun with…'));
    expect(button('Replay verbatim with the same model and the stored prompt')).toBeDefined();
  });
});

describe('OutputToolbar: the Trust Score names who scored', () => {
  const props = {
    outputContent: 'A long answer. '.repeat(20), model: GLM, sessionId: 's1', isStreaming: false, streamingThinking: '',
    systemPrompt: '', creativity: 'balanced', thinking: 'think', selectedOutputFormats: [],
  };
  const score = { id: 'q1', moduleId: 'open-chat', overall: 8, completeness: 8, accuracy: 8, structure: 8, actionability: 8, citations: 8, isRegression: false, scoredAt: '2026-10-01', reasoning: null };
  const scoredDemo = { ...DEMO_CONFIG, answersScored: true, scorerModel: DEEPSEEK };

  it('on a demo that scores (DEMO_POST_ANSWER_CALLS=scored) a visitor sees the score and the model that made it', async () => {
    as('visitor', scoredDemo);
    answers = { '/api/quality/by-session/s1': { body: { ...score, modelUsed: KIMI } } };
    await render(OutputToolbar as ComponentType<object>, props);
    await click(button('Trust Score'));
    expect(called('/api/quality/by-session/s1')).toBe(true);
    expect(text()).toContain('8.0');
    expect(text()).toContain('Scored by Kimi K2.6');
    expect(text()).not.toContain('not scored on this demo');
  });

  it('falls back to the scorer /api/config names when the score row does not say', async () => {
    as('visitor', scoredDemo);
    answers = { '/api/quality/by-session/s1': { body: { ...score, modelUsed: null } } };
    await render(OutputToolbar as ComponentType<object>, props);
    await click(button('Trust Score'));
    expect(text()).toContain('Scored by DeepSeek V4 Flash');
  });

  it('negative control: a demo that scores nothing says so and asks for no score', async () => {
    as('visitor');
    await render(OutputToolbar as ComponentType<object>, props);
    await click(button('Trust Score'));
    expect(text()).toContain('Answers are not scored on this demo.');
    expect(called('/quality/by-session')).toBe(false);
  });

  it('scoredByLine: the score row first, then the configured scorer, and the heuristic said plainly', () => {
    expect(scoredByLine(KIMI, DEEPSEEK)).toBe('Scored by Kimi K2.6');
    expect(scoredByLine(null, DEEPSEEK)).toBe('Scored by DeepSeek V4 Flash');
    expect(scoredByLine(null, null)).toBe('Scored by the quality check');
    expect(scoredByLine('heuristic', DEEPSEEK)).toContain('simple heuristic');
  });
});

describe('RerunComparison: the quality score of each side', () => {
  const data = {
    mode: 'recompose',
    original: { messageId: 'a1', content: 'One.', modelId: GLM, cost: null, outputTokens: null },
    rerun: { messageId: 'a2', content: 'Two.', modelId: KIMI, cost: null, outputTokens: null },
    sourceDriftAvailable: true,
    sourceDrift: [],
  } as unknown as RerunResponse;

  it('says "not scored" at once on a demo that scores nothing, and names both models', async () => {
    as('visitor');
    await render(RerunComparison as ComponentType<object>, { data, onClose: () => {} });
    expect(text().match(/not scored/g)).toHaveLength(2);
    expect(called('/api/rerun/quality')).toBe(false);
    expect(text()).toContain('Rerun of GLM 5.3 output');
    expect(text()).toContain('Kimi K2.6');
  });

  it('negative control: where answers are scored it still asks for the scores', async () => {
    as('ordinary');
    await render(RerunComparison as ComponentType<object>, { data, onClose: () => {} });
    expect(called('/api/rerun/quality/a1')).toBe(true);
    expect(called('/api/rerun/quality/a2')).toBe(true);
  });
});

// ── Build Module ────────────────────────────────────────────────────────

describe('Build Module', () => {
  it('gives a visitor no community sharing, and an unsigned .anton download of their own module', async () => {
    as('visitor');
    answers = { '/api/exchange/export/m0?type=custom': { body: { bundle: 'unsigned' } } };
    const created = vi.fn(() => 'blob:anton');
    URL.createObjectURL = created as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    await render(BuildYourOwnModule as ComponentType<object>);
    expect(text()).toContain('My checker');
    // Opened 2026-10-02: POST /exchange/export/:id answers a visitor for their
    // own module, always unsigned; the page says so and asks for no signature.
    expect(button('Export as .anton')).toBeUndefined();
    expect(text()).toContain('A module you download as .anton from this demo is unsigned');
    await click(button('Export as .anton (unsigned)'));
    const exported = calls.find((c) => c.url === '/api/exchange/export/m0?type=custom' && c.method === 'POST');
    expect(exported).toBeDefined();
    expect(JSON.parse(exported?.body ?? '{}')).toEqual({ sign: false });
    expect(created).toHaveBeenCalled();
    expect(text()).not.toContain('Export failed');
    await click([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Save Current Session')) as HTMLButtonElement);
    expect(text()).toContain('Save As Custom Module');
    expect(text()).not.toContain('Share with Community');
  });

  it('negative control, and the fix: an admin can share, and a refused share still says the module was saved', async () => {
    as('admin');
    answers = { '/api/modules/community': { status: 500, body: { error: 'refused' } } };
    await render(BuildYourOwnModule as ComponentType<object>);
    expect(button('Export as .anton')).toBeDefined();
    // An admin's download is not marked unsigned (the server may sign it).
    expect(button('Export as .anton (unsigned)')).toBeUndefined();
    expect(text()).not.toContain('A module you download as .anton from this demo is unsigned');
    await click([...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Save Current Session')) as HTMLButtonElement);
    expect(text()).toContain('Share with Community');
    await typeInto(container.querySelector('input[placeholder="e.g., Nordic Bank AMLR Checker"]') as HTMLInputElement, 'New module');
    const share = [...container.querySelectorAll('input[type="checkbox"]')].find((b) => b.closest('label')?.textContent?.includes('Share with Community')) as HTMLInputElement;
    await click(share);
    await click(button('Save Module'));
    expect(calls.some((c) => c.url === '/api/custom-modules' && c.method === 'POST')).toBe(true);
    expect(calls.some((c) => c.url === '/api/modules/community' && c.method === 'POST')).toBe(true);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Module saved. It could not be shared with the community');
    expect(text()).not.toContain('Save As Custom Module');
  });
});

// ── Settings › Double-check ─────────────────────────────────────────────

describe('Settings › Double-check', () => {
  it('builds the verifier chips from every allowed model of each endpoint (compatModelChoices)', () => {
    const page = readFileSync(join(process.cwd(), 'src', 'pages', 'Settings.tsx'), 'utf8');
    const start = page.indexOf("t('settings.doubleCheck'");
    const end = page.indexOf('{/* Default Thinking */}', start);
    expect(start).toBeGreaterThan(-1);
    const block = page.slice(start, end);
    expect(block).toContain('...compatModelChoices(ecoEndpoints)');
    // The old row offered each endpoint's default model only.
    expect(block).not.toContain('`compat:${e.slug}:${e.defaultModel}`');
    expect(page).toMatch(/allowedModels\?: string\[\]; enabled: boolean/);
  });
});
