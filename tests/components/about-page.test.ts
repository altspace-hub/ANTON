// @vitest-environment jsdom
/**
 * about-page.test.ts — the About page (/about), as a signed-out visitor, a
 * demo visitor and a signed-in user see it:
 *
 *   - it credits the creator ("Created by Daniel Bardun."), has one h1 and
 *     its own header, main and footer landmarks;
 *   - on a demo it names the models /api/config reports (the default first,
 *     with its maker, and OpenRouter when every id goes through it) and links
 *     the privacy notice and the demo terms; it calls nothing but the public
 *     /api/config, so the demo allowlist never answers it 404;
 *   - on an ordinary server it speaks generally about the models (that
 *     server publishes none before sign-in) and shows the server's version;
 *   - it renders before the sign-in check, signed out and signed in;
 *   - the sign-in page links it on a demo and on an ordinary server (keeping
 *     the ordinary server's "Created by …" line as it was), and so does the
 *     sidebar, for a demo visitor and for an ordinary user.
 *
 * Negative control: a signed-out visitor at / still gets the login page.
 * Rendered with react-dom in jsdom (no testing library in this repo); fetch
 * is a stub.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App';
import AboutPage from '../../src/pages/AboutPage';
import LoginPage from '../../src/pages/LoginPage';
import Sidebar from '../../src/components/layout/Sidebar';
import { useDemoStore } from '../../src/stores/useDemoStore';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { DEMO_OFF, parseServerVersion } from '../../src/lib/demo-config';
import { DEMO_TERMS_TEXT_VERSION } from '../../src/lib/demo-legal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DEMO_CONFIG = {
  deploymentMode: 'team',
  version: '0.7.5',
  demoMode: true,
  offeredModels: [
    'compat:openrouter:moonshotai/kimi-k2.6',
    'compat:openrouter:z-ai/glm-5.3',
    'compat:openrouter:deepseek/deepseek-v4-flash-0731',
  ],
  defaultModel: 'compat:openrouter:z-ai/glm-5.3',
  enabledPillars: ['work'],
  signupOpen: true,
  signupCodeRequired: true,
  retentionDays: 21,
  privacyPath: '/privacy',
  termsPath: '/terms',
  termsVersion: DEMO_TERMS_TEXT_VERSION,
  operatorName: '',
};
const ORDINARY = { deploymentMode: 'team', version: '0.7.5', demoMode: false };

let container: HTMLDivElement;
let root: Root;
let fetchCalls: string[] = [];
let configAnswer: unknown = DEMO_CONFIG;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

async function render(component: ComponentType<object>, path = '/'): Promise<void> {
  await act(async () => {
    root.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(component)));
  });
  await settle();
}

/** The server's /api/config answer; the store starts empty so the page has to fetch it. */
function serve(config: unknown, role: 'analyst' | 'admin' | null = null) {
  configAnswer = config;
  useDemoStore.setState({ config: DEMO_OFF, version: '', loaded: false });
  useAuthStore.setState({
    user: role ? { id: `u-${role}`, username: `user_${role}`, role } : null,
    token: role ? 't' : null,
    isTeamMode: true,
    isLoading: false,
  });
}

const text = () => container.textContent ?? '';
const hrefs = () => [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));

beforeEach(() => {
  fetchCalls = [];
  configAnswer = DEMO_CONFIG;
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('openexpert-tour-completed', 'true');
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    fetchCalls.push(url);
    if (url === '/api/config') return json(configAnswer);
    if (url === '/api/auth/me') return json({}, 401);
    if (url.includes('/custom-modules')) return json([]);
    if (url.includes('/sessions/stats')) return json({ topModules: [] });
    return json({}, 404);
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
  useDemoStore.setState({ config: DEMO_OFF, version: '', loaded: false });
});

describe('the About page', () => {
  it('credits the creator, with one h1 and its own landmarks', async () => {
    serve(DEMO_CONFIG);
    await render(AboutPage as ComponentType<object>, '/about');
    const h1s = container.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent).toBe('About ANTON');
    const credit = [...container.querySelectorAll('main p')].find((p) => p.textContent === 'Created by Daniel Bardun.');
    expect(credit, 'the credit is a paragraph of its own').toBeDefined();
    expect(credit!.className).toContain('text-xl');
    expect(container.querySelectorAll('main').length).toBe(1);
    expect(container.querySelector('header')).not.toBeNull();
    expect(container.querySelector('footer nav')).not.toBeNull();
    // No contact details.
    expect(text()).not.toMatch(/@|gmail/i);
  });

  it('on a demo names the models the server reports, the default first, and links the notice and the terms', async () => {
    serve(DEMO_CONFIG);
    await render(AboutPage as ComponentType<object>, '/about');
    expect(text()).toContain('On this demo, answers come from these models, reached through OpenRouter. You can choose one in the model list before a run.');
    const items = [...container.querySelectorAll('main li')].map((li) => li.textContent);
    expect(items).toEqual([
      'GLM 5.3 · defaultMade by Z.ai (GLM)',
      'Kimi K2.6Made by Moonshot AI (Kimi)',
      'DeepSeek V4 FlashMade by DeepSeek',
    ]);
    expect(container.querySelector('[role="note"]')?.textContent)
      .toBe('Answers are AI-generated and must be checked by a qualified person. They are not legal advice.');
    expect(text()).toContain('ANTON 0.7.5');
    expect(hrefs()).toContain('/privacy');
    expect(hrefs()).toContain('/terms');
    // The general text about Claude is for servers that report no model.
    expect(text()).not.toContain('Anthropic');
    // Only the public config endpoint: nothing the demo allowlist could close.
    expect(fetchCalls.length).toBeGreaterThan(0);
    expect(new Set(fetchCalls)).toEqual(new Set(['/api/config']));
  });

  it('names the operator of a demo that sets DEMO_OPERATOR_NAME', async () => {
    serve({ ...DEMO_CONFIG, operatorName: 'Example Consulting AB' });
    await render(AboutPage as ComponentType<object>, '/about');
    expect(text()).toContain('Created by Daniel Bardun.');
    expect(text()).toContain('This demo is operated by Example Consulting AB.');
  });

  it('on an ordinary server speaks generally about the models and shows no demo terms', async () => {
    serve(ORDINARY);
    await render(AboutPage as ComponentType<object>, '/about');
    expect(text()).toContain('Created by Daniel Bardun.');
    expect(text()).toContain('ANTON is built around Anthropic’s Claude models');
    expect(text()).not.toContain('On this demo');
    expect(text()).not.toContain('operated by');
    expect(text()).toContain('ANTON 0.7.5');
    expect(hrefs()).toContain('/privacy');
    expect(hrefs()).not.toContain('/terms');
  });

  it('leaves the version out when the server does not report one', async () => {
    serve({ deploymentMode: 'solo', version: 'unknown', demoMode: false });
    await render(AboutPage as ComponentType<object>, '/about');
    expect(text()).toContain('Created by Daniel Bardun.');
    expect(container.querySelector('#about-version')).toBeNull();
    expect(parseServerVersion({ version: '0.7.5' })).toBe('0.7.5');
    expect(parseServerVersion({ version: '<script>' })).toBe('');
    expect(parseServerVersion(null)).toBe('');
  });
});

describe('reaching /about', () => {
  it('renders signed out on a demo, before the sign-in check', async () => {
    serve(DEMO_CONFIG, null);
    await render(App as ComponentType<object>, '/about');
    expect(container.querySelector('h1')?.textContent).toBe('About ANTON');
    expect(text()).toContain('Created by Daniel Bardun.');
    expect(container.querySelector('#username, #su-username')).toBeNull();
  });

  it('renders signed out on an ordinary server too', async () => {
    serve(ORDINARY, null);
    await render(App as ComponentType<object>, '/about');
    expect(container.querySelector('h1')?.textContent).toBe('About ANTON');
    expect(container.querySelector('#username')).toBeNull();
  });

  it('renders for a signed-in user', async () => {
    serve(ORDINARY, 'analyst');
    await render(App as ComponentType<object>, '/about');
    expect(container.querySelector('h1')?.textContent).toBe('About ANTON');
    expect(text()).toContain('Created by Daniel Bardun.');
  });

  it('negative control: a signed-out visitor at / gets the login page, not the About page', async () => {
    serve(DEMO_CONFIG, null);
    await render(App as ComponentType<object>, '/');
    expect(container.querySelector('#username')).not.toBeNull();
    expect(text()).not.toContain('Created by Daniel Bardun.');
  });
});

describe('links to /about', () => {
  it('the sign-in page links it on a demo, beside the notice and the terms', async () => {
    serve(DEMO_CONFIG, null);
    useDemoStore.getState().applyConfig(DEMO_CONFIG);
    await render(LoginPage as ComponentType<object>);
    expect(text()).toContain('Privacy notice · Demo terms · About');
    expect(hrefs()).toContain('/about');
    // The demo's footer still names no author (privacy review: it names the operator).
    expect(text()).not.toContain('Created by Daniel Bardun');
  });

  it('the sign-in page links it on an ordinary server and keeps the "Created by" line', async () => {
    serve(ORDINARY, null);
    useDemoStore.getState().applyConfig(ORDINARY);
    await render(LoginPage as ComponentType<object>);
    expect(text()).toContain('Created by Daniel Bardun & FutureChain — Enhanced by You');
    expect(hrefs()).toContain('/about');
  });

  it('the sidebar links it for a demo visitor and for an ordinary user', async () => {
    serve(DEMO_CONFIG, 'analyst');
    useDemoStore.getState().applyConfig(DEMO_CONFIG);
    await render(Sidebar as ComponentType<object>);
    expect(hrefs()).toContain('/about');
    expect(hrefs()).toContain('/privacy');

    serve(ORDINARY, 'analyst');
    useDemoStore.getState().applyConfig(ORDINARY);
    await render(Sidebar as ComponentType<object>);
    expect(hrefs()).toContain('/about');
  });
});
